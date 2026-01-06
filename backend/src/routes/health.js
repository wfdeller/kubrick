import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', async (req, res) => {
    const mongoStatus = mongoose.connection.readyState === 1;

    const status = mongoStatus ? 'healthy' : 'unhealthy';
    const statusCode = mongoStatus ? 200 : 503;

    res.status(statusCode).json({
        status,
        mongo: mongoStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

export default router;
