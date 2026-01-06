import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add stack trace for errors
    if (stack) {
        log += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
        log += ` ${JSON.stringify(metadata)}`;
    }

    return log;
});

// JSON format for production
const jsonFormat = printf(({ level, message, timestamp, ...metadata }) => {
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...metadata,
    });
});

// Determine log level from environment
const getLogLevel = () => {
    const level = process.env.LOG_LEVEL;
    if (level) return level;
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

// Create logger instance
const logger = winston.createLogger({
    level: getLogLevel(),
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
    ),
    defaultMeta: { service: 'kubrick-backend' },
    transports: [],
});

// Console transport with colors for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: combine(colorize(), logFormat),
        })
    );
} else {
    // JSON format for production (easier to parse in log aggregators)
    logger.add(
        new winston.transports.Console({
            format: jsonFormat,
        })
    );
}

// Create a stream object for Morgan HTTP logging (if needed later)
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    },
};

// Helper methods for request logging
logger.logRequest = (req, duration) => {
    const { method, originalUrl, ip } = req;
    logger.http('Request completed', {
        method,
        url: originalUrl,
        ip,
        duration: `${duration}ms`,
        statusCode: req.res?.statusCode,
    });
};

logger.logError = (err, req = null) => {
    const errorInfo = {
        message: err.message,
        stack: err.stack,
        code: err.code,
    };

    if (req) {
        errorInfo.method = req.method;
        errorInfo.url = req.originalUrl;
        errorInfo.ip = req.ip;
    }

    logger.error('Error occurred', errorInfo);
};

export default logger;
