const express = require('express');
const router = express.Router();
const db = require('../config/firebase');
const { authenticateToken, requireOwner } = require('../middleware/auth');

module.exports = router;