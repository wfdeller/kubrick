import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch and check feature flags from the backend
 */
export const useFeatureFlags = () => {
    const { data, isLoading, error } = useQuery({
        queryKey: ['features'],
        queryFn: async () => {
            const response = await fetch('/api/features');
            if (!response.ok) {
                throw new Error('Failed to fetch feature flags');
            }
            const result = await response.json();
            return result.data.attributes;
        },
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    });

    return {
        features: data || { liveStreaming: false },
        isLoading,
        error,
        isLiveStreamingEnabled: data?.liveStreaming || false,
    };
};
