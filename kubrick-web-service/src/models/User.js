import mongoose from 'mongoose';

const { Schema } = mongoose;

const OKTA_ENABLED = process.env.OKTA_ENABLED === 'true';

const UserSchema = new Schema(
    {
        email: {
            type: String,
            required: OKTA_ENABLED,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        oktaId: {
            type: String,
            default: null,
            sparse: true,
        },
        role: {
            type: String,
            enum: ['viewer', 'recorder', 'admin'],
            default: 'recorder',
        },
        preferences: {
            defaultQuality: {
                type: String,
                enum: ['480p', '720p', '1080p'],
                default: '720p',
            },
        },
        lastLogin: Date,
    },
    {
        timestamps: true,
    }
);

// Index for lookups
UserSchema.index({ email: 1 });
UserSchema.index({ oktaId: 1 });
UserSchema.index({ displayName: 1 });

export default mongoose.model('User', UserSchema);
