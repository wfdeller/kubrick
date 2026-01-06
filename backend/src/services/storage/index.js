import * as gcp from './gcp.js';
import * as s3 from './s3.js';

const getProvider = () => {
    const provider = process.env.STORAGE_PROVIDER || 'gcp';
    return provider === 's3' ? s3 : gcp;
};

/**
 * Generate a storage key for a recording
 * @param {string} recordingId - MongoDB ObjectId of the recording
 * @param {number} sequence - Sequence number for the day
 */
export const generateStorageKey = (recordingId, sequence = 1) => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const seq = String(sequence).padStart(3, '0');

    return `recordings/${year}/${month}/${day}/${recordingId}-${seq}.webm`;
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
    const provider = getProvider();
    return provider.getSignedUrl(bucket, key, operation, contentType);
};

/**
 * Delete a file from storage
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 */
export const deleteFile = async (bucket, key) => {
    const provider = getProvider();
    return provider.deleteFile(bucket, key);
};

/**
 * Check if a file exists
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
export const fileExists = async (bucket, key) => {
    const provider = getProvider();
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
    const provider = getProvider();
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
    const provider = getProvider();
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
    const provider = getProvider();
    return provider.completeResumableUpload(bucket, key, uploadId, parts);
};

/**
 * Abort a resumable/multipart upload
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {string} uploadId - Upload session ID
 */
export const abortResumableUpload = async (bucket, key, uploadId) => {
    const provider = getProvider();
    return provider.abortResumableUpload(bucket, key, uploadId);
};

/**
 * Get the current storage provider name
 * @returns {string}
 */
export const getProviderName = () => {
    return process.env.STORAGE_PROVIDER || 'gcp';
};
