import { Storage } from '@google-cloud/storage';

let storage = null;

const getStorage = () => {
    if (!storage) {
        storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
    }
    return storage;
};

export const downloadFile = async (bucket, key) => {
    const file = getStorage().bucket(bucket).file(key);
    const [contents] = await file.download();
    return contents;
};

export const uploadFile = async (bucket, key, localPath, contentType, options = {}) => {
    await getStorage().bucket(bucket).upload(localPath, {
        destination: key,
        metadata: {
            contentType,
            cacheControl: options.cacheControl || 'public, max-age=31536000',
        },
    });
    return { bucket, key };
};

export const uploadBuffer = async (bucket, key, buffer, contentType, options = {}) => {
    const file = getStorage().bucket(bucket).file(key);
    await file.save(buffer, {
        contentType,
        metadata: { cacheControl: options.cacheControl || 'public, max-age=31536000' },
    });
    return { bucket, key };
};

export const getSignedUrl = async (bucket, key) => {
    const file = getStorage().bucket(bucket).file(key);
    const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
    });
    return url;
};
