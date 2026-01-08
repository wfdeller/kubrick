import express from 'express';
import Recording from '../models/Recording.js';
import {
    getSignedUrl,
    generateStorageKey,
    initResumableUpload,
    getChunkUploadUrl,
    completeResumableUpload,
    abortResumableUpload,
    getProviderName,
    getBucketName,
} from '../services/storage/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Default chunk size: 10MB (minimum for S3 multipart is 5MB except last part)
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

/**
 * Get the next sequence number for recordings created today
 */
const getNextSequence = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await Recording.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow },
    });

    return count + 1;
};

// POST /api/upload/presigned-url - Get presigned URL for direct upload
router.post('/presigned-url', async (req, res, next) => {
    try {
        const { recordingId, contentType, fileSize } = req.body;

        if (!recordingId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId is required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        // Generate storage key with recording ID and sequence
        const sequence = await getNextSequence();
        const storageKey = generateStorageKey(recordingId, sequence);
        const bucket = getBucketName();

        // Get presigned upload URL
        const uploadUrl = await getSignedUrl(bucket, storageKey, 'write', contentType);

        // Update recording with storage info
        recording.storageBucket = bucket;
        recording.storageKey = storageKey;
        recording.mimeType = contentType || 'video/webm';
        if (fileSize) recording.fileBytes = fileSize;
        await recording.save();

        res.json({
            uploadUrl,
            storageKey,
            bucket,
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/upload/complete - Mark upload as complete (simple upload)
router.post('/complete', async (req, res, next) => {
    try {
        const { recordingId, duration } = req.body;

        if (!recordingId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId is required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        // Update status to ready
        recording.status = 'ready';
        if (duration) recording.duration = duration;
        await recording.save();

        res.json({
            success: true,
            status: recording.status,
        });
    } catch (err) {
        next(err);
    }
});

// ============================================
// CHUNKED UPLOAD ENDPOINTS
// ============================================

// POST /api/upload/init-chunked - Initialize a chunked upload session
router.post('/init-chunked', async (req, res, next) => {
    try {
        const { recordingId, contentType, fileSize } = req.body;

        if (!recordingId || !fileSize) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId and fileSize are required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        // Generate storage key with recording ID and sequence
        const sequence = await getNextSequence();
        const storageKey = generateStorageKey(recordingId, sequence);
        const bucket = getBucketName();
        const mimeType = contentType || 'video/webm';

        // Get origin for CORS (browser uploads)
        const origin = req.get('Origin') || req.get('Referer')?.replace(/\/$/, '') || 'http://localhost:5173';

        // Initialize resumable/multipart upload
        const { uploadId } = await initResumableUpload(bucket, storageKey, mimeType, fileSize, origin);

        // Calculate number of chunks
        const chunkSize = DEFAULT_CHUNK_SIZE;
        const totalChunks = Math.ceil(fileSize / chunkSize);

        // Update recording with storage info
        recording.storageBucket = bucket;
        recording.storageKey = storageKey;
        recording.mimeType = mimeType;
        recording.fileBytes = fileSize;
        recording.uploadId = uploadId;
        recording.status = 'uploading';
        await recording.save();

        logger.info('Initialized chunked upload', {
            recordingId,
            fileSize,
            totalChunks,
            chunkSize,
            provider: getProviderName(),
        });

        res.json({
            uploadId,
            bucket,
            storageKey,
            chunkSize,
            totalChunks,
            provider: getProviderName(),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/upload/chunk-url - Get presigned URL for a specific chunk
router.post('/chunk-url', async (req, res, next) => {
    try {
        const { recordingId, partNumber, chunkSize } = req.body;

        if (!recordingId || partNumber === undefined) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId and partNumber are required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        if (!recording.uploadId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'NO_UPLOAD_SESSION',
                        title: 'No Upload Session',
                        detail: 'No chunked upload session found. Call /init-chunked first.',
                    },
                ],
            });
        }

        const { uploadUrl } = await getChunkUploadUrl(
            recording.storageBucket,
            recording.storageKey,
            recording.uploadId,
            partNumber,
            chunkSize || DEFAULT_CHUNK_SIZE,
            recording.fileBytes
        );

        res.json({
            uploadUrl,
            partNumber,
            provider: getProviderName(),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/upload/complete-chunked - Complete a chunked upload
router.post('/complete-chunked', async (req, res, next) => {
    try {
        const { recordingId, parts, duration } = req.body;

        if (!recordingId || !parts) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId and parts array are required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        if (!recording.uploadId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'NO_UPLOAD_SESSION',
                        title: 'No Upload Session',
                        detail: 'No chunked upload session found.',
                    },
                ],
            });
        }

        // Complete the upload
        await completeResumableUpload(
            recording.storageBucket,
            recording.storageKey,
            recording.uploadId,
            parts
        );

        // Update recording status
        recording.status = 'ready';
        recording.uploadId = null;
        if (duration) recording.duration = duration;
        await recording.save();

        logger.info('Completed chunked upload', {
            recordingId,
            partsCount: parts.length,
        });

        res.json({
            success: true,
            status: recording.status,
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/upload/abort-chunked - Abort a chunked upload
router.post('/abort-chunked', async (req, res, next) => {
    try {
        const { recordingId } = req.body;

        if (!recordingId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId is required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        if (recording.uploadId) {
            await abortResumableUpload(
                recording.storageBucket,
                recording.storageKey,
                recording.uploadId
            );
        }

        // Update recording status
        recording.status = 'error';
        recording.uploadId = null;
        await recording.save();

        logger.info('Aborted chunked upload', { recordingId });

        res.json({
            success: true,
            status: recording.status,
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/upload/thumbnail-url - Get presigned URL for thumbnail upload
router.post('/thumbnail-url', async (req, res, next) => {
    try {
        const { recordingId } = req.body;

        if (!recordingId) {
            return res.status(400).json({
                errors: [
                    {
                        status: '400',
                        code: 'MISSING_PARAMETER',
                        title: 'Missing Parameter',
                        detail: 'recordingId is required',
                    },
                ],
            });
        }

        const recording = await Recording.findById(recordingId);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${recordingId} not found`,
                    },
                ],
            });
        }

        const bucket = getBucketName();
        const thumbnailKey = `thumbnails/${recordingId}.jpg`;

        // Get presigned upload URL for thumbnail
        const uploadUrl = await getSignedUrl(bucket, thumbnailKey, 'write', 'image/jpeg');

        // Update recording with thumbnail key
        recording.thumbnailKey = thumbnailKey;
        await recording.save();

        logger.info('Generated thumbnail upload URL', { recordingId, thumbnailKey });

        res.json({
            uploadUrl,
            thumbnailKey,
            bucket,
        });
    } catch (err) {
        next(err);
    }
});

export default router;
