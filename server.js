require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const session = require('express-session');
const { initDB, getDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware (before static + routes)
app.use(session({
  secret: process.env.SESSION_SECRET || 'kpg-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
}));

// ── Auth routes (no protection needed) ───────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.authed) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const password = process.env.LOGIN_PASSWORD;
  if (!password) {
    // No password set — allow through
    req.session.authed = true;
    return res.redirect('/');
  }
  if (req.body.password === password) {
    req.session.authed = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── Auth guard ────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!process.env.LOGIN_PASSWORD) return next(); // dev mode: no password set
  if (req.session.authed) return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.redirect('/login');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(requireAuth);

// API Routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/meta', require('./routes/meta'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/content', require('./routes/content'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/settings', require('./routes/settings'));

// Webhook Routes (no /api/ prefix)
app.use('/webhooks', require('./routes/webhooks'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── CRON JOBS ────────────────────────────────────────────────────────────────

function setupCron() {
  // Every hour: process email queue
  cron.schedule('0 * * * *', async () => {
    console.log('[cron] Processing email queue...');
    try {
      const { processQueue } = require('./services/email-queue');
      await processQueue();
    } catch (e) { console.error('[cron] Email queue error:', e.message); }
  });

  // Every day at 6am: scrape social, auto follow-up tasks, sheets sync
  cron.schedule('0 6 * * *', async () => {
    console.log('[cron] Daily 6am jobs...');
    try {
      const db = getDB();
      const now = new Date();
      const fourteenAgo = new Date(now); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
      const cutoff = fourteenAgo.toISOString().split('T')[0];

      const needsFollowUp = db.prepare(`
        SELECT c.id, c.name FROM clients c
        LEFT JOIN interactions i ON c.id = i.client_id
        WHERE c.status IN ('active','trial')
        GROUP BY c.id
        HAVING MAX(i.date) IS NULL OR MAX(i.date) < ?
      `).all(cutoff);

      for (const client of needsFollowUp) {
        const existing = db.prepare(`
          SELECT id FROM tasks WHERE related_client_id=? AND status='pending' AND title LIKE '%follow%'
        `).get(client.id);
        if (!existing) {
          const due = new Date(now); due.setDate(due.getDate() + 1);
          db.prepare(`INSERT INTO tasks (title, category, related_client_id, due_date, priority) VALUES (?,?,?,?,?)`)
            .run(`Follow up with ${client.name} (14 days no contact)`, 'client follow-up', client.id, due.toISOString().split('T')[0], 'high');
          console.log(`[cron] Created follow-up task for ${client.name}`);
        }
      }
    } catch (e) { console.error('[cron] Follow-up task error:', e.message); }

    // Apify scrape if token exists
    if (process.env.APIFY_API_TOKEN) {
      try {
        const { scrapeAll } = require('./services/content-scraper');
        await scrapeAll();
      } catch (e) { console.error('[cron] Scrape error:', e.message); }
    }
  });

  // Every day at midnight: Google Sheets sync
  cron.schedule('0 0 * * *', async () => {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return;
    console.log('[cron] Google Sheets sync...');
    try {
      const sheets = require('./services/google-sheets');
      await sheets.syncClients();
      await sheets.syncFinance();
      await sheets.syncLeads();
    } catch (e) { console.error('[cron] Sheets sync error:', e.message); }
  });

  // Every day at 8am: task reminder emails
  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Task reminders...');
    try {
      const db = getDB();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const dueTomorrow = db.prepare(`
        SELECT t.*, c.name as client_name, c.email as client_email
        FROM tasks t LEFT JOIN clients c ON t.related_client_id = c.id
        WHERE t.due_date = ? AND t.status = 'pending'
      `).all(tomorrowStr);

      if (dueTomorrow.length > 0) {
        console.log(`[cron] ${dueTomorrow.length} tasks due tomorrow`);
      }
    } catch (e) { console.error('[cron] Task reminder error:', e.message); }
  });

  console.log('Cron jobs scheduled.');
}

// ─── START ────────────────────────────────────────────────────────────────────

initDB();
setupCron();

app.listen(PORT, () => {
  const base = process.env.BASE_URL || `http://localhost:${PORT}`;
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║     KPG Coaching Dashboard is running!           ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Dashboard:  ${base.padEnd(36)}║`);
  console.log(`║  Webhooks:   ${(base + '/webhooks/test').padEnd(36)}║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});
