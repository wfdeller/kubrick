import { EventEmitter } from 'events';
import HLSTranscoder from './HLSTranscoder.js';
import {
    uploadStreamSegment,
    uploadStreamManifest,
    getStreamPlaybackUrl,
    getBucketName,
    generateStreamPrefix,
    generateStreamManifestKey,
} from '../storage/index.js';
import Recording from '../../models/Recording.js';
import logger from '../../utils/logger.js';

/**
 * StreamManager - Manages all active live streams
 * Handles stream lifecycle, transcoding, storage uploads, and status tracking
 */
class StreamManager extends EventEmitter {
    constructor() {
        super();
        this.streams = new Map(); // streamId -> stream state
        this.transcoders = new Map(); // streamId -> HLSTranscoder
    }

    /**
     * Start a new live stream
     */
    async startStream(recordingId, options = {}) {
        if (this.streams.has(recordingId)) {
            throw new Error(`Stream ${recordingId} already exists`);
        }

        const bucket = getBucketName();
        const streamPrefix = generateStreamPrefix(recordingId);

        const streamState = {
            recordingId,
            status: 'starting',
            startTime: Date.now(),
            endTime: null,
            viewerCount: 0,
            viewers: new Set(),
            segmentsUploaded: 0,
            bytesUploaded: 0,
            lastActivity: Date.now(),
            bucket,
            streamPrefix,
            manifestUrl: null,
            error: null,
        };

        this.streams.set(recordingId, streamState);

        // Create and start transcoder
        const transcoder = new HLSTranscoder(recordingId, options);
        this.transcoders.set(recordingId, transcoder);

        // Handle new segments - upload to cloud storage
        transcoder.on('segmentReady', async ({ filename, path }) => {
            try {
                const storageKey = `${streamPrefix}/${filename}`;
                await uploadStreamSegment(bucket, storageKey, path);

                streamState.segmentsUploaded++;
                streamState.lastActivity = Date.now();

                logger.debug('Uploaded HLS segment', { recordingId, filename, storageKey });
            } catch (err) {
                logger.error('Failed to upload segment', { recordingId, filename, error: err.message });
            }
        });

        // Handle manifest updates - upload to cloud storage
        transcoder.on('manifestUpdated', async ({ path }) => {
            try {
                const storageKey = `${streamPrefix}/stream.m3u8`;
                await uploadStreamManifest(bucket, storageKey, path);

                // Update playback URL if not set
                if (!streamState.manifestUrl) {
                    streamState.manifestUrl = await getStreamPlaybackUrl(bucket, storageKey);
                }

                logger.debug('Uploaded HLS manifest', { recordingId, storageKey });
            } catch (err) {
                logger.error('Failed to upload manifest', { recordingId, error: err.message });
            }
        });

        // Handle transcoder close
        transcoder.on('close', ({ code }) => {
            if (streamState.status === 'live') {
                streamState.status = code === 0 ? 'ended' : 'error';
                streamState.endTime = Date.now();
            }
            this.emit('streamEnded', { recordingId, status: streamState.status });
        });

        // Handle transcoder errors
        transcoder.on('error', ({ error }) => {
            streamState.error = error.message;
            streamState.status = 'error';
            this.emit('streamError', { recordingId, error });
        });

        try {
            await transcoder.start();
            streamState.status = 'live';
            this.emit('streamStarted', { recordingId });

            logger.info('Started live stream', { recordingId, streamPrefix });

            return {
                recordingId,
                status: 'live',
                streamPrefix,
            };
        } catch (err) {
            streamState.status = 'error';
            streamState.error = err.message;
            this.streams.delete(recordingId);
            this.transcoders.delete(recordingId);
            throw err;
        }
    }

    /**
     * Write media data to a stream
     */
    async writeToStream(recordingId, chunk) {
        const transcoder = this.transcoders.get(recordingId);
        const streamState = this.streams.get(recordingId);

        if (!transcoder || !streamState) {
            // Stream not found - silently ignore (may have been stopped)
            return;
        }

        // Don't write if stream is stopping or ended
        if (streamState.status !== 'live') {
            return;
        }

        streamState.lastActivity = Date.now();
        streamState.bytesUploaded += chunk.length;

        await transcoder.write(chunk);
    }

