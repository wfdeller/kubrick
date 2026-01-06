import { useState, useCallback, useRef } from 'react';

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const CONCURRENT_UPLOADS = 3; // Number of parallel chunk uploads

/**
 * Hook for chunked/resumable file uploads
 * Supports both GCP resumable uploads and S3 multipart uploads
 */
export const useChunkedUpload = () => {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadedChunks, setUploadedChunks] = useState(0);
    const [totalChunks, setTotalChunks] = useState(0);
    const [error, setError] = useState(null);
    const [currentSpeed, setCurrentSpeed] = useState(0);

    const abortControllerRef = useRef(null);
    const uploadStateRef = useRef(null);
    const bytesUploadedRef = useRef(0);
    const totalBytesRef = useRef(0);

    /**
     * Sleep for a given number of milliseconds
     */
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * Upload a single chunk with retry logic and progress tracking
     */
    const uploadChunk = async (blob, partNumber, recordingId, provider, onChunkProgress, chunkInfo, retryCount = 0) => {
        try {
            // Get presigned URL for this chunk
            const urlResponse = await fetch('/api/upload/chunk-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordingId,
                    partNumber,
                    chunkSize: blob.size,
                }),
            });

            if (!urlResponse.ok) {
                throw new Error(`Failed to get chunk URL: ${urlResponse.status}`);
            }

            const { uploadUrl } = await urlResponse.json();

            // Upload the chunk using XMLHttpRequest for progress tracking
            const startTime = Date.now();
            let chunkBytesUploaded = 0;

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', uploadUrl);

                if (provider === 'gcp') {
                    // GCP resumable upload requires Content-Range header
                    const { start, end, total } = chunkInfo;
                    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end - 1}/${total}`);
                    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                }

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const newBytes = event.loaded - chunkBytesUploaded;
                        chunkBytesUploaded = event.loaded;
                        if (onChunkProgress) {
                            onChunkProgress(newBytes);
                        }

                        // Calculate speed
                        const elapsed = (Date.now() - startTime) / 1000;
                        if (elapsed > 0) {
                            setCurrentSpeed(Math.round(event.loaded / elapsed / 1024));
                        }
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const etag = xhr.getResponseHeader('etag');
                        resolve({
                            partNumber,
                            etag: etag?.replace(/"/g, '') || `part-${partNumber}`,
                        });
                    } else if (provider === 'gcp' && xhr.status === 308) {
                        // GCP resumable upload incomplete response - this is OK for intermediate chunks
                        resolve({
                            partNumber,
                            etag: `part-${partNumber}`,
                        });
                    } else {
                        reject(new Error(`Chunk upload failed: ${xhr.status} - ${xhr.responseText}`));
                    }
                };

                xhr.onerror = () => reject(new Error('Chunk upload network error'));
                xhr.send(blob);
            });
        } catch (err) {
            if (retryCount < MAX_RETRIES) {
                console.warn(`Chunk ${partNumber} failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
                await sleep(RETRY_DELAY * (retryCount + 1));
                return uploadChunk(blob, partNumber, recordingId, provider, onChunkProgress, chunkInfo, retryCount + 1);
            }
            throw err;
        }
    };

    /**
     * Upload a file in chunks
     * @param {Blob} blob - The file to upload
     * @param {string} recordingId - MongoDB recording ID
     * @param {number} duration - Recording duration in seconds
     * @param {function} onProgress - Progress callback
     */
    const uploadFile = useCallback(async (blob, recordingId, duration, onProgress) => {
        setIsUploading(true);
        setProgress(0);
        setError(null);
        setUploadedChunks(0);
        bytesUploadedRef.current = 0;
        totalBytesRef.current = blob.size;

        abortControllerRef.current = new AbortController();

        try {
            // Step 1: Initialize chunked upload
            const initResponse = await fetch('/api/upload/init-chunked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordingId,
                    contentType: blob.type,
                    fileSize: blob.size,
                }),
            });

            if (!initResponse.ok) {
                const errorData = await initResponse.json();
                throw new Error(errorData.errors?.[0]?.detail || 'Failed to initialize upload');
            }

            const { chunkSize, totalChunks: numChunks, provider } = await initResponse.json();
            setTotalChunks(numChunks);

            // Store upload state for potential resume
            uploadStateRef.current = {
                recordingId,
                provider,
                chunkSize,
                totalChunks: numChunks,
                completedParts: [],
            };

            // Progress callback for byte-level tracking
            const handleChunkProgress = (bytesUploaded) => {
                bytesUploadedRef.current += bytesUploaded;
                const progressPercent = Math.round((bytesUploadedRef.current / totalBytesRef.current) * 100);
                setProgress(Math.min(progressPercent, 99)); // Cap at 99 until complete
            };

            // Step 2: Split blob into chunks and upload
            const chunks = [];
            for (let i = 0; i < numChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, blob.size);
                chunks.push({
                    partNumber: i + 1, // 1-indexed for S3 compatibility
                    blob: blob.slice(start, end),
                    chunkInfo: { start, end, total: blob.size },
                });
            }

            // Upload chunks
            const completedParts = [];
            let uploadedCount = 0;

            if (provider === 'gcp') {
                // GCP resumable uploads must be sequential (bytes must be in order)
                for (const chunk of chunks) {
                    const result = await uploadChunk(
                        chunk.blob,
                        chunk.partNumber,
                        recordingId,
                        provider,
                        handleChunkProgress,
                        chunk.chunkInfo
                    );
                    completedParts.push(result);
                    uploadedCount++;
                    setUploadedChunks(uploadedCount);
                    uploadStateRef.current.completedParts = completedParts;

                    if (onProgress) {
                        const progressPercent = Math.round((bytesUploadedRef.current / totalBytesRef.current) * 100);
                        onProgress(progressPercent, uploadedCount, numChunks);
                    }
                }
            } else {
                // S3 multipart uploads can be parallel
                for (let i = 0; i < chunks.length; i += CONCURRENT_UPLOADS) {
                    const batch = chunks.slice(i, i + CONCURRENT_UPLOADS);

                    const batchResults = await Promise.all(
                        batch.map((chunk) =>
                            uploadChunk(
                                chunk.blob,
                                chunk.partNumber,
                                recordingId,
                                provider,
                                handleChunkProgress,
                                chunk.chunkInfo
                            )
                        )
                    );

                    completedParts.push(...batchResults);
                    uploadedCount += batch.length;
                    setUploadedChunks(uploadedCount);
                    uploadStateRef.current.completedParts = completedParts;

                    if (onProgress) {
                        const progressPercent = Math.round((bytesUploadedRef.current / totalBytesRef.current) * 100);
                        onProgress(progressPercent, uploadedCount, numChunks);
                    }
                }
            }

            // Step 3: Complete the upload
            const completeResponse = await fetch('/api/upload/complete-chunked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recordingId,
                    parts: completedParts,
                    duration,
                }),
            });

            if (!completeResponse.ok) {
                const errorData = await completeResponse.json();
                throw new Error(errorData.errors?.[0]?.detail || 'Failed to complete upload');
            }

            setProgress(100);
            setIsUploading(false);
            uploadStateRef.current = null;

            return { success: true };
        } catch (err) {
            console.error('Chunked upload error:', err);
            setError(err.message);
            setIsUploading(false);
            return { success: false, error: err.message };
        }
    }, []);

    /**
     * Abort the current upload
     */
    const abortUpload = useCallback(async (recordingId) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        try {
            await fetch('/api/upload/abort-chunked', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordingId }),
            });
        } catch (err) {
            console.error('Failed to abort upload:', err);
        }

        setIsUploading(false);
        setProgress(0);
        uploadStateRef.current = null;
    }, []);

    /**
     * Reset upload state
     */
    const reset = useCallback(() => {
        setIsUploading(false);
        setProgress(0);
        setUploadedChunks(0);
        setTotalChunks(0);
        setError(null);
        setCurrentSpeed(0);
        uploadStateRef.current = null;
    }, []);

    return {
        uploadFile,
        abortUpload,
        reset,
        isUploading,
        progress,
        uploadedChunks,
        totalChunks,
        error,
        currentSpeed,
    };
};
