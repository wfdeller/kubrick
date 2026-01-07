import { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Hls from 'hls.js';
import { Tag, Spin } from 'antd';
import { SyncOutlined, TeamOutlined } from '@ant-design/icons';

/**
 * HLS video player component
 * Supports both live streams and VOD playback via HLS.js
 */
const HLSPlayer = ({ src, autoPlay = true, isLive = false, viewerCount = 0, onError }) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        // Clean up previous instance
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        setIsLoading(true);
        setError(null);

        // Check if HLS is supported
        if (Hls.isSupported()) {
            const hls = new Hls({
                // Live stream optimizations
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 10,
                liveDurationInfinity: isLive,
                // Lower latency settings for live
                lowLatencyMode: isLive,
                // Buffer settings
                maxBufferLength: isLive ? 10 : 30,
                maxMaxBufferLength: isLive ? 30 : 600,
            });

            hlsRef.current = hls;

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setIsLoading(false);
                if (autoPlay) {
                    video.play().catch((err) => {
                        console.log('Autoplay prevented:', err.message);
                    });
                }
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            // Try to recover from network errors
                            console.log('Network error, attempting recovery...');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log('Media error, attempting recovery...');
                            hls.recoverMediaError();
                            break;
                        default:
                            // Cannot recover
                            const errorMsg = `Playback error: ${data.details}`;
                            setError(errorMsg);
                            onError?.(errorMsg);
                            hls.destroy();
                            break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = src;
            video.addEventListener('loadedmetadata', () => {
                setIsLoading(false);
                if (autoPlay) {
                    video.play().catch((err) => {
                        console.log('Autoplay prevented:', err.message);
                    });
                }
            });
            video.addEventListener('error', () => {
                const errorMsg = 'Video playback error';
                setError(errorMsg);
                onError?.(errorMsg);
            });
        } else {
            const errorMsg = 'HLS is not supported in this browser';
            setError(errorMsg);
            onError?.(errorMsg);
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [src, autoPlay, isLive, onError]);

    return (
        <div className='hls-player'>
            {isLive && (
                <div className='hls-player-overlay'>
                    <Tag color='red' icon={<SyncOutlined spin />}>
                        LIVE
                    </Tag>
                    {viewerCount > 0 && (
                        <Tag icon={<TeamOutlined />}>
                            {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
                        </Tag>
                    )}
                </div>
            )}

            {isLoading && !error && (
                <div className='hls-player-loading'>
                    <Spin size='large' />
                    <p>{isLive ? 'Connecting to live stream...' : 'Loading video...'}</p>
                </div>
            )}

            {error && (
                <div className='hls-player-error'>
                    <p>{error}</p>
                </div>
            )}

            <video ref={videoRef} controls playsInline className='hls-video' style={{ width: '100%' }}>
                Your browser does not support the video tag.
            </video>
        </div>
    );
};

HLSPlayer.propTypes = {
    src: PropTypes.string.isRequired,
    autoPlay: PropTypes.bool,
    isLive: PropTypes.bool,
    viewerCount: PropTypes.number,
    onError: PropTypes.func,
};

export default HLSPlayer;
