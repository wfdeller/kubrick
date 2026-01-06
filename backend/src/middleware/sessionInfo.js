// Middleware to attach client IP address to request
export const attachSessionInfo = (req, res, next) => {
    // Get IP address from various headers (handling proxies)
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];

    let ipAddress = req.ip || req.connection?.remoteAddress;

    if (forwardedFor) {
        // x-forwarded-for may contain multiple IPs, take the first one
        ipAddress = forwardedFor.split(',')[0].trim();
    } else if (realIp) {
        ipAddress = realIp;
    }

    // Clean up IPv6 localhost representation
    if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
        ipAddress = '127.0.0.1';
    }

    req.clientIp = ipAddress;
    next();
};
