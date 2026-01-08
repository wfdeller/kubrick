import JSONAPISerializer from 'jsonapi-serializer';

const { Serializer } = JSONAPISerializer;

export const RecordingSerializer = new Serializer('recordings', {
    attributes: [
        'title',
        'description',
        'recorderName',
        'metadata',
        'storageProvider',
        'storageBucket',
        'storageKey',
        'thumbnailKey',
        'duration',
        'fileBytes',
        'mimeType',
        'quality',
        'sessionInfo',
        'status',
        'playbackFormat',
        'videoUrl',
        'thumbnailUrl',
        'recordedAt',
        'createdAt',
        'updatedAt',
    ],
    keyForAttribute: 'camelCase',
    id: '_id',
    transform: (record) => {
        // Convert Mongoose document to plain object
        const obj = record.toObject ? record.toObject() : record;
        // Convert Mongoose Map to plain object
        const metadata = obj.metadata instanceof Map
            ? Object.fromEntries(obj.metadata)
            : obj.metadata || {};
        return {
            ...obj,
            id: obj._id?.toString() || obj.id,
            metadata,
        };
    },
});

// Serialize single recording
export const serializeRecording = (recording) => {
    return RecordingSerializer.serialize(recording);
};

// Serialize array of recordings with pagination
export const serializeRecordings = (recordings, meta = {}, links = {}) => {
    const serialized = RecordingSerializer.serialize(recordings);
    return {
        ...serialized,
        meta,
        links,
    };
};

// Deserialize request body
export const deserializeRecording = async (body) => {
    // Validate JSON:API structure
    if (!body || !body.data || !body.data.type || !body.data.attributes) {
        const error = new Error('Invalid JSON:API request body: missing data, type, or attributes');
        error.receivedBody = JSON.stringify(body);
        throw error;
    }

    if (body.data.type !== 'recordings') {
        throw new Error(`Invalid JSON:API type: expected 'recordings', got '${body.data.type}'`);
    }

    // Return attributes directly since jsonapi-serializer can be finicky
    return body.data.attributes;
};
