const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function signToken(payload) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
}

async function loginAdmin({ email, password }) {
  const result = await pool.query(
    'SELECT id, full_name, email, password_hash, role FROM admins WHERE email = $1',
    [email]
  );

  const admin = result.rows[0];

  if (!admin) {
    return null;
  }

  const validPassword = await bcrypt.compare(password, admin.password_hash);

  if (!validPassword) {
    return null;
  }

  const token = signToken({
    sub: admin.id,
    scope: 'admin',
    role: admin.role,
  });

  return {
    token,
    token_type: 'Bearer',
    scope: 'admin',
    admin: {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
    },
  };
}

async function loginCustomer({ phone_number, pin }) {
  const result = await pool.query(
    `
      SELECT id, full_name, phone_number, national_id, status, pin_hash, created_at
      FROM customers
      WHERE phone_number = $1
    `,
    [phone_number]
  );

  const customer = result.rows[0];

  if (!customer) {
    return { outcome: 'invalid_credentials' };
  }

  if (!customer.pin_hash) {
    return { outcome: 'pin_not_set' };
  }

  const validPin = await bcrypt.compare(pin, customer.pin_hash);

  if (!validPin) {
    return { outcome: 'invalid_credentials' };
  }

  if (customer.status === 'pending') {
    return { outcome: 'pending' };
  }

  if (customer.status === 'blocked') {
    return { outcome: 'blocked' };
  }

  const token = signToken({
    sub: customer.id,
    scope: 'customer',
  });

  return {
    outcome: 'success',
    body: {
      token,
      token_type: 'Bearer',
      scope: 'customer',
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        phone_number: customer.phone_number,
        national_id: customer.national_id,
        status: customer.status,
        created_at: customer.created_at.toISOString(),
      },
    },
  };
}

module.exports = {
  loginAdmin,
  loginCustomer,
};
