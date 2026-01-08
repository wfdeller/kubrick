import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Descriptions, Tag, Collapse } from 'antd';
import HLSPlayer from '../common/HLSPlayer';
import { formatDuration, formatDate, formatBytes } from '../../utils/formatters';

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
                    <HLSPlayer src={attributes.videoUrl} autoPlay isLive={attributes.status === 'recording'} />
                ) : (
                    <video ref={videoRef} controls autoPlay className='player-video' src={attributes.videoUrl}>
                        Your browser does not support the video tag.
                    </video>
                )}
            </div>

            <div className='player-info'>
                <h2 className='player-title'>{attributes.title || 'Untitled Recording'}</h2>

                <Collapse
                    defaultActiveKey={['metadata']}
                    size='small'
                    className='player-collapse'
                    items={[
                        {
                            key: 'metadata',
                            label: 'Recording Metadata',
                            children: (
                                <Descriptions column={2} size='small'>
                                    <Descriptions.Item label='Recorder'>
                                        {attributes.recorderName || 'N/A'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Location'>
                                        {attributes.metadata?.Location || 'N/A'}
                                    </Descriptions.Item>
                                </Descriptions>
                            ),
                        },
                        {
                            key: 'details',
                            label: 'Recording Details',
                            children: (
                                <Descriptions column={2} size='small'>
                                    <Descriptions.Item label='Duration'>
                                        {formatDuration(attributes.duration)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Quality'>
                                        <Tag>{attributes.quality || 'N/A'}</Tag>
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Size'>
                                        {formatBytes(attributes.fileBytes)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Recorded'>
                                        {formatDate(attributes.recordedAt || attributes.createdAt)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Status'>
                                        <Tag color={attributes.status === 'ready' ? 'success' : 'default'}>
                                            {attributes.status || 'N/A'}
                                        </Tag>
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Format'>
                                        <Tag color={attributes.playbackFormat === 'hls' ? 'blue' : 'default'}>
                                            {attributes.playbackFormat === 'hls' ? 'HLS (Live)' : 'Video'}
                                        </Tag>
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Video Path' span={2}>
                                        <code>{attributes.storageKey || 'N/A'}</code>
                                    </Descriptions.Item>
                                    <Descriptions.Item label='Thumbnail Path' span={2}>
                                        <code>{attributes.thumbnailKey || 'N/A'}</code>
                                    </Descriptions.Item>
                                </Descriptions>
                            ),
                        },
                        ...(attributes.sessionInfo
                            ? [
                                  {
                                      key: 'session',
                                      label: 'Session Info',
                                      children: (
                                          <Descriptions column={2} size='small'>
                                              <Descriptions.Item label='Browser'>
                                                  {attributes.sessionInfo.browserName || 'N/A'}{' '}
                                                  {attributes.sessionInfo.browserVersion || ''}
                                              </Descriptions.Item>
                                              <Descriptions.Item label='OS'>
                                                  {attributes.sessionInfo.osName || 'N/A'}{' '}
                                                  {attributes.sessionInfo.osVersion || ''}
                                              </Descriptions.Item>
                                              <Descriptions.Item label='Timezone'>
                                                  {attributes.sessionInfo.timezone || 'N/A'}
                                              </Descriptions.Item>
                                              <Descriptions.Item label='IP Address'>
                                                  {attributes.sessionInfo.ipAddress || 'N/A'}
                                              </Descriptions.Item>
                                              <Descriptions.Item label='Screen'>
                                                  {attributes.sessionInfo.screenResolution || 'N/A'}
                                              </Descriptions.Item>
                                              <Descriptions.Item label='Language'>
                                                  {attributes.sessionInfo.language || 'N/A'}
                                              </Descriptions.Item>
                                          </Descriptions>
                                      ),
                                  },
                              ]
                            : []),
                    ]}
                />
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
            storageKey: PropTypes.string.isRequired,
            thumbnailKey: PropTypes.string.isRequired,
            metadata: PropTypes.object,
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
