/**
 * Create a new recording metadata entry
 */
export const createRecording = async (attributes) => {
    const response = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({
            data: {
                type: 'recordings',
                attributes,
            },
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to create recording metadata');
    }

    const result = await response.json();
    return result.data;
};

/**
 * Stop a live stream via REST API (fallback when WebSocket is unavailable)
 * @param {string} recordingId - Recording ID
 * @param {object} stats - Recording statistics
 * @param {number} stats.duration - Actual recording duration in seconds (excluding paused time)
 * @param {number} stats.pauseCount - Number of times recording was paused
 * @param {number} stats.pauseDurationTotal - Total paused duration in seconds
 * @param {Array} stats.pauseEvents - Array of pause events with timestamps
 */
export const stopLiveStream = async (recordingId, stats = {}) => {
    const response = await fetch(`/api/streams/${recordingId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stats),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.errors?.[0]?.detail || 'Failed to stop live stream');
    }

    return response.json();
};

/**
 * Upload a thumbnail for a recording
 */
export const uploadThumbnail = async (recordingId, thumbnailBlob) => {
    const response = await fetch('/api/upload/thumbnail-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId }),
    });

    if (!response.ok) {
        throw new Error('Failed to get thumbnail upload URL');
    }

    const { uploadUrl } = await response.json();

    await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: thumbnailBlob,
    });
};
