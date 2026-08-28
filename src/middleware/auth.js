const jwt = require('jsonwebtoken');
const { errorResponse } = require('../utils/errors');

function requireAuth(scope) {
  return (req, res, next) => {
    const header = req.get('Authorization');

    if (!header || !header.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    const token = header.slice('Bearer '.length);

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (payload.scope !== scope) {
        return errorResponse(res, 403, 'FORBIDDEN', 'Token scope is not allowed');
      }

      req.auth = payload;
      return next();
    } catch (error) {
      return errorResponse(res, 401, 'UNAUTHENTICATED', 'Invalid or expired token');
    }
  };
}

module.exports = {
  requireAdminAuth: requireAuth('admin'),
  requireCustomerAuth: requireAuth('customer'),
};
