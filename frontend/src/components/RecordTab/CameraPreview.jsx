import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';
import { VideoCameraOutlined } from '@ant-design/icons';

const CameraPreview = forwardRef(({ stream = null, isRecording = false }, ref) => {
    const videoRef = useRef(null);

    // Expose video element to parent via ref
    useImperativeHandle(ref, () => ({
        getVideoElement: () => videoRef.current,
        captureFrame: () => {
            const video = videoRef.current;
            if (!video || !video.videoWidth) return null;

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);

            return new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', 0.85);
            });
        },
    }));

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    if (!stream) {
        return (
            <div className='camera-preview camera-preview-placeholder'>
                <VideoCameraOutlined className='placeholder-icon' />
                <p>Waiting for camera access...</p>
            </div>
        );
    }

    return (
        <div className={`camera-preview ${isRecording ? 'camera-recording' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted className='preview-video' />
            {isRecording && <div className='recording-border' />}
        </div>
    );
});

CameraPreview.displayName = 'CameraPreview';

CameraPreview.propTypes = {
    stream: PropTypes.instanceOf(MediaStream),
    isRecording: PropTypes.bool,
};

export default CameraPreview;
