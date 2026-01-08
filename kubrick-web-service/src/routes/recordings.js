import express from 'express';
import Recording from '../models/Recording.js';
import { serializeRecording, serializeRecordings, deserializeRecording } from '../serializers/recording.js';
import { getSignedUrl, deleteFile } from '../services/storage/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Attach videoUrl and thumbnailUrl to a recording document
 * @param {Object} recording - Mongoose recording document
 */
async function attachUrls(recording) {
    // Generate video URL
    try {
        if (recording.playbackFormat === 'hls' && ['recording', 'pending', 'transcoding', 'ready'].includes(recording.status)) {
            recording.videoUrl = `/api/streams/${recording._id}/hls/manifest.m3u8`;
        } else if (recording.storageKey && recording.status === 'ready') {
            recording.videoUrl = await getSignedUrl(recording.storageBucket, recording.storageKey, 'read');
        }
    } catch (err) {
        logger.warn('Failed to generate video URL', { recordingId: recording._id, error: err.message });
    }

    // Generate thumbnail URL
    if (recording.thumbnailKey) {
        try {
            recording.thumbnailUrl = await getSignedUrl(recording.storageBucket, recording.thumbnailKey, 'read');
        } catch (err) {
            logger.warn('Failed to generate thumbnail URL', { recordingId: recording._id, error: err.message });
        }
    }

    return recording;
}

/**
 * Parse search query into text terms and metadata filters
 * @param {string} query - Search string like "john Location=Studio"
 * @returns {{ textTerms: string[], metadataFilters: { key: string, value: string }[] }}
 *
 * Examples:
 *   "john" -> { textTerms: ["john"], metadataFilters: [] }
 *   "Location=Studio" -> { textTerms: [], metadataFilters: [{ key: "Location", value: "Studio" }] }
 *   "john Location=Studio" -> { textTerms: ["john"], metadataFilters: [{ key: "Location", value: "Studio" }] }
 *   'Project="Big Demo"' -> { textTerms: [], metadataFilters: [{ key: "Project", value: "Big Demo" }] }
 */
function parseSearchQuery(queryString) {
    if (!queryString || typeof queryString !== 'string') {
        return { textTerms: [], metadataFilters: [] };
    }

    const textTerms = [];
    const metadataFilters = [];

    // Match key=value, key="quoted value", key='quoted value'
    const keyValueRegex = /(\w+)=(?:"([^"]+)"|'([^']+)'|(\S+))/g;

    let remainingQuery = queryString;
    let match;
    while ((match = keyValueRegex.exec(queryString)) !== null) {
        const key = match[1];
        const value = match[2] || match[3] || match[4];
        metadataFilters.push({ key, value });
        remainingQuery = remainingQuery.replace(match[0], '');
    }

    // Remaining tokens are text search terms
    const terms = remainingQuery.trim().split(/\s+/).filter((t) => t.length > 0);
    textTerms.push(...terms);

    return { textTerms, metadataFilters };
}

