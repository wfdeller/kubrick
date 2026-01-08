import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import logger from './logger.js';

/**
 * Validates that a required environment variable is set
 * @param {string} name - Environment variable name
 * @param {string[]} validValues - Optional array of valid values (case-insensitive)
 * @returns {string} The environment variable value
 * @throws {Error} If the variable is not set or invalid
 */
const requireEnv = (name, validValues = null) => {
    const value = process.env[name];
    if (value === undefined || value === '') {
        throw new Error(`Required environment variable ${name} is not set`);
    }
    if (validValues) {
        const normalizedValue = value.toLowerCase();
        const normalizedValidValues = validValues.map((v) => v.toLowerCase());
        if (!normalizedValidValues.includes(normalizedValue)) {
            throw new Error(`${name} must be one of: ${validValues.join(', ')}. Got: ${value}`);
        }
    }
    return value;
};

/**
 * Masks sensitive values for logging
 * @param {string} value - Value to mask
 * @returns {string} Masked value
 */
const maskSensitive = (value) => {
    if (!value) return '(not set)';
    if (value.length <= 8) return '****';
    return value.substring(0, 4) + '****' + value.substring(value.length - 4);
};

/**
 * Tests MongoDB connection
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<{host: string, database: string}>}
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
 * @param {string} projectId - GCP project ID
 * @param {string} bucketName - Bucket name
 * @returns {Promise<void>}
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
 * Tests AWS S3 connection
 * @param {string} region - AWS region
 * @param {string} bucketName - Bucket name
 * @param {string} accessKeyId - AWS access key ID
 * @param {string} secretAccessKey - AWS secret access key
 * @returns {Promise<void>}
 */
const testS3Connection = async (region, bucketName, accessKeyId, secretAccessKey) => {
    const client = new S3Client({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });
    const command = new HeadBucketCommand({ Bucket: bucketName });
    await client.send(command);
    logger.info('AWS S3 connection validated', { region, bucket: bucketName });
};

/**
 * Validates all environment variables and tests connections
 * @returns {Promise<{config: object, mongoInfo: object}>}
 */
export const validateEnvironment = async () => {
    const errors = [];
    const config = {};

    logger.info('='.repeat(60));
    logger.info('Validating environment configuration...');
    logger.info('='.repeat(60));

    // Required base configuration
    try {
        config.nodeEnv = requireEnv('NODE_ENV', ['development', 'production', 'test']);
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

    // Storage provider configuration
    let storageProvider = null;
    try {
        storageProvider = requireEnv('STORAGE_PROVIDER', ['gcp', 's3']).toLowerCase();
        config.storageProvider = storageProvider;
    } catch (e) {
        errors.push(e.message);
    }

    // Provider-specific configuration
    if (storageProvider === 'gcp') {
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

        // GOOGLE_APPLICATION_CREDENTIALS is optional if using default credentials
        config.gcpCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || '(using default credentials)';
    } else if (storageProvider === 's3') {
        try {
            config.awsRegion = requireEnv('AWS_REGION');
        } catch (e) {
            errors.push(e.message);
        }

        try {
            config.awsBucketName = requireEnv('AWS_BUCKET_NAME');
        } catch (e) {
            errors.push(e.message);
        }

        try {
            config.awsAccessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
        } catch (e) {
            errors.push(e.message);
        }

        try {
            config.awsSecretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
        } catch (e) {
            errors.push(e.message);
        }
    }

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
    logger.info(`  STORAGE_PROVIDER:  ${config.storageProvider}`);

    if (config.storageProvider === 'gcp') {
        logger.info(`  GCP_PROJECT_ID:    ${config.gcpProjectId}`);
        logger.info(`  GCP_BUCKET_NAME:   ${config.gcpBucketName}`);
        logger.info(`  GCP_CREDENTIALS:   ${config.gcpCredentialsPath}`);
    } else if (config.storageProvider === 's3') {
        logger.info(`  AWS_REGION:        ${config.awsRegion}`);
        logger.info(`  AWS_BUCKET_NAME:   ${config.awsBucketName}`);
        logger.info(`  AWS_ACCESS_KEY_ID: ${maskSensitive(config.awsAccessKeyId)}`);
        logger.info(`  AWS_SECRET_ACCESS_KEY: ${maskSensitive(config.awsSecretAccessKey)}`);
    }

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
        if (config.storageProvider === 'gcp') {
            await testGCPConnection(config.gcpProjectId, config.gcpBucketName);
        } else if (config.storageProvider === 's3') {
            await testS3Connection(
                config.awsRegion,
                config.awsBucketName,
                config.awsAccessKeyId,
                config.awsSecretAccessKey
            );
        }
    } catch (error) {
        logger.error('Storage connection failed', { error: error.message });
        process.exit(1);
    }

    logger.info('-'.repeat(40));
    logger.info('All connections validated successfully');
    logger.info('='.repeat(60));
    logger.info('');

    return { config, mongoInfo };
};

export default validateEnvironment;
