require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const port  = Number(process.env.PORT) || 5000;

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Employee task manager backend is running.');
});

app.post('/test-json', (req, res) => {
  console.dir(req.body);
  res.json(req.body);
});

app.listen(port, () => {
  console.log(`Server is successfully running on http://localhost:${port}`);
});


