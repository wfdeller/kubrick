import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Select, Alert, Switch, message } from 'antd';
import { CloseCircleOutlined, WifiOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { useSessionInfo } from '../../hooks/useSessionInfo';
import { useChunkedUpload } from '../../hooks/useChunkedUpload';
import { useLiveStream } from '../../hooks/useLiveStream';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useRecordingStore } from '../../stores/recordingStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { createRecording, uploadThumbnail } from '../../api/recordingService';
import CameraPreview from './CameraPreview';
import RecordingControls from './RecordingControls';
import RecordingMetadata from './RecordingMetadata';
import RecordingProgress from './RecordingProgress';
import '../../styles/components/RecordTab.css';

const QUALITY_OPTIONS = [
    { value: '480p', label: '480p (SD)' },
    { value: '720p', label: '720p (HD)' },
    { value: '1080p', label: '1080p (Full HD)' },
];

const RecordTab = () => {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState('');
    const [currentRecordingId, setCurrentRecordingId] = useState(null);
    const [liveStreamEnabled, setLiveStreamEnabled] = useState(false);
    const timerRef = useRef(null);
    const cameraRef = useRef(null);
    const thumbnailBlobRef = useRef(null);

    const { isLiveStreamingEnabled } = useFeatureFlags();

    const {
        defaultQuality,
        setDefaultQuality,
        recorderName,
        setRecorderName,
        metadata,
        setMetadata,
        setMetadataField,
    } = usePreferencesStore();

    const {
        status,
        duration,
        startRecording: setRecordingStarted,
        stopRecording: setRecordingStopped,
        setUploading,
        completeUpload,
        setError: setRecordingError,
        updateDuration,
    } = useRecordingStore();

    const { sessionInfo } = useSessionInfo();

    // Pre-populate metadata from URL parameters
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        const urlRecorderName = params.get('recorderName') || params.get('name');
        if (urlRecorderName) setRecorderName(urlRecorderName);

        const urlMetadata = { Location: '' };
        for (const [key, value] of params.entries()) {
            if (key !== 'recorderName' && key !== 'name') {
                urlMetadata[key] = value;
            }
        }
        setMetadata(urlMetadata);
    }, []);

    const {
        uploadFile,
        abortUpload,
        reset: resetUpload,
        progress: uploadProgress,
        uploadedChunks,
        totalChunks,
        currentSpeed,
    } = useChunkedUpload();

    const {
        isConnected: wsConnected,
        isStreaming,
        connect: connectLiveStream,
        disconnect: disconnectLiveStream,
        startStream: startLiveStreamSession,
        stopStream: stopLiveStreamSession,
        sendChunk,
    } = useLiveStream();

    const handleChunk = useCallback(
        (chunk) => {
            if (liveStreamEnabled && isStreaming) {
                chunk.arrayBuffer().then((buffer) => {
                    sendChunk(buffer);
                });
            }
        },
        [liveStreamEnabled, isStreaming, sendChunk]
    );

    const {
        stream,
        isRecording,
        isPaused,
        error: mediaError,
        recordedBlob,
        startRecording: startMediaRecording,
        stopRecording: stopMediaRecording,
        pauseRecording,
        resumeRecording,
        releaseCamera,
        cleanup,
        clearError,
    } = useMediaRecorder(defaultQuality, liveStreamEnabled ? handleChunk : null);

    // Cleanup camera on unmount only
    const cleanupRef = useRef(cleanup);
    cleanupRef.current = cleanup;
    useEffect(() => {
        return () => cleanupRef.current();
    }, []);

    // Connect to WebSocket when live streaming is enabled
    useEffect(() => {
        if (liveStreamEnabled && isLiveStreamingEnabled) {
            connectLiveStream();
        } else {
            disconnectLiveStream();
        }
    }, [liveStreamEnabled, isLiveStreamingEnabled]);

    // Timer for recording duration
    useEffect(() => {
        if (isRecording && !isPaused) {
            timerRef.current = setInterval(() => {
                updateDuration(duration + 1);
            }, 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isRecording, isPaused, duration, updateDuration]);

    // Handle recording completion and upload
    useEffect(() => {
        if (recordedBlob && status === 'stopped') {
            releaseCamera();

            if (liveStreamEnabled && currentRecordingId) {
                handleUpload(recordedBlob, true, currentRecordingId);
            } else {
                handleUpload(recordedBlob, false, null);
            }
        }
    }, [recordedBlob, status]);

    const handleStartRecording = async () => {
        if (!recorderName.trim()) {
            message.warning('Please enter your name before recording');
            return;
        }
        clearError();

        if (liveStreamEnabled && wsConnected) {
            try {
                const recording = await createRecording({
                    title: title.trim() || `Live Recording ${new Date().toLocaleString()}`,
                    recorderName,
                    metadata,
                    quality: defaultQuality,
                    mimeType: 'video/webm',
                    playbackFormat: 'hls',
                    sessionInfo,
                });

                setCurrentRecordingId(recording.id);

                const streamStarted = startLiveStreamSession(recording.id);
                if (!streamStarted) {
                    throw new Error('Failed to start live stream session');
                }

                message.success('Live stream started!');
            } catch (err) {
                message.error(`Failed to start live stream: ${err.message}`);
                return;
            }
        }

        const success = await startMediaRecording();
        if (success) {
            setRecordingStarted(null);
            updateDuration(0);

            setTimeout(async () => {
                if (cameraRef.current) {
                    const thumbnailBlob = await cameraRef.current.captureFrame();
                    thumbnailBlobRef.current = thumbnailBlob;
                }
            }, 500);
        }
    };

    const handleStopRecording = () => {
        if (liveStreamEnabled && isStreaming) {
            stopLiveStreamSession();
            message.info('Live stream ended');
        }

        stopMediaRecording();
        setRecordingStopped();
    };

    const handleUpload = async (blob, isLiveRecording = false, existingRecordingId = null) => {
        setUploading();
        resetUpload();

        try {
            let recordingId = existingRecordingId;

            if (!isLiveRecording) {
                const recording = await createRecording({
                    title: title.trim() || `Recording ${new Date().toLocaleString()}`,
                    recorderName,
                    metadata,
                    quality: defaultQuality,
                    mimeType: blob.type,
                    fileBytes: blob.size,
                    playbackFormat: 'video',
                    sessionInfo,
                });

                recordingId = recording.id;
                setCurrentRecordingId(recordingId);

                const result = await uploadFile(blob, recordingId, duration);

                if (!result.success) {
                    throw new Error(result.error || 'Upload failed');
                }
            }

            if (thumbnailBlobRef.current && recordingId) {
                try {
                    await uploadThumbnail(recordingId, thumbnailBlobRef.current);
                } catch (thumbErr) {
                    console.warn('Thumbnail upload failed:', thumbErr);
                }
                thumbnailBlobRef.current = null;
            }

            message.success(isLiveRecording ? 'Live recording complete!' : 'Recording uploaded successfully!');
            completeUpload();
            setTitle('');
            setCurrentRecordingId(null);
            resetUpload();

            queryClient.invalidateQueries({ queryKey: ['recordings'] });
        } catch (err) {
            console.error('Upload error:', err);
            message.error(`Upload failed: ${err.message}`);
            setRecordingError(err.message);
            setCurrentRecordingId(null);
            resetUpload();
        }
    };

    const handleCancelUpload = async () => {
        if (currentRecordingId) {
            await abortUpload(currentRecordingId);
            setCurrentRecordingId(null);
            setRecordingError('Upload cancelled');
            thumbnailBlobRef.current = null;
            message.info('Upload cancelled');
        }
    };

    const isIdle = status === 'idle' && !isRecording;
    const isUploading = status === 'uploading';

    return (
        <div className='record-tab'>
            <div className='record-main'>
                <div className='record-top-row'>
                    <div className='record-video-section'>
                        <div className='video-header'>
                            {isLiveStreamingEnabled && (
                                <div className='live-stream-toggle'>
                                    <Switch
                                        checked={liveStreamEnabled}
                                        onChange={setLiveStreamEnabled}
                                        disabled={isRecording || isUploading}
                                        size='small'
                                    />
                                    <span className={`live-stream-label ${liveStreamEnabled ? 'live-enabled' : ''}`}>
                                        <WifiOutlined style={{ marginRight: 4 }} />
                                        {liveStreamEnabled ? 'Live Streaming Enabled' : 'Live Streaming Disabled'}
                                    </span>
                                </div>
                            )}
                            <Select
                                value={defaultQuality}
                                onChange={setDefaultQuality}
                                options={QUALITY_OPTIONS}
                                disabled={isRecording || isUploading}
                                className='quality-select'
                                size='small'
                            />
                        </div>

                        <CameraPreview ref={cameraRef} stream={stream} isRecording={isRecording} />

                        {mediaError && (
                            <Alert
                                message='Camera Error'
                                description={mediaError}
                                type='error'
                                showIcon
                                closable
                                onClose={clearError}
                                className='record-error'
                            />
                        )}

                        <RecordingProgress
                            isRecording={isRecording}
                            isPaused={isPaused}
                            duration={duration}
                            liveStreamEnabled={liveStreamEnabled}
                            isStreaming={isStreaming}
                            isUploading={isUploading}
                            uploadProgress={uploadProgress}
                            uploadedChunks={uploadedChunks}
                            totalChunks={totalChunks}
                            currentSpeed={currentSpeed}
                        />
                    </div>

                    <div className='metadata-section'>
                        <div className='metadata-header'>
                            <RecordingControls
                                isIdle={isIdle}
                                isRecording={isRecording}
                                isPaused={isPaused}
                                isUploading={isUploading}
                                liveStreamEnabled={liveStreamEnabled}
                                wsConnected={wsConnected}
                                onStart={handleStartRecording}
                                onPause={pauseRecording}
                                onResume={resumeRecording}
                                onStop={handleStopRecording}
                            />
                        </div>
                        <RecordingMetadata
                            title={title}
                            recorderName={recorderName}
                            metadata={metadata}
                            disabled={isRecording || isUploading}
                            onTitleChange={setTitle}
                            onRecorderNameChange={setRecorderName}
                            onMetadataFieldChange={setMetadataField}
                        />
                    </div>
                </div>
            </div>

            {isUploading && (
                <div className='record-controls'>
                    <div className='record-controls-row'>
                        <Button size='large' loading disabled>
                            Uploading... {uploadProgress}%
                        </Button>
                        <Button size='large' danger icon={<CloseCircleOutlined />} onClick={handleCancelUpload}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecordTab;
