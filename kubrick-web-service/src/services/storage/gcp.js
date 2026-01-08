import { Storage } from '@google-cloud/storage';

let storage = null;

const getStorage = () => {
    if (!storage) {
        storage = new Storage({
            projectId: process.env.GCP_PROJECT_ID,
        });
    }
    return storage;
};

/**
 * Get a signed URL for GCP Cloud Storage (simple read/write)
 */
export const getSignedUrl = async (bucket, key, operation = 'read', contentType = 'video/webm') => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);

    const options = {
        version: 'v4',
        expires: Date.now() + (operation === 'write' ? 120 : 60) * 60 * 1000,
    };

    if (operation === 'write') {
        options.action = 'write';
        options.contentType = contentType;
    } else {
        options.action = 'read';
    }

    const [url] = await file.getSignedUrl(options);
    return url;
};

/**
 * Initialize a resumable upload session
 * Returns a resumable upload URI that can be used to upload chunks
 */
export const initResumableUpload = async (bucket, key, contentType = 'video/webm', fileSize, origin) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);

    const options = {
        metadata: {
            contentType,
        },
    };

    // Include origin for CORS support when uploading from browser
    if (origin) {
        options.origin = origin;
    }

    const [uploadUri] = await file.createResumableUpload(options);

    return {
        uploadId: uploadUri,
        bucket,
        key,
    };
};

/**
 * Get a signed URL for uploading a specific chunk/range
 * For GCP resumable uploads, we return the resumable URI with range info
 */
export const getChunkUploadUrl = async (bucket, key, uploadId, partNumber, chunkSize, totalSize) => {
    // For GCP, the uploadId IS the resumable upload URI
    // The frontend will use this URI with Content-Range header
    return {
        uploadUrl: uploadId,
        partNumber,
    };
};

/**
 * Complete a resumable upload (GCP handles this automatically when last chunk is uploaded)
 */
export const completeResumableUpload = async (bucket, key, uploadId, parts) => {
    // GCP resumable uploads complete automatically when the final byte is uploaded
    // Verify the file exists
    const exists = await fileExists(bucket, key);
    if (!exists) {
        throw new Error('Upload failed - file not found after completion');
    }
    return { bucket, key };
};

/**
 * Abort a resumable upload
 */
export const abortResumableUpload = async (bucket, key, uploadId) => {
    // For GCP, we can delete the partial file if it exists
    try {
        await deleteFile(bucket, key);
    } catch (err) {
        // Ignore if file doesn't exist
    }
};

/**
 * Delete a file from GCP Cloud Storage
 */
export const deleteFile = async (bucket, key) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);
    await file.delete();
};

/**
 * Check if a file exists in GCP Cloud Storage
 */
export const fileExists = async (bucket, key) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);
    const [exists] = await file.exists();
    return exists;
};

/**
 * Download a file from GCP Cloud Storage as a buffer
 * Used for proxying HLS content
 */
export const downloadFile = async (bucket, key) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);
    const [contents] = await file.download();
    return contents;
};

/**
 * Create a read stream for a file in GCP Cloud Storage
 * Used for streaming large files
 */
export const createReadStream = (bucket, key) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);
    return file.createReadStream();
};

/**
 * Upload a local file to GCP Cloud Storage
 * Used for HLS segments and manifests
 */
export const uploadFile = async (bucket, key, localPath, contentType = 'application/octet-stream', options = {}) => {
    const storage = getStorage();

    const uploadOptions = {
        destination: key,
        metadata: {
            contentType,
            cacheControl: options.cacheControl || 'public, max-age=31536000',
        },
    };

    await storage.bucket(bucket).upload(localPath, uploadOptions);
    return { bucket, key };
};

/**
 * Upload a buffer directly to GCP Cloud Storage
 * Used for streaming chunks
 */
export const uploadBuffer = async (bucket, key, buffer, contentType = 'application/octet-stream', options = {}) => {
    const storage = getStorage();
    const file = storage.bucket(bucket).file(key);

    await file.save(buffer, {
        contentType,
        metadata: {
            cacheControl: options.cacheControl || 'public, max-age=31536000',
        },
    });

    return { bucket, key };
};
