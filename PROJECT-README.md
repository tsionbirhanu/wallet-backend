# Wallet/Deposit MVP Demo

This repository contains the backend API for the wallet/deposit MVP.

## What Runs In This Repo

- Node.js + Express REST API
- PostgreSQL persistence through `DATABASE_URL`
- JWT auth for admin and customer sessions
- Admin customer registration, OTP activation, deposits, withdrawals, transactions, notifications, and dashboard metrics
- Mock SMS locally through `[MOCK SMS]`
- Mock push locally through `[MOCK PUSH]`, or Firebase Cloud Messaging when configured

## Local Demo Order

1. Start the backend database.

Use Neon or another PostgreSQL database and put the connection string in `.env`:

```env
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=replace-me-with-a-long-random-secret
PORT=4000
NODE_ENV=development
SMS_PROVIDER=mock
PUSH_PROVIDER=mock
```

For a real SMS Ethiopia demo, replace mock SMS with:

```env
SMS_PROVIDER=smsethiopia
SMSETHIOPIA_API_KEY=your_api_key_from_sms_ethiopia
SMSETHIOPIA_SENDER_ID=your_approved_sender_or_campaign
SMSETHIOPIA_BASE_URL=https://smsethiopia.com/api
SMSETHIOPIA_API_VERSION=v2
```

2. Install backend dependencies.

```bash
npm install
```

3. Run backend migrations.

```bash
npm run migrate
```

4. Seed the demo admin.

```bash
npm run seed
```

Demo admin:

```text
email: admin@test.com
password: Admin123!
```

5. Start the backend.

```bash
npm run dev
```

Backend health check:

```bash
curl http://localhost:4000/health
```

6. Start the admin web app.

Open the admin web project in a separate terminal, point it at:

```text
http://localhost:4000
```

Then log in with the seeded admin account.

7. Register a test customer in the admin web app.

Create a customer with full name, phone number, national ID, and optionally a 4 to 6 digit PIN. The admin web "Register Customer" form should include a `pin` field when the admin wants the customer to log in immediately after OTP activation. If the PIN is omitted, use `POST /customers/:id/set-pin` later to set or reset it. The backend hashes the PIN with bcrypt and stores only `pin_hash`.

Example set/reset PIN request:

```bash
curl -s -X POST http://localhost:4000/customers/CUSTOMER_ID/set-pin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"pin":"1234"}'
```

Use this endpoint for demos and support flows. Do not update `pin_hash` manually with SQL.

8. Verify the customer OTP.

If `SMS_PROVIDER=mock`, read the OTP from the backend terminal logs:

```text
[MOCK SMS] Message: Your registration OTP is 123456. It expires in 5 minutes.
```

Enter that OTP in the admin web app to activate the customer.

9. Deposit money.

Use the admin web app to deposit an amount such as:

```text
100.00
```

The backend updates the wallet, writes a transaction, audit log, notification, and sends mock SMS/push after the DB transaction commits.

10. Open the Flutter customer app.

Point the Flutter app API base URL at:

```text
http://localhost:4000
```

Log in as the test customer, then open the wallet/home screen to see the updated balance and transaction history.

Customer login uses phone number and PIN. If a PIN was not provided during registration, set it through the real `POST /customers/:id/set-pin` endpoint before logging in; no raw SQL is needed. The raw PIN is never returned by the API and is never stored in the database.

## Demo Deployment

This repo includes:

- `Dockerfile`
- `render.yaml`
- `.env.example`

For Render, create a Blueprint from the repository and set `DATABASE_URL`. Render generates `JWT_SECRET` from `render.yaml`. The Docker command runs migrations, seeds the demo admin, and starts the API.

For SMS Ethiopia on Render, also set:

```env
SMS_PROVIDER=smsethiopia
SMSETHIOPIA_API_KEY=your_api_key_from_sms_ethiopia
SMSETHIOPIA_SENDER_ID=your_approved_sender_or_campaign
SMSETHIOPIA_BASE_URL=https://smsethiopia.com/api
SMSETHIOPIA_API_VERSION=v2
```

The backend SMS integration uses SMS Ethiopia API v2:

```text
POST https://smsethiopia.com/api/v2/sms/send
```

with the `KEY` header and request body fields `msisdn`, `text`, and `messageType`.

Real SMS delivery has been tested successfully with SMS Ethiopia. A successful send returns `sent: true`, a v2 message `id`, `segments`, `status: ACCEPTED`, and `description: Accepted for delivery`.

## Firebase Push Setup

Local demos do not require Firebase. Without Firebase env vars, push logs to the console.

To enable real push notifications:

1. Create a Firebase project.
2. Add the Flutter app to the Firebase project.
3. Open Firebase Console, then Project settings, then Service accounts.
4. Generate and download a service account JSON file.
5. Set either:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=C:\secure\firebase-service-account.json
```

or:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

The Flutter app should call `POST /me/register-device-token` after customer login so the backend can send FCM pushes to that customer.
