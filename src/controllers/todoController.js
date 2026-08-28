function todo(req, res) {
  return res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'This endpoint is not implemented yet',
    },
  });
}

module.exports = {
  todo,
};
