const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/:employeeId', async (req, res) => {
    try {
        const employeeId = req.params.employeeId;
        const isOwner = req.user.role === 'owner' && req.user.sub === 'owner';
        const isEmployee = req.user.role === 'employee' && req.user.sub === employeeId;

        if (!isOwner && !isEmployee) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const employeeSnapshot = await db.collection('employees').doc(employeeId).get();

        if (!employeeSnapshot.exists || employeeSnapshot.data().status !== 'active') {
            return res.status(404).json({ error: 'Active employee not found.' });
        }

        const snapshot = await db.collection('conversations').doc(employeeId).collection('messages').orderBy('createdAt', 'desc').limit(50).get();

        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            text: doc.data().text,
            senderRole: doc.data().senderRole,
            senderId: doc.data().senderId,
            createdAt: doc.data().createdAt
        })).reverse();

        return res.status(200).json({ messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/:employeeId', async (req, res) => {
    const employeeId = req.params.employeeId;
    const text = req.body?.text;

    if (typeof text !== 'string' || text.trim() === '' || text.trim().length > 2000) {
        return res.status(400).json({ error: 'Message must contain between 1 and 2000 characters.' });
    }

    const isOwner = req.user.role === 'owner' && req.user.sub === 'owner';
    const isEmployee = req.user.role === 'employee' && req.user.sub === employeeId;

    if (!isOwner && !isEmployee) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const employeeRef = db.collection('employees').doc(employeeId);
        const messageRef = db.collection('conversations').doc(employeeId).collection('messages').doc();

        const message = {text: text.trim(), senderRole: req.user.role, senderId: req.user.sub, createdAt: Date.now()
        };

        const result = await db.runTransaction(async (transaction) => {
            const employeeSnapshot = await transaction.get(employeeRef);

            if (!employeeSnapshot.exists || employeeSnapshot.data().status !== 'active' || employeeSnapshot.data().role !== 'employee') {
                return { status: 404,error: 'Active employee not found.'};
            }

            transaction.set(messageRef, message);
            return { status: 201 };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        const io = req.app.get('io');
        if (io) {
            io.to('owner').to(`employee:${employeeId}`).emit('messages:changed', { employeeId });
        }

        return res.status(201).json({ message: 'Message sent successfully.',id: messageRef.id});
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});
module.exports = router;