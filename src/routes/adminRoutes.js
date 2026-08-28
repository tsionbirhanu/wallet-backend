const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/admin/dashboard', requireAdminAuth, adminController.dashboard);

module.exports = router;
