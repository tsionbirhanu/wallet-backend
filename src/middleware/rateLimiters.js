const rateLimit = require('express-rate-limit');

function buildRateLimit({ windowMinutes, max, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    },
  });
}

const authRateLimiter = buildRateLimit({
  windowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES || 15),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  message: 'Too many login attempts. Please try again later.',
});

const otpRateLimiter = buildRateLimit({
  windowMinutes: Number(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES || 10),
  max: Number(process.env.OTP_RATE_LIMIT_MAX || 30),
  message: 'Too many OTP attempts. Please try again later.',
});

module.exports = {
  authRateLimiter,
  otpRateLimiter,
};
