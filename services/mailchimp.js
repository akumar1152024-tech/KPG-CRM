const axios = require('axios');

function isConfigured() {
  return !!(process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_LIST_ID && process.env.MAILCHIMP_DC);
}

function getHeaders() {
  return { Authorization: `Bearer ${process.env.MAILCHIMP_API_KEY}`, 'Content-Type': 'application/json' };
}

function getBaseUrl() {
  return `https://${process.env.MAILCHIMP_DC || 'us21'}.api.mailchimp.com/3.0`;
}

function subscriberHash(email) {
  // MD5 hash — use simple string for Mailchimp subscriber lookup
  // For production, use the 'md5' package. Here we use the API's email lookup.
  return email.toLowerCase().trim();
}

async function sendEmail(to, subject, bodyHtml) {
  if (!isConfigured()) {
    console.log(`[Mailchimp] NOT configured — would send: "${subject}" to ${to}`);
    return { skipped: true, reason: 'Mailchimp not configured' };
  }
  try {
    // Use Mailchimp Transactional (Mandrill) if available, else log
    // For simplicity we create a campaign and send immediately
    const from_email = process.env.MAILCHIMP_FROM_EMAIL || 'hello@example.com';
    const from_name  = process.env.MAILCHIMP_FROM_NAME  || 'Kash Performance Group';

    // Create campaign
    const campaign = await axios.post(`${getBaseUrl()}/campaigns`, {
      type: 'regular',
      recipients: { list_id: process.env.MAILCHIMP_LIST_ID, segment_opts: { conditions: [{ condition_type: 'EmailAddress', op: 'is', field: 'EMAIL', value: to }] } },
      settings: { subject_line: subject, from_name, reply_to: from_email, title: `[Auto] ${subject.slice(0,50)}` },
    }, { headers: getHeaders() });

    const campaignId = campaign.data.id;

    // Set content
    await axios.put(`${getBaseUrl()}/campaigns/${campaignId}/content`, { html: bodyHtml }, { headers: getHeaders() });

    // Send
    await axios.post(`${getBaseUrl()}/campaigns/${campaignId}/actions/send`, {}, { headers: getHeaders() });

    console.log(`[Mailchimp] Email sent: "${subject}" to ${to}`);
    return { success: true, campaignId };
  } catch (err) {
    console.error(`[Mailchimp] sendEmail error: ${err.response?.data?.detail || err.message}`);
    return { success: false, error: err.message };
  }
}

async function addToAudience(email, name, tags = []) {
  if (!isConfigured()) {
    console.log(`[Mailchimp] NOT configured — would add ${email} with tags: ${tags.join(',')}`);
    return { skipped: true };
  }
  try {
    const nameParts = (name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    await axios.post(`${getBaseUrl()}/lists/${process.env.MAILCHIMP_LIST_ID}/members`, {
      email_address: email,
      status: 'subscribed',
      merge_fields: { FNAME: firstName, LNAME: lastName },
      tags: tags.map(t => ({ name: t, status: 'active' })),
    }, { headers: getHeaders() });

    console.log(`[Mailchimp] Added ${email} to audience`);
    return { success: true };
  } catch (err) {
    // 400 means already subscribed — update instead
    if (err.response?.status === 400 && err.response?.data?.title === 'Member Exists') {
      return tagContact(email, tags);
    }
    console.error(`[Mailchimp] addToAudience error: ${err.response?.data?.detail || err.message}`);
    return { success: false, error: err.message };
  }
}

async function tagContact(email, tags = []) {
  if (!isConfigured()) { console.log(`[Mailchimp] NOT configured — would tag ${email}: ${tags.join(',')}`); return { skipped: true }; }
  try {
    const hash = require('crypto').createHash('md5').update(email.toLowerCase()).digest('hex');
    await axios.post(`${getBaseUrl()}/lists/${process.env.MAILCHIMP_LIST_ID}/members/${hash}/tags`, {
      tags: tags.map(t => ({ name: t, status: 'active' }))
    }, { headers: getHeaders() });
    return { success: true };
  } catch (err) {
    console.error(`[Mailchimp] tagContact error: ${err.response?.data?.detail || err.message}`);
    return { success: false, error: err.message };
  }
}

async function triggerSequence(clientId, trigger) {
  // Delegate to sequence engine
  const { triggerSequence } = require('./sequence-engine');
  return triggerSequence(clientId, trigger);
}

module.exports = { sendEmail, addToAudience, tagContact, triggerSequence, isConfigured };
