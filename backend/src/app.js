import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import recordingsRouter from './routes/recordings.js';
import uploadRouter from './routes/upload.js';
import healthRouter from './routes/health.js';
import sessionInfoRouter from './routes/sessionInfo.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import logger from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
    cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        credentials: true,
    })
);
app.use(express.json({ type: ['application/json', 'application/vnd.api+json'] }));

// Request logging
app.use(requestLogger);

// Routes
app.use('/api/recordings', recordingsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/session-info', sessionInfoRouter);
app.use('/health', healthRouter);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Database connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kubrick');
        logger.info('MongoDB connected', { host: conn.connection.host });
    } catch (error) {
        logger.error('MongoDB connection error', { error: error.message });
        process.exit(1);
    }
};

// Start server
const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        logger.info('Server started', {
            port: PORT,
            storageProvider: process.env.STORAGE_PROVIDER || 'gcp',
            nodeEnv: process.env.NODE_ENV || 'development',
        });
    });
};

startServer();
