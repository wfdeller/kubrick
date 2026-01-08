import express from 'express';
import streamManager from '../services/streaming/StreamManager.js';
import Recording from '../models/Recording.js';
import { downloadFile, getBucketName, generateStreamManifestKey } from '../services/storage/index.js';
import logger from '../utils/logger.js';

/**
 * Get the stream directory prefix from a manifest storage key
 * e.g., "recordings/2026/01/08/abc123/stream.m3u8" -> "recordings/2026/01/08/abc123"
 */
const getStreamPrefix = (storageKey) => {
    if (!storageKey) return null;
    const lastSlash = storageKey.lastIndexOf('/');
    return lastSlash > 0 ? storageKey.substring(0, lastSlash) : null;
};

const router = express.Router();

// ============================================
// HLS PROXY ENDPOINTS (No feature flag required)
// These endpoints proxy HLS content from cloud storage
// to avoid signed URL issues with relative segment paths
// ============================================

/**
 * GET /api/streams/:recordingId/hls/manifest.m3u8
 * Proxy the HLS manifest file
 */
router.get('/:recordingId/hls/manifest.m3u8', async (req, res, next) => {
    try {
        const { recordingId } = req.params;

        const recording = await Recording.findById(recordingId);
        if (!recording) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    code: 'NOT_FOUND',
                    title: 'Recording Not Found',
                }],
            });
        }

        if (recording.playbackFormat !== 'hls') {
            return res.status(400).json({
                errors: [{
                    status: '400',
                    code: 'INVALID_FORMAT',
                    title: 'Not an HLS recording',
                }],
            });
        }

        const manifestKey = recording.storageKey || generateStreamManifestKey(recordingId);
        const bucket = recording.storageBucket || getBucketName();

        try {
            let manifestContent = await downloadFile(bucket, manifestKey);

            // For completed recordings, add #EXT-X-ENDLIST if not present
            // This tells players the stream is complete and stops manifest polling
            if (recording.status === 'ready' && !manifestContent.toString().includes('#EXT-X-ENDLIST')) {
                manifestContent = manifestContent.toString().trim() + '\n#EXT-X-ENDLIST\n';
            }

            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            // Cache completed recordings, don't cache live streams
            res.set('Cache-Control', recording.status === 'ready' ? 'public, max-age=3600' : 'no-cache');
            res.send(manifestContent);
        } catch (downloadErr) {
            // If manifest not found and stream is still recording, it may not be ready yet
            if (recording.status === 'recording') {
                logger.info('HLS manifest not ready yet (stream initializing)', { recordingId });
                return res.status(503).json({
                    errors: [{
                        status: '503',
                        code: 'STREAM_INITIALIZING',
                        title: 'Stream is initializing, please retry in a moment',
                    }],
                });
            }
            throw downloadErr;
        }
    } catch (err) {
        logger.error('Failed to proxy HLS manifest', { recordingId: req.params.recordingId, error: err.message });
        next(err);
    }
});

/**
 * GET /api/streams/:recordingId/hls/:segment
 * Proxy HLS segment files (.ts files)
 */
router.get('/:recordingId/hls/:segment', async (req, res, next) => {
    try {
        const { recordingId, segment } = req.params;

        // Validate segment filename to prevent path traversal
        if (!segment.match(/^[\w\-]+\.(ts|m3u8)$/)) {
            return res.status(400).json({
                errors: [{
                    status: '400',
                    code: 'INVALID_SEGMENT',
                    title: 'Invalid segment filename',
                }],
            });
        }

        const recording = await Recording.findById(recordingId);
        if (!recording) {
            return res.status(404).json({
                errors: [{
                    status: '404',
                    code: 'NOT_FOUND',
                    title: 'Recording Not Found',
                }],
            });
        }

        const bucket = recording.storageBucket || getBucketName();
        const streamPrefix = getStreamPrefix(recording.storageKey) || `recordings/${recordingId}`;
        const segmentKey = `${streamPrefix}/${segment}`;

        const segmentContent = await downloadFile(bucket, segmentKey);

        // Set appropriate content type
        const contentType = segment.endsWith('.ts')
            ? 'video/mp2t'
            : 'application/vnd.apple.mpegurl';

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000'); // Segments are immutable
        res.send(segmentContent);
    } catch (err) {
        logger.error('Failed to proxy HLS segment', {
            recordingId: req.params.recordingId,
            segment: req.params.segment,
            error: err.message,
        });
        next(err);
    }
});

// ============================================
// LIVE STREAMING ROUTES
// ============================================

/**
 * GET /api/streams/status
 * Get system-wide streaming status and all active streams
 */
