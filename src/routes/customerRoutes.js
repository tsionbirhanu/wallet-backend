const express = require('express');
const { body, param, query } = require('express-validator');
const { todo } = require('../controllers/todoController');
const customerController = require('../controllers/customerController');
const { requireAdminAuth, requireCustomerAuth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { otpRateLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function normalizeAmount(value) {
  const [whole, fraction = ''] = String(value).split('.');

  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function amountValidation() {
  return body('amount')
    .isString()
    .withMessage('amount must be a string')
    .bail()
    .matches(amountPattern)
    .withMessage('amount must be a positive decimal with max 2 decimal places')
    .bail()
    .custom((value) => value !== '0' && value !== '0.0' && value !== '0.00')
    .withMessage('amount must be greater than 0')
    .customSanitizer(normalizeAmount);
}

router.post(
  '/customers',
  otpRateLimiter,
  requireAdminAuth,
  [
    body('full_name').isString().trim().notEmpty().withMessage('full_name is required'),
    body('phone_number').isString().trim().notEmpty().withMessage('phone_number is required'),
    body('national_id').isString().trim().notEmpty().withMessage('national_id is required'),
    body('pin').optional().isString().matches(/^\d{4,6}$/).withMessage('pin must be 4 to 6 digits'),
  ],
  handleValidationErrors,
  customerController.registerCustomer
);

router.post(
  '/customers/:id/set-pin',
  requireAdminAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    body('pin').isString().matches(/^\d{4,6}$/).withMessage('pin must be 4 to 6 digits'),
  ],
  handleValidationErrors,
  customerController.setCustomerPin
);

router.post(
  '/customers/:id/verify-otp',
  otpRateLimiter,
  requireAdminAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    body('code').isString().matches(/^\d{6}$/).withMessage('code must be 6 digits'),
  ],
  handleValidationErrors,
  customerController.verifyRegistrationOtp
);

router.get(
  '/customers',
  requireAdminAuth,
  [
    query('search').optional().isString().trim(),
    query('status').optional().isIn(['pending', 'active', 'blocked']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  handleValidationErrors,
  customerController.listCustomers
);

router.get(
  '/customers/:id',
  requireAdminAuth,
  [param('id').isUUID().withMessage('id must be a valid UUID')],
  handleValidationErrors,
  customerController.getCustomerById
);

router.patch(
  '/customers/:id/status',
  requireAdminAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    body('status').isIn(['active', 'blocked']).withMessage('status must be active or blocked'),
    body('reason').optional().isString().trim(),
  ],
  handleValidationErrors,
  customerController.updateCustomerStatus
);

router.post(
  '/customers/:id/deposit',
  requireAdminAuth,
  [param('id').isUUID().withMessage('id must be a valid UUID'), amountValidation()],
  handleValidationErrors,
  customerController.createDeposit
);

router.post(
  '/customers/:id/withdraw/request-otp',
  otpRateLimiter,
  requireAdminAuth,
  [param('id').isUUID().withMessage('id must be a valid UUID'), amountValidation()],
  handleValidationErrors,
  customerController.requestWithdrawalOtp
);

router.post(
  '/customers/:id/withdraw/confirm',
  otpRateLimiter,
  requireAdminAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    amountValidation(),
    body('code').isString().matches(/^\d{6}$/).withMessage('code must be 6 digits'),
  ],
  handleValidationErrors,
  customerController.confirmWithdrawal
);

router.get(
  '/customers/:id/transactions',
  requireAdminAuth,
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  handleValidationErrors,
  customerController.listCustomerTransactions
);

router.get('/me', requireCustomerAuth, customerController.getMe);

router.get(
  '/me/transactions',
  requireCustomerAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  handleValidationErrors,
  customerController.listMyTransactions
);

router.get(
  '/me/notifications',
  requireCustomerAuth,
  [
    query('is_read').optional().isBoolean().toBoolean(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  handleValidationErrors,
  customerController.listMyNotifications
);

router.post(
  '/me/notifications/:id/read',
  requireCustomerAuth,
  [param('id').isUUID().withMessage('id must be a valid UUID')],
  handleValidationErrors,
  customerController.markMyNotificationRead
);

router.post(
  '/me/register-device-token',
  requireCustomerAuth,
  [body('fcm_token').isString().trim().notEmpty().withMessage('fcm_token is required')],
  handleValidationErrors,
  customerController.registerDeviceToken
);

module.exports = router;
