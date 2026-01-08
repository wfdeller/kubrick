import Redis from 'ioredis';
import logger from '../../utils/logger.js';

let client = null;

export const getRedisClient = () => {
    if (!client) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 10) {
                    logger.error('Redis connection failed after 10 retries');
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
        });

        client.on('connect', () => logger.info('Redis connected'));
        client.on('error', (err) => logger.error('Redis error', { error: err.message }));
    }
    return client;
};

export const disconnect = async () => {
    if (client) {
        await client.quit();
        client = null;
    }
};

export default { getRedisClient, disconnect };
