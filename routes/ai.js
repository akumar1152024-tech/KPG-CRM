const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// ── Shared helper ─────────────────────────────────────────────────────────────

async function callClaude(apiKey, prompt, maxTokens = 1024) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON block in response');
  return JSON.parse(m[0]);
}

function requireKey(res) {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) { res.status(503).json({ success: false, error: 'ANTHROPIC_API_KEY not configured in .env' }); return null; }
  return k;
}

// ── POST /api/ai/client-insight ───────────────────────────────────────────────

router.post('/client-insight', async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ success: false, error: 'client_id required' });

    const db = getDB();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const interactions = db.prepare(
      'SELECT * FROM interactions WHERE client_id = ? ORDER BY date DESC LIMIT 10'
    ).all(client_id);

    const incomeRow = db.prepare('SELECT SUM(amount) as total FROM income WHERE client_id = ?').get(client_id);
    const totalPaid = incomeRow?.total || client.total_paid || 0;

    const now = Date.now();
    const startDate = client.start_date ? new Date(client.start_date) : null;
    const clientDays = startDate ? Math.floor((now - startDate) / 86400000) : null;

    const lastInt = interactions[0];
    const lastIntDate = lastInt ? new Date(lastInt.date) : null;
    const daysSinceContact = lastIntDate ? Math.floor((now - lastIntDate) / 86400000) : null;

    // ── Churn risk ──────────────────────────────────────────────────────────────

    const badKeywords = /missed|cancel|pause|quit|stop/i;
    let churnLevel, churnReason;

    if (
      client.status === 'paused' ||
      daysSinceContact === null || daysSinceContact >= 30 ||
      (lastInt?.summary && badKeywords.test(lastInt.summary))
    ) {
      churnLevel = 'high';
      if (client.status === 'paused')
        churnReason = 'Client is currently paused.';
      else if (daysSinceContact === null || daysSinceContact >= 30)
        churnReason = `No contact for ${daysSinceContact ?? 'an unknown number of'} days — high risk of disengagement.`;
      else
        churnReason = 'Last interaction flagged a concern (missed, cancel, pause, quit, or stop).';
    } else if (daysSinceContact >= 14 || interactions.length <= 1) {
      churnLevel = 'medium';
      churnReason = interactions.length <= 1
        ? 'Only 1 interaction on record — relationship is still very early.'
        : `No contact for ${daysSinceContact} days — follow-up recommended.`;
    } else if (daysSinceContact <= 7 && interactions.length > 3) {
      churnLevel = 'low';
      churnReason = `Regular contact (last ${daysSinceContact}d ago) with ${interactions.length} interactions logged.`;
    } else {
      churnLevel = 'medium';
      churnReason = 'Moderate engagement — monitor closely.';
    }

    // ── Summary ─────────────────────────────────────────────────────────────────

    const clientDaysStr = clientDays !== null ? `${clientDays} days` : 'an unknown period';
    const program = client.program_type || 'their program';
    const monthly = client.monthly_value ? `$${client.monthly_value}/mo` : 'an unspecified amount';
    const lastContactStr = daysSinceContact !== null
      ? `${daysSinceContact} days ago via ${lastInt.type}`
      : 'never recorded';
    const summary = `${client.name} has been a client for ${clientDaysStr}. They are on ${program} paying ${monthly}. Last contact was ${lastContactStr}.`;

    // ── Action items ─────────────────────────────────────────────────────────────

    const actions = [];
    if (daysSinceContact === null || daysSinceContact >= 14)
      actions.push(`Send a check-in message to ${client.name}`);
    if (client.status === 'trial')
      actions.push(`Follow up on ${client.name}'s trial conversion`);
    if (client.monthly_value && totalPaid > client.monthly_value * 3)
      actions.push(`Ask ${client.name} for a testimonial`);
    if (/instagram|tiktok/i.test(client.source || ''))
      actions.push(`Ask ${client.name} to share their progress on social media`);
    if (churnLevel === 'high')
      actions.push(`Urgent outreach needed for ${client.name}`);
    if (client.monthly_value && client.monthly_value < 500)
      actions.push(`Explore an upsell opportunity with ${client.name}`);

    const action_items = actions.slice(0, 3);

    // ── Upsell opportunity ───────────────────────────────────────────────────────

    let upsell_opportunity;
    const prog = (client.program_type || '').toLowerCase();

    if (client.status === 'churned') {
      upsell_opportunity = 'Offer a re-engagement discount or a free check-in session to win them back.';
    } else if (prog.includes('group')) {
      upsell_opportunity = 'On a group program — offer an upgrade to 1:1 coaching for personalised results.';
    } else if (prog.includes('1:1') || prog.includes('1-1') || prog.includes('one')) {
      if (clientDays !== null && clientDays < 90)
        upsell_opportunity = 'Too early to upsell — focus on delivering results and building rapport first.';
      else if (churnLevel === 'low')
        upsell_opportunity = 'Long-term engaged 1:1 client — offer a prepay discount for 3–6 months to lock in commitment.';
      else
        upsell_opportunity = 'Consider discussing a prepay option once engagement improves.';
    } else {
      upsell_opportunity = 'Assess their goals and current results before suggesting a program change.';
    }

    res.json({ success: true, data: { summary, action_items, churn_risk: { level: churnLevel, reason: churnReason }, upsell_opportunity } });
  } catch (err) {
    console.error('[AI] client-insight error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ai/daily-briefing ───────────────────────────────────────────────

router.post('/daily-briefing', async (req, res) => {
  const apiKey = requireKey(res); if (!apiKey) return;
  try {
    const db = getDB();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Client counts
    const clients = db.prepare(`
      SELECT
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status='trial'  THEN 1 ELSE 0 END) as trial,
        SUM(CASE WHEN status='active' THEN monthly_value ELSE 0 END) as mrr
      FROM clients
    `).get();

    // Finance this month
    const revenue  = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM income   WHERE month=? AND year=?").get(month, year);
    const expenses = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE month=? AND year=?").get(month, year);

    // Tasks
    const overdue   = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='pending' AND due_date < date('now')").get();
    const todayTasks = db.prepare("SELECT title FROM tasks WHERE status='pending' AND due_date = date('now') LIMIT 5").all();

    // Clients needing follow-up
    const followUps = db.prepare(`
      SELECT c.name FROM clients c
      LEFT JOIN interactions i ON c.id = i.client_id
      WHERE c.status IN ('active','trial')
      GROUP BY c.id
      HAVING MAX(i.date) IS NULL OR MAX(i.date) < date('now','-14 days')
      LIMIT 5
    `).all();

    // Pipeline
    const pipe = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(potential_value),0) as val FROM pipeline
      WHERE stage NOT IN ('signed','lost')
    `).get();
    const stuckPipe = db.prepare(`
      SELECT COUNT(*) as cnt FROM pipeline
      WHERE stage NOT IN ('signed','lost')
        AND created_at < datetime('now','-14 days')
    `).get();

    // Recent interactions
    const recentInts = db.prepare(`
      SELECT i.date, i.type, i.summary, c.name as client_name
      FROM interactions i JOIN clients c ON i.client_id = c.id
      WHERE i.date >= date('now','-3 days')
      ORDER BY i.date DESC LIMIT 5
    `).all();

    const todayStr  = todayTasks.length ? todayTasks.map(t => `- ${t.title}`).join('\n') : '- None';
    const followStr = followUps.length  ? followUps.map(c => `- ${c.name}`).join('\n') : '- None';
    const recentStr = recentInts.length ? recentInts.map(i => `- ${i.date} [${i.type}] ${i.client_name}: ${i.summary||''}`).join('\n') : '- None';

    const prompt = `You are a daily business assistant for Kash, a fitness coach at Kash Performance Group specializing in South Asian professionals.

Today: ${dateStr}

Business snapshot:
- Active clients: ${clients.active} | Trial: ${clients.trial} | MRR: $${(clients.mrr||0).toLocaleString()}
- Revenue this month: $${(revenue.t||0).toLocaleString()} | Expenses: $${(expenses.t||0).toLocaleString()} | Net: $${((revenue.t||0)-(expenses.t||0)).toLocaleString()}
- Overdue tasks: ${overdue.c} | Tasks due today: ${todayTasks.length}

Tasks due today:
${todayStr}

Clients needing follow-up (14+ days no contact):
${followStr}

Active pipeline: ${pipe.cnt} prospects worth $${(pipe.val||0).toLocaleString()} | Stuck >14 days: ${stuckPipe.cnt}

Recent interactions (last 3 days):
${recentStr}

Write a concise, energising morning briefing for Kash.
Format as JSON with exactly these keys:
- greeting (string): warm personalised good morning with the day and date
- summary (string): 2-sentence business pulse combining client health and revenue
- focus_today (array of exactly 3 strings): top priorities ranked by urgency — be specific, name actual clients or tasks where possible
- pipeline_note (string): 1 sentence on pipeline health and what needs attention
- motivation (string): 1 closing line specific to coaching South Asian professionals`;

    const text = await callClaude(apiKey, prompt, 800);
    res.json({ success: true, data: parseJSON(text) });
  } catch (err) {
    console.error('[AI] daily-briefing error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/ai/pipeline-advice ──────────────────────────────────────────────

router.post('/pipeline-advice', async (req, res) => {
  const apiKey = requireKey(res); if (!apiKey) return;
  try {
    const { prospect_id } = req.body;
    if (!prospect_id) return res.status(400).json({ success: false, error: 'prospect_id required' });

    const db = getDB();
    const p = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(prospect_id);
    if (!p) return res.status(404).json({ success: false, error: 'Prospect not found' });

    const days = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
    const STAGE_LABELS = {
      new_lead: 'New Lead', typeform_submitted: 'Typeform Submitted',
      calendly_booked: 'Calendly Booked', proposal_sent: 'Proposal Sent',
      signed: 'Signed', lost: 'Lost',
    };

    const prompt = `You are a sales coach for Kash at Kash Performance Group, a premium fitness coaching business for South Asian professionals (doctors, engineers, lawyers, finance professionals).

Prospect details:
Name: ${p.name}
Stage: ${STAGE_LABELS[p.stage] || p.stage}
Days in pipeline: ${days}
Source: ${p.source || 'Unknown'}
Potential value: $${p.potential_value || 0}/month
Email: ${p.email || 'Unknown'}
Notes: ${p.notes || 'None'}

Kash's context: He coaches high-achieving South Asian professionals on fitness, nutrition, and lifestyle. USP: understands their culture, work pressures, and family dynamics. Typical program: 1:1 coaching at $400-800/month. Common objections: "too busy", "need to think about it", "is it worth the cost?", "my family won't support it". Discovery calls are 45 min on Zoom. Next steps usually involve: sending a Calendly link, following up after a no-show, nudging after a proposal, or re-engaging cold leads.

Give Kash clear, confident, culturally-aware advice.
Format as JSON with exactly these keys:
- best_next_step (string): the single most important action Kash should take TODAY — be very specific
- likely_objections (array of exactly 3 strings): the most realistic objections this prospect will raise, based on their stage and background
- suggested_message (string): the actual WhatsApp or SMS message Kash should send RIGHT NOW — conversational, warm, non-pushy, 3-5 sentences max, ready to copy-paste`;

    const text = await callClaude(apiKey, prompt, 800);
    res.json({ success: true, data: parseJSON(text) });
  } catch (err) {
    console.error('[AI] pipeline-advice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
