import express from 'express';
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
// HLS PROXY ENDPOINTS
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

export default router;
