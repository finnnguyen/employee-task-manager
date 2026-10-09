require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/firebase');
const app = express();
const port  = Number(process.env.PORT) || 5000;
const ownerRoutes = require('./routes/owner');

app.use(cors())
app.use(express.json())
app.use('/api/owner', ownerRoutes);

app.get('/', (req, res) => {
  res.send('Employee task manager backend is running.');
});

app.listen(port, () => {
  console.log(`Server is successfully running on http://localhost:${port}`);
});


