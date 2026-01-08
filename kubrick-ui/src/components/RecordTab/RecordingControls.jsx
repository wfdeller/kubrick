import PropTypes from 'prop-types';
import { Button } from 'antd';
import {
    VideoCameraOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    StopOutlined,
} from '@ant-design/icons';

const RecordingControls = ({
    isIdle,
    isRecording,
    isPaused,
    isUploading,
    liveStreamEnabled,
    wsConnected,
    onStart,
    onPause,
    onResume,
    onStop,
}) => {
    if (isIdle) {
        return (
            <Button
                type='primary'
                icon={<VideoCameraOutlined />}
                onClick={onStart}
                disabled={isUploading || (liveStreamEnabled && !wsConnected)}
                className='record-button'
            >
                Start Recording
            </Button>
        );
    }

    if (isRecording && !isPaused) {
        return (
            <div className='recording-buttons'>
                <Button
                    icon={<PauseCircleOutlined />}
                    onClick={onPause}
                    className='pause-button'
                >
                    Pause
                </Button>
                <Button
                    type='primary'
                    danger
                    icon={<StopOutlined />}
                    onClick={onStop}
                    className='stop-button'
                >
                    Stop
                </Button>
            </div>
        );
    }

    if (isRecording && isPaused) {
        return (
            <div className='recording-buttons'>
                <Button
                    type='primary'
                    icon={<PlayCircleOutlined />}
                    onClick={onResume}
                    className='resume-button'
                >
                    Resume
                </Button>
                <Button
                    type='primary'
                    danger
                    icon={<StopOutlined />}
                    onClick={onStop}
                    className='stop-button'
                >
                    Stop
                </Button>
            </div>
        );
    }

    return null;
};

RecordingControls.propTypes = {
    isIdle: PropTypes.bool.isRequired,
    isRecording: PropTypes.bool.isRequired,
    isPaused: PropTypes.bool.isRequired,
    isUploading: PropTypes.bool.isRequired,
    liveStreamEnabled: PropTypes.bool.isRequired,
    wsConnected: PropTypes.bool.isRequired,
    onStart: PropTypes.func.isRequired,
    onPause: PropTypes.func.isRequired,
    onResume: PropTypes.func.isRequired,
    onStop: PropTypes.func.isRequired,
};

export default RecordingControls;
