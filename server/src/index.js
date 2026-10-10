require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const db = require('./config/firebase');
const { initializeSocket } = require('./socket');

const ownerRoutes = require('./routes/owner');
const employeeRoutes = require('./routes/employee');
const taskRoutes = require('./routes/tasks');
const messageRoutes = require('./routes/messages');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

app.set('io', io);


const port = Number(process.env.PORT) || 5000;
app.use(cors())
app.use(express.json())
app.use('/api/owner', ownerRoutes);
app.use('/api/employees', employeeRoutes);  
app.use('/api/tasks', taskRoutes);
app.use('/api/messages', messageRoutes);

app.get('/', (req, res) => {
  res.send('Employee task manager backend is running.');
});

server.listen(port, () => {
   console.log(`Server is successfully running on http://localhost:${port}`);
});


