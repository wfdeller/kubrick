import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Select, Alert, Progress, Input, message, Card, Switch, Tag, Tooltip } from 'antd';
import {
    VideoCameraOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
    CloudUploadOutlined,
    CloseCircleOutlined,
    UserOutlined,
    FormOutlined,
    WifiOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaRecorder } from '../../hooks/useMediaRecorder';
import { useSessionInfo } from '../../hooks/useSessionInfo';
import { useChunkedUpload } from '../../hooks/useChunkedUpload';
import { useLiveStream } from '../../hooks/useLiveStream';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useRecordingStore } from '../../stores/recordingStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import CameraPreview from './CameraPreview';
import '../../styles/components/RecordTab.css';

const QUALITY_OPTIONS = [
    { value: '480p', label: '480p (SD)' },
    { value: '720p', label: '720p (HD)' },
    { value: '1080p', label: '1080p (Full HD)' },
];

const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
};

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
        clearMetadata,
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
        reset: resetRecordingStore,
    } = useRecordingStore();

    const { sessionInfo } = useSessionInfo();

    // Default metadata fields (can be overridden by URL params)
    const defaultMetadataFields = {
        eventId: '',
        civId: '',
        aNumber: '',
    };

    // Pre-populate metadata from URL parameters
    // recorderName persists across sessions, metadata resets each visit
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        const urlRecorderName = params.get('recorderName') || params.get('name');
        if (urlRecorderName) setRecorderName(urlRecorderName);

        // Start with default fields, override with URL params
        const urlMetadata = { ...defaultMetadataFields };
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
        isUploading: chunkedUploading,
        progress: uploadProgress,
        uploadedChunks,
        totalChunks,
        error: uploadError,
        currentSpeed,
    } = useChunkedUpload();

    // Live streaming hook
    const {
        isConnected: wsConnected,
        isStreaming,
        viewerCount,
        connect: connectLiveStream,
        disconnect: disconnectLiveStream,
        startStream: startLiveStreamSession,
        stopStream: stopLiveStreamSession,
        sendChunk,
    } = useLiveStream();

    // Callback to send chunks when live streaming
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
    // Skip chunked upload if live streaming was used (content already uploaded as HLS)
    useEffect(() => {
        if (recordedBlob && status === 'stopped') {
            // Release camera now that recording is complete
            releaseCamera();

            if (liveStreamEnabled && currentRecordingId) {
                // Live stream already uploaded content - just mark as complete
                message.success('Live recording complete! Video available in library.');
                completeUpload();
                setTitle('');
                setCurrentRecordingId(null);
                queryClient.invalidateQueries({ queryKey: ['recordings'] });
            } else {
                // Standard recording - upload the blob
                handleUpload(recordedBlob);
            }
        }
    }, [recordedBlob, status]);

    const handleStartRecording = async () => {
        if (!recorderName.trim()) {
            message.warning('Please enter your name before recording');
            return;
        }
        clearError();

        // If live streaming is enabled, create recording first and start stream session
        if (liveStreamEnabled && wsConnected) {
            try {
                const recordingData = {
                    data: {
                        type: 'recordings',
                        attributes: {
                            title: title.trim() || `Live Recording ${new Date().toLocaleString()}`,
                            recorderName: recorderName,
                            metadata: metadata,
                            quality: defaultQuality,
                            mimeType: 'video/webm',
                            playbackFormat: 'hls',
                            sessionInfo: sessionInfo,
                        },
                    },
                };

                const metaResponse = await fetch('/api/recordings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/vnd.api+json' },
                    body: JSON.stringify(recordingData),
                });

                if (!metaResponse.ok) {
                    throw new Error('Failed to create recording metadata');
                }

                const metaResult = await metaResponse.json();
                const recordingId = metaResult.data.id;
                setCurrentRecordingId(recordingId);

                // Start live stream session
                const streamStarted = startLiveStreamSession(recordingId);
                if (!streamStarted) {
                    throw new Error('Failed to start live stream session');
                }

                message.success('Live stream started!');
            } catch (err) {
                message.error(`Failed to start live stream: ${err.message}`);
                return;
            }
        }

        // Capture thumbnail before starting (first frame)
        if (cameraRef.current) {
            const thumbnailBlob = await cameraRef.current.captureFrame();
            thumbnailBlobRef.current = thumbnailBlob;
        }

        const success = await startMediaRecording();
        if (success) {
            setRecordingStarted(null);
            updateDuration(0);
        }
    };

    const handleStopRecording = () => {
        // Stop live stream session if active
        if (liveStreamEnabled && isStreaming) {
            stopLiveStreamSession();
            message.info('Live stream ended');
        }

        stopMediaRecording();
        setRecordingStopped();
    };

    const handleUpload = async (blob) => {
        setUploading();
        resetUpload();

        try {
            // Create recording metadata
            const recordingData = {
                data: {
                    type: 'recordings',
                    attributes: {
                        title: title.trim() || `Recording ${new Date().toLocaleString()}`,
                        recorderName: recorderName,
                        metadata: metadata,
                        quality: defaultQuality,
                        mimeType: blob.type,
                        fileBytes: blob.size,
                        playbackFormat: 'video',
                        sessionInfo: sessionInfo,
                    },
                },
            };

            const metaResponse = await fetch('/api/recordings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/vnd.api+json' },
                body: JSON.stringify(recordingData),
            });

            if (!metaResponse.ok) {
                throw new Error('Failed to create recording metadata');
            }

            const metaResult = await metaResponse.json();
            const recordingId = metaResult.data.id;
            setCurrentRecordingId(recordingId);

            // Upload using chunked upload with progress callback
            const result = await uploadFile(blob, recordingId, duration, (progress, chunks, total) => {
                console.log(`Upload progress: ${progress}% (${chunks}/${total} chunks)`);
            });

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            // Upload thumbnail if captured
            if (thumbnailBlobRef.current) {
                try {
                    const thumbResponse = await fetch('/api/upload/thumbnail-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recordingId }),
                    });

                    if (thumbResponse.ok) {
                        const { uploadUrl } = await thumbResponse.json();
                        await fetch(uploadUrl, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'image/jpeg' },
                            body: thumbnailBlobRef.current,
                        });
                    }
                } catch (thumbErr) {
                    console.warn('Thumbnail upload failed:', thumbErr);
                    // Don't fail the whole upload for thumbnail
                }
                thumbnailBlobRef.current = null;
            }

            message.success('Recording uploaded successfully!');
            completeUpload();
            setTitle('');
            setCurrentRecordingId(null);
            resetUpload();

            // Refresh library to show new recording
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

                        <div className='record-info'>
                            {isRecording && (
                                <div className='recording-indicator'>
                                    <span className='recording-dot' />
                                    <span className='recording-time'>{formatDuration(duration)}</span>
                                    {isPaused && <span className='recording-paused'>PAUSED</span>}
                                    {liveStreamEnabled && isStreaming && (
                                        <>
                                            <Tag color='red' icon={<WifiOutlined />}>
                                                LIVE
                                            </Tag>
                                            <Tag icon={<TeamOutlined />}>
                                                {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
                                            </Tag>
                                        </>
                                    )}
                                </div>
                            )}

                            {isUploading && (
                                <div className='upload-progress-container'>
                                    <div className='upload-progress'>
                                        <CloudUploadOutlined className='upload-icon' />
                                        <Progress percent={uploadProgress} size='small' status='active' />
                                    </div>
                                    <div className='upload-details'>
                                        <span className='upload-chunks'>
                                            Chunk {uploadedChunks} of {totalChunks}
                                        </span>
                                        {currentSpeed > 0 && (
                                            <span className='upload-speed'>{currentSpeed} KB/s</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <Card
                        title={
                            <span>
                                <FormOutlined style={{ marginRight: 8 }} />
                                Recording Metadata
                            </span>
                        }
                        size='small'
                        className='metadata-card'
                    >
                        <div className='metadata-fields'>
                            <div className='metadata-field'>
                                <label>Your Name *</label>
                                <Input
                                    prefix={<UserOutlined />}
                                    placeholder='Enter your name'
                                    value={recorderName}
                                    onChange={(e) => setRecorderName(e.target.value)}
                                    disabled={isRecording || isUploading}
                                />
                            </div>
                            {Object.entries(metadata).map(([key, value]) => {
                                const isNumeric = key === 'civId' || key === 'aNumber';
                                return (
                                    <div className='metadata-field' key={key}>
                                        <label>{key}</label>
                                        <Input
                                            type={isNumeric ? 'number' : 'text'}
                                            placeholder={key}
                                            value={value}
                                            onChange={(e) => setMetadataField(key, e.target.value)}
                                            disabled={isRecording || isUploading}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>
            </div>

            <div className='record-controls'>
                {isIdle && (
                    <div className='record-controls-row'>
                        <Select
                            value={defaultQuality}
                            onChange={setDefaultQuality}
                            options={QUALITY_OPTIONS}
                            disabled={isUploading}
                            className='quality-select'
                            size='large'
                        />
                        {isLiveStreamingEnabled && (
                            <Tooltip title='Enable live streaming to allow others to watch in real-time'>
                                <div className='live-stream-toggle'>
                                    <Switch
                                        checked={liveStreamEnabled}
                                        onChange={setLiveStreamEnabled}
                                        disabled={isUploading}
                                    />
                                    <span className='live-stream-label'>
                                        <WifiOutlined style={{ marginRight: 4 }} />
                                        Live
                                    </span>
                                    {liveStreamEnabled && (
                                        <Tag color={wsConnected ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                                            {wsConnected ? 'Ready' : 'Connecting...'}
                                        </Tag>
                                    )}
                                </div>
                            </Tooltip>
                        )}
                        <Input
                            placeholder='Recording title (optional)'
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={isUploading}
                            className='title-input'
                            size='large'
                        />
                        <Button
                            type='primary'
                            size='large'
                            icon={<VideoCameraOutlined />}
                            onClick={handleStartRecording}
                            disabled={isUploading || (liveStreamEnabled && !wsConnected)}
                            className='record-button'
                        >
                            Start Recording
                        </Button>
                    </div>
                )}

                {isRecording && (
                    <div className='record-controls-row'>
                        {!isPaused ? (
                            <>
                                <Button
                                    size='large'
                                    icon={<PauseCircleOutlined />}
                                    onClick={pauseRecording}
                                    className='pause-button'
                                >
                                    Pause
                                </Button>
                                <Button
                                    type='primary'
                                    danger
                                    size='large'
                                    icon={<StopOutlined />}
                                    onClick={handleStopRecording}
                                    className='stop-button'
                                >
                                    Stop Recording
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    type='primary'
                                    size='large'
                                    icon={<PlayCircleOutlined />}
                                    onClick={resumeRecording}
                                    className='resume-button'
                                >
                                    Resume
                                </Button>
                                <Button
                                    type='primary'
                                    danger
                                    size='large'
                                    icon={<StopOutlined />}
                                    onClick={handleStopRecording}
                                    className='stop-button'
                                >
                                    Stop Recording
                                </Button>
                            </>
                        )}
                    </div>
                )}

                {isUploading && (
                    <div className='record-controls-row'>
                        <Button size='large' loading disabled>
                            Uploading... {uploadProgress}%
                        </Button>
                        <Button
                            size='large'
                            danger
                            icon={<CloseCircleOutlined />}
                            onClick={handleCancelUpload}
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecordTab;
