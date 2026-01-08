import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';

import recordingsRouter from './routes/recordings.js';
import uploadRouter from './routes/upload.js';
import healthRouter from './routes/health.js';
import sessionInfoRouter from './routes/sessionInfo.js';
import streamsRouter from './routes/streams.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import logger from './utils/logger.js';
import { initWebSocketServer } from './services/streaming/WebSocketServer.js';
import { isLiveStreamingEnabled, getFeatureFlags } from './utils/featureFlags.js';

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
app.use('/api/streams', streamsRouter);
app.use('/health', healthRouter);

// Feature flags endpoint
app.get('/api/features', (req, res) => {
    res.json({ data: { type: 'features', attributes: getFeatureFlags() } });
});

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

    // Create HTTP server (required for WebSocket)
    const server = createServer(app);

    // Initialize WebSocket server if live streaming is enabled
    if (isLiveStreamingEnabled()) {
        initWebSocketServer(server);
        logger.info('Live streaming enabled');
    }

    server.listen(PORT, () => {
        logger.info('Server started', {
            port: PORT,
            storageProvider: process.env.STORAGE_PROVIDER || 'gcp',
            nodeEnv: process.env.NODE_ENV || 'development',
            liveStreaming: isLiveStreamingEnabled(),
        });
    });
};

startServer();
