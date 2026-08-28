const authService = require('../services/authService');
const { errorResponse } = require('../utils/errors');

async function adminLogin(req, res, next) {
  try {
    const body = await authService.loginAdmin(req.body);

    if (!body) {
      return errorResponse(res, 401, 'INVALID_CREDENTIALS', 'Invalid phone number or password');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function customerLogin(req, res, next) {
  try {
    const result = await authService.loginCustomer(req.body);

    if (result.outcome === 'invalid_credentials') {
      return errorResponse(res, 401, 'INVALID_CREDENTIALS', 'Invalid phone number or PIN');
    }

    if (result.outcome === 'pin_not_set') {
      return errorResponse(
        res,
        400,
        'PIN_NOT_SET',
        'PIN not set for this account. Contact admin.'
      );
    }

    if (result.outcome === 'pending') {
      return errorResponse(
        res,
        403,
        'CUSTOMER_PENDING_VERIFICATION',
        'Customer is pending verification'
      );
    }

    if (result.outcome === 'blocked') {
      return errorResponse(res, 403, 'CUSTOMER_BLOCKED', 'Customer is blocked');
    }

    return res.json(result.body);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  adminLogin,
  customerLogin,
};
