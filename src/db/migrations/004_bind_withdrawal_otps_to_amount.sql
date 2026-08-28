ALTER TABLE otp_codes
ADD COLUMN IF NOT EXISTS amount NUMERIC(18,2);

CREATE INDEX IF NOT EXISTS idx_otp_codes_withdrawal_amount
ON otp_codes(customer_id, purpose, amount, created_at DESC)
WHERE purpose = 'WITHDRAWAL' AND verified = false;
