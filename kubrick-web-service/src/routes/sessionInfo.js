import express from 'express';
import { attachSessionInfo } from '../middleware/sessionInfo.js';

const router = express.Router();

// GET /api/session-info - Get client IP address
router.get('/', attachSessionInfo, (req, res) => {
    res.json({
        ipAddress: req.clientIp,
        timestamp: new Date().toISOString(),
    });
});

export default router;