router.get('/status', async (req, res, next) => {
    try {
        const systemStatus = streamManager.getSystemStatus();

        res.json({
            data: {
                type: 'stream-status',
                attributes: systemStatus,
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/streams/active
 * Get only active (live) streams
 */
router.get('/active', async (req, res, next) => {
    try {
        const activeStreams = streamManager.getActiveStreams();

        // Enrich with recording metadata
        const enrichedStreams = await Promise.all(
            activeStreams.map(async (stream) => {
                const recording = await Recording.findById(stream.recordingId).lean();
                return {
                    ...stream,
                    recording: recording
                        ? {
                              title: recording.title,
                              recorderName: recording.recorderName,
                              quality: recording.quality,
                          }
                        : null,
                };
            })
        );

        res.json({
            data: enrichedStreams.map((stream) => ({
                type: 'live-stream',
                id: stream.recordingId,
                attributes: stream,
            })),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/streams/:recordingId
 * Get status of a specific stream
 */
router.get('/:recordingId', async (req, res, next) => {
    try {
        const { recordingId } = req.params;
        const streamStatus = streamManager.getStreamStatus(recordingId);

        if (!streamStatus) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Stream Not Found',
                        detail: `Stream ${recordingId} not found`,
                    },
                ],
            });
        }

        // Get recording metadata
        const recording = await Recording.findById(recordingId).lean();

        res.json({
            data: {
                type: 'live-stream',
                id: recordingId,
                attributes: {
                    ...streamStatus,
                    recording: recording
                        ? {
                              title: recording.title,
                              recorderName: recording.recorderName,
                              quality: recording.quality,
                          }
                        : null,
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/streams/:recordingId/start
 * Start a live stream for a recording
 */
router.post('/:recordingId/start', async (req, res, next) => {
    try {
        const { recordingId } = req.params;

        // Verify recording exists
        const recording = await Recording.findById(recordingId);
        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording ${recordingId} not found`,
                    },
                ],
            });
        }

        // Start the stream
        const result = await streamManager.startStream(recordingId);

        // Update recording status
        recording.status = 'recording';
        recording.isLiveStreaming = true;
        recording.streamStartedAt = new Date();
        await recording.save();

        logger.info('Started live stream via API', { recordingId });

        res.json({
            data: {
                type: 'live-stream',
                id: recordingId,
                attributes: {
                    ...result,
                    message: 'Stream started successfully',
                },
            },
        });
    } catch (err) {
        if (err.message.includes('already exists')) {
            return res.status(409).json({
                errors: [
                    {
                        status: '409',
                        code: 'CONFLICT',
                        title: 'Stream Already Exists',
                        detail: err.message,
                    },
                ],
            });
        }
        next(err);
    }
});

/**
 * POST /api/streams/:recordingId/stop
 * Stop a live stream
 * @body {number} duration - Actual recording duration in seconds (excluding paused time)
 * @body {number} pauseCount - Number of times recording was paused
 * @body {number} pauseDurationTotal - Total paused duration in seconds
 * @body {Array} pauseEvents - Array of pause events with timestamps
 */
router.post('/:recordingId/stop', async (req, res, next) => {
    try {
        const { recordingId } = req.params;
        const { duration, pauseCount, pauseDurationTotal, pauseEvents } = req.body;

        const stats = {};
        if (duration !== undefined) stats.duration = duration;
        if (pauseCount !== undefined) stats.pauseCount = pauseCount;
        if (pauseDurationTotal !== undefined) stats.pauseDurationTotal = pauseDurationTotal;
        if (pauseEvents !== undefined) stats.pauseEvents = pauseEvents;

        logger.info('Stopping live stream via API', { recordingId, stats });

        const finalStatus = await streamManager.stopStream(recordingId, stats);

        logger.info('Stopped live stream via API', { recordingId });

        res.json({
            data: {
                type: 'live-stream',
                id: recordingId,
                attributes: {
                    ...finalStatus,
                    message: 'Stream stopped successfully',
                },
            },
        });
    } catch (err) {
        if (err.message.includes('not found')) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Stream Not Found',
                        detail: err.message,
                    },
                ],
            });
        }
        next(err);
    }
});

/**
 * POST /api/streams/:recordingId/viewer
 * Register a viewer joining a stream
 */
router.post('/:recordingId/viewer', async (req, res, next) => {
    try {
        const { recordingId } = req.params;
        const { viewerId } = req.body;

        if (!viewerId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'viewerId is required',
                    },
                ],
            });
        }

        streamManager.addViewer(recordingId, viewerId);
        const status = streamManager.getStreamStatus(recordingId);

        res.json({
            data: {
                type: 'viewer-registration',
                attributes: {
                    viewerId,
                    viewerCount: status?.viewerCount || 0,
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/streams/:recordingId/viewer
 * Register a viewer leaving a stream
 */
router.delete('/:recordingId/viewer', async (req, res, next) => {
    try {
        const { recordingId } = req.params;
        const { viewerId } = req.body;

        if (!viewerId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'viewerId is required',
                    },
                ],
            });
        }

        streamManager.removeViewer(recordingId, viewerId);
        const status = streamManager.getStreamStatus(recordingId);

        res.json({
            data: {
                type: 'viewer-registration',
                attributes: {
                    viewerId,
                    viewerCount: status?.viewerCount || 0,
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

export default router;
