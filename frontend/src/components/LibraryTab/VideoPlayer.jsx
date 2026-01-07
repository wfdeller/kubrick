import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Descriptions, Tag } from 'antd';
import HLSPlayer from '../common/HLSPlayer';

const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
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

const VideoPlayer = ({ recording }) => {
    const videoRef = useRef(null);
    const { attributes } = recording;

    useEffect(() => {
        // Reset video when recording changes
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [recording.id]);

    return (
        <div className='video-player'>
            <div className='player-video-container'>
                {attributes.playbackFormat === 'hls' ? (
                    <HLSPlayer
                        src={attributes.videoUrl}
                        autoPlay
                    />
                ) : (
                    <video ref={videoRef} controls autoPlay className='player-video' src={attributes.videoUrl}>
                        Your browser does not support the video tag.
                    </video>
                )}
            </div>

            <div className='player-info'>
                <h2 className='player-title'>{attributes.title || 'Untitled Recording'}</h2>

                <Descriptions column={2} size='small' className='player-details'>
                    <Descriptions.Item label='Recorder'>{attributes.recorderName}</Descriptions.Item>
                    <Descriptions.Item label='Duration'>{formatDuration(attributes.duration)}</Descriptions.Item>
                    <Descriptions.Item label='Quality'>
                        <Tag>{attributes.quality}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label='Size'>{formatBytes(attributes.fileBytes)}</Descriptions.Item>
                    <Descriptions.Item label='Recorded'>
                        {formatDate(attributes.recordedAt || attributes.createdAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label='Status'>
                        <Tag color={attributes.status === 'ready' ? 'success' : 'default'}>{attributes.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label='Format'>
                        <Tag color={attributes.playbackFormat === 'hls' ? 'blue' : 'default'}>
                            {attributes.playbackFormat === 'hls' ? 'HLS (Live)' : 'Video'}
                        </Tag>
                    </Descriptions.Item>
                </Descriptions>

                {attributes.sessionInfo && (
                    <div className='session-info'>
                        <h4>Session Details</h4>
                        <Descriptions column={2} size='small'>
                            <Descriptions.Item label='Browser'>
                                {attributes.sessionInfo.browserName} {attributes.sessionInfo.browserVersion}
                            </Descriptions.Item>
                            <Descriptions.Item label='OS'>
                                {attributes.sessionInfo.osName} {attributes.sessionInfo.osVersion}
                            </Descriptions.Item>
                            <Descriptions.Item label='Timezone'>{attributes.sessionInfo.timezone}</Descriptions.Item>
                            <Descriptions.Item label='IP Address'>
                                {attributes.sessionInfo.ipAddress || 'N/A'}
                            </Descriptions.Item>
                            <Descriptions.Item label='Screen'>
                                {attributes.sessionInfo.screenResolution}
                            </Descriptions.Item>
                            <Descriptions.Item label='Language'>{attributes.sessionInfo.language}</Descriptions.Item>
                        </Descriptions>
                    </div>
                )}
            </div>
        </div>
    );
};

VideoPlayer.propTypes = {
    recording: PropTypes.shape({
        id: PropTypes.string.isRequired,
        attributes: PropTypes.shape({
            title: PropTypes.string,
            recorderName: PropTypes.string.isRequired,
            duration: PropTypes.number,
            status: PropTypes.string,
            quality: PropTypes.string,
            fileBytes: PropTypes.number,
            createdAt: PropTypes.string.isRequired,
            recordedAt: PropTypes.string,
            videoUrl: PropTypes.string,
            playbackFormat: PropTypes.oneOf(['video', 'hls']),
            sessionInfo: PropTypes.shape({
                browserName: PropTypes.string,
                browserVersion: PropTypes.string,
                osName: PropTypes.string,
                osVersion: PropTypes.string,
                timezone: PropTypes.string,
                ipAddress: PropTypes.string,
                screenResolution: PropTypes.string,
                language: PropTypes.string,
            }),
        }).isRequired,
    }).isRequired,
};

export default VideoPlayer;
