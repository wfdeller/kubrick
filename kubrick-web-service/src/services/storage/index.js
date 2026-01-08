import * as gcp from './gcp.js';

/**
 * Generate the date-based path prefix for a recording
 * @param {Date} date - Date to use for path (defaults to now)
 * @returns {string} Path prefix like "recordings/2026/01/08"
 */
export const generateDatePrefix = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `recordings/${year}/${month}/${day}`;
};

/**
 * Generate a storage key for a video recording
 * @param {string} recordingId - MongoDB ObjectId of the recording
 * @param {Date} date - Date to use for path (defaults to now)
 */
export const generateStorageKey = (recordingId, date = new Date()) => {
    return `${generateDatePrefix(date)}/${recordingId}.webm`;
};

/**
 * Generate a storage key for a thumbnail
 * @param {string} recordingId - MongoDB ObjectId of the recording
 * @param {Date} date - Date to use for path (defaults to now)
 */
export const generateThumbnailKey = (recordingId, date = new Date()) => {
    return `${generateDatePrefix(date)}/${recordingId}.jpg`;
};

/**
 * Generate the storage prefix for HLS stream files
 * @param {string} recordingId - MongoDB ObjectId of the recording
 * @param {Date} date - Date to use for path (defaults to now)
 */
export const generateStreamPrefix = (recordingId, date = new Date()) => {
    return `${generateDatePrefix(date)}/${recordingId}`;
};

/**
 * Generate a storage key for an HLS manifest
 * @param {string} recordingId - MongoDB ObjectId of the recording
 * @param {Date} date - Date to use for path (defaults to now)
 */
export const generateStreamManifestKey = (recordingId, date = new Date()) => {
    return `${generateStreamPrefix(recordingId, date)}/hls/stream.m3u8`;
};

/**
 * Get a signed URL for upload or download
 */
export const getSignedUrl = async (bucket, key, operation = 'read', contentType = 'video/webm') => {
    return gcp.getSignedUrl(bucket, key, operation, contentType);
};

/**
 * Delete a file from storage
 */
export const deleteFile = async (bucket, key) => {
    return gcp.deleteFile(bucket, key);
};

/**
 * Check if a file exists
 */
export const fileExists = async (bucket, key) => {
    return gcp.fileExists(bucket, key);
};

/**
 * Initialize a resumable upload
 */
export const initResumableUpload = async (bucket, key, contentType = 'video/webm', fileSize, origin) => {
    return gcp.initResumableUpload(bucket, key, contentType, fileSize, origin);
};

/**
 * Get upload URL for a specific chunk
 */
export const getChunkUploadUrl = async (bucket, key, uploadId, partNumber, chunkSize, totalSize) => {
    return gcp.getChunkUploadUrl(bucket, key, uploadId, partNumber, chunkSize, totalSize);
};

/**
 * Complete a resumable upload
 */
export const completeResumableUpload = async (bucket, key, uploadId, parts) => {
    return gcp.completeResumableUpload(bucket, key, uploadId, parts);
};

/**
 * Abort a resumable upload
 */
export const abortResumableUpload = async (bucket, key, uploadId) => {
    return gcp.abortResumableUpload(bucket, key, uploadId);
};

/**
 * Get the configured bucket name
 */
export const getBucketName = () => {
    return process.env.GCP_BUCKET_NAME;
};

/**
 * Upload an HLS segment file to storage
 */
export const uploadStreamSegment = async (bucket, key, localPath) => {
    return gcp.uploadFile(bucket, key, localPath, 'video/mp2t');
};

/**
 * Upload an HLS manifest file to storage
 */
export const uploadStreamManifest = async (bucket, key, localPath) => {
    return gcp.uploadFile(bucket, key, localPath, 'application/vnd.apple.mpegurl', {
        cacheControl: 'no-cache, no-store, must-revalidate',
    });
};

/**
 * Get a signed URL for stream playback
 */
export const getStreamPlaybackUrl = async (bucket, key) => {
    return gcp.getSignedUrl(bucket, key, 'read', 'application/vnd.apple.mpegurl');
};

/**
 * Download a file from storage as a buffer
 */
export const downloadFile = async (bucket, key) => {
    return gcp.downloadFile(bucket, key);
};

/**
 * Upload a buffer directly to storage
 */
export const uploadBuffer = async (bucket, key, buffer, contentType = 'application/octet-stream', options = {}) => {
    return gcp.uploadBuffer(bucket, key, buffer, contentType, options);
};

/**
 * Create a read stream for a file in storage
 */
export const createReadStream = (bucket, key) => {
    return gcp.createReadStream(bucket, key);
};
