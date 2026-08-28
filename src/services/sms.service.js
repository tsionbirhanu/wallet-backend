require('dotenv').config({ override: true });

function normalizeMsisdn(phoneNumber) {
  return String(phoneNumber).replace(/[^\d]/g, '');
}

function buildSmsEthiopiaUrl() {
  const baseUrl = (process.env.SMSETHIOPIA_BASE_URL || 'https://smsethiopia.com/api').replace(
    /\/$/,
    ''
  );
  const apiVersion = process.env.SMSETHIOPIA_API_VERSION || 'v2';

  if (baseUrl.endsWith('/api')) {
    return apiVersion === 'v1' ? `${baseUrl}/sms/send` : `${baseUrl}/v2/sms/send`;
  }

  return apiVersion === 'v1' ? `${baseUrl}/api/sms/send` : `${baseUrl}/api/v2/sms/send`;
}

async function sendSms(phoneNumber, message) {
  const provider = process.env.SMS_PROVIDER || 'mock';

  if (provider === 'mock') {
    console.log(`[MOCK SMS] To: ${phoneNumber}`);
    console.log(`[MOCK SMS] Message: ${message}`);
    return { provider, sent: true };
  }

  if (provider === 'smsethiopia') {
    if (!process.env.SMSETHIOPIA_API_KEY) {
      throw new Error('SMSETHIOPIA_API_KEY is required when SMS_PROVIDER=smsethiopia');
    }

    const msisdn = normalizeMsisdn(phoneNumber);

    if (!/^2519\d{8}$/.test(msisdn)) {
      throw new Error('SMSETHIOPIA msisdn must be 12 digits and start with 2519');
    }

    const response = await fetch(buildSmsEthiopiaUrl(), {
      method: 'POST',
      headers: {
        KEY: process.env.SMSETHIOPIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msisdn,
        text: message,
        messageType: 'simple',
      }),
    });

    const responseText = await response.text();
    let responseBody;

    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      responseBody = { raw: responseText };
    }

    if (!response.ok || responseBody.sent === false) {
      const description = responseBody.description || response.statusText || 'SMS send failed';
      const error = new Error(`SMSETHIOPIA send failed: ${description}`);
      error.status = response.status;
      error.providerResponse = responseBody;
      throw error;
    }

    return {
      provider,
      sent: true,
      id: responseBody.id,
      segments: responseBody.segments,
      status: responseBody.status,
      description: responseBody.description,
    };
  }

  throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
}

module.exports = {
  sendSms,
};
