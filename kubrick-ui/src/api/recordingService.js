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
