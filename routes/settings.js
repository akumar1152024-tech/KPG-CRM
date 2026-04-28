const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const webhooks = {
      stripe:       `${base}/webhooks/stripe`,
      typeform:     `${base}/webhooks/typeform`,
      calendly:     `${base}/webhooks/calendly`,
      mailchimp:    `${base}/webhooks/mailchimp`,
      manychat:     `${base}/webhooks/manychat`,
      instagram_dm: `${base}/webhooks/instagram-dm`,
      whatsapp:     `${base}/webhooks/whatsapp`,
      gmail:        `${base}/webhooks/gmail`,
      formspree:    `${base}/webhooks/formspree`,
      test:         `${base}/webhooks/test`,
    };

    const connections = {
      stripe:       { connected: !!(process.env.STRIPE_SECRET_KEY), label: 'Stripe' },
      mailchimp:    { connected: !!(process.env.MAILCHIMP_API_KEY), label: 'Mailchimp' },
      meta:         { connected: !!(process.env.META_ACCESS_TOKEN), label: 'Meta Ads' },
      google:       { connected: !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), label: 'Google Sheets' },
      twilio:       { connected: !!(process.env.TWILIO_ACCOUNT_SID), label: 'Twilio SMS' },
      apify:        { connected: !!(process.env.APIFY_API_TOKEN), label: 'Apify (Scraping)' },
      calendly:     { connected: !!(process.env.CALENDLY_API_KEY), label: 'Calendly' },
      typeform:     { connected: !!(process.env.TYPEFORM_API_KEY), label: 'Typeform' },
    };

    res.json({ success: true, data: { settings, webhooks, connections, env: {
      coachName: process.env.COACH_NAME || settings.coach_name || 'Kash',
      businessName: process.env.BUSINESS_NAME || settings.business_name || 'Kash Performance Group',
      website: process.env.WEBSITE_URL || settings.website || '',
      baseUrl: base,
    }}});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return res.status(400).json({ success: false, error: 'settings object required' });

    const upsert = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')");
    for (const [key, value] of Object.entries(settings)) upsert.run(key, String(value));

    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/export-db
router.get('/export-db', (req, res) => {
  try {
    const db = getDB();
    const tables = ['clients','interactions','income','expenses','monthly_goals','pipeline','leads','tasks','content_calendar','content_analytics','automations_log'];
    const exported = {};
    for (const t of tables) {
      try { exported[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { exported[t] = []; }
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kpg-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(exported, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/clear-sample-data
router.post('/clear-sample-data', (req, res) => {
  try {
    const db = getDB();
    const tables = ['automations_log','webhooks_log','email_queue','tasks','leads','pipeline','expenses','income','interactions','clients'];
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare('DELETE FROM monthly_goals').run();
    res.json({ success: true, message: 'All sample data cleared. Database is empty and ready.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/webhooks-log
router.get('/webhooks-log', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM webhooks_log ORDER BY created_at DESC LIMIT 50').all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
