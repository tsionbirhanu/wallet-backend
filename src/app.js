const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const allowedCorsOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions =
  allowedCorsOrigins.length > 0
    ? {
        origin(origin, callback) {
          if (!origin || allowedCorsOrigins.includes(origin)) {
            return callback(null, true);
          }

          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
      }
    : {};

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(authRoutes);
app.use(customerRoutes);
app.use(adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
