import mongoose from 'mongoose';

const { Schema } = mongoose;

const SessionInfoSchema = new Schema(
    {
        ipAddress: String,
        timezone: String,
        timezoneOffset: Number,
        browserName: String,
        browserVersion: String,
        osName: String,
        osVersion: String,
        screenResolution: String,
        language: String,
        userAgent: String,
        deviceType: {
            type: String,
            enum: ['desktop', 'tablet', 'mobile', 'unknown'],
            default: 'unknown',
        },
    },
    { _id: false }
);

const RecordingSchema = new Schema(
    {
        // Core fields
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 2000,
        },
        recorderName: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        // Flexible metadata (varies per deployment)
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
        },

        // Video storage
        storageBucket: String,
        storageKey: String,
        thumbnailKey: String, // Storage key for thumbnail image
        uploadId: String, // For resumable/multipart upload sessions

        // Playback format determines how to play the video
        playbackFormat: {
            type: String,
            enum: ['video', 'hls'],
            required: true,
        },

        // Live streaming metadata
        isLiveStreaming: {
            type: Boolean,
            default: false,
        },
        streamStartedAt: Date,
        streamEndedAt: Date,

        // Video properties
        duration: {
            type: Number,
            default: 0,
        },
        // Pause tracking
        pauseCount: {
            type: Number,
            default: 0,
        },
        pauseDurationTotal: {
            type: Number,
            default: 0,
        },
        pauseEvents: [
            {
                pausedAt: Date,
                resumedAt: Date,
                duration: Number,
            },
        ],
        fileBytes: {
            type: Number,
            default: 0,
        },
        mimeType: {
            type: String,
            default: 'video/webm',
        },
        quality: {
            type: String,
            enum: ['480p', '720p', '1080p'],
            default: '720p',
        },

        // Session metadata
        sessionInfo: SessionInfoSchema,

        // Processing status
        status: {
            type: String,
            enum: ['recording', 'pending', 'transcoding', 'uploading', 'ready', 'error', 'archived'],
            default: 'recording',
            index: true,
        },

        // Edison sync (future)
        edisonSynced: {
            type: Boolean,
            default: false,
        },
        edisonMediaId: {
            type: Schema.Types.ObjectId,
            default: null,
        },

        // Timestamps
        recordedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index for efficient queries
RecordingSchema.index({ recorderName: 1, createdAt: -1 });
RecordingSchema.index({ status: 1, createdAt: -1 });

// Virtual for signed URL (will be populated by the route)
RecordingSchema.virtual('videoUrl').get(function () {
    return this._videoUrl || null;
});

RecordingSchema.virtual('videoUrl').set(function (url) {
    this._videoUrl = url;
});

RecordingSchema.virtual('thumbnailUrl').get(function () {
    return this._thumbnailUrl || null;
});

RecordingSchema.virtual('thumbnailUrl').set(function (url) {
    this._thumbnailUrl = url;
});

export default mongoose.model('Recording', RecordingSchema);
