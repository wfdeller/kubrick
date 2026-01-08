import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import TranscodeWorker from './services/transcoder/TranscodeWorker.js';
import { disconnect as disconnectRedis } from './services/redis/RedisClient.js';
import logger from './utils/logger.js';

const workerId = process.env.WORKER_ID || uuidv4();

logger.info('Starting kubrick-transcoder', {
    workerId,
    redisUrl: process.env.REDIS_URL?.replace(/:([^:@]+)@/, ':***@'),
});

const worker = new TranscodeWorker(workerId);

// Graceful shutdown
const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    await worker.stop();
    await disconnectRedis();
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start worker
worker.start().catch((err) => {
    logger.error('Worker failed to start', { error: err.message });
    process.exit(1);
});
