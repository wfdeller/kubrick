import { EventEmitter } from 'events';
import { getRedisClient, getSubscriberClient } from './RedisClient.js';
import { getBucketName, generateDatePrefix } from '../storage/index.js';
import * as storage from '../storage/index.js';
import logger from '../../utils/logger.js';

/**
 * StreamCoordinator - Manages distributed streaming coordination via Redis
 *
 * Responsibilities:
 * - Upload raw chunks to cloud storage
 * - Publish chunk notifications to Redis streams
 * - Publish control events (start/stop)
 * - Subscribe to transcoder events and emit locally
 */
class StreamCoordinator extends EventEmitter {
    constructor() {
        super();
        this.streams = new Map(); // recordingId -> stream state
        this.subscribed = false;
    }

    /**
     * Initialize pub/sub subscription for transcoder events
     */
    async initialize() {
        if (this.subscribed) return;

        const subscriber = getSubscriberClient();

        // Subscribe to transcoder events
        await subscriber.psubscribe('transcoder:events:*');

        subscriber.on('pmessage', (pattern, channel, message) => {
            try {
                const event = JSON.parse(message);
                const recordingId = channel.split(':')[2];

                logger.debug('Received transcoder event', { recordingId, type: event.type });

                // Re-emit the event locally for WebSocket broadcast
                this.emit(event.type, { recordingId, ...event });
            } catch (err) {
                logger.error('Failed to parse transcoder event', { error: err.message });
            }
        });

        this.subscribed = true;
        logger.info('StreamCoordinator subscribed to transcoder events');
    }

    /**
     * Start a new stream - initializes state and notifies transcoders
     * @param {string} recordingId
     * @returns {Promise<{recordingId: string, status: string}>}
     */
    async startStream(recordingId) {
        const redis = getRedisClient();
        const bucket = getBucketName();
        const prefix = generateDatePrefix();

        const streamState = {
            recordingId,
            status: 'live',
            bucket,
            prefix,
            chunkCount: 0,
            startTime: Date.now(),
        };

        this.streams.set(recordingId, streamState);

        // Set stream state in Redis
        await redis.hset(`stream:${recordingId}:state`, {
            status: 'live',
            bucket,
            prefix,
            startTime: Date.now().toString(),
            chunkCount: '0',
        });

        // Publish start event to control stream
        await redis.xadd('stream:control', '*',
            'type', 'stream_start',
            'recordingId', recordingId,
            'bucket', bucket,
            'prefix', prefix,
            'timestamp', Date.now().toString()
        );

        logger.info('Stream started', { recordingId, bucket, prefix });

        return { recordingId, status: 'live' };
    }

    /**
     * Write a chunk - uploads to storage and notifies transcoders
     * @param {string} recordingId
     * @param {Buffer} chunk
     */
    async writeChunk(recordingId, chunk) {
        const streamState = this.streams.get(recordingId);
        if (!streamState || streamState.status !== 'live') {
            return;
        }

        const redis = getRedisClient();
        const seq = streamState.chunkCount++;
        const chunkKey = `${streamState.prefix}/${recordingId}/chunks/chunk_${String(seq).padStart(8, '0')}.webm`;

        // Upload chunk to cloud storage
        await storage.uploadBuffer(streamState.bucket, chunkKey, chunk, 'video/webm');

        // Update chunk count in Redis
        await redis.hincrby(`stream:${recordingId}:state`, 'chunkCount', 1);

        // Publish chunk notification to Redis stream
        await redis.xadd(`stream:chunks:${recordingId}`, '*',
            'seq', seq.toString(),
            'key', chunkKey,
            'size', chunk.length.toString(),
            'timestamp', Date.now().toString()
        );

        logger.debug('Chunk uploaded and published', { recordingId, seq, size: chunk.length });
    }

    /**
     * Stop a stream - notifies transcoders to finalize
     * @param {string} recordingId
     * @param {object} stats - Client-provided stats (duration, pauseCount, etc)
     */
    async stopStream(recordingId, stats = {}) {
        const streamState = this.streams.get(recordingId);
        if (!streamState) {
            throw new Error(`Stream ${recordingId} not found`);
        }

        const redis = getRedisClient();

        // Update state
        streamState.status = 'ending';
        await redis.hset(`stream:${recordingId}:state`, 'status', 'ending');

        // Publish stop event
        await redis.xadd('stream:control', '*',
            'type', 'stream_stop',
            'recordingId', recordingId,
            'duration', (stats.duration || 0).toString(),
            'pauseCount', (stats.pauseCount || 0).toString(),
            'pauseDurationTotal', (stats.pauseDurationTotal || 0).toString(),
            'timestamp', Date.now().toString()
        );

        logger.info('Stream stop requested', { recordingId, stats });

        // Keep state for status queries, clean up after delay
        setTimeout(() => {
            this.streams.delete(recordingId);
        }, 5 * 60 * 1000);

        return { recordingId, status: 'ending' };
    }

    /**
     * Get stream status
     * @param {string} recordingId
     */
    async getStreamStatus(recordingId) {
        const redis = getRedisClient();
        const state = await redis.hgetall(`stream:${recordingId}:state`);

        if (!state || Object.keys(state).length === 0) {
            return null;
        }

        return {
            recordingId,
            status: state.status,
            chunkCount: parseInt(state.chunkCount, 10),
            startTime: parseInt(state.startTime, 10),
        };
    }
}

// Singleton
const streamCoordinator = new StreamCoordinator();

export default streamCoordinator;
