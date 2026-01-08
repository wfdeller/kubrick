import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getRedisClient } from '../redis/RedisClient.js';
import * as storage from '../storage/index.js';
import logger from '../../utils/logger.js';

/**
 * TranscodeWorker - Processes streams from Redis, transcodes with FFmpeg
 */
class TranscodeWorker {
    constructor(workerId) {
        this.workerId = workerId;
        this.activeStreams = new Map(); // recordingId -> transcoder state
        this.running = false;
    }

    async start() {
        this.running = true;
        logger.info('TranscodeWorker started', { workerId: this.workerId });

        // Start heartbeat
        this.startHeartbeat();

        // Listen for control events
        await this.listenForStreams();
    }

    async stop() {
        this.running = false;
        // Stop all active transcoders
        for (const [recordingId, state] of this.activeStreams) {
            await this.stopTranscoder(recordingId, state);
        }
        logger.info('TranscodeWorker stopped', { workerId: this.workerId });
    }

    startHeartbeat() {
        const redis = getRedisClient();
        const interval = parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10) || 5000;
        const ttl = parseInt(process.env.HEARTBEAT_TTL_MS, 10) || 10000;

        this.heartbeatInterval = setInterval(async () => {
            try {
                await redis.set(`worker:${this.workerId}:heartbeat`, Date.now(), 'PX', ttl);
            } catch (err) {
                logger.error('Heartbeat failed', { error: err.message });
            }
        }, interval);
    }

    async listenForStreams() {
        const redis = getRedisClient();
        let lastId = '$'; // Only new messages

        while (this.running) {
            try {
                // Read from control stream
                const results = await redis.xread('BLOCK', 1000, 'STREAMS', 'stream:control', lastId);

                if (!results) continue;

                for (const [stream, messages] of results) {
                    for (const [id, fields] of messages) {
                        lastId = id;
                        const event = this.parseStreamFields(fields);

                        if (event.type === 'stream_start') {
                            await this.handleStreamStart(event);
                        } else if (event.type === 'stream_stop') {
                            await this.handleStreamStop(event);
                        }
                    }
                }
            } catch (err) {
                logger.error('Error reading control stream', { error: err.message });
                await this.sleep(1000);
            }
        }
    }

    parseStreamFields(fields) {
        const result = {};
        for (let i = 0; i < fields.length; i += 2) {
            result[fields[i]] = fields[i + 1];
        }
        return result;
    }

    async handleStreamStart(event) {
        const { recordingId, bucket, prefix } = event;

        // Try to claim the stream
        const redis = getRedisClient();
        const claimed = await redis.setnx(`stream:${recordingId}:owner`, this.workerId);

        if (!claimed) {
            logger.debug('Stream already claimed', { recordingId });
            return;
        }

        logger.info('Claimed stream', { recordingId, workerId: this.workerId });

        // Publish status change to 'transcoding'
        await this.publishEvent(recordingId, 'statusChange', { status: 'transcoding' });

        // Start transcoding
        await this.startTranscoder(recordingId, bucket, prefix);
    }

    async handleStreamStop(event) {
        const { recordingId } = event;
        const state = this.activeStreams.get(recordingId);

        if (!state) return;

        // Mark as ending, let chunk processor finish
        state.ending = true;
        logger.info('Stream stop received', { recordingId });
    }

    async startTranscoder(recordingId, bucket, prefix) {
        const outputDir = path.join(os.tmpdir(), 'kubrick-transcoder', recordingId);
        await fs.promises.mkdir(outputDir, { recursive: true });

        const manifestPath = path.join(outputDir, 'stream.m3u8');
        const segmentPattern = path.join(outputDir, 'segment_%05d.ts');

        // FFmpeg arguments
        const ffmpegArgs = [
            '-probesize', '5000000',
            '-analyzeduration', '5000000',
            '-fflags', '+genpts+discardcorrupt',
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-profile:v', 'baseline',
            '-level', '3.1',
            '-b:v', '2500k',
            '-maxrate', '2500k',
            '-bufsize', '5000k',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-f', 'hls',
            '-hls_time', '4',
            '-hls_list_size', '0',
            '-hls_flags', 'append_list+split_by_time',
            '-hls_segment_type', 'mpegts',
            '-hls_segment_filename', segmentPattern,
            manifestPath,
        ];

        const process = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

        const state = {
            recordingId,
            bucket,
            prefix,
            outputDir,
            process,
            ending: false,
            lastChunkSeq: -1,
            segmentCount: 0,
        };

        this.activeStreams.set(recordingId, state);

        // Handle FFmpeg output
        process.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('Opening') && msg.includes('.ts')) {
                state.segmentCount++;
            }
        });

        process.on('close', async (code) => {
            logger.info('FFmpeg exited', { recordingId, code });
            await this.finalizeStream(recordingId, state);
        });

        // Start polling for segments to upload
        this.startSegmentPoller(recordingId, state);

        // Start consuming chunks
        this.consumeChunks(recordingId, state);

        logger.info('Transcoder started', { recordingId, outputDir });
    }

    /**
     * Poll directory for new segments and upload them
     * More reliable than fs.watch on macOS
     */
    startSegmentPoller(recordingId, state) {
        state.uploadedSegments = new Set();
        state.lastManifestMtime = 0;
        state.totalBytes = 0;

        state.pollerInterval = setInterval(async () => {
            try {
                const files = await fs.promises.readdir(state.outputDir);

                for (const filename of files) {
                    const filePath = path.join(state.outputDir, filename);

                    if (filename.endsWith('.ts') && !state.uploadedSegments.has(filename)) {
                        // Check if file is complete (not being written)
                        const stats = await fs.promises.stat(filePath);
                        const age = Date.now() - stats.mtimeMs;

                        // Only upload if file hasn't been modified in 500ms
                        if (age > 500) {
                            const key = `${state.prefix}/${recordingId}/hls/${filename}`;
                            await storage.uploadFile(state.bucket, key, filePath, 'video/mp2t');
                            state.uploadedSegments.add(filename);
                            state.totalBytes += stats.size;
                            await this.publishEvent(recordingId, 'segmentReady', { segment: filename, size: stats.size });
                            logger.info('Uploaded segment', { recordingId, filename, size: stats.size });
                        }
                    } else if (filename === 'stream.m3u8') {
                        const stats = await fs.promises.stat(filePath);
                        if (stats.mtimeMs > state.lastManifestMtime) {
                            // Wait a bit for file to finish writing
                            await this.sleep(100);
                            const key = `${state.prefix}/${recordingId}/hls/stream.m3u8`;
                            await storage.uploadFile(state.bucket, key, filePath, 'application/vnd.apple.mpegurl', {
                                cacheControl: 'no-cache',
                            });
                            state.lastManifestMtime = stats.mtimeMs;
                            await this.publishEvent(recordingId, 'manifestUpdated', { key });
                            logger.debug('Uploaded manifest', { recordingId });
                        }
                    }
                }
            } catch (err) {
                // Ignore errors during polling (directory might not exist yet)
                if (err.code !== 'ENOENT') {
                    logger.error('Segment poller error', { recordingId, error: err.message });
                }
            }
        }, 1000); // Poll every second
    }

    async consumeChunks(recordingId, state) {
        const redis = getRedisClient();
        const streamKey = `stream:chunks:${recordingId}`;
        let lastId = '0';

        while (this.running && !state.ending) {
            try {
                const results = await redis.xread('BLOCK', 500, 'STREAMS', streamKey, lastId);

                if (!results) {
                    // Check if stream ended while we were waiting
                    const streamState = await redis.hget(`stream:${recordingId}:state`, 'status');
                    if (streamState === 'ending') {
                        state.ending = true;
                        break;
                    }
                    continue;
                }

                for (const [stream, messages] of results) {
                    for (const [id, fields] of messages) {
                        lastId = id;
                        const chunk = this.parseStreamFields(fields);
                        await this.processChunk(state, chunk);
                    }
                }
            } catch (err) {
                logger.error('Error consuming chunks', { recordingId, error: err.message });
                await this.sleep(100);
            }
        }

        // Process any remaining chunks
        await this.drainRemainingChunks(recordingId, state, lastId);

        // Close FFmpeg stdin to finalize
        state.process.stdin.end();
    }

    async drainRemainingChunks(recordingId, state, lastId) {
        const redis = getRedisClient();
        const streamKey = `stream:chunks:${recordingId}`;

        // Read any remaining chunks without blocking
        const results = await redis.xread('STREAMS', streamKey, lastId);
        if (results) {
            for (const [stream, messages] of results) {
                for (const [id, fields] of messages) {
                    const chunk = this.parseStreamFields(fields);
                    await this.processChunk(state, chunk);
                }
            }
        }
    }

    async processChunk(state, chunkInfo) {
        const { seq, key, size } = chunkInfo;
        const seqNum = parseInt(seq, 10);

        // Ensure ordering
        if (seqNum <= state.lastChunkSeq) {
            logger.warn('Out of order chunk', { recordingId: state.recordingId, seq, lastSeq: state.lastChunkSeq });
            return;
        }

        // Download chunk from storage
        const buffer = await storage.downloadFile(state.bucket, key);

        // Write to FFmpeg
        state.process.stdin.write(buffer);
        state.lastChunkSeq = seqNum;

        logger.debug('Processed chunk', { recordingId: state.recordingId, seq, size });
    }

    async finalizeStream(recordingId, state) {
        const redis = getRedisClient();

        // Stop segment poller
        if (state.pollerInterval) {
            clearInterval(state.pollerInterval);
        }

        // Upload any remaining segments
        try {
            const files = await fs.promises.readdir(state.outputDir);
            for (const filename of files) {
                if (filename.endsWith('.ts') && !state.uploadedSegments.has(filename)) {
                    const filePath = path.join(state.outputDir, filename);
                    const fileStats = await fs.promises.stat(filePath);
                    const key = `${state.prefix}/${recordingId}/hls/${filename}`;
                    await storage.uploadFile(state.bucket, key, filePath, 'video/mp2t');
                    state.totalBytes += fileStats.size;
                    logger.info('Uploaded final segment', { recordingId, filename, size: fileStats.size });
                }
            }
        } catch (err) {
            logger.error('Error uploading final segments', { recordingId, error: err.message });
        }

        // Upload final manifest
        const manifestPath = path.join(state.outputDir, 'stream.m3u8');
        if (fs.existsSync(manifestPath)) {
            const key = `${state.prefix}/${recordingId}/hls/stream.m3u8`;
            await storage.uploadFile(state.bucket, key, manifestPath, 'application/vnd.apple.mpegurl', {
                cacheControl: 'no-cache',
            });
        }

        // Publish status change to 'ready'
        await this.publishEvent(recordingId, 'statusChange', { status: 'ready' });

        // Publish completion event with total bytes
        await this.publishEvent(recordingId, 'streamComplete', {
            segmentCount: state.segmentCount,
            totalBytes: state.totalBytes || 0,
        });

        // Update Redis state
        await redis.hset(`stream:${recordingId}:state`, 'status', 'complete');

        // Clean up ownership
        await redis.del(`stream:${recordingId}:owner`);

        // Clean up local files
        await fs.promises.rm(state.outputDir, { recursive: true, force: true });

        this.activeStreams.delete(recordingId);
        logger.info('Stream finalized', { recordingId, segmentCount: state.segmentCount });
    }

    async stopTranscoder(recordingId, state) {
        state.ending = true;
        if (state.process) {
            state.process.stdin.end();
            // Give it time to finish
            await this.sleep(2000);
            if (state.process.exitCode === null) {
                state.process.kill('SIGKILL');
            }
        }
    }

    async publishEvent(recordingId, type, data) {
        const redis = getRedisClient();
        const event = JSON.stringify({ type, recordingId, ...data, timestamp: Date.now() });
        await redis.publish(`transcoder:events:${recordingId}`, event);
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export default TranscodeWorker;
