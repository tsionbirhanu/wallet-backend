const customerService = require('../services/customerService');
const { errorResponse } = require('../utils/errors');

async function registerCustomer(req, res, next) {
  try {
    const result = await customerService.registerCustomer({
      adminId: req.auth.sub,
      ...req.body,
    });

    if (result.outcome === 'phone_conflict') {
      return errorResponse(res, 409, 'PHONE_NUMBER_ALREADY_EXISTS', 'Phone number already exists');
    }

    if (result.outcome === 'rate_limited') {
      return errorResponse(res, 429, 'OTP_RATE_LIMITED', 'Too many OTP requests');
    }

    return res.status(201).json(result.body);
  } catch (error) {
    return next(error);
  }
}

async function verifyRegistrationOtp(req, res, next) {
  try {
    const result = await customerService.verifyRegistrationOtp({
      adminId: req.auth.sub,
      customerId: req.params.id,
      code: req.body.code,
    });

    if (result.outcome === 'not_found') {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    if (result.outcome === 'invalid_otp') {
      return errorResponse(res, 400, 'OTP_INVALID', 'Invalid or expired code.');
    }

    return res.json(result.body);
  } catch (error) {
    return next(error);
  }
}

async function setCustomerPin(req, res, next) {
  try {
    const body = await customerService.setCustomerPin({
      adminId: req.auth.sub,
      customerId: req.params.id,
      pin: req.body.pin,
    });

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function listCustomers(req, res, next) {
  try {
    const body = await customerService.listCustomers({
      search: req.query.search,
      status: req.query.status,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function getCustomerById(req, res, next) {
  try {
    const body = await customerService.getCustomerById(req.params.id);

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function updateCustomerStatus(req, res, next) {
  try {
    const body = await customerService.updateCustomerStatus({
      adminId: req.auth.sub,
      customerId: req.params.id,
      status: req.body.status,
      reason: req.body.reason,
    });

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function createDeposit(req, res, next) {
  try {
    const result = await customerService.createDeposit({
      adminId: req.auth.sub,
      customerId: req.params.id,
      amount: req.body.amount,
    });

    return moneyMovementResponse(res, result);
  } catch (error) {
    return next(error);
  }
}

async function requestWithdrawalOtp(req, res, next) {
  try {
    const result = await customerService.requestWithdrawalOtp({
      adminId: req.auth.sub,
      customerId: req.params.id,
      amount: req.body.amount,
    });

    if (result.outcome === 'not_found') {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    if (result.outcome === 'not_active') {
      return errorResponse(res, 403, 'CUSTOMER_NOT_ACTIVE', 'Customer is not active');
    }

    if (result.outcome === 'insufficient_balance') {
      return errorResponse(res, 400, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
    }

    if (result.outcome === 'rate_limited') {
      return errorResponse(res, 429, 'OTP_RATE_LIMITED', 'Too many OTP requests');
    }

    return res.json(result.body);
  } catch (error) {
    return next(error);
  }
}

async function confirmWithdrawal(req, res, next) {
  try {
    const result = await customerService.confirmWithdrawal({
      adminId: req.auth.sub,
      customerId: req.params.id,
      code: req.body.code,
      amount: req.body.amount,
    });

    if (result.outcome === 'invalid_otp') {
      return errorResponse(res, 400, 'OTP_INVALID', 'Invalid or expired code.');
    }

    return moneyMovementResponse(res, result);
  } catch (error) {
    return next(error);
  }
}

async function listCustomerTransactions(req, res, next) {
  try {
    const body = await customerService.listCustomerTransactions({
      customerId: req.params.id,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const body = await customerService.getMe(req.auth.sub);

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function listMyTransactions(req, res, next) {
  try {
    const body = await customerService.listMyTransactions({
      customerId: req.auth.sub,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });

    if (!body) {
      return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function listMyNotifications(req, res, next) {
  try {
    const body = await customerService.listMyNotifications({
      customerId: req.auth.sub,
      isRead: req.query.is_read,
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
    });

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function markMyNotificationRead(req, res, next) {
  try {
    const body = await customerService.markMyNotificationRead({
      customerId: req.auth.sub,
      notificationId: req.params.id,
    });

    if (!body) {
      return errorResponse(res, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

async function registerDeviceToken(req, res, next) {
  try {
    const body = await customerService.registerDeviceToken({
      customerId: req.auth.sub,
      token: req.body.fcm_token,
    });

    return res.status(201).json(body);
  } catch (error) {
    return next(error);
  }
}

function moneyMovementResponse(res, result) {
  if (result.outcome === 'not_found') {
    return errorResponse(res, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
  }

  if (result.outcome === 'wallet_not_found') {
    return errorResponse(res, 404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  if (result.outcome === 'not_active') {
    return errorResponse(res, 403, 'CUSTOMER_NOT_ACTIVE', 'Customer is not active');
  }

  if (result.outcome === 'insufficient_balance') {
    return errorResponse(res, 400, 'INSUFFICIENT_BALANCE', 'Insufficient balance');
  }

  return res.json(result.body);
}

module.exports = {
  registerCustomer,
  setCustomerPin,
  verifyRegistrationOtp,
  listCustomers,
  getCustomerById,
  updateCustomerStatus,
  createDeposit,
  requestWithdrawalOtp,
  confirmWithdrawal,
  listCustomerTransactions,
  getMe,
  listMyTransactions,
  listMyNotifications,
  markMyNotificationRead,
  registerDeviceToken,
};
