function isConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

async function sendSMS(to, message) {
  if (!isConfigured()) {
    console.log(`[Twilio] NOT configured — would send SMS to ${to}: "${message}"`);
    return { skipped: true, reason: 'Twilio not configured' };
  }
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const axios = require('axios');

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Body: message }).toString(),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    console.log(`[Twilio] SMS sent to ${to}: SID ${response.data.sid}`);
    return { success: true, sid: response.data.sid };
  } catch (err) {
    console.error(`[Twilio] sendSMS error: ${err.response?.data?.message || err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSMS, isConfigured };
