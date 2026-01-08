import { WebSocketServer } from 'ws';
import streamCoordinator from '../redis/StreamCoordinator.js';
import Recording from '../../models/Recording.js';
import { getBucketName, generateStreamManifestKey } from '../storage/index.js';
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

    // Initialize the stream coordinator (sets up Redis pub/sub)
    streamCoordinator.initialize();

    // Forward transcoder events to all WebSocket clients
    streamCoordinator.on('segmentReady', (data) => {
        broadcast(wss, { type: 'segmentReady', ...data });
    });

    streamCoordinator.on('manifestUpdated', (data) => {
        broadcast(wss, { type: 'manifestUpdated', ...data });
    });

    streamCoordinator.on('streamComplete', async (data) => {
        broadcast(wss, { type: 'streamComplete', ...data });

        // Use $set to only update specific fields without overwriting duration
        try {
            const updateFields = {
                isLiveStreaming: false,
                streamEndedAt: new Date(),
            };
            if (data.totalBytes) {
                updateFields.fileBytes = data.totalBytes;
            }
            await Recording.updateOne(
                { _id: data.recordingId },
                { $set: updateFields }
            );
            logger.info('Recording stream complete', {
                recordingId: data.recordingId,
                segmentCount: data.segmentCount,
                fileBytes: data.totalBytes,
            });
        } catch (err) {
            logger.error('Failed to update recording on stream complete', { recordingId: data.recordingId, error: err.message });
        }
    });

    streamCoordinator.on('statusChange', async (data) => {
        broadcast(wss, { type: 'statusChange', ...data });

        // Use $set to only update status without overwriting other fields
        try {
            await Recording.updateOne(
                { _id: data.recordingId },
                { $set: { status: data.status } }
            );
            logger.info('Recording status changed', { recordingId: data.recordingId, status: data.status });
        } catch (err) {
            logger.error('Failed to update recording status', { recordingId: data.recordingId, error: err.message });
        }
    });

    streamCoordinator.on('streamError', (data) => {
        broadcast(wss, { type: 'streamError', ...data });
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

                    await streamCoordinator.writeChunk(streamId, data);
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
                    const status = await streamCoordinator.getStreamStatus(streamId);
                    if (status && status.status === 'live') {
                        logger.info('Auto-stopping stream due to disconnect', { streamId });
                        await streamCoordinator.stopStream(streamId);
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
            recording.storageKey = generateStreamManifestKey(recordingId);
            recording.playbackFormat = 'hls';
            await recording.save();
            logger.info('Updated recording for stream start', { recordingId, isLiveStreaming: true, storageKey: recording.storageKey });
        }
    } catch (err) {
        logger.error('Failed to update recording for stream start', { recordingId, error: err.message });
    }

    const result = await streamCoordinator.startStream(recordingId);

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

    // Save recording stats and set status to pending
    try {
        const recording = await Recording.findById(streamId);
        if (recording) {
            recording.status = 'pending';
            if (duration !== undefined) recording.duration = duration;
            if (pauseCount !== undefined) recording.pauseCount = pauseCount;
            if (pauseDurationTotal !== undefined) recording.pauseDurationTotal = pauseDurationTotal;
            if (pauseEvents !== undefined) recording.pauseEvents = pauseEvents;
            await recording.save();
            logger.info('Saved recording stats, status set to pending', { streamId, duration, pauseCount });
        }
    } catch (err) {
        logger.error('Failed to save recording stats', { streamId, error: err.message });
    }

    const result = await streamCoordinator.stopStream(streamId, {
        duration,
        pauseCount,
        pauseDurationTotal,
        pauseEvents,
    });

    ws.send(
        JSON.stringify({
            type: 'stopped',
            ...result,
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
            client.send(data);
        }
    });
}
