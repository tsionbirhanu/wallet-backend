const pool = require('../db/pool');
const bcrypt = require('bcrypt');
const { sendSms } = require('./sms.service');
const { sendPush } = require('./push.service');

const OTP_TTL_MINUTES = 5;
const OTP_RATE_LIMIT_MAX = 3;
const OTP_RATE_LIMIT_WINDOW_MINUTES = 10;

function formatTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatMoney(value) {
  const text = String(value);
  const [whole, fraction = ''] = text.split('.');

  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function mapCustomer(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    phone_number: row.phone_number,
    national_id: row.national_id,
    status: row.status,
    created_at: formatTimestamp(row.created_at),
  };
}

function mapWallet(row) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    balance: formatMoney(row.balance),
    updated_at: formatTimestamp(row.updated_at),
  };
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTransactionRef(prefix) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();

  return `${prefix}-${timestamp}-${random}`;
}

function mapTransaction(row) {
  return {
    id: row.id,
    transaction_ref: row.transaction_ref,
    customer_id: row.customer_id,
    type: row.type,
    amount: formatMoney(row.amount),
    previous_balance: formatMoney(row.previous_balance),
    new_balance: formatMoney(row.new_balance),
    status: row.status,
    created_by_admin_id: row.created_by_admin_id,
    otp_verified: row.otp_verified,
    created_at: formatTimestamp(row.created_at),
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    customer_id: row.customer_id,
    title: row.title,
    body: row.body,
    is_read: row.is_read,
    created_at: formatTimestamp(row.created_at),
  };
}

async function assertOtpRateLimit(client, customerId, purpose) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM otp_codes
      WHERE customer_id = $1
        AND purpose = $2
        AND created_at >= NOW() - ($3::text || ' minutes')::interval
    `,
    [customerId, purpose, OTP_RATE_LIMIT_WINDOW_MINUTES]
  );

  return result.rows[0].count < OTP_RATE_LIMIT_MAX;
}

async function writeAuditLog(client, { adminId, action, targetCustomerId, meta = {} }) {
  await client.query(
    `
      INSERT INTO audit_logs (admin_id, action, target_customer_id, meta)
      VALUES ($1, $2, $3, $4)
    `,
    [adminId, action, targetCustomerId, meta]
  );
}

async function registerCustomer({ adminId, full_name, phone_number, national_id, pin }) {
  const client = await pool.connect();
  const code = generateOtpCode();
  const pinHash = pin ? await bcrypt.hash(pin, 12) : null;

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        INSERT INTO customers (full_name, phone_number, national_id, pin_hash, status, created_by_admin_id)
        VALUES ($1, $2, $3, $4, 'pending', $5)
        RETURNING id, full_name, phone_number, national_id, status, created_at
      `,
      [full_name, phone_number, national_id, pinHash, adminId]
    );

    const customer = customerResult.rows[0];

    const walletResult = await client.query(
      `
        INSERT INTO wallets (customer_id, balance)
        VALUES ($1, 0)
        RETURNING id, customer_id, balance, updated_at
      `,
      [customer.id]
    );

    const withinRateLimit = await assertOtpRateLimit(client, customer.id, 'REGISTRATION');

    if (!withinRateLimit) {
      await client.query('ROLLBACK');
      return { outcome: 'rate_limited' };
    }

    const otpResult = await client.query(
      `
        INSERT INTO otp_codes (customer_id, code, purpose, expires_at)
        VALUES ($1, $2, 'REGISTRATION', NOW() + ($3::text || ' minutes')::interval)
        RETURNING purpose, expires_at
      `,
      [customer.id, code, OTP_TTL_MINUTES]
    );

    await writeAuditLog(client, {
      adminId,
      action: 'CUSTOMER_REGISTERED',
      targetCustomerId: customer.id,
      meta: { phone_number },
    });

    await client.query('COMMIT');

    await sendSms(phone_number, `Your registration OTP is ${code}. It expires in 5 minutes.`)
      .then((result) => {
        console.log(
          `[SMS] Registration OTP send result customer=${customer.id} provider=${result.provider} sent=${result.sent} status=${result.status || 'n/a'} id=${result.id || 'n/a'}`
        );
      })
      .catch((error) => {
        console.error(
          `[SMS] Registration OTP send failed customer=${customer.id} phone=${phone_number} message=${error.message}`
        );
        if (error.providerResponse) {
          console.error('[SMS] Provider response:', JSON.stringify(error.providerResponse));
        }
      });

    return {
      outcome: 'success',
      body: {
        customer: mapCustomer(customer),
        wallet: mapWallet(walletResult.rows[0]),
        otp: {
          purpose: otpResult.rows[0].purpose,
          expires_at: formatTimestamp(otpResult.rows[0].expires_at),
        },
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505' && error.constraint === 'customers_phone_number_key') {
      return { outcome: 'phone_conflict' };
    }

    throw error;
  } finally {
    client.release();
  }
}

