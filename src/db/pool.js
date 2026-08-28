const { Pool } = require('pg');
require('dotenv').config({ override: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const ssl =
  process.env.PGSSLMODE === 'disable'
    ? false
    : {
        rejectUnauthorized: false,
      };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

module.exports = pool;
