const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

function logWebhook(db, endpoint, payload, status = 'received') {
  try {
    db.prepare('INSERT INTO webhooks_log (endpoint, payload, status) VALUES (?,?,?)').run(endpoint, JSON.stringify(payload), status);
  } catch (e) { console.error('Webhook log error:', e.message); }
}

function findOrCreateClient(db, email, name, phone) {
  if (!email) return null;
  let client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
  if (!client) {
    const initials = (name || email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const result = db.prepare(`INSERT INTO clients (name, email, phone, status, source, avatar_initials) VALUES (?,?,?,'lead','Other',?)`)
      .run(name || email, email, phone || null, initials);
    client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  }
  return client;
}

function findOrCreateLead(db, email, name, phone, platform, detail) {
  let lead = email ? db.prepare('SELECT * FROM leads WHERE email = ?').get(email) : null;
  if (!lead) {
    const result = db.prepare(`
      INSERT INTO leads (name, email, phone, source_platform, source_detail, status, date_captured)
      VALUES (?,?,?,?,?,'new',date('now'))
    `).run(name || email || 'Unknown', email || null, phone || null, platform || 'Website', detail || null);
    lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
  }
  return lead;
}

async function maybeRunSequence(clientId, trigger) {
  try {
    const { triggerSequence } = require('../services/sequence-engine');
    await triggerSequence(clientId, trigger);
  } catch (e) { console.error('Sequence error:', e.message); }
}

// GET /webhooks/test
router.get('/test', (req, res) => {
  const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const recent = (() => { try { return getDB().prepare('SELECT * FROM webhooks_log ORDER BY created_at DESC LIMIT 10').all(); } catch(e) { return []; } })();
  res.json({
    success: true,
    message: 'KPG Webhook Receiver is live',
    endpoints: {
      stripe:       { method: 'POST', url: `${base}/webhooks/stripe`,        body: { customer_email: 'string', customer_name: 'string', amount: 'number', description: 'string', payment_id: 'string' } },
      typeform:     { method: 'POST', url: `${base}/webhooks/typeform`,       body: { email: 'string', name: 'string', phone: 'string', answers: 'JSON string', form_id: 'string' } },
      calendly:     { method: 'POST', url: `${base}/webhooks/calendly`,       body: { email: 'string', name: 'string', event_type: 'string', scheduled_time: 'string' } },
      mailchimp:    { method: 'POST', url: `${base}/webhooks/mailchimp`,      body: { email: 'string', name: 'string', event: 'subscribe|unsubscribe' } },
      manychat:     { method: 'POST', url: `${base}/webhooks/manychat`,       body: { email: 'string', name: 'string', phone: 'string', tag: 'string' } },
      instagram_dm: { method: 'POST', url: `${base}/webhooks/instagram-dm`,  body: { sender_name: 'string', sender_id: 'string', message: 'string', timestamp: 'string' } },
      whatsapp:     { method: 'POST', url: `${base}/webhooks/whatsapp`,       body: { phone: 'string', name: 'string', message: 'string', timestamp: 'string' } },
      gmail:        { method: 'POST', url: `${base}/webhooks/gmail`,          body: { from_email: 'string', from_name: 'string', subject: 'string', snippet: 'string' } },
      formspree:    { method: 'POST', url: `${base}/webhooks/formspree`,      body: { email: 'string', name: 'string', message: 'string', _form_id: 'string' } },
    },
    recent_logs: recent,
  });
});

// POST /webhooks/stripe
router.post('/stripe', async (req, res) => {
  const db = getDB();
  try {
    const { customer_email, customer_name, amount, description, payment_id } = req.body;
    logWebhook(db, '/webhooks/stripe', req.body);
    if (!customer_email || !amount) return res.status(400).json({ success: false, error: 'customer_email and amount required' });

    const isFailed = payment_id && payment_id.toLowerCase().includes('failed');
    const client = findOrCreateClient(db, customer_email, customer_name);

    if (!isFailed) {
      const d = new Date();
      db.prepare('INSERT INTO income (description, amount, category, stripe_payment_id, client_id, date, month, year) VALUES (?,?,?,?,?,?,?,?)')
        .run(description || `Stripe payment from ${customer_name || customer_email}`, parseFloat(amount), 'stripe payment', payment_id || null, client?.id || null, d.toISOString().split('T')[0], d.getMonth()+1, d.getFullYear());
      if (client) {
        db.prepare('INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date("now"))')
          .run(client.id, 'stripe_payment', `Stripe payment received: $${parseFloat(amount).toFixed(2)}${description ? ' — ' + description : ''}`);
        await maybeRunSequence(client.id, 'payment_received');
      }
    } else if (client) {
      const { runAutomation } = require('../services/automations');
      await runAutomation('paymentFailed', client.id);
    }

    res.json({ success: true, message: `${isFailed ? 'Payment failure' : 'Payment'} processed for ${customer_name || customer_email}` });
  } catch (err) {
    console.error('/webhooks/stripe error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/typeform
router.post('/typeform', async (req, res) => {
  const db = getDB();
  try {
    const { email, name, phone, answers, form_id } = req.body;
    logWebhook(db, '/webhooks/typeform', req.body);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    const lead = findOrCreateLead(db, email, name, phone, 'Website', `Typeform${form_id ? ' ' + form_id : ''}`);

    let pipeline = db.prepare('SELECT * FROM pipeline WHERE email = ?').get(email);
    if (!pipeline) {
      db.prepare("INSERT INTO pipeline (name, email, phone, source, stage, notes) VALUES (?,?,?,'Typeform','typeform_submitted',?)")
        .run(name || email, email, phone || null, answers ? `Answers: ${answers}` : null);
    } else {
      db.prepare("UPDATE pipeline SET stage='typeform_submitted', updated_at=datetime('now') WHERE id=?").run(pipeline.id);
    }
    await maybeRunSequence(lead.id, 'new_lead');
    res.json({ success: true, message: `Typeform submission from ${name || email} processed` });
  } catch (err) {
    console.error('/webhooks/typeform error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/calendly
router.post('/calendly', (req, res) => {
  const db = getDB();
  try {
    const { email, name, event_type, scheduled_time } = req.body;
    logWebhook(db, '/webhooks/calendly', req.body);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    const note = `Calendly: ${event_type || 'call'} booked${scheduled_time ? ' for ' + scheduled_time : ''}`;
    findOrCreateLead(db, email, name, null, 'Website', 'Calendly booking');

    let pipeline = db.prepare('SELECT * FROM pipeline WHERE email = ?').get(email);
    if (!pipeline) {
      db.prepare("INSERT INTO pipeline (name, email, source, stage, notes) VALUES (?,?,'Calendly','calendly_booked',?)").run(name || email, email, note);
    } else {
      db.prepare("UPDATE pipeline SET stage='calendly_booked', notes=?, updated_at=datetime('now') WHERE id=?")
        .run((pipeline.notes ? pipeline.notes + '\n' : '') + note, pipeline.id);
    }

    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
    if (client) {
      db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))").run(client.id, 'calendly_booking', note);
    }
    res.json({ success: true, message: `Calendly booking from ${name || email} processed` });
  } catch (err) {
    console.error('/webhooks/calendly error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/mailchimp
router.post('/mailchimp', (req, res) => {
  const db = getDB();
  try {
    const { email, name, event } = req.body;
    logWebhook(db, '/webhooks/mailchimp', req.body);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });
    if (event === 'subscribe') findOrCreateLead(db, email, name, null, 'Website', 'Mailchimp subscribe');
    res.json({ success: true, message: `Mailchimp ${event || 'event'} for ${email} processed` });
  } catch (err) {
    console.error('/webhooks/mailchimp error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/manychat
router.post('/manychat', async (req, res) => {
  const db = getDB();
  try {
    const { email, name, phone, tag } = req.body;
    logWebhook(db, '/webhooks/manychat', req.body);
    if (!email && !name) return res.status(400).json({ success: false, error: 'email or name required' });
    const lead = findOrCreateLead(db, email, name, phone, 'ManyChat', tag ? `Tag: ${tag}` : 'ManyChat');
    await maybeRunSequence(lead.id, 'new_lead');
    res.json({ success: true, message: `ManyChat lead ${name || email} captured` });
  } catch (err) {
    console.error('/webhooks/manychat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/instagram-dm
router.post('/instagram-dm', async (req, res) => {
  const db = getDB();
  try {
    const { sender_name, sender_id, message, timestamp } = req.body;
    logWebhook(db, '/webhooks/instagram-dm', req.body);
    const lead = findOrCreateLead(db, null, sender_name, null, 'Instagram', `Instagram DM (ID: ${sender_id || 'unknown'})`);
    const preview = message ? message.substring(0, 100) : '(no message)';

    const client = sender_name ? db.prepare("SELECT * FROM clients WHERE name LIKE ?").get(`%${sender_name}%`) : null;
    if (client) {
      db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))").run(client.id, 'dm', `Instagram DM: ${preview}`);
    }
    await maybeRunSequence(lead.id, 'new_lead');
    res.json({ success: true, message: `Instagram DM from ${sender_name || 'unknown'} captured` });
  } catch (err) {
    console.error('/webhooks/instagram-dm error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/whatsapp
router.post('/whatsapp', async (req, res) => {
  const db = getDB();
  try {
    const { phone, name, message } = req.body;
    logWebhook(db, '/webhooks/whatsapp', req.body);
    if (!phone && !name) return res.status(400).json({ success: false, error: 'phone or name required' });

    let client = phone ? db.prepare("SELECT * FROM clients WHERE phone LIKE ?").get(`%${phone.slice(-10)}%`) : null;
    const lead = findOrCreateLead(db, null, name, phone, 'WhatsApp', 'WhatsApp message');

    if (client) {
      db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))")
        .run(client.id, 'whatsapp', `WhatsApp: ${(message || '').substring(0, 200)}`);
    }
    await maybeRunSequence(lead.id, 'new_lead');
    res.json({ success: true, message: `WhatsApp message from ${name || phone} captured` });
  } catch (err) {
    console.error('/webhooks/whatsapp error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/gmail
router.post('/gmail', (req, res) => {
  const db = getDB();
  try {
    const { from_email, from_name, subject, snippet } = req.body;
    logWebhook(db, '/webhooks/gmail', req.body);
    if (!from_email) return res.status(400).json({ success: false, error: 'from_email required' });

    const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(from_email);
    if (client) {
      db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))")
        .run(client.id, 'email', `Email received: "${subject || 'no subject'}" — ${(snippet || '').substring(0, 150)}`);
    }
    res.json({ success: true, message: `Gmail from ${from_name || from_email} logged` });
  } catch (err) {
    console.error('/webhooks/gmail error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks/formspree
router.post('/formspree', async (req, res) => {
  const db = getDB();
  try {
    const { email, name, message } = req.body;
    logWebhook(db, '/webhooks/formspree', req.body);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });
    const lead = findOrCreateLead(db, email, name, null, 'Website', 'Formspree contact form');
    if (message) {
      db.prepare("UPDATE leads SET notes=? WHERE id=?").run(message.substring(0, 500), lead.id);
    }
    await maybeRunSequence(lead.id, 'new_lead');
    res.json({ success: true, message: `Formspree submission from ${name || email} captured` });
  } catch (err) {
    console.error('/webhooks/formspree error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
