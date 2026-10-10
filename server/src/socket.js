const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./config/firebase');

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is missing.');
}

function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173'
        }
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (typeof token !== 'string' || token === '') {
                return next(new Error('Authentication required.'));
            }

            const user = jwt.verify(token, jwtSecret, {
                algorithms: ['HS256']
            });

            if (typeof user !== 'object' || !user || typeof user.sub !== 'string' || user.sub === '' || user.sub.includes('/') ||typeof user.exp !== 'number') {
                return next(new Error('Invalid access token.'));
            }

            if (user.role === 'owner' && user.sub === 'owner') {
                socket.data.user = user;
                return next();
            }

            if (user.role !== 'employee') {
                return next(new Error('Access denied.'));
            }

            const snapshot = await db.collection('employees').doc(user.sub).get();

            if ( !snapshot.exists || snapshot.data().status !== 'active' || snapshot.data().role !== 'employee') {
                return next(new Error('Employee account is unavailable.'));
            }

            socket.data.user = user;
            return next();
        } catch (error) {
            return next(new Error('Invalid or expired access token.'));
        }
    });

    io.on('connection', (socket) => {
        const user = socket.data.user;

        if (user.role === 'owner') {
            socket.join('owner');
        } else {
            socket.join(`employee:${user.sub}`);
        }

        const remainingMs = user.exp * 1000 - Date.now();

        if (remainingMs <= 0) {
            socket.disconnect(true);
            return;
        }

        const expiryTimer = setTimeout(() => {
            socket.disconnect(true);
        }, Math.min(remainingMs, 2147483647));

        socket.on('disconnect', () => {
            clearTimeout(expiryTimer);
        });
    });

    return io;
}

module.exports = { initializeSocket };