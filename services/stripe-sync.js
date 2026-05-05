const axios = require('axios');
const { getDB } = require('../database');

function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function stripeGet(path, params) {
  return axios.get(`https://api.stripe.com/v1/${path}`, {
    auth: { username: process.env.STRIPE_SECRET_KEY, password: '' },
    params,
  });
}

async function syncStripePayments() {
  if (!isConfigured()) {
    console.log('[Stripe Sync] STRIPE_SECRET_KEY not configured — skipping');
    return { skipped: true };
  }

  const db = getDB();
  const yesterdayUnix = Math.floor(Date.now() / 1000) - 86400;
  let imported = 0;

  function maybeInsert(paymentId, amountCents, email, name, description) {
    if (!paymentId) return;
    if (amountCents <= 0) return;

    const exists = db.prepare('SELECT id FROM income WHERE stripe_payment_id = ?').get(paymentId);
    if (exists) return;

    let clientId = null;
    if (email) {
      let client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
      if (!client) {
        const initials = (name || email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const ins = db.prepare(`INSERT INTO clients (name, email, status, source, avatar_initials) VALUES (?,?,'lead','Other',?)`)
          .run(name || email, email, initials);
        client = db.prepare('SELECT * FROM clients WHERE id = ?').get(ins.lastInsertRowid);
      }
      clientId = client.id;

      db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))")
        .run(clientId, 'stripe_payment', `Stripe payment imported: $${(amountCents / 100).toFixed(2)}${description ? ' — ' + description : ''}`);
    }

    const d = new Date();
    db.prepare('INSERT INTO income (description, amount, category, stripe_payment_id, client_id, date, month, year) VALUES (?,?,?,?,?,?,?,?)')
      .run(
        description || `Stripe payment${name ? ' from ' + name : email ? ' from ' + email : ''}`,
        amountCents / 100,
        'stripe payment',
        paymentId,
        clientId,
        d.toISOString().split('T')[0],
        d.getMonth() + 1,
        d.getFullYear()
      );
    imported++;
    console.log(`[Stripe Sync] Imported: ${paymentId} — $${(amountCents / 100).toFixed(2)} (${email || 'no email'})`);
  }

  // ── payment_intents (succeeded) ───────────────────────────────────────────────
  try {
    const res = await stripeGet('payment_intents', { limit: 100, 'created[gte]': yesterdayUnix });
    for (const pi of res.data.data || []) {
      if (pi.status !== 'succeeded') continue;
      const email  = pi.receipt_email ||
                     pi.customer_details?.email ||
                     pi.charges?.data?.[0]?.billing_details?.email ||
                     pi.charges?.data?.[0]?.receipt_email ||
                     null;
      const name   = pi.charges?.data?.[0]?.billing_details?.name || pi.metadata?.name || null;
      const amount = pi.amount_received || pi.amount || 0;
      maybeInsert(pi.id, amount, email, name, pi.description || null);
    }
  } catch (err) {
    console.error('[Stripe Sync] payment_intents fetch error:', err.response?.data?.error?.message || err.message);
  }

  // ── invoices (paid) ───────────────────────────────────────────────────────────
  try {
    const res = await stripeGet('invoices', { limit: 100, status: 'paid', 'created[gte]': yesterdayUnix });
    for (const inv of res.data.data || []) {
      const email   = inv.customer_email || inv.customer_details?.email || null;
      const name    = inv.customer_name  || null;
      const amount  = inv.total ?? inv.amount_paid ?? 0;
      // Use payment_intent as dedup key when present so it doesn't double-count with PI sync
      const pid     = inv.payment_intent || inv.id;
      const desc    = inv.description || (inv.number ? `Invoice ${inv.number}` : null);
      maybeInsert(pid, amount, email, name, desc);
    }
  } catch (err) {
    console.error('[Stripe Sync] invoices fetch error:', err.response?.data?.error?.message || err.message);
  }

  console.log(`[Stripe Sync] ${imported} new payment${imported !== 1 ? 's' : ''} imported`);
  return { imported };
}

module.exports = { syncStripePayments, isConfigured };
