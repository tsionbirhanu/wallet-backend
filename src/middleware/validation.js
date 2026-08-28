const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/errors');

function handleValidationErrors(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  return errorResponse(res, 400, 'VALIDATION_ERROR', 'Request validation failed', {
    fields: result.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });
}

module.exports = {
  handleValidationErrors,
};
