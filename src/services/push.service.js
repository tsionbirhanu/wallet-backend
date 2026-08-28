const fs = require('fs');
const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const pool = require('../db/pool');

require('dotenv').config({ override: true });

let firebaseApp;

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  const provider = process.env.PUSH_PROVIDER || 'mock';

  if (provider === 'mock') {
    return null;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!serviceAccountJson && !serviceAccountPath) {
    return null;
  }

  let serviceAccount;

  if (serviceAccountJson) {
    serviceAccount = JSON.parse(serviceAccountJson);
  } else {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }

  firebaseApp = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount),
      });

  return firebaseApp;
}

async function sendPush(customerId, title, body) {
  const tokenResult = await pool.query('SELECT token FROM device_tokens WHERE customer_id = $1', [
    customerId,
  ]);
  const tokens = tokenResult.rows.map((row) => row.token);
  const app = getFirebaseApp();

  if (!app || tokens.length === 0) {
    console.log(`[MOCK PUSH] Customer: ${customerId}`);
    console.log(`[MOCK PUSH] Title: ${title}`);
    console.log(`[MOCK PUSH] Body: ${body}`);
    console.log(`[MOCK PUSH] Tokens found: ${tokens.length}`);
    return { provider: 'mock', sent: false, token_count: tokens.length };
  }

  const response = await getMessaging(app).sendEachForMulticast({
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      customer_id: customerId,
    },
  });

  return {
    provider: 'firebase',
    sent: response.successCount > 0,
    success_count: response.successCount,
    failure_count: response.failureCount,
  };
}

module.exports = {
  sendPush,
};
