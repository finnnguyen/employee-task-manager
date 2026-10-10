const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendEmployeeInvite } = require('../services/email');
const { authenticateToken, requireOwner } = require('../middleware/auth');

const jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET is missing.');
}

router.get('/me', authenticateToken, async (req, res) => {
    if (req.user?.role !== 'employee' || typeof req.user?.sub !== 'string') {
        return res.status(403).json({ error: 'Employee access required.' });
    }

    try {
        const snapshot = await db.collection('employees').doc(req.user.sub).get();
        if (!snapshot.exists || snapshot.data().status !== 'active') {
            return res.status(401).json({ error: 'Employee account is unavailable.' });
        }

        const employeeData = snapshot.data();
        return res.status(200).json({ employee: {
            id: snapshot.id, name: employeeData.name, email: employeeData.email, username: employeeData.username}
        });
    } catch (error) {
        console.error('Error fetching employee data:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/', authenticateToken, requireOwner, async (req, res) => {
    try {
        const employeesSnapshot = await db.collection('employees').get();
        const employees = employeesSnapshot.docs.map(doc => {const data = doc.data(); return { id: doc.id, name: data.name, email: data.email }; });
        return res.status(200).json({ message: 'Employees fetched successfully.', employees });
    } catch (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/', authenticateToken, requireOwner, async (req, res) => {
    try {
        const name = req.body?.name;
        const email = req.body?.email;
        if (typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required.' });
        }
        if (typeof email !== 'string' || email.trim() === '') {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(trimmedEmail)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        const emailKey = crypto.createHash('sha256').update(trimmedEmail).digest('hex');
        const emailRef = db.collection('employeeEmails').doc(emailKey);
        const employeeRef = db.collection('employees').doc()

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
        const inviteExpiresAt = Date.now() + 24 * 60 * 60 * 1000;

        const creationResult = await db.runTransaction(async (transaction) => { 
            const emailDoc = await transaction.get(emailRef);

            if (emailDoc.exists) {
                return {status: 409, error: 'Email already exists.'};
            }
            transaction.set(employeeRef, { name: trimmedName, email: trimmedEmail , role: 'employee',status: 'invited', inviteTokenHash, inviteExpiresAt });
            transaction.set(emailRef, { employeeId: employeeRef.id });
            return {status: 201, id: employeeRef.id};
        });

        if (creationResult.error) {
            return res.status(creationResult.status).json({ error: creationResult.error });
        }

        const inviteUrl = new URL('/setup-account', process.env.CLIENT_URL);
        inviteUrl.searchParams.set('employeeId', employeeRef.id);
        inviteUrl.searchParams.set('token', inviteToken);

        await sendEmployeeInvite(trimmedEmail, trimmedName, inviteUrl.toString());
        
        return res.status(201).json({ message: 'Employee created successfully.', id: creationResult.id });

    } catch (error) {
        console.error('Error creating employee:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.patch('/:id', authenticateToken, requireOwner, async (req, res) => {
    try {
        const employeeId = req.params?.id;
        const name = req.body?.name;
        const email = req.body?.email;

        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required.' });
        }

        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
            return res.status(400).json({ error: 'Name must be string and not empty.' });}

        if (email !== undefined && (typeof email !== 'string' || email.trim() === '')) {
            return res.status(400).json({ error: 'Email must be string and not empty.' });
        }

        const updates = {};
        if (typeof name === 'string' && name.trim() !== '') {
            updates.name = name.trim();
        }
        if (typeof email === 'string' && email.trim() !== '') {
            const trimmedEmail = email.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(trimmedEmail)) {
                return res.status(400).json({ error: 'Invalid email format.' });
            }
            updates.email = trimmedEmail;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.' });
        }

        const employeeRef = db.collection('employees').doc(employeeId);
        const employeeSnapshot = await employeeRef.get();
        if (!employeeSnapshot.exists) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const updateResult = await db.runTransaction(async (transaction) => {
            const employeeSnapshot = await transaction.get(employeeRef);

            if (!employeeSnapshot.exists) {
                return {status: 404, error: 'Employee not found.'};
            }

            const employeeData = employeeSnapshot.data();

            if (updates.email !== undefined && updates.email !== employeeData.email) {
                const newEmailKey = crypto.createHash('sha256').update(updates.email).digest('hex');
                const newEmailRef = db.collection('emails').doc(newEmailKey);
                const newEmailSnapshot = await transaction.get(newEmailRef);

                if (newEmailSnapshot.exists) {
                    return {status: 409, error: 'Email already in use.'};
                }
                const oldEmailKey = crypto.createHash('sha256').update(employeeData.email).digest('hex');
                const oldEmailRef = db.collection('emails').doc(oldEmailKey);

                transaction.delete(oldEmailRef);
                transaction.set(newEmailRef, { employeeId: employeeRef.id });
            }

            transaction.update(employeeRef, updates);
            return {status: 200};
        });

        if (updateResult.error) {
            return res.status(updateResult.status).json({ error: updateResult.error });
        }
        return res.status(200).json({ message: 'Employee updated successfully.' });
    } catch (error) {
        console.error('Error updating employee:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.delete('/:id',authenticateToken, requireOwner, async (req, res) => {
    try {
        const employeeRef = db.collection('employees').doc(req.params.id);
        const deletionResult = await db.runTransaction(async (transaction) => {
            const employeeSnapshot = await transaction.get(employeeRef);

            if (!employeeSnapshot.exists) {
                return {status: 404, error: 'Employee not found.'};
            }
            const emailRef = db.collection('employeeEmails').doc(emailKey);

            transaction.delete(emailRef);
            transaction.delete(employeeRef);
            return {status: 200};
        }); 

        if (deletionResult.error) {
            return res.status(deletionResult.status).json({ error: deletionResult.error });
        }
        return res.status(200).json({ message: 'Employee deleted successfully.' });

    } catch (error) {
        console.error('Error deleting employee:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/setup-account', async (req, res) => {
    const employeeId = req.body?.employeeId;
    const token = req.body?.token;
    const username = req.body?.username;
    const password = req.body?.password;

    const fields = { employeeId, token, username, password };
    for (const [field, value] of Object.entries(fields)) {
        if (typeof value !== 'string' || value.trim() === '') {
            return res.status(400).json({ error: `${field} is required and must be a nonempty string.` });
        }
    }

    if (!/^[a-f0-9]{64}$/.test(token)) {   
        return res.status(400).json({ error: 'Invalid token format.' });
    }
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
        return res.status(400).json({ error: 'Username must contain 3 to 30 letters, numbers, or underscores.' });
    }

    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ error: 'Password must be at least 8 characters and less than 72 bytes.' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
        if (employeeId.includes('/') || employeeId !== employeeId.trim()) {
            return res.status(400).json({ error: 'Invalid employee ID.' });
        }
        const employeeRef = db.collection('employees').doc(employeeId);
        const usernameRef = db.collection('employeeUsernames').doc(normalizedUsername);
        const passwordHash = await bcrypt.hash(password, 10);

        const setupResult = await db.runTransaction(async (transaction) => {
            const employeeSnapshot = await transaction.get(employeeRef);
            if (!employeeSnapshot.exists) {
                return { status:400, error: 'Invalid or expired invitation.',  };
            }
            const employeeData = employeeSnapshot.data();
            if (employeeData.status !== 'invited' || employeeData.tokenHash !== tokenHash
                || typeof employeeData.inviteExpiresAt !== 'number' || Date.now() >= employeeData.inviteExpiresAt) {
                return { status:400, error: 'Invalid or expired invitation.',  };
            }
            const usernameSnapshot = await transaction.get(usernameRef);
            if (usernameSnapshot.exists) {
                return { status:400, error: 'Username already exists.',  };
            }

            transaction.set(usernameRef, { employeeId });
            transaction.update(employeeRef, { username: normalizedUsername, passwordHash, role: 'employee', status: 'active',
                inviteTokenHash: null,inviteExpiresAt: null
        });
            return { status:200, message: 'Account setup successfully.' };
        }); 
        
        if (setupResult.error) {
            return res.status(setupResult.status).json({ error: setupResult.error });
        }

        return res.status(200).json({ message: 'Account setup completed successfully.'});
    } catch (error) {
        console.error('Error setting up account:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.post('/login', async (req, res) => {
    const username = req.body?.username;
    const password = req.body?.password;

    if (typeof username !== 'string' || typeof password !== 'string' || username.trim() === '' || password.trim() === '') {
        return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    if ( !/^[a-z0-9_]{3,30}$/.test(normalizedUsername) || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }
    try {
        const usernameSnapshot = await db.collection('employeeUsernames').doc(normalizedUsername).get();
        if (!usernameSnapshot.exists) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        const employeeId = usernameSnapshot.data().employeeId;

        const employeeSnapshot = await db.collection('employees').doc(employeeId).get();
        if (!employeeSnapshot.exists) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const employeeData = employeeSnapshot.data();
        if (employeeData.status !== 'active' || employeeData.role !== 'employee' || typeof employeeData.passwordHash !== 'string') {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const passwordMatch = await bcrypt.compare(password, employeeData.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const token = jwt.sign({ role: 'employee' }, jwtSecret, { subject: employeeId, expiresIn: '1h', algorithm: 'HS256' });

        return res.status(200).json({ message: 'Employee logged in successfully.', token, employee: {
            id: employeeId, name: employeeData.name, username: employeeData.username
        }
    });
    } catch (error) {
        console.error('Error logging in employee:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;