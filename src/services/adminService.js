const pool = require('../db/pool');

function formatTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatMoney(value) {
  const text = String(value || '0');
  const [whole, fraction = ''] = text.split('.');

  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
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

async function getDashboard() {
  const [customerMetrics, transactionMetrics, walletMetrics, lastTransactions] =
    await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_customers,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active_customers
          FROM customers
        `
      ),
      pool.query(
        `
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT' AND status = 'success'), 0)::numeric(18,2) AS total_deposits,
            COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL' AND status = 'success'), 0)::numeric(18,2) AS total_withdrawals
          FROM transactions
        `
      ),
      pool.query(
        `
          SELECT COALESCE(SUM(balance), 0)::numeric(18,2) AS total_balance
          FROM wallets
        `
      ),
      pool.query(
        `
          SELECT *
          FROM transactions
          ORDER BY created_at DESC
          LIMIT 10
        `
      ),
    ]);

  return {
    total_customers: customerMetrics.rows[0].total_customers,
    active_customers: customerMetrics.rows[0].active_customers,
    total_deposits: formatMoney(transactionMetrics.rows[0].total_deposits),
    total_withdrawals: formatMoney(transactionMetrics.rows[0].total_withdrawals),
    total_balance: formatMoney(walletMetrics.rows[0].total_balance),
    last_transactions: lastTransactions.rows.map(mapTransaction),
  };
}

module.exports = {
  getDashboard,
};
