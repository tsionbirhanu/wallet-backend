function errorResponse(res, status, code, message, details) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

module.exports = {
  errorResponse,
};
