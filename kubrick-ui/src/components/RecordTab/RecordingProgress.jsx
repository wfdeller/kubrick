import PropTypes from 'prop-types';
import { Progress, Tag } from 'antd';
import { CloudUploadOutlined, WifiOutlined } from '@ant-design/icons';
import { formatDuration } from '../../utils/formatters';

const RecordingProgress = ({
    isRecording,
    isPaused,
    duration,
    liveStreamEnabled,
    isStreaming,
    isUploading,
    uploadProgress,
    uploadedChunks,
    totalChunks,
    currentSpeed,
}) => {
    return (
        <div className='record-info'>
            {isRecording && (
                <div className='recording-indicator'>
                    <span className='recording-dot' />
                    <span className='recording-time'>{formatDuration(duration)}</span>
                    {isPaused && <span className='recording-paused'>PAUSED</span>}
                    {liveStreamEnabled && isStreaming && (
                        <Tag color='red' icon={<WifiOutlined />}>
                            LIVE
                        </Tag>
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
                        {currentSpeed > 0 && <span className='upload-speed'>{currentSpeed} KB/s</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

RecordingProgress.propTypes = {
    isRecording: PropTypes.bool.isRequired,
    isPaused: PropTypes.bool.isRequired,
    duration: PropTypes.number.isRequired,
    liveStreamEnabled: PropTypes.bool.isRequired,
    isStreaming: PropTypes.bool.isRequired,
    isUploading: PropTypes.bool.isRequired,
    uploadProgress: PropTypes.number.isRequired,
    uploadedChunks: PropTypes.number.isRequired,
    totalChunks: PropTypes.number.isRequired,
    currentSpeed: PropTypes.number.isRequired,
};

export default RecordingProgress;
