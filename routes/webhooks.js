const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

function logWebhook(db, endpoint, payload, status = 'received') {
  try {
    console.log(`[webhook] ${endpoint}`, JSON.stringify(payload));
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
  const recent = (() => { try { return getDB().prepare('SELECT * FROM webhooks_log ORDER BY created_at DESC LIMIT 20').all(); } catch(e) { return []; } })();

  const ENDPOINTS = [
    {
      name: 'Stripe',
      path: '/webhooks/stripe',
      zapier: 'Stripe → Webhooks by Zapier',
      desc: 'Fires on successful payment or failed charge. Logs income, updates client, triggers email sequence.',
      fields: { customer_email: 'string (required)', customer_name: 'string', amount: 'number (required)', description: 'string', payment_id: 'string — include "failed" to trigger paymentFailed automation' },
      sample: { customer_email: 'priya@example.com', customer_name: 'Priya Ramesh', amount: 800, description: '1:1 Coaching - April', payment_id: 'pi_abc123' },
    },
    {
      name: 'Typeform',
      path: '/webhooks/typeform',
      zapier: 'Typeform → Webhooks by Zapier',
      desc: 'Fires when discovery form is submitted. Creates lead + pipeline entry at Typeform Submitted stage.',
      fields: { email: 'string (required)', name: 'string', phone: 'string', answers: 'string (JSON of form answers)', form_id: 'string' },
      sample: { email: 'rohan@example.com', name: 'Rohan Nair', phone: '+16045550101', answers: '{"goal":"fat loss","budget":"800"}', form_id: 'abc123' },
    },
    {
      name: 'Calendly',
      path: '/webhooks/calendly',
      zapier: 'Calendly → Webhooks by Zapier',
      desc: 'Fires when a discovery call is booked. Moves pipeline to Calendly Booked, logs interaction.',
      fields: { email: 'string (required)', name: 'string', event_type: 'string', scheduled_time: 'string (ISO datetime)' },
      sample: { email: 'sneha@example.com', name: 'Sneha Verma', event_type: 'Discovery Call', scheduled_time: '2026-05-10T10:00:00Z' },
    },
    {
      name: 'Mailchimp',
      path: '/webhooks/mailchimp',
      zapier: 'Mailchimp → Webhooks by Zapier',
      desc: 'Fires on list subscribe/unsubscribe. Creates a lead on subscribe.',
      fields: { email: 'string (required)', name: 'string', event: 'subscribe | unsubscribe' },
      sample: { email: 'amit@example.com', name: 'Amit Shah', event: 'subscribe' },
    },
    {
      name: 'ManyChat',
      path: '/webhooks/manychat',
      zapier: 'ManyChat → Webhooks by Zapier (or ManyChat External Request)',
      desc: 'Fires when a user hits a ManyChat flow. Captures lead and triggers new_lead email sequence.',
      fields: { email: 'string', name: 'string', phone: 'string', tag: 'string (ManyChat tag name)' },
      sample: { email: 'kavya@example.com', name: 'Kavya Pillai', phone: '+19055550303', tag: 'interested-coaching' },
    },
    {
      name: 'Instagram DM',
      path: '/webhooks/instagram-dm',
      zapier: 'Instagram Lead Ads or ManyChat → Webhooks by Zapier',
      desc: 'Fires when someone DMs. Creates Instagram lead and logs interaction if client matches by name.',
      fields: { sender_name: 'string', sender_id: 'string', message: 'string', timestamp: 'string' },
      sample: { sender_name: 'Deepa Nair', sender_id: 'ig_98765', message: 'Hi! I saw your fat loss reel, can we talk?', timestamp: '2026-05-01T09:30:00Z' },
    },
    {
      name: 'WhatsApp',
      path: '/webhooks/whatsapp',
      zapier: 'WhatsApp Business via Twilio or 360dialog → Webhooks by Zapier',
      desc: 'Fires on incoming WhatsApp message. Matches client by phone, logs interaction or creates lead.',
      fields: { phone: 'string (required)', name: 'string', message: 'string', timestamp: 'string' },
      sample: { phone: '+16475550101', name: 'Priya Ramesh', message: 'Just finished my workout, feeling great!', timestamp: '2026-05-01T07:15:00Z' },
    },
    {
      name: 'Gmail',
      path: '/webhooks/gmail',
      zapier: 'Gmail → Webhooks by Zapier',
      desc: 'Fires when an email arrives from a known client. Logs an email interaction on their profile.',
      fields: { from_email: 'string (required)', from_name: 'string', subject: 'string', snippet: 'string (email preview)' },
      sample: { from_email: 'priya.ramesh@gmail.com', from_name: 'Priya Ramesh', subject: 'My progress this week', snippet: 'Hi Kash, just wanted to share — I hit a new PB today...' },
    },
    {
      name: 'Formspree',
      path: '/webhooks/formspree',
      zapier: 'Formspree → Webhooks by Zapier',
      desc: 'Fires on website contact form submission. Creates a Website lead and triggers email sequence.',
      fields: { email: 'string (required)', name: 'string', message: 'string', _form_id: 'string' },
      sample: { email: 'new@example.com', name: 'New Lead', message: 'I am interested in your 1:1 coaching program', _form_id: 'myform123' },
    },
  ];

  const rows = recent.map(r => {
    let payload = '';
    try { payload = JSON.stringify(JSON.parse(r.payload), null, 2); } catch { payload = r.payload || ''; }
    const ago = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
    return `<tr>
      <td><code>${r.endpoint}</code></td>
      <td><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:11px">${r.status||'received'}</span></td>
      <td style="color:#6b7280;font-size:12px">${ago}</td>
      <td><details><summary style="cursor:pointer;font-size:12px;color:#6b7280">View payload</summary><pre style="font-size:11px;background:#f9fafb;padding:8px;border-radius:4px;overflow:auto;max-height:120px;margin-top:4px">${payload.replace(/</g,'&lt;')}</pre></details></td>
    </tr>`;
  }).join('');

  const cards = ENDPOINTS.map(ep => {
    const url = `${base}${ep.path}`;
    const curl = `curl -s -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(ep.sample)}'`;
    const fieldsHtml = Object.entries(ep.fields).map(([k,v]) =>
      `<tr><td style="font-family:monospace;font-size:12px;color:#0F6E56;padding:3px 8px 3px 0;white-space:nowrap">${k}</td><td style="font-size:12px;color:#6b7280;padding:3px 0">${v}</td></tr>`
    ).join('');
    return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div>
          <span style="font-size:16px;font-weight:700;color:#111">${ep.name}</span>
          <span style="margin-left:8px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px">POST</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <code style="background:#f3f4f6;padding:4px 10px;border-radius:6px;font-size:12px;color:#374151">${url}</code>
          <button onclick="navigator.clipboard.writeText('${url}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copy',1500)})"
            style="background:#0F6E56;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Copy</button>
        </div>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-bottom:12px">${ep.desc}</p>
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:6px">📋 Zapier trigger: ${ep.zapier}</p>
      <details style="margin-bottom:10px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#374151;list-style:none">▶ Expected fields</summary>
        <table style="margin-top:8px;border-collapse:collapse;width:100%">${fieldsHtml}</table>
      </details>
      <details>
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#374151;list-style:none">▶ Test with curl</summary>
        <div style="position:relative;margin-top:8px">
          <pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;overflow-x:auto;line-height:1.6">${curl.replace(/</g,'&lt;')}</pre>
          <button onclick="navigator.clipboard.writeText(\`${curl.replace(/`/g,'\\`')}\`).then(()=>{this.textContent='✓ Copied';setTimeout(()=>this.textContent='Copy curl',1500)})"
            style="position:absolute;top:8px;right:8px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer">Copy curl</button>
        </div>
      </details>
    </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>KPG Webhooks</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#f8fafc;color:#111;padding:32px 16px}
    .wrap{max-width:860px;margin:0 auto}
    h1{font-size:24px;font-weight:700;color:#0A4A3A;margin-bottom:4px}
    .sub{font-size:14px;color:#6b7280;margin-bottom:28px}
    h2{font-size:15px;font-weight:700;color:#374151;margin:28px 0 14px;padding-bottom:6px;border-bottom:2px solid #e5e7eb}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;padding:8px 10px;border-bottom:1px solid #e5e7eb}
    td{padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;vertical-align:top}
    .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .live{background:#d1fae5;color:#065f46}
  </style>
</head>
<body>
<div class="wrap">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
    <span style="font-size:32px">💪</span>
    <div>
      <h1>KPG Webhook Endpoints</h1>
      <p class="sub">9 endpoints ready · Base URL: <code style="background:#e5e7eb;padding:2px 8px;border-radius:4px">${base}</code> · <span class="badge live">Live</span></p>
    </div>
  </div>

  <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#92400e">
    <strong>📋 How to connect with Zapier:</strong><br>
    1. Create a new Zap · 2. Choose your trigger app (Stripe, Typeform, Calendly etc) ·
    3. Add action: <em>Webhooks by Zapier → POST</em> · 4. Paste the URL below ·
    5. Map fields from the trigger to the expected body fields shown below.
  </div>

  <h2>Endpoints</h2>
  ${cards}

  <h2>Recent Webhook Log (last 20)</h2>
  ${recent.length ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <table>
      <thead><tr><th>Endpoint</th><th>Status</th><th>Received</th><th>Payload</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>` : '<p style="color:#9ca3af;font-size:13px">No webhooks received yet. Use the curl commands above to send a test.</p>'}

  <p style="margin-top:32px;font-size:12px;color:#9ca3af;text-align:center">
    KPG Coaching Dashboard · <a href="/" style="color:#0F6E56">Back to app</a>
  </p>
</div>
</body>
</html>`);
});

// POST /webhooks/stripe
// No signature verification — accepts all POSTs (Stripe native + Zapier)
router.post('/stripe', async (req, res) => {
  console.log('[STRIPE] Request received');
  console.log('[STRIPE] Body:', JSON.stringify(req.body).slice(0, 300));

  // Respond 200 immediately — must be first so Stripe never sees a failure
  res.json({ success: true, received: true });

  try {
    const db   = getDB();
    const body = req.body;

    logWebhook(db, '/webhooks/stripe', body);
    console.log('[STRIPE] Webhook logged');

    let email, name, amountDollars, description, paymentId, isFailed;

    if (body.type && body.data && body.data.object) {
      const obj      = body.data.object;
      const type     = body.type;
      console.log('[STRIPE] Event type:', type);

      isFailed = type === 'payment_intent.payment_failed' ||
                 type === 'charge.failed' ||
                 type === 'invoice.payment_failed';

      // Email — check top-level fields first, then dig into nested charge data
      email = obj.customer_email ||
              obj.receipt_email  ||
              obj.billing_details?.email ||
              obj.customer_details?.email ||
              obj.charges?.data?.[0]?.billing_details?.email ||
              obj.charges?.data?.[0]?.receipt_email ||
              obj.metadata?.email ||
              null;
      console.log('[STRIPE] Email found:', email);

      // Name — invoice events use customer_name at top level
      name = obj.customer_name ||
             obj.billing_details?.name ||
             obj.customer_details?.name ||
             obj.metadata?.name ||
             null;

      // Amount — invoice events use total/amount_paid, payment_intent uses amount_received/amount
      // Stripe native events always send cents — divide by 100 unconditionally
      const rawAmount = obj.total ?? obj.amount_paid ?? obj.amount_due ??
                        obj.amount_received ?? obj.amount ?? obj.amount_total ?? 0;
      amountDollars = rawAmount / 100;
      console.log('[STRIPE] Amount:', amountDollars, '| raw cents:', rawAmount);

      description = obj.description || obj.metadata?.description || `Stripe ${type}`;
      paymentId   = obj.id || null;

    } else {
      console.log('[STRIPE] Flat-field payload (Zapier or manual test)');
      email         = body.customer_email || body.email || null;
      name          = body.customer_name  || body.name  || null;
      amountDollars = parseFloat(body.amount || 0);
      description   = body.description || null;
      paymentId     = body.payment_id   || null;
      isFailed      = paymentId && paymentId.toLowerCase().includes('failed');
      console.log('[STRIPE] Email found:', email, '| Amount:', amountDollars);
    }

    // Always log income regardless of whether email was found
    if (!isFailed && amountDollars > 0) {
      // Find/create client only if we have identifying info
      const client = (email || name) ? findOrCreateClient(db, email, name) : null;
      console.log('[STRIPE] Client found/created:', client ? `id=${client.id} name=${client.name}` : 'null (no email/name — income still logged)');

      const d = new Date();
      db.prepare('INSERT INTO income (description, amount, category, stripe_payment_id, client_id, date, month, year) VALUES (?,?,?,?,?,?,?,?)')
        .run(
          description || `Stripe payment${name ? ' from ' + name : email ? ' from ' + email : ''}`,
          amountDollars,
          'stripe payment',
          paymentId || null,
          client?.id || null,
          d.toISOString().split('T')[0],
          d.getMonth() + 1,
          d.getFullYear()
        );
      console.log('[STRIPE] Income inserted — amount:', amountDollars, '| client_id:', client?.id ?? 'null');

      if (client) {
        db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))")
          .run(client.id, 'stripe_payment', `Stripe payment received: $${amountDollars.toFixed(2)}${description ? ' — ' + description : ''}`);
        await maybeRunSequence(client.id, 'payment_received');
        console.log('[STRIPE] Interaction logged + sequence triggered for client:', client.name);
      }
    } else if (isFailed) {
      const client = (email || name) ? findOrCreateClient(db, email, name) : null;
      if (client) {
        const { runAutomation } = require('../services/automations');
        await runAutomation('paymentFailed', client.id);
        console.log('[STRIPE] paymentFailed automation triggered for client:', client.name);
      } else {
        console.log('[STRIPE] Payment failed but no client identified — no automation triggered');
      }
    } else {
      console.log('[STRIPE] No action taken — isFailed:', isFailed, '| amountDollars:', amountDollars);
    }

  } catch (err) {
    console.error('[STRIPE] Processing error:', err.message);
    console.error('[STRIPE] Stack:', err.stack);
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
    // Log first — before any validation so nothing is ever lost
    logWebhook(db, '/webhooks/formspree', req.body);

    const b = req.body;

    // Resolve email from any common Formspree field name
    const email = b.email || b.Email || b._replyto || b['your-email'] || b['Email Address'] || null;

    // Resolve name from any common Formspree field name
    const name  = b.name  || b.Name  || b['your-name'] || b.fullname || b['Full Name'] || null;

    // Resolve message/notes
    const message = b.message || b.Message || b.notes || b.Notes || null;

    if (email) {
      const lead = findOrCreateLead(db, email, name, null, 'Website', 'Formspree contact form');
      if (message) {
        db.prepare('UPDATE leads SET notes=? WHERE id=?').run(message.substring(0, 500), lead.id);
      }
      await maybeRunSequence(lead.id, 'new_lead');
      res.json({ success: true, message: `Formspree submission from ${name || email} captured` });
    } else {
      // No email found — still create a lead so nothing is lost; store full body as notes
      const lead = findOrCreateLead(db, null, name, null, 'Website', 'Formspree contact form');
      db.prepare('UPDATE leads SET notes=? WHERE id=?').run(JSON.stringify(b).substring(0, 500), lead.id);
      await maybeRunSequence(lead.id, 'new_lead');
      res.json({ success: true, message: 'Formspree submission captured (no email field found — raw body stored in notes)' });
    }
  } catch (err) {
    console.error('/webhooks/formspree error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
