import * as gcp from './gcp.js';

export const downloadFile = (bucket, key) => gcp.downloadFile(bucket, key);
export const uploadFile = (bucket, key, localPath, contentType, options) =>
    gcp.uploadFile(bucket, key, localPath, contentType, options);
export const uploadBuffer = (bucket, key, buffer, contentType, options) =>
    gcp.uploadBuffer(bucket, key, buffer, contentType, options);
export const getSignedUrl = (bucket, key) => gcp.getSignedUrl(bucket, key);

export const getBucketName = () => process.env.GCP_BUCKET_NAME;
