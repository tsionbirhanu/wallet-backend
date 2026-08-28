# Wallet Backend

Backend for a wallet/deposit MVP using Node.js, Express, PostgreSQL, JWT auth, and bcrypt.

## Requirements

- Node.js 18+
- PostgreSQL database URL, for example a Neon `DATABASE_URL`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```bash
cp .env.example .env
```

3. Set environment variables:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=replace-me-with-a-long-random-secret
PORT=4000
```

## Database

Run migrations:

```bash
npm run migrate
```

Seed the test admin:

```bash
npm run seed
```

The seed creates:

```text
email: admin@test.com
password: Admin123!
```

## Development

Start the dev server:

```bash
npm run dev
```

The server listens on `http://localhost:4000` by default.

## Implemented Endpoints

### POST /admin/login

Request:

```json
{
  "email": "admin@test.com",
  "password": "Admin123!"
}
```

### POST /customer/login

Request:

```json
{
  "phone_number": "+251900000000",
  "pin": "1234"
}
```

Customer app endpoints under `/me` require a customer Bearer token and are scoped to the customer ID in the JWT. Dashboard and wallet movement are implemented; any remaining future endpoints return `501 NOT_IMPLEMENTED`.

### POST /customers

Admin-only customer registration accepts an optional customer PIN:

```json
{
  "full_name": "Test Customer",
  "phone_number": "+251900000001",
  "national_id": "NID-000001",
  "pin": "1234"
}
```

If `pin` is provided, the backend hashes it with bcrypt and stores only `pin_hash`. If it is omitted, the admin can set it later with `POST /customers/:id/set-pin`.

### POST /customers/:id/set-pin

Admin-only PIN set/reset:

```json
{
  "pin": "1234"
}
```

This endpoint hashes the PIN with bcrypt and never returns `pin` or `pin_hash`.

## Manual Registration and OTP Verification Test

1. Log in as the seeded admin:

```bash
curl -s -X POST http://localhost:4000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Admin123!"}'
```

Copy the returned `token` value into `ADMIN_TOKEN`.

2. Register a pending customer:

```bash
curl -s -X POST http://localhost:4000/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"full_name":"Test Customer","phone_number":"+251900000001","national_id":"NID-000001","pin":"1234"}'
```

The response includes `customer`, `wallet`, and `otp.expires_at`. If `pin` is sent, the backend stores only a bcrypt `pin_hash`, never the raw PIN. The OTP code is printed by the mock SMS provider in the server logs with the `[MOCK SMS]` label.

If the PIN was not provided during registration, set it through the API:

```bash
curl -s -X POST http://localhost:4000/customers/CUSTOMER_ID/set-pin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"pin":"1234"}'
```

This is the supported demo path. Do not set `pin_hash` manually with SQL.

3. Verify the registration OTP:

```bash
curl -s -X POST http://localhost:4000/customers/CUSTOMER_ID/verify-otp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"code":"123456"}'
```

Replace `CUSTOMER_ID` with the customer ID from step 2 and `123456` with the OTP printed in the server logs.

4. List customers:

```bash
curl -s "http://localhost:4000/customers?search=Test&status=active&page=1&limit=20" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

5. Get one customer:

```bash
curl -s http://localhost:4000/customers/CUSTOMER_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

6. Manually block or activate a customer:

```bash
curl -s -X PATCH http://localhost:4000/customers/CUSTOMER_ID/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"status":"blocked","reason":"Manual admin review"}'
```

## Money Movement Safety Guarantees

Deposits and confirmed withdrawals run inside a single PostgreSQL transaction. Each balance-changing operation locks the customer's wallet row with `SELECT ... FOR UPDATE` before reading and updating the balance, so concurrent requests cannot both spend or overwrite the same starting balance.

Withdrawal OTP request checks the current balance only for early admin feedback. Withdrawal confirmation performs the authoritative balance check again after locking the wallet row, because another deposit or withdrawal may have changed the balance after the OTP was issued.

External side effects are intentionally outside the database transaction. SMS and push notifications are sent only after the transaction commits, so a failed provider call cannot roll back a valid ledger update and a rolled-back ledger update cannot send a success message.

All API money amounts are validated as positive decimal strings with at most two decimal places. PostgreSQL `NUMERIC(18,2)` performs the actual balance arithmetic, and API responses format amounts as decimal strings to avoid JSON float precision issues.

## Firebase Push Notifications

Local development works without Firebase. If no Firebase service account env var is set, `sendPush()` logs `[MOCK PUSH]` and the API continues normally.

To enable real FCM push delivery:

1. Create or open a Firebase project in the Firebase Console.
2. Add your Flutter app to the project and configure Firebase in Flutter.
3. In Firebase Console, open Project settings, then Service accounts.
4. Generate a new private key and download the JSON file.
5. Set one of these env vars:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=C:\secure\firebase-service-account.json
```

or:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

Use `/me/register-device-token` from the Flutter app after login:

```json
{
  "fcm_token": "DEVICE_FCM_TOKEN"
}
```

Deposit and withdrawal success flows call `sendPush(customerId, title, body)` after the database transaction commits.

## SMS Ethiopia Setup

For local development, keep SMS mocked:

```env
SMS_PROVIDER=mock
```

Mock mode prints OTP messages in the backend terminal:

```text
[MOCK SMS] To: +251900000001
[MOCK SMS] Message: Your registration OTP is 123456. It expires in 5 minutes.
```

To use SMS Ethiopia instead, create an API key from:

```text
https://smsethiopia.com/#/api-keys
```

Then set:

```env
SMS_PROVIDER=smsethiopia
SMSETHIOPIA_API_KEY=your_api_key_from_sms_ethiopia
SMSETHIOPIA_SENDER_ID=your_approved_sender_or_campaign
SMSETHIOPIA_BASE_URL=https://smsethiopia.com/api
SMSETHIOPIA_API_VERSION=v2
```

Keep the API key private. Do not commit `.env`.

The SMS integration is intentionally isolated in:

```text
src/services/sms.service.js
```

The SMS Ethiopia integration uses `POST /api/v2/sms/send`, the `KEY` header, and a JSON body containing `msisdn`, `text`, and `messageType`.
