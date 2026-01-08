import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        log += ` ${JSON.stringify(metadata)}`;
    }
    return log;
});

const jsonFormat = printf(({ level, message, timestamp, ...metadata }) => {
    return JSON.stringify({ timestamp, level, message, ...metadata });
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
    defaultMeta: { service: 'kubrick-transcoder' },
    transports: [],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({ format: combine(colorize(), logFormat) }));
} else {
    logger.add(new winston.transports.Console({ format: jsonFormat }));
}

export default logger;
