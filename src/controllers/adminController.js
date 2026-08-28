const adminService = require('../services/adminService');

async function dashboard(req, res, next) {
  try {
    const body = await adminService.getDashboard();

    return res.json(body);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  dashboard,
};
