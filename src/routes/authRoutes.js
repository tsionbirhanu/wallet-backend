const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { handleValidationErrors } = require('../middleware/validation');
const { authRateLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post(
  '/admin/login',
  authRateLimiter,
  [
    body('phone_number').isString().trim().notEmpty().withMessage('phone_number is required'),
    body('password').isString().notEmpty().withMessage('password is required'),
  ],
  handleValidationErrors,
  authController.adminLogin
);

router.post(
  '/customer/login',
  authRateLimiter,
  [
    body('phone_number').isString().notEmpty().withMessage('phone_number is required').trim(),
    body('pin')
      .isString()
      .matches(/^\d{4,6}$/)
      .withMessage('pin must be 4 to 6 digits'),
  ],
  handleValidationErrors,
  authController.customerLogin
);

module.exports = router;
