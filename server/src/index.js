require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/firebase');
const app = express();
const port  = Number(process.env.PORT) || 5000;
const ownerRoutes = require('./routes/owner');
const employeeRoutes = require('./routes/employee');
const taskRoutes = require('./routes/tasks');

app.use(cors())
app.use(express.json())
app.use('/api/owner', ownerRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/', (req, res) => {
  res.send('Employee task manager backend is running.');
});

app.listen(port, () => {
  console.log(`Server is successfully running on http://localhost:${port}`);
});


