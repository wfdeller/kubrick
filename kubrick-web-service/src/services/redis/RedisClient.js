import Redis from 'ioredis';
import logger from '../../utils/logger.js';

let client = null;
let subscriber = null;

/**
 * Get or create the Redis client singleton
 * @returns {Redis}
 */
export const getRedisClient = () => {
    if (!client) {
        client = createClient('main');
    }
    return client;
};

/**
 * Get or create a dedicated subscriber client
 * Pub/Sub requires a separate connection
 * @returns {Redis}
 */
export const getSubscriberClient = () => {
    if (!subscriber) {
        subscriber = createClient('subscriber');
    }
    return subscriber;
};

/**
 * Create a new Redis client with standard configuration
 * @param {string} name - Client name for logging
 * @returns {Redis}
 */
const createClient = (name) => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    const options = {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
            if (times > 10) {
                logger.error('Redis connection failed after 10 retries', { name });
                return null;
            }
            return Math.min(times * 100, 3000);
        },
    };

    if (process.env.REDIS_TLS_ENABLED === 'true') {
        options.tls = {};
    }

    const redis = new Redis(redisUrl, options);

    redis.on('connect', () => {
        logger.info('Redis connected', { name });
    });

    redis.on('error', (err) => {
        logger.error('Redis error', { name, error: err.message });
    });

    return redis;
};

/**
 * Test Redis connection
 * @returns {Promise<boolean>}
 */
export const testConnection = async () => {
    try {
        const redis = getRedisClient();
        await redis.ping();
        logger.info('Redis connection test passed');
        return true;
    } catch (err) {
        logger.error('Redis connection test failed', { error: err.message });
        return false;
    }
};

/**
 * Gracefully disconnect all Redis clients
 */
export const disconnect = async () => {
    if (client) {
        await client.quit();
        client = null;
    }
    if (subscriber) {
        await subscriber.quit();
        subscriber = null;
    }
    logger.info('Redis disconnected');
};

export default {
    getRedisClient,
    getSubscriberClient,
    testConnection,
    disconnect,
};
