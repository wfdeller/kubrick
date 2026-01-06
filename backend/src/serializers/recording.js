import JSONAPISerializer from 'jsonapi-serializer';

const { Serializer } = JSONAPISerializer;

export const RecordingSerializer = new Serializer('recordings', {
    attributes: [
        'title',
        'description',
        'recorderName',
        'eventId',
        'civId',
        'aNumber',
        'storageProvider',
        'duration',
        'fileBytes',
        'mimeType',
        'quality',
        'sessionInfo',
        'status',
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
        return {
            ...obj,
            id: obj._id?.toString() || obj.id,
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
