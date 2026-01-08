import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import { validateEnvironment } from './utils/validateEnvironment.js';

// Start server
const startServer = async () => {
    // Validate environment and test connections before starting
    const { config } = await validateEnvironment();

    const app = express();

    // Middleware
    app.use(
        cors({
            origin: config.frontendUrl,
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

    // Error handling
    app.use(notFound);
    app.use(errorHandler);

    // Create HTTP server (required for WebSocket)
    const server = createServer(app);

    // Initialize WebSocket server for live streaming
    initWebSocketServer(server);

    server.listen(config.port, () => {
        logger.info('Server started', {
            port: config.port,
            nodeEnv: config.nodeEnv,
        });
    });
};

startServer();
