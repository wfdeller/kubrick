import * as gcp from './gcp.js';
import * as s3 from './s3.js';

const provider = process.env.STORAGE_PROVIDER?.toLowerCase() === 's3' ? s3 : gcp;

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
    return `${generateStreamPrefix(recordingId, date)}/stream.m3u8`;
};

/**
 * Get a signed URL for upload or download
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} operation - 'read' or 'write'
 * @param {string} contentType - Content type for uploads
 * @returns {Promise<string>} Signed URL
 */
export const getSignedUrl = async (bucket, key, operation = 'read', contentType = 'video/webm') => {
    return provider.getSignedUrl(bucket, key, operation, contentType);
};

/**
 * Delete a file from storage
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 */
export const deleteFile = async (bucket, key) => {
    return provider.deleteFile(bucket, key);
};

/**
 * Check if a file exists
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
export const fileExists = async (bucket, key) => {
    return provider.fileExists(bucket, key);
};

/**
 * Initialize a resumable/multipart upload
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} contentType - Content type
 * @param {number} fileSize - Total file size in bytes
 * @param {string} origin - Origin header for CORS (browser uploads)
 * @returns {Promise<{uploadId: string, bucket: string, key: string}>}
 */
export const initResumableUpload = async (bucket, key, contentType = 'video/webm', fileSize, origin) => {
    return provider.initResumableUpload(bucket, key, contentType, fileSize, origin);
};

/**
 * Get upload URL for a specific chunk
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} uploadId - Upload session ID
 * @param {number} partNumber - Part number (1-indexed)
 * @param {number} chunkSize - Size of this chunk
 * @param {number} totalSize - Total file size
 * @returns {Promise<{uploadUrl: string, partNumber: number}>}
 */
export const getChunkUploadUrl = async (bucket, key, uploadId, partNumber, chunkSize, totalSize) => {
    return provider.getChunkUploadUrl(bucket, key, uploadId, partNumber, chunkSize, totalSize);
};

/**
 * Complete a resumable/multipart upload
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} uploadId - Upload session ID
 * @param {Array<{partNumber: number, etag: string}>} parts - Uploaded parts
 * @returns {Promise<{bucket: string, key: string}>}
 */
export const completeResumableUpload = async (bucket, key, uploadId, parts) => {
    return provider.completeResumableUpload(bucket, key, uploadId, parts);
};

/**
 * Abort a resumable/multipart upload
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} uploadId - Upload session ID
 */
export const abortResumableUpload = async (bucket, key, uploadId) => {
    return provider.abortResumableUpload(bucket, key, uploadId);
};

/**
 * Get the current storage provider name
 * @returns {string}
 */
export const getProviderName = () => {
    return process.env.STORAGE_PROVIDER.toLowerCase();
};

/**
 * Get the configured bucket name for the current storage provider
 * @returns {string}
 */
export const getBucketName = () => {
    const storageProvider = process.env.STORAGE_PROVIDER.toLowerCase();
    if (storageProvider === 's3') {
        return process.env.AWS_BUCKET_NAME;
    }
    return process.env.GCP_BUCKET_NAME;
};

// ============================================
// STREAMING FUNCTIONS
// ============================================

/**
 * Upload an HLS segment file to storage
 * @param {string} bucket - Bucket name
 * @param {string} key - Storage key for the segment
 * @param {string} localPath - Local file path to upload
 */
export const uploadStreamSegment = async (bucket, key, localPath) => {
    return provider.uploadFile(bucket, key, localPath, 'video/mp2t');
};

/**
 * Upload an HLS manifest file to storage
 * @param {string} bucket - Bucket name
 * @param {string} key - Storage key for the manifest
 * @param {string} localPath - Local file path to upload
 */
export const uploadStreamManifest = async (bucket, key, localPath) => {
    return provider.uploadFile(bucket, key, localPath, 'application/vnd.apple.mpegurl', {
        cacheControl: 'no-cache, no-store, must-revalidate',
    });
};

/**
 * Get a public/signed URL for stream playback
 * @param {string} bucket - Bucket name
 * @param {string} key - Manifest key
 * @returns {Promise<string>} Playback URL
 */
export const getStreamPlaybackUrl = async (bucket, key) => {
    return provider.getSignedUrl(bucket, key, 'read', 'application/vnd.apple.mpegurl');
};

/**
 * Download a file from storage as a buffer
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {Promise<Buffer>}
 */
export const downloadFile = async (bucket, key) => {
    return provider.downloadFile(bucket, key);
};

/**
 * Create a read stream for a file in storage
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {ReadableStream}
 */
export const createReadStream = (bucket, key) => {
    return provider.createReadStream(bucket, key);
};
