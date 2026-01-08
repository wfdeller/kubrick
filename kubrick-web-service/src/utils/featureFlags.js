/**
 * Feature flags utility
 * Controls feature availability based on environment variables
 */

/**
 * Check if live streaming feature is enabled
 * Set LIVE_STREAMING_ENABLED=true in .env to enable
 */
export const isLiveStreamingEnabled = () => {
    const value = process.env.LIVE_STREAMING_ENABLED;
    return value === 'true' || value === '1';
};

/**
 * Get all feature flags and their current state
 */
export const getFeatureFlags = () => {
    return {
        liveStreaming: isLiveStreamingEnabled(),
    };
};

/**
 * Middleware to check if live streaming is enabled
 * Returns 404 if feature is disabled (to avoid leaking feature existence)
 */
export const requireLiveStreaming = (req, res, next) => {
    if (!isLiveStreamingEnabled()) {
        return res.status(404).json({
            errors: [
                {
                    status: '404',
                    code: 'NOT_FOUND',
                    title: 'Not Found',
                    detail: 'The requested resource was not found',
                },
            ],
        });
    }
    next();
};
