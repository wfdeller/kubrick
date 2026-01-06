const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const IterationSchema = new Schema({
    iterationNumber: {
        type: Number,
        required: true,
        default: 0,
    },
    iterationType: {
        type: String,
        required: true,
        enum: ['original', 'extract', 'clip', 'thumbnail'],
        default: 'original',
    },
    parentIterationId: {
        type: Schema.Types.ObjectId,
        ref: 'Media.iterations',
        default: null,
    },
    startTime: {
        type: Number, // in seconds
        default: null,
    },
    endTime: {
        type: Number, // in seconds
        default: null,
    },
    url: {
        type: String,
        required: true,
    },
    thumbnail: {
        type: String,
    },
    duration: {
        type: Number,
    },
    fileBytes: {
        type: Number,
        required: true,
    },
    mimeType: {
        type: String,
        required: true,
    },
    checksum: {
        type: String,
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'ready', 'error', 'archived'],
        default: 'pending',
    },
    metadata: {
        type: Map,
        of: Schema.Types.Mixed,
    },
    tags: {
        type: [String],
        default: [],
    },
    views: {
        type: Number,
        default: 0,
    },
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
});

const MediaSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
        },
        userId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        evidence: {
            caseNumber: {
                type: String,
            },
            evidenceNumber: {
                type: String,
            },
            description: {
                type: String,
            },
            tags: [
                {
                    type: String,
                },
            ],
        },
        device: {
            make: {
                type: String,
            },
            model: {
                type: String,
            },
            serialNumber: {
                type: String,
            },
            osVersion: {
                type: String,
            },
            location: {
                type: String,
            },
        },
        gps: {
            latitude: {
                type: Number,
            },
            longitude: {
                type: Number,
            },
            altitude: {
                type: Number,
            },
            timestamp: {
                type: Date,
            },
            locationName: {
                type: String,
            },
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'archived'],
            default: 'active',
        },
        iterations: [IterationSchema],
        defaultIterationIndex: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for default iteration
MediaSchema.virtual('defaultIteration').get(function () {
    if (this.iterations && this.iterations.length > 0) {
        return this.iterations[this.defaultIterationIndex];
    }
    return null;
});

// Virtual for category
MediaSchema.virtual('category', {
    ref: 'Category',
    localField: 'categoryId',
    foreignField: '_id',
    justOne: true,
});

// Virtual for organization (through category)
MediaSchema.virtual('organization', {
    ref: 'Organization',
    localField: 'category.organizationId',
    foreignField: '_id',
    justOne: true,
});

// Virtual for user who created this media
MediaSchema.virtual('creator', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true,
});

// Index for efficient queries
MediaSchema.index({ userId: 1 });
MediaSchema.index({ categoryId: 1 });

module.exports = mongoose.model('Media', MediaSchema);
