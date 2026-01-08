/**
 * Hook for feature flags
 * Live streaming is now always enabled - this hook is kept for backwards compatibility
 */
export const useFeatureFlags = () => {
    return {
        features: { liveStreaming: true },
        isLoading: false,
        error: null,
        isLiveStreamingEnabled: true,
    };
};