async function setCustomerPin({ adminId, customerId, pin }) {
  const client = await pool.connect();
  const pinHash = await bcrypt.hash(pin, 12);

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE customers
        SET pin_hash = $1
        WHERE id = $2
        RETURNING id, full_name, phone_number, national_id, status, created_at
      `,
      [pinHash, customerId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await writeAuditLog(client, {
      adminId,
      action: 'CUSTOMER_PIN_SET',
      targetCustomerId: customerId,
      meta: {},
    });

    await client.query('COMMIT');

    return {
      customer: mapCustomer(result.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function verifyRegistrationOtp({ adminId, customerId, code }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      'SELECT id FROM customers WHERE id = $1 FOR UPDATE',
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    const otpResult = await client.query(
      `
        SELECT id, code
        FROM otp_codes
        WHERE customer_id = $1
          AND purpose = 'REGISTRATION'
          AND verified = false
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [customerId]
    );

    const otp = otpResult.rows[0];

    if (!otp || otp.code !== code) {
      await client.query('ROLLBACK');
      return { outcome: 'invalid_otp' };
    }

    await client.query('UPDATE otp_codes SET verified = true WHERE id = $1', [otp.id]);

    const updatedCustomer = await client.query(
      `
        UPDATE customers
        SET status = 'active'
        WHERE id = $1
        RETURNING id, full_name, phone_number, national_id, status, created_at
      `,
      [customerId]
    );

    await writeAuditLog(client, {
      adminId,
      action: 'CUSTOMER_ACTIVATED',
      targetCustomerId: customerId,
      meta: { otp_code_id: otp.id },
    });

    await client.query('COMMIT');

    return {
      outcome: 'success',
      body: {
        customer: mapCustomer(updatedCustomer.rows[0]),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listCustomers({ search, status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const values = [];
  const filters = [];

  if (search) {
    values.push(`%${search}%`);
    filters.push(
      `(c.full_name ILIKE $${values.length} OR c.phone_number ILIKE $${values.length} OR c.national_id ILIKE $${values.length})`
    );
  }

  if (status) {
    values.push(status);
    filters.push(`c.status = $${values.length}`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM customers c ${whereClause}`,
    values
  );

  values.push(limit);
  values.push(offset);

  const dataResult = await pool.query(
    `
      SELECT
        c.id,
        c.full_name,
        c.phone_number,
        c.national_id,
        c.status,
        c.created_at,
        w.id AS wallet_id,
        w.balance AS wallet_balance,
        w.updated_at AS wallet_updated_at
      FROM customers c
      JOIN wallets w ON w.customer_id = c.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values
  );

  const total = countResult.rows[0].total;

  return {
    data: dataResult.rows.map((row) => ({
      ...mapCustomer(row),
      wallet: {
        id: row.wallet_id,
        balance: formatMoney(row.wallet_balance),
        updated_at: formatTimestamp(row.wallet_updated_at),
      },
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function getCustomerById(customerId) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.full_name,
        c.phone_number,
        c.national_id,
        c.status,
        c.created_at,
        w.id AS wallet_id,
        w.customer_id AS wallet_customer_id,
        w.balance AS wallet_balance,
        w.updated_at AS wallet_updated_at
      FROM customers c
      JOIN wallets w ON w.customer_id = c.id
      WHERE c.id = $1
    `,
    [customerId]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    customer: mapCustomer(row),
    wallet: {
      id: row.wallet_id,
      customer_id: row.wallet_customer_id,
      balance: formatMoney(row.wallet_balance),
      updated_at: formatTimestamp(row.wallet_updated_at),
    },
  };
}

async function updateCustomerStatus({ adminId, customerId, status, reason }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE customers
        SET status = $1
        WHERE id = $2
        RETURNING id, full_name, phone_number, national_id, status, created_at
      `,
      [status, customerId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await writeAuditLog(client, {
      adminId,
      action: 'CUSTOMER_STATUS_UPDATED',
      targetCustomerId: customerId,
      meta: { status, reason: reason || null },
    });

    await client.query('COMMIT');

    return {
      customer: mapCustomer(result.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createDeposit({ adminId, customerId, amount }) {
  const client = await pool.connect();
  let committedSideEffect;

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        SELECT c.id, c.phone_number, c.status
        FROM customers c
        WHERE c.id = $1
        FOR UPDATE
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    if (customerResult.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return { outcome: 'not_active' };
    }

    // FOR UPDATE serializes concurrent money changes for this wallet. Without it,
    // two deposits or withdrawals could read the same old balance and overwrite
    // each other, producing an incorrect final balance.
    const walletResult = await client.query(
      `
        SELECT id, customer_id, balance, updated_at
        FROM wallets
        WHERE customer_id = $1
        FOR UPDATE
      `,
      [customerId]
    );

    if (walletResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'wallet_not_found' };
    }

    const wallet = walletResult.rows[0];
    const previousBalance = wallet.balance;
    const balanceResult = await client.query(
      'SELECT ($1::numeric(18,2) + $2::numeric(18,2))::numeric(18,2) AS new_balance',
      [previousBalance, amount]
    );
    const newBalance = balanceResult.rows[0].new_balance;

    const transactionResult = await client.query(
      `
        INSERT INTO transactions (
          transaction_ref,
          customer_id,
          type,
          amount,
          previous_balance,
          new_balance,
          status,
          created_by_admin_id,
          otp_verified
        )
        VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'success', $6, false)
        RETURNING *
      `,
      [generateTransactionRef('DEP'), customerId, amount, previousBalance, newBalance, adminId]
    );

    const updatedWallet = await client.query(
      `
        UPDATE wallets
        SET balance = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, customer_id, balance, updated_at
      `,
      [newBalance, wallet.id]
    );

    await writeAuditLog(client, {
      adminId,
      action: 'DEPOSIT_CREATED',
      targetCustomerId: customerId,
      meta: {
        amount,
        previous_balance: formatMoney(previousBalance),
        new_balance: formatMoney(newBalance),
        transaction_id: transactionResult.rows[0].id,
      },
    });

    const title = 'Deposit successful';
    const body = `Deposit successful: ${formatMoney(amount)} ETB has been added. Your current balance is ${formatMoney(newBalance)} ETB.`;

    await client.query(
      `
        INSERT INTO notifications (customer_id, title, body)
        VALUES ($1, $2, $3)
      `,
      [customerId, title, body]
    );

    await client.query('COMMIT');

    committedSideEffect = {
      phoneNumber: customerResult.rows[0].phone_number,
      customerId,
      title,
      body,
    };

    await sendSms(committedSideEffect.phoneNumber, committedSideEffect.body).catch(console.error);
    await sendPush(committedSideEffect.customerId, committedSideEffect.title, committedSideEffect.body)
      .then((result) => {
        console.log(
          `[PUSH] Deposit push result customer=${committedSideEffect.customerId} provider=${result.provider} sent=${result.sent} success=${result.success_count || 0} failure=${result.failure_count || 0} tokens=${result.token_count || 'n/a'}`
        );
      })
      .catch(console.error);

    return {
      outcome: 'success',
      body: {
        transaction: mapTransaction(transactionResult.rows[0]),
        wallet: mapWallet(updatedWallet.rows[0]),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505' && error.constraint === 'transactions_transaction_ref_key') {
      return createDeposit({ adminId, customerId, amount });
    }

    throw error;
  } finally {
    client.release();
  }
}

async function requestWithdrawalOtp({ adminId, customerId, amount }) {
  const client = await pool.connect();
  const code = generateOtpCode();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        SELECT c.id, c.phone_number, c.status, w.balance
        FROM customers c
        JOIN wallets w ON w.customer_id = c.id
        WHERE c.id = $1
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    const customer = customerResult.rows[0];

    if (customer.status !== 'active') {
      await client.query('ROLLBACK');
      return { outcome: 'not_active' };
    }

    const balanceCheck = await client.query(
      'SELECT $1::numeric(18,2) >= $2::numeric(18,2) AS sufficient',
      [customer.balance, amount]
    );

    if (!balanceCheck.rows[0].sufficient) {
      await client.query('ROLLBACK');
      return { outcome: 'insufficient_balance' };
    }

    const withinRateLimit = await assertOtpRateLimit(client, customerId, 'WITHDRAWAL');

    if (!withinRateLimit) {
      await client.query('ROLLBACK');
      return { outcome: 'rate_limited' };
    }

    const otpResult = await client.query(
      `
        INSERT INTO otp_codes (customer_id, code, purpose, amount, expires_at)
        VALUES ($1, $2, 'WITHDRAWAL', $3, NOW() + ($4::text || ' minutes')::interval)
        RETURNING purpose, amount, expires_at
      `,
      [customerId, code, amount, OTP_TTL_MINUTES]
    );

    await writeAuditLog(client, {
      adminId,
      action: 'WITHDRAWAL_OTP_REQUESTED',
      targetCustomerId: customerId,
      meta: { amount },
    });

    await client.query('COMMIT');

    await sendSms(
      customer.phone_number,
      `Your withdrawal OTP is ${code}. It expires in 5 minutes.`
    ).catch(console.error);

    return {
      outcome: 'success',
      body: {
        otp: {
          purpose: otpResult.rows[0].purpose,
          amount: formatMoney(otpResult.rows[0].amount),
          expires_at: formatTimestamp(otpResult.rows[0].expires_at),
        },
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function confirmWithdrawal({ adminId, customerId, code, amount }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        SELECT id, phone_number, status
        FROM customers
        WHERE id = $1
        FOR UPDATE
      `,
      [customerId]
    );

    if (customerResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    if (customerResult.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return { outcome: 'not_active' };
    }

    const otpResult = await client.query(
      `
        SELECT id, code
        FROM otp_codes
        WHERE customer_id = $1
          AND purpose = 'WITHDRAWAL'
          AND verified = false
          AND expires_at > NOW()
          AND code = $2
          AND amount = $3::numeric(18,2)
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [customerId, code, amount]
    );

    const otp = otpResult.rows[0];

    if (!otp) {
      await writeAuditLog(client, {
        adminId,
        action: 'WITHDRAWAL_OTP_FAILED',
        targetCustomerId: customerId,
        meta: { amount },
      });
      await client.query('COMMIT');
      return { outcome: 'invalid_otp' };
    }

    // The wallet is locked and balance is checked again at confirmation time.
    // The earlier OTP request check is only user feedback; another admin could
    // withdraw or block funds before this request arrives. This re-check prevents
    // race-condition overdrafts and keeps the transaction ledger consistent.
    const walletResult = await client.query(
      `
        SELECT id, customer_id, balance, updated_at
        FROM wallets
        WHERE customer_id = $1
        FOR UPDATE
      `,
      [customerId]
    );

    if (walletResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'wallet_not_found' };
    }

    const wallet = walletResult.rows[0];
    const balanceCheck = await client.query(
      'SELECT $1::numeric(18,2) >= $2::numeric(18,2) AS sufficient',
      [wallet.balance, amount]
    );

    if (!balanceCheck.rows[0].sufficient) {
      await client.query('ROLLBACK');
      return { outcome: 'insufficient_balance' };
    }

    const balanceResult = await client.query(
      'SELECT ($1::numeric(18,2) - $2::numeric(18,2))::numeric(18,2) AS new_balance',
      [wallet.balance, amount]
    );
    const newBalance = balanceResult.rows[0].new_balance;

    const transactionResult = await client.query(
      `
        INSERT INTO transactions (
          transaction_ref,
          customer_id,
          type,
          amount,
          previous_balance,
          new_balance,
          status,
          created_by_admin_id,
          otp_verified
        )
        VALUES ($1, $2, 'WITHDRAWAL', $3, $4, $5, 'success', $6, true)
        RETURNING *
      `,
      [generateTransactionRef('WDR'), customerId, amount, wallet.balance, newBalance, adminId]
    );

    const updatedWallet = await client.query(
      `
        UPDATE wallets
        SET balance = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, customer_id, balance, updated_at
      `,
      [newBalance, wallet.id]
    );

    await client.query('UPDATE otp_codes SET verified = true WHERE id = $1', [otp.id]);

    await writeAuditLog(client, {
      adminId,
      action: 'WITHDRAWAL_CREATED',
      targetCustomerId: customerId,
      meta: {
        amount,
        previous_balance: formatMoney(wallet.balance),
        new_balance: formatMoney(newBalance),
        transaction_id: transactionResult.rows[0].id,
        otp_code_id: otp.id,
      },
    });

    const title = 'Withdrawal successful';
    const body = `Withdrawal successful: ${formatMoney(amount)} ETB has been withdrawn. Your current balance is ${formatMoney(newBalance)} ETB.`;

    await client.query(
      `
        INSERT INTO notifications (customer_id, title, body)
        VALUES ($1, $2, $3)
      `,
      [customerId, title, body]
    );

    await client.query('COMMIT');

    await sendSms(customerResult.rows[0].phone_number, body).catch(console.error);
    await sendPush(customerId, title, body)
      .then((result) => {
        console.log(
          `[PUSH] Withdrawal push result customer=${customerId} provider=${result.provider} sent=${result.sent} success=${result.success_count || 0} failure=${result.failure_count || 0} tokens=${result.token_count || 'n/a'}`
        );
      })
      .catch(console.error);

    return {
      outcome: 'success',
      body: {
        transaction: mapTransaction(transactionResult.rows[0]),
        wallet: mapWallet(updatedWallet.rows[0]),
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505' && error.constraint === 'transactions_transaction_ref_key') {
      return confirmWithdrawal({ adminId, customerId, code, amount });
    }

    throw error;
  } finally {
    client.release();
  }
}

async function listCustomerTransactions({ customerId, page = 1, limit = 20 }) {
  const customerResult = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);

  if (customerResult.rowCount === 0) {
    return null;
  }

  const offset = (page - 1) * limit;
  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM transactions WHERE customer_id = $1',
    [customerId]
  );
  const dataResult = await pool.query(
    `
      SELECT *
      FROM transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [customerId, limit, offset]
  );
  const total = countResult.rows[0].total;

  return {
    data: dataResult.rows.map(mapTransaction),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function getMe(customerId) {
  return getCustomerById(customerId);
}

async function listMyTransactions({ customerId, page = 1, limit = 20 }) {
  return listCustomerTransactions({ customerId, page, limit });
}

async function listMyNotifications({ customerId, isRead, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const values = [customerId];
  const filters = ['customer_id = $1'];

  if (typeof isRead === 'boolean') {
    values.push(isRead);
    filters.push(`is_read = $${values.length}`);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM notifications ${whereClause}`,
    values
  );

  values.push(limit);
  values.push(offset);

  const dataResult = await pool.query(
    `
      SELECT id, customer_id, title, body, is_read, created_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  const total = countResult.rows[0].total;

  return {
    data: dataResult.rows.map(mapNotification),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function markMyNotificationRead({ customerId, notificationId }) {
  const result = await pool.query(
    `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
        AND customer_id = $2
      RETURNING id, customer_id, title, body, is_read, created_at
    `,
    [notificationId, customerId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return {
    notification: mapNotification(result.rows[0]),
  };
}

async function registerDeviceToken({ customerId, token }) {
  const result = await pool.query(
    `
      INSERT INTO device_tokens (customer_id, token)
      VALUES ($1, $2)
      ON CONFLICT (customer_id, token) DO UPDATE
      SET token = EXCLUDED.token
      RETURNING id, customer_id, token, created_at
    `,
    [customerId, token]
  );

  return {
    device_token: {
      id: result.rows[0].id,
      customer_id: result.rows[0].customer_id,
      token: result.rows[0].token,
      created_at: formatTimestamp(result.rows[0].created_at),
    },
  };
}

module.exports = {
  registerCustomer,
  setCustomerPin,
  verifyRegistrationOtp,
  listCustomers,
  getCustomerById,
  updateCustomerStatus,
  createDeposit,
  requestWithdrawalOtp,
  confirmWithdrawal,
  listCustomerTransactions,
  getMe,
  listMyTransactions,
  listMyNotifications,
  markMyNotificationRead,
  registerDeviceToken,
};
