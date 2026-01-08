import { WebSocketServer } from 'ws';
import streamManager from './StreamManager.js';
import Recording from '../../models/Recording.js';
import { getBucketName } from '../storage/index.js';
import logger from '../../utils/logger.js';

/**
 * Initialize WebSocket server for live streaming
 * Handles real-time media chunk ingestion from recorders
 */
export const initWebSocketServer = (server) => {
    const wss = new WebSocketServer({
        server,
        path: '/ws/stream',
    });

    wss.on('connection', (ws, req) => {
        let streamId = null;
        let isAuthenticated = false;

        logger.info('WebSocket client connected', {
            ip: req.socket.remoteAddress,
        });

        ws.on('message', async (data, isBinary) => {
            try {
                // Binary messages are media chunks
                if (isBinary) {
                    if (!streamId || !isAuthenticated) {
                        ws.send(JSON.stringify({ error: 'Not authenticated' }));
                        return;
                    }

                    await streamManager.writeToStream(streamId, data);
                    return;
                }

                // Text messages are control commands
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'start':
                        await handleStart(ws, message);
                        streamId = message.recordingId;
                        isAuthenticated = true;
                        break;

                    case 'stop':
                        await handleStop(ws, streamId, message);
                        break;

                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                        break;

                    default:
                        ws.send(JSON.stringify({ error: `Unknown message type: ${message.type}` }));
                }
            } catch (err) {
                logger.error('WebSocket message error', { error: err.message, streamId });
                ws.send(JSON.stringify({ error: err.message }));
            }
        });

        ws.on('close', async () => {
            logger.info('WebSocket client disconnected', { streamId });

            // Auto-stop stream if connection drops
            if (streamId && isAuthenticated) {
                try {
                    const status = streamManager.getStreamStatus(streamId);
                    if (status && status.status === 'live') {
                        logger.info('Auto-stopping stream due to disconnect', { streamId });
                        await streamManager.stopStream(streamId);
                    }
                } catch (err) {
                    logger.error('Error auto-stopping stream', { streamId, error: err.message });
                }
            }
        });

        ws.on('error', (err) => {
            logger.error('WebSocket error', { error: err.message, streamId });
        });
    });

    // Broadcast stream events to all connected clients
    streamManager.on('streamStarted', (data) => {
        broadcast(wss, { type: 'streamStarted', ...data });
    });

    streamManager.on('streamEnded', (data) => {
        broadcast(wss, { type: 'streamEnded', ...data });
    });

    streamManager.on('viewerJoined', (data) => {
        broadcast(wss, { type: 'viewerJoined', ...data });
    });

    streamManager.on('viewerLeft', (data) => {
        broadcast(wss, { type: 'viewerLeft', ...data });
    });

    logger.info('WebSocket server initialized', { path: '/ws/stream' });

    return wss;
};

/**
 * Handle stream start command
 */
async function handleStart(ws, message) {
    const { recordingId } = message;

    if (!recordingId) {
        ws.send(JSON.stringify({ error: 'recordingId is required' }));
        return;
    }

    logger.info('Starting stream via WebSocket', { recordingId });

    // Update recording to mark as live streaming
    try {
        const recording = await Recording.findById(recordingId);
        if (recording) {
            recording.isLiveStreaming = true;
            recording.streamStartedAt = new Date();
            recording.status = 'recording';
            recording.storageBucket = getBucketName();
            await recording.save();
            logger.info('Updated recording for stream start', { recordingId, isLiveStreaming: true });
        }
    } catch (err) {
        logger.error('Failed to update recording for stream start', { recordingId, error: err.message });
    }

    const result = await streamManager.startStream(recordingId);

    ws.send(
        JSON.stringify({
            type: 'started',
            ...result,
        })
    );
}

/**
 * Handle stream stop command
 */
async function handleStop(ws, streamId, message) {
    if (!streamId) {
        ws.send(JSON.stringify({ error: 'No active stream' }));
        return;
    }

    const { duration, pauseCount, pauseDurationTotal, pauseEvents } = message;

    logger.info('Stopping stream via WebSocket', {
        streamId,
        duration,
        pauseCount,
        pauseDurationTotal,
        pauseEventsCount: pauseEvents?.length,
    });

    const finalStatus = await streamManager.stopStream(streamId, {
        duration,
        pauseCount,
        pauseDurationTotal,
        pauseEvents,
    });

    ws.send(
        JSON.stringify({
            type: 'stopped',
            ...finalStatus,
        })
    );
}

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcast(wss, message) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) {
            // OPEN
            client.send(data);
        }
    });
}
