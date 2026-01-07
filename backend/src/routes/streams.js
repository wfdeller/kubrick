import express from 'express';
import streamManager from '../services/streaming/StreamManager.js';
import Recording from '../models/Recording.js';
import { requireLiveStreaming, getFeatureFlags } from '../utils/featureFlags.js';
import { downloadFile } from '../services/storage/index.js';
import logger from '../utils/logger.js';

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

        const manifestKey = recording.storageKey || `streams/${recordingId}/stream.m3u8`;
        const bucket = recording.storageBucket || process.env.GCP_BUCKET_NAME || 'kubrick-videos';

        const manifestContent = await downloadFile(bucket, manifestKey);

        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
        res.send(manifestContent);
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

        const bucket = recording.storageBucket || process.env.GCP_BUCKET_NAME || 'kubrick-videos';
        const segmentKey = `streams/${recordingId}/${segment}`;

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
// LIVE STREAMING ROUTES (Feature flag required)
// ============================================

// Apply feature flag check to remaining routes
router.use(requireLiveStreaming);

/**
 * GET /api/streams/status
 * Get system-wide streaming status and all active streams
 */
router.get('/status', async (req, res, next) => {
    try {
        const systemStatus = streamManager.getSystemStatus();
        const flags = getFeatureFlags();

        res.json({
            data: {
                type: 'stream-status',
                attributes: {
                    ...systemStatus,
                    featureFlags: flags,
                },
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
 */
router.post('/:recordingId/stop', async (req, res, next) => {
    try {
        const { recordingId } = req.params;

        const finalStatus = await streamManager.stopStream(recordingId);

        // Update recording with HLS manifest location and mark as ready
        const recording = await Recording.findById(recordingId);
        if (recording) {
            const bucket = process.env.GCP_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'kubrick-videos';
            recording.status = 'ready';
            recording.isLiveStreaming = false;
            recording.streamEndedAt = new Date();
            recording.duration = Math.floor(finalStatus.duration / 1000); // Convert ms to seconds
            recording.storageBucket = bucket;
            recording.hlsManifestKey = `streams/${recordingId}/stream.m3u8`;
            await recording.save();
        }

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
