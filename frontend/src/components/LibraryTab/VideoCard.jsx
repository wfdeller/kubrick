import PropTypes from 'prop-types';
import { Card, Tag, Popconfirm } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';

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

const statusColors = {
    ready: 'success',
    processing: 'processing',
    uploading: 'processing',
    error: 'error',
    recording: 'warning',
    archived: 'default',
};

const VideoCard = ({ recording, onPlay, onArchive = null }) => {
    const { attributes } = recording;

    return (
        <Card
            className='video-card'
            cover={
                <div className='video-thumbnail' onClick={() => onPlay(recording)}>
                    {attributes.thumbnailUrl ? (
                        <img src={attributes.thumbnailUrl} alt={attributes.title} />
                    ) : (
                        <div className='thumbnail-placeholder'>
                            <PlayCircleOutlined />
                        </div>
                    )}
                    <div className='thumbnail-overlay'>
                        <PlayCircleOutlined className='play-icon' />
                    </div>
                    <span className='duration-badge'>
                        <ClockCircleOutlined /> {formatDuration(attributes.duration)}
                    </span>
                </div>
            }
        >
            <Card.Meta
                title={attributes.title || 'Untitled Recording'}
                description={
                    <div className='card-meta'>
                        <span className='recorder-name'>
                            <UserOutlined /> {attributes.recorderName}
                        </span>
                        <span className='created-date'>{formatDate(attributes.createdAt)}</span>
                        <div className='card-bottom-row'>
                            <div className='card-tags'>
                                <Tag color={statusColors[attributes.status] || 'default'}>{attributes.status}</Tag>
                                <Tag>{attributes.quality}</Tag>
                            </div>
                            <Popconfirm
                                title='Archive this recording?'
                                description='The recording will be moved to the archive.'
                                onConfirm={() => onArchive(recording)}
                                okText='Archive'
                                cancelText='Cancel'
                            >
                                <DeleteOutlined className='archive-icon' />
                            </Popconfirm>
                        </div>
                    </div>
                }
            />
        </Card>
    );
};

VideoCard.propTypes = {
    recording: PropTypes.shape({
        id: PropTypes.string.isRequired,
        attributes: PropTypes.shape({
            title: PropTypes.string,
            recorderName: PropTypes.string.isRequired,
            duration: PropTypes.number,
            status: PropTypes.oneOf(['recording', 'uploading', 'processing', 'ready', 'error', 'archived']),
            quality: PropTypes.string,
            createdAt: PropTypes.string.isRequired,
            thumbnailUrl: PropTypes.string,
            videoUrl: PropTypes.string,
        }).isRequired,
    }).isRequired,
    onPlay: PropTypes.func.isRequired,
    onArchive: PropTypes.func,
};

export default VideoCard;
