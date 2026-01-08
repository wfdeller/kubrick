import logger from '../utils/logger.js';

// JSON:API error format
const formatError = (status, code, title, detail, source = null) => ({
    status: String(status),
    code,
    title,
    detail,
    ...(source && { source }),
});

export const notFound = (req, res, next) => {
    res.status(404).json({
        errors: [
            formatError(
                404,
                'NOT_FOUND',
                'Resource Not Found',
                `The requested resource ${req.originalUrl} was not found`
            ),
        ],
    });
};

export const errorHandler = (err, req, res, next) => {
    logger.logError(err, req);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.entries(err.errors).map(([field, error]) =>
            formatError(422, 'VALIDATION_ERROR', 'Invalid Attribute', error.message, {
                pointer: `/data/attributes/${field}`,
            })
        );
        return res.status(422).json({ errors });
    }

    // Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            errors: [formatError(400, 'INVALID_ID', 'Invalid ID', `Invalid ${err.path}: ${err.value}`)],
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(409).json({
            errors: [
                formatError(409, 'DUPLICATE_KEY', 'Duplicate Value', `A record with this ${field} already exists`, {
                    pointer: `/data/attributes/${field}`,
                }),
            ],
        });
    }

    // Default server error
    const status = err.status || 500;
    return res.status(status).json({
        errors: [
            formatError(
                status,
                err.code || 'SERVER_ERROR',
                err.title || 'Server Error',
                process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
            ),
        ],
    });
};