    /**
     * Stop a live stream and update the recording
     */
    async stopStream(recordingId) {
        const transcoder = this.transcoders.get(recordingId);
        const streamState = this.streams.get(recordingId);

        if (!transcoder || !streamState) {
            throw new Error(`Stream ${recordingId} not found`);
        }

        logger.info('Stopping live stream', { recordingId });

        streamState.status = 'stopping';
        await transcoder.stop();

        streamState.status = 'ended';
        streamState.endTime = Date.now();

        const finalStatus = this.getStreamStatus(recordingId);

        // Update the recording in database
        try {
            const recording = await Recording.findById(recordingId);
            if (recording) {
                recording.status = 'ready';
                recording.isLiveStreaming = false;
                recording.streamEndedAt = new Date();
                recording.duration = Math.floor(finalStatus.duration / 1000);
                recording.fileBytes = finalStatus.transcoder?.bytesReceived || 0;
                recording.storageBucket = getBucketName();
                recording.storageKey = generateStreamManifestKey(recordingId);
                await recording.save();
                logger.info('Updated recording after stream stop', {
                    recordingId,
                    status: 'ready',
                    duration: recording.duration,
                    fileBytes: recording.fileBytes,
                });
            }
        } catch (err) {
            logger.error('Failed to update recording after stream stop', { recordingId, error: err.message });
        }

        // Keep stream state for a while for status queries
        // Clean up after 5 minutes
        setTimeout(() => {
            this.cleanupStream(recordingId);
        }, 5 * 60 * 1000);

        return finalStatus;
    }

    /**
     * Clean up stream resources
     */
    async cleanupStream(recordingId) {
        const transcoder = this.transcoders.get(recordingId);
        if (transcoder) {
            transcoder.kill();
            await transcoder.cleanup();
            this.transcoders.delete(recordingId);
        }
        this.streams.delete(recordingId);

        logger.info('Cleaned up stream', { recordingId });
    }

    /**
     * Add a viewer to a stream
     */
    addViewer(recordingId, viewerId) {
        const streamState = this.streams.get(recordingId);
        if (streamState) {
            streamState.viewers.add(viewerId);
            streamState.viewerCount = streamState.viewers.size;
            this.emit('viewerJoined', { recordingId, viewerId, viewerCount: streamState.viewerCount });
        }
    }

    /**
     * Remove a viewer from a stream
     */
    removeViewer(recordingId, viewerId) {
        const streamState = this.streams.get(recordingId);
        if (streamState) {
            streamState.viewers.delete(viewerId);
            streamState.viewerCount = streamState.viewers.size;
            this.emit('viewerLeft', { recordingId, viewerId, viewerCount: streamState.viewerCount });
        }
    }

    /**
     * Get status of a specific stream
     */
    getStreamStatus(recordingId) {
        const streamState = this.streams.get(recordingId);
        const transcoder = this.transcoders.get(recordingId);

        if (!streamState) {
            return null;
        }

        const transcoderStatus = transcoder ? transcoder.getStatus() : null;

        return {
            recordingId: streamState.recordingId,
            status: streamState.status,
            startTime: streamState.startTime,
            endTime: streamState.endTime,
            duration: streamState.endTime
                ? streamState.endTime - streamState.startTime
                : Date.now() - streamState.startTime,
            viewerCount: streamState.viewerCount,
            segmentsUploaded: streamState.segmentsUploaded,
            bytesUploaded: streamState.bytesUploaded,
            lastActivity: streamState.lastActivity,
            manifestUrl: streamState.manifestUrl,
            error: streamState.error,
            transcoder: transcoderStatus
                ? {
                      isRunning: transcoderStatus.isRunning,
                      segmentCount: transcoderStatus.segmentCount,
                      bytesReceived: transcoderStatus.bytesReceived,
                      errors: transcoderStatus.errors,
                  }
                : null,
        };
    }

    /**
     * Get status of all streams
     */
    getAllStreams() {
        const streams = [];
        for (const recordingId of this.streams.keys()) {
            streams.push(this.getStreamStatus(recordingId));
        }
        return streams;
    }

    /**
     * Get active (live) streams only
     */
    getActiveStreams() {
        return this.getAllStreams().filter((s) => s.status === 'live');
    }

    /**
     * Get aggregate system status
     */
    getSystemStatus() {
        const allStreams = this.getAllStreams();
        const activeStreams = allStreams.filter((s) => s.status === 'live');

        return {
            totalStreams: allStreams.length,
            activeStreams: activeStreams.length,
            totalViewers: activeStreams.reduce((sum, s) => sum + s.viewerCount, 0),
            totalSegmentsUploaded: allStreams.reduce((sum, s) => sum + s.segmentsUploaded, 0),
            totalBytesUploaded: allStreams.reduce((sum, s) => sum + s.bytesUploaded, 0),
            streams: allStreams,
        };
    }
}

// Singleton instance
const streamManager = new StreamManager();

export default streamManager;
