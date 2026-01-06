// Auth middleware stub - Okta-ready
// Currently passes through all requests in dev mode

const OKTA_ENABLED = process.env.OKTA_ENABLED === 'true';

export const authenticate = async (req, res, next) => {
    if (!OKTA_ENABLED) {
        // Development mode: auth is optional
        // If X-User-Id header provided, could attach user (not implemented yet)
        // Otherwise, allow anonymous access
        req.user = null;
        return next();
    }

    // Okta mode: validate JWT from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            errors: [
                {
                    status: '401',
                    code: 'UNAUTHORIZED',
                    title: 'Unauthorized',
                    detail: 'Missing or invalid authorization header',
                },
            ],
        });
    }

    // TODO: Implement Okta JWT verification when OKTA_ENABLED=true
    // const token = authHeader.replace('Bearer ', '');
    // Verify token using @okta/jwt-verifier
    // Attach user to request

    return next();
};

// Optional auth - allows requests without auth but attaches user if present
export const optionalAuth = async (req, res, next) => {
    if (!OKTA_ENABLED) {
        req.user = null;
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        req.user = null;
        return next();
    }

    // If auth header is present, validate it
    return authenticate(req, res, next);
};
