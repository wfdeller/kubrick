import {
    S3Client,
    DeleteObjectCommand,
    HeadObjectCommand,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    PutObjectCommand,
    GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';

let s3Client = null;

const getS3Client = () => {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }
    return s3Client;
};

/**
 * Get a signed URL for AWS S3 (simple read/write)
 */
export const getSignedUrl = async (bucket, key, operation = 'read', contentType = 'video/webm') => {
    const client = getS3Client();
    const expiresIn = operation === 'write' ? 120 * 60 : 60 * 60;

    let command;
    if (operation === 'write') {
        command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
        });
    } else {
        command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
    }

    return getS3SignedUrl(client, command, { expiresIn });
};

/**
 * Initialize a multipart upload
 */
export const initResumableUpload = async (bucket, key, contentType = 'video/webm', fileSize, origin) => {
    // S3 doesn't use origin for CORS (handled at bucket level)
    const client = getS3Client();

    const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });

    const response = await client.send(command);

    return {
        uploadId: response.UploadId,
        bucket,
        key,
    };
};

/**
 * Get a presigned URL for uploading a specific part
 */
export const getChunkUploadUrl = async (bucket, key, uploadId, partNumber, chunkSize, totalSize) => {
    const client = getS3Client();

    const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
    });

    const uploadUrl = await getS3SignedUrl(client, command, { expiresIn: 3600 });

    return {
        uploadUrl,
        partNumber,
    };
};

/**
 * Complete a multipart upload
 */
export const completeResumableUpload = async (bucket, key, uploadId, parts) => {
    const client = getS3Client();

    // Parts must be sorted by part number and include ETag
    const sortedParts = parts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
        }));

    const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: sortedParts,
        },
    });

    await client.send(command);
    return { bucket, key };
};

/**
 * Abort a multipart upload
 */
export const abortResumableUpload = async (bucket, key, uploadId) => {
    const client = getS3Client();

    const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
    });

    await client.send(command);
};

/**
 * Delete a file from AWS S3
 */
export const deleteFile = async (bucket, key) => {
    const client = getS3Client();

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    });

    await client.send(command);
};

/**
 * Check if a file exists in AWS S3
 */
export const fileExists = async (bucket, key) => {
    const client = getS3Client();

    try {
        const command = new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        await client.send(command);
        return true;
    } catch (err) {
        if (err.name === 'NotFound') {
            return false;
        }
        throw err;
    }
};

/**
 * Download a file from AWS S3 as a buffer
 * Used for proxying HLS content
 */
export const downloadFile = async (bucket, key) => {
    const client = getS3Client();
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    const response = await client.send(command);
    // Convert readable stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

/**
 * Create a read stream for a file in AWS S3
 * Used for streaming large files
 */
export const createReadStream = async (bucket, key) => {
    const client = getS3Client();
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    const response = await client.send(command);
    return response.Body;
};

/**
 * Upload a local file to AWS S3
 * Used for HLS segments and manifests
 */
export const uploadFile = async (bucket, key, localPath, contentType = 'application/octet-stream', options = {}) => {
    const client = getS3Client();
    const fileContent = fs.readFileSync(localPath);

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: options.cacheControl || 'public, max-age=31536000',
    });

    await client.send(command);
    return { bucket, key };
};
