const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { authenticateToken, requireOwner } = require('../middleware/auth');

const  allowedStatuses = ['pending', 'in_progress', 'done'];

function isValidId(value) {
    return (typeof value === 'string' && value.trim() !== '' && value === value.trim() && !value.includes('/'));
}

function isOwner(user) {
    return user?.role === 'owner' && user?.sub === 'owner';
}

function taskResponse(doc) {
    const data = doc.data();
    return {
        id: doc.id,
        title: data.title,
        description: data.description,
        status: data.status,
        employeeId: data.employeeId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
    };
}

function notifyTaskChange(req) {
    const io = req.app.get('io');

    if (io) {
        io.emit('tasks:changed');
    }
}


router.post('/', authenticateToken, requireOwner, async (req, res) => {
    const title = req.body?.title;
    const description = req.body?.description;
    const employeeId = req.body?.employeeId;

    if (typeof title !== 'string' || title.trim() === '' || title.trim().length > 200) {
        return res.status(400).json({ error: 'Title is required and must be less than 200 characters.' });
    }

    if (typeof description !== 'string' ||  description.trim() === '' || description.length > 5000) {
        return res.status(400).json({ error: 'Description is required and must be less than 5000 characters.' });
    }

    if (!isValidId(employeeId)) {
        return res.status(400).json({ error: 'Invalid employee ID.' });
    }

    try {
        const employeeRef = db.collection('employees').doc(employeeId);
        const taskRef = db.collection('tasks').doc();

        const result = await db.runTransaction(async (transaction) => {
            const employeeSnapshot = await transaction.get(employeeRef);
            if (!employeeSnapshot.exists || employeeSnapshot.data().status !== 'active' || employeeSnapshot.data().role !== 'employee') {
                return { status: 400, error: 'Invalid employee.' };
            }
            
            const now = Date.now();

            transaction.set(taskRef, {
                title: title.trim(),
                description: description.trim(),
                status: 'pending',
                employeeId: employeeId.trim(),
                createdBy: req.user.sub,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            return { status: 201, id: taskRef.id };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        notifyTaskChange(req);

        return res.status(201).json({ message: 'Task created successfully.', id: result.id });
        
    } catch (error) {
        console.error('Error creating task:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
         let query = db.collection('tasks');
         if (!isOwner(req.user)) {
            if ( req.user?.role !== 'employee' || !isValidId(req.user?.sub)) {
                return res.status(403).json({ error: 'Access denied.' });
            }

            const employeeSnapshot = await db.collection('employees').doc(req.user.sub).get();
            if ( !employeeSnapshot.exists || employeeSnapshot.data().status !== 'active' || employeeSnapshot.data().role !== 'employee') {
                return res.status(401).json({ error: 'Employee account is unavailable.' });
            }

            query = query.where('employeeId', '==', req.user.sub);}
        const snapshot = await query.get();
        const tasks = snapshot.docs.map(taskResponse);
        return res.status(200).json({ tasks });
    } catch (error) {
        console.error('Error fetching task:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.patch('/:id', authenticateToken, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid task ID.' });
    }

    const owner = isOwner(req.user);
    if (!owner || (req.user?.role !== 'employee' || !isValidId(req.user?.sub))) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'JSON body is required.' });
    }

    const allowedFields = owner ? ['title', 'description', 'status', 'employeeId'] : ['status'];
    if (Object.keys(body).some(field => !allowedFields.includes(field))) {
        return res.status(400).json({ error: owner ? 'Unsupported update field.' : 'Employees can update only task status.' });
    }

    const updates = {};
    if (Object.hasOwn(body, 'title')) {
        if (typeof body.title !== 'string' || body.title.trim() === '' || body.title.trim().length > 200) {
            return res.status(400).json({ error: 'Title must be a non-empty string and less than 200 characters.' });
        }
        updates.title = body.title.trim();
    }

    if (Object.hasOwn(body, 'description')) {
        if ( typeof body.description !== 'string' || body.description.length > 5000) {
            return res.status(400).json({ error: 'Description must be a string and less than 5000 characters.' });
        }
        updates.description = body.description.trim();
    }

    if (Object.hasOwn(body, 'employeeId')) {
        if (!isValidId(body.employeeId)) {
            return res.status(400).json({ error: 'Invalid employee ID.' });
        }
        updates.employeeId = body.employeeId;
    }

    if (Object.hasOwn(body, 'status')) {
        if (!allowedStatuses.includes(body.status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }
        updates.status = body.status;
    }   

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });   
    }

    try { 
        const taskRef = db.collection('tasks').doc(req.params.id);

        const result = await db.runTransaction(async (transaction) => {
            const taskSnapshot = await transaction.get(taskRef);
            if (!taskSnapshot.exists) {
                throw new Error('Task not found.');
            }

            const taskData = taskSnapshot.data();

            if (!owner) {
                const employeeRef = db.collection('employees').doc(req.user.sub);
                const employeeSnapshot = await transaction.get(employeeRef);
                if (!employeeSnapshot.exists || employeeSnapshot.data().status !== 'active' || employeeSnapshot.data().role !== 'employee') {
                    throw new Error('Employee not found.');
                }
            }

            if (taskData.employeeId !== req.user.sub) { 
                throw new Error('You are not authorized to update this task.');
            }

            const changes = { ...updates };

            if (owner && updates.employeeId !== undefined) {
                const employeeRef = db.collection('employees').doc(updates.employeeId);
                const employeeSnapshot = await transaction.get(employeeRef);

                if (!employeeSnapshot.exists ||  employeeSnapshot.data().status !== 'active' || employeeSnapshot.data().role !== 'employee') {
                    throw new Error('Employee not found or inactive.'); 
                }

                if ( updates.employeeId !== taskData.employeeId && updates.status === undefined) {
                    changes.status = 'pending';
                }
            }

            transaction.update(taskRef, {
                ...changes,
                updatedAt: new Date(),
            });
            return { status: 200 };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        notifyTaskChange(req);

        return res.status(200).json({ message: 'Task updated successfully.' 
        });
        
    } catch (error) {
        console.error('Error updating task:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.delete('/:id', authenticateToken, requireOwner, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid task ID.' });
    }

    try {
        const taskRef = db.collection('tasks').doc(req.params.id);

        const result = await db.runTransaction(async (transaction) => {
             const snapshot = await transaction.get(taskRef);

             if (!snapshot.exists) {
                 throw new Error('Task not found.');
             }

             transaction.delete(taskRef);
             return { status: 200 };
        });

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        notifyTaskChange(req);
        
        return res.status(200).json({ message: 'Task deleted successfully.' });
    } catch (error) {
        console.error('Error deleting task:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});
    
        
module.exports = router;