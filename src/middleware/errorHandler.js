const { errorResponse } = require('../utils/errors');

function notFoundHandler(req, res) {
  return errorResponse(res, 404, 'NOT_FOUND', 'Route not found');
}

function errorHandler(error, req, res, next) {
  if (error.type === 'entity.parse.failed') {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid JSON request body');
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
