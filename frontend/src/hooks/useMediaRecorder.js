import { useState, useRef, useCallback, useEffect } from 'react';

const QUALITY_CONSTRAINTS = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};

export const useMediaRecorder = (quality = '720p') => {
    const [stream, setStream] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState(null);
    const [recordedBlob, setRecordedBlob] = useState(null);

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const constraints = QUALITY_CONSTRAINTS[quality] || QUALITY_CONSTRAINTS['720p'];

    const initializeStream = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: constraints.width },
                    height: { ideal: constraints.height },
                    facingMode: 'user',
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            setStream(mediaStream);
            setError(null);
            return mediaStream;
        } catch (err) {
            const message =
                err.name === 'NotAllowedError'
                    ? 'Camera/microphone permission denied. Please allow access to record.'
                    : err.name === 'NotFoundError'
                    ? 'No camera or microphone found on this device.'
                    : `Failed to access camera: ${err.message}`;
            setError(message);
            return null;
        }
    }, [constraints.width, constraints.height]);

    const startRecording = useCallback(async () => {
        let mediaStream = stream;

        if (!mediaStream) {
            mediaStream = await initializeStream();
            if (!mediaStream) return false;
        }

        try {
            chunksRef.current = [];
            setRecordedBlob(null);

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm';

            const mediaRecorder = new MediaRecorder(mediaStream, {
                mimeType,
                videoBitsPerSecond: quality === '1080p' ? 5000000 : quality === '720p' ? 2500000 : 1000000,
            });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                setRecordedBlob(blob);
                setIsRecording(false);
                setIsPaused(false);
            };

            mediaRecorder.onerror = (event) => {
                setError(`Recording error: ${event.error?.message || 'Unknown error'}`);
                setIsRecording(false);
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000); // Collect data every second
            setIsRecording(true);
            setIsPaused(false);
            return true;
        } catch (err) {
            setError(`Failed to start recording: ${err.message}`);
            return false;
        }
    }, [stream, initializeStream, quality]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    }, []);

    const pauseRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
        }
    }, []);

    const resumeRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
        }
    }, []);

    const cleanup = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
        if (mediaRecorderRef.current) {
            if (mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            mediaRecorderRef.current = null;
        }
        chunksRef.current = [];
        setRecordedBlob(null);
        setIsRecording(false);
        setIsPaused(false);
    }, [stream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [stream]);

    return {
        stream,
        isRecording,
        isPaused,
        error,
        recordedBlob,
        initializeStream,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        cleanup,
        clearError: () => setError(null),
    };
};
