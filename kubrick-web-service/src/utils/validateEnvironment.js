import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { testConnection as testRedisConnection } from '../services/redis/RedisClient.js';
import logger from './logger.js';

/**
 * Validates that a required environment variable is set
 */
const requireEnv = (name) => {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
};

/**
 * Masks sensitive values for logging
 */
const maskSensitive = (value) => {
    if (!value) return '(not set)';
    if (value.length <= 8) return '****';
    return value.substring(0, 4) + '****' + value.substring(value.length - 4);
};

/**
 * Tests MongoDB connection
 */
const testMongoConnection = async (uri) => {
    const conn = await mongoose.connect(uri);
    const host = conn.connection.host;
    const database = conn.connection.name;
    logger.info('MongoDB connection validated', { host, database });
    return { host, database };
};

/**
 * Tests GCP Cloud Storage connection
 */
const testGCPConnection = async (projectId, bucketName) => {
    const storage = new Storage({ projectId });
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
        throw new Error(`GCP bucket '${bucketName}' does not exist or is not accessible`);
    }
    logger.info('GCP Cloud Storage connection validated', { projectId, bucket: bucketName });
};

/**
 * Validates all environment variables and tests connections
 */
export const validateEnvironment = async () => {
    const errors = [];
    const config = {};

    logger.info('='.repeat(60));
    logger.info('Validating environment configuration...');
    logger.info('='.repeat(60));

    // Required configuration
    try {
        config.nodeEnv = requireEnv('NODE_ENV');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.port = requireEnv('PORT');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.frontendUrl = requireEnv('FRONTEND_URL');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.mongodbUri = requireEnv('MONGODB_URI');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.redisUrl = requireEnv('REDIS_URL');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.gcpProjectId = requireEnv('GCP_PROJECT_ID');
    } catch (e) {
        errors.push(e.message);
    }

    try {
        config.gcpBucketName = requireEnv('GCP_BUCKET_NAME');
    } catch (e) {
        errors.push(e.message);
    }

    config.gcpCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '(using default credentials)';

    // Optional configuration
    config.logLevel = process.env.LOG_LEVEL || 'info';
    config.oktaEnabled = process.env.OKTA_ENABLED === 'true';

    // If there are validation errors, fail immediately
    if (errors.length > 0) {
        logger.error('Environment validation failed:');
        errors.forEach((err) => logger.error(`  - ${err}`));
        process.exit(1);
    }

    // Display configuration
    logger.info('');
    logger.info('Server Configuration:');
    logger.info(`  NODE_ENV:          ${config.nodeEnv}`);
    logger.info(`  PORT:              ${config.port}`);
    logger.info(`  LOG_LEVEL:         ${config.logLevel}`);
    logger.info(`  FRONTEND_URL:      ${config.frontendUrl}`);
    logger.info('');
    logger.info('Database Configuration:');
    logger.info(`  MONGODB_URI:       ${maskSensitive(config.mongodbUri)}`);
    logger.info('');
    logger.info('Storage Configuration:');
    logger.info(`  GCP_PROJECT_ID:    ${config.gcpProjectId}`);
    logger.info(`  GCP_BUCKET_NAME:   ${config.gcpBucketName}`);
    logger.info(`  GCP_CREDENTIALS:   ${config.gcpCredentialsPath}`);
    logger.info('');
    logger.info('Redis Configuration:');
    logger.info(`  REDIS_URL:         ${maskSensitive(config.redisUrl)}`);

    if (config.oktaEnabled) {
        logger.info('');
        logger.info('Auth Configuration:');
        logger.info(`  OKTA_ENABLED:      ${config.oktaEnabled}`);
    }

    logger.info('');

    // Test connections
    logger.info('Testing connections...');
    logger.info('-'.repeat(40));

    let mongoInfo;
    try {
        mongoInfo = await testMongoConnection(config.mongodbUri);
    } catch (error) {
        logger.error('MongoDB connection failed', { error: error.message });
        process.exit(1);
    }

    try {
        await testGCPConnection(config.gcpProjectId, config.gcpBucketName);
    } catch (error) {
        logger.error('Storage connection failed', { error: error.message });
        process.exit(1);
    }

    try {
        const redisOk = await testRedisConnection();
        if (!redisOk) {
            throw new Error('Redis ping failed');
        }
    } catch (error) {
        logger.error('Redis connection failed', { error: error.message });
        process.exit(1);
    }

    logger.info('-'.repeat(40));
    logger.info('All connections validated successfully');
    logger.info('='.repeat(60));
    logger.info('');

    return { config, mongoInfo };
};

export default validateEnvironment;
