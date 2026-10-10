const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is missing.');
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const parts = (authHeader || '').split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const token = parts[1];

    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }, (err, user) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid or expired access token.' });
        }
        req.user = user;
        next();
    });
};

const requireOwner = (req, res, next) => {
    if (req.user?.role !== 'owner' || req.user?.sub !== 'owner') {
        return res.status(403).json({ error: 'Owner access required.' });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireOwner
};