// GET /api/recordings - List recordings with filtering and pagination
router.get('/', async (req, res, next) => {
    try {
        // Express parses bracket notation as nested objects
        const {
            filter = {},
            sort = '-createdAt',
            page: pageParams = {},
        } = req.query;
        const searchQuery = filter.search;
        const status = filter.status;
        const pageNumber = pageParams.number || 1;
        const pageSize = pageParams.size || 20;

        // Build query
        const query = {};

        // Parse and apply search query
        if (searchQuery) {
            const { textTerms, metadataFilters } = parseSearchQuery(searchQuery);

            // Full-text search across title, description, recorderName
            if (textTerms.length > 0) {
                const textConditions = textTerms.map((term) => ({
                    $or: [
                        { title: { $regex: term, $options: 'i' } },
                        { description: { $regex: term, $options: 'i' } },
                        { recorderName: { $regex: term, $options: 'i' } },
                    ],
                }));
                query.$and = query.$and || [];
                query.$and.push(...textConditions);
            }

            // Metadata filters using dot notation
            if (metadataFilters.length > 0) {
                query.$and = query.$and || [];
                for (const { key, value } of metadataFilters) {
                    query.$and.push({
                        [`metadata.${key}`]: { $regex: value, $options: 'i' },
                    });
                }
            }
        }

        // Status filter
        if (status) {
            query.status = status;
        } else {
            // Exclude archived recordings by default
            query.status = { $ne: 'archived' };
        }

        // Parse pagination
        const page = Math.max(1, parseInt(pageNumber, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
        const skip = (page - 1) * limit;

        // Parse sort - include _id as secondary sort for stable pagination
        const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
        const sortOrder = sort.startsWith('-') ? -1 : 1;
        const sortObj = { [sortField]: sortOrder, _id: sortOrder };

        // Execute query
        const [recordings, totalCount] = await Promise.all([
            Recording.find(query).sort(sortObj).skip(skip).limit(limit),
            Recording.countDocuments(query),
        ]);

        // Generate URLs for each recording
        const recordingsWithUrls = await Promise.all(recordings.map(attachUrls));

        // Build pagination links
        const totalPages = Math.ceil(totalCount / limit);
        const baseUrl = `/api/recordings`;
        const buildUrl = (p) => {
            const params = new URLSearchParams();
            if (searchQuery) params.set('filter[search]', searchQuery);
            if (status) params.set('filter[status]', status);
            params.set('sort', sort);
            params.set('page[number]', p);
            params.set('page[size]', limit);
            return `${baseUrl}?${params}`;
        };

        const links = {
            self: buildUrl(page),
            first: buildUrl(1),
            last: buildUrl(totalPages || 1),
        };
        if (page > 1) links.prev = buildUrl(page - 1);
        if (page < totalPages) links.next = buildUrl(page + 1);

        res.json(serializeRecordings(recordingsWithUrls, { totalCount }, links));
    } catch (err) {
        next(err);
    }
});

// GET /api/recordings/:id - Get single recording
router.get('/:id', async (req, res, next) => {
    try {
        const recording = await Recording.findById(req.params.id);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${req.params.id} not found`,
                    },
                ],
            });
        }

        await attachUrls(recording);

        res.json(serializeRecording(recording));
    } catch (err) {
        next(err);
    }
});

// POST /api/recordings - Create new recording
router.post('/', async (req, res, next) => {
    try {
        const data = await deserializeRecording(req.body);

        // Validate required fields
        if (!data.recorderName) {
            return res.status(422).json({
                errors: [
                    {
                        status: '422',
                        code: 'VALIDATION_ERROR',
                        title: 'Invalid Attribute',
                        detail: 'recorderName is required',
                        source: { pointer: '/data/attributes/recorderName' },
                    },
                ],
            });
        }

        // Validate playbackFormat
        if (!data.playbackFormat || !['video', 'hls'].includes(data.playbackFormat)) {
            return res.status(422).json({
                errors: [
                    {
                        status: '422',
                        code: 'VALIDATION_ERROR',
                        title: 'Invalid Attribute',
                        detail: "playbackFormat is required and must be 'video' or 'hls'",
                        source: { pointer: '/data/attributes/playbackFormat' },
                    },
                ],
            });
        }

        // Set defaults
        const recordingData = {
            title: data.title || `Recording ${new Date().toLocaleString()}`,
            description: data.description || '',
            recorderName: data.recorderName,
            metadata: data.metadata || {},
            quality: data.quality || '720p',
            mimeType: data.mimeType || 'video/webm',
            fileBytes: data.fileBytes || 0,
            sessionInfo: data.sessionInfo || {},
            playbackFormat: data.playbackFormat,
            status: 'uploading',
            recordedAt: new Date(),
        };

        const recording = await Recording.create(recordingData);
        res.status(201).json(serializeRecording(recording));
    } catch (err) {
        next(err);
    }
});

// PATCH /api/recordings/:id - Update recording
router.patch('/:id', async (req, res, next) => {
    try {
        const data = await deserializeRecording(req.body);

        // Only allow updating certain fields
        const allowedFields = ['title', 'description', 'status'];
        const updateData = {};
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        const recording = await Recording.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true,
        });

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${req.params.id} not found`,
                    },
                ],
            });
        }

        res.json(serializeRecording(recording));
    } catch (err) {
        next(err);
    }
});

// DELETE /api/recordings/:id - Delete recording
router.delete('/:id', async (req, res, next) => {
    try {
        const recording = await Recording.findById(req.params.id);

        if (!recording) {
            return res.status(404).json({
                errors: [
                    {
                        status: '404',
                        code: 'NOT_FOUND',
                        title: 'Recording Not Found',
                        detail: `Recording with id ${req.params.id} not found`,
                    },
                ],
            });
        }

        // Delete file from cloud storage
        if (recording.storageKey) {
            try {
                await deleteFile(recording.storageBucket, recording.storageKey);
                logger.info('Deleted file from storage', { bucket: recording.storageBucket, key: recording.storageKey });
            } catch (err) {
                logger.warn('Failed to delete file from storage', { recordingId: recording._id, error: err.message });
                // Continue with database deletion even if storage deletion fails
            }
        }

        await Recording.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
