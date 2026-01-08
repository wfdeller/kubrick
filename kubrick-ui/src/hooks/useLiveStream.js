import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for managing live stream via WebSocket
 * Handles connection, media chunk streaming, and stream lifecycle
 */
export const useLiveStream = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const [streamInfo, setStreamInfo] = useState(null);
    const [viewerCount, setViewerCount] = useState(0);

    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const pingIntervalRef = useRef(null);

    /**
     * Connect to WebSocket server
     */
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/stream`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setError(null);

            // Start ping interval to keep connection alive
            pingIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (err) {
                console.error('Failed to parse WebSocket message:', err);
            }
        };

        ws.onerror = (event) => {
            console.error('WebSocket error:', event);
            setError('Connection error');
        };

        ws.onclose = (event) => {
            setIsConnected(false);
            setIsStreaming(false);
            clearInterval(pingIntervalRef.current);

            if (event.code !== 1000) {
                // Abnormal close, try to reconnect
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
                        connect();
                    }
                }, 3000);
            }
        };
    }, []);

    /**
     * Handle incoming WebSocket messages
     */
    const handleMessage = useCallback((message) => {
        switch (message.type) {
            case 'started':
                setIsStreaming(true);
                setStreamInfo(message);
                break;

            case 'stopped':
                setIsStreaming(false);
                setStreamInfo(message);
                break;

            case 'viewerJoined':
            case 'viewerLeft':
                setViewerCount(message.viewerCount);
                break;

            case 'pong':
                // Connection is alive
                break;

            case 'error':
                setError(message.error);
                break;

            // Broadcast messages from server (informational)
            case 'streamStarted':
            case 'streamEnded':
            case 'streamError':
                // These are broadcast to all clients, can be used for notifications
                break;

            // Transcoder events (informational - HLS player handles refresh automatically)
            case 'manifestUpdated':
            case 'segmentReady':
            case 'streamComplete':
            case 'statusChange':
                // Transcoder progress events - no action needed
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }, []);

    /**
     * Disconnect from WebSocket server
     */
    const disconnect = useCallback(() => {
        clearTimeout(reconnectTimeoutRef.current);
        clearInterval(pingIntervalRef.current);

        if (wsRef.current) {
            wsRef.current.close(1000, 'User disconnect');
            wsRef.current = null;
        }

        setIsConnected(false);
        setIsStreaming(false);
    }, []);

    /**
     * Start streaming for a recording
     */
    const startStream = useCallback(
        (recordingId) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                setError('Not connected to server');
                return false;
            }

            wsRef.current.send(
                JSON.stringify({
                    type: 'start',
                    recordingId,
                })
            );

            return true;
        },
        []
    );

    /**
     * Stop streaming
     * @param {object} stats - Recording statistics
     * @param {number} stats.duration - Actual recording duration in seconds (excluding paused time)
     * @param {number} stats.pauseCount - Number of times recording was paused
     * @param {number} stats.pauseDurationTotal - Total paused duration in seconds
     * @param {Array} stats.pauseEvents - Array of pause events with timestamps
     */
    const stopStream = useCallback((stats = {}) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError('Not connected to server');
            return false;
        }

        wsRef.current.send(
            JSON.stringify({
                type: 'stop',
                ...stats,
            })
        );

        return true;
    }, []);

    /**
     * Send a media chunk to the stream
     */
    const sendChunk = useCallback((chunk) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return false;
        }

        // Send binary data directly
        wsRef.current.send(chunk);
        return true;
    }, []);

    /**
     * Clean up on unmount
     */
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        isConnected,
        isStreaming,
        error,
        streamInfo,
        viewerCount,
        connect,
        disconnect,
        startStream,
        stopStream,
        sendChunk,
        clearError: () => setError(null),
    };
};
