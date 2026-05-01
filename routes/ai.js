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
  try {
    const db = getDB();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // ── DB queries ────────────────────────────────────────────────────────────────

    const clientStats = db.prepare(`
      SELECT
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status='trial'  THEN 1 ELSE 0 END) as trial
      FROM clients
    `).get();

    const revenue = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM income   WHERE month=? AND year=?').get(month, year);
    db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE month=? AND year=?').get(month, year);

    const goals       = db.prepare('SELECT revenue_goal FROM monthly_goals WHERE month=? AND year=?').get(month, year);
    const revenueGoal = goals?.revenue_goal || 0;

    const overdueCount    = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='pending' AND due_date < date('now')").get().c;
    const mostUrgentTask  = db.prepare("SELECT title FROM tasks WHERE status='pending' AND due_date < date('now') ORDER BY due_date ASC LIMIT 1").get();

    const leadsThisWeek = db.prepare("SELECT COUNT(*) as c FROM leads WHERE date_captured >= date('now','-7 days')").get().c;
    const topSource     = db.prepare(`
      SELECT source_platform, COUNT(*) as cnt FROM leads
      WHERE date_captured >= date('now','-7 days') AND source_platform IS NOT NULL
      GROUP BY source_platform ORDER BY cnt DESC LIMIT 1
    `).get();

    const followUps = db.prepare(`
      SELECT c.name FROM clients c
      LEFT JOIN interactions i ON c.id = i.client_id
      WHERE c.status IN ('active','trial')
      GROUP BY c.id
      HAVING MAX(i.date) IS NULL OR MAX(i.date) < date('now','-14 days')
      LIMIT 5
    `).all();

    const trialClients = db.prepare("SELECT name FROM clients WHERE status='trial' LIMIT 3").all();

    const pipeTotal          = db.prepare("SELECT COUNT(*) as c FROM pipeline WHERE stage NOT IN ('signed','lost')").get().c;
    const proposalProspects  = db.prepare("SELECT name FROM pipeline WHERE stage='proposal_sent' LIMIT 5").all();

    const highChurnClient = db.prepare(`
      SELECT c.name FROM clients c
      LEFT JOIN interactions i ON c.id = i.client_id
      WHERE c.status IN ('active','trial')
      GROUP BY c.id
      HAVING MAX(i.date) IS NULL OR MAX(i.date) < date('now','-30 days')
      LIMIT 1
    `).get();

    // ── Build sections ────────────────────────────────────────────────────────────

    const revMade = revenue.t || 0;
    const revPct  = revenueGoal > 0 ? Math.round((revMade / revenueGoal) * 100) : 0;
    const revNeed = Math.max(0, revenueGoal - revMade);

    const revenueSection = revenueGoal > 0
      ? `REVENUE: $${revMade.toLocaleString()} made this month, ${revPct}% of your $${revenueGoal.toLocaleString()} goal. Need $${revNeed.toLocaleString()} more to hit target.`
      : `REVENUE: $${revMade.toLocaleString()} made this month. No revenue goal set.`;

    let clientSection = `CLIENTS: ${clientStats.active || 0} active client${clientStats.active !== 1 ? 's' : ''}.`;
    if (followUps.length) {
      const names = followUps.map(c => c.name).join(', ');
      clientSection += ` ${names} need${followUps.length === 1 ? 's' : ''} follow-up today — no contact in 14+ days.`;
    }
    if (trialClients.length) {
      const names = trialClients.map(c => c.name).join(', ');
      clientSection += ` ${names} ${trialClients.length === 1 ? 'is' : 'are'} on trial and need${trialClients.length === 1 ? 's' : ''} a conversion conversation.`;
    }

    let pipelineSection = `PIPELINE: ${pipeTotal} prospect${pipeTotal !== 1 ? 's' : ''} total.`;
    if (proposalProspects.length) {
      pipelineSection += ` ${proposalProspects.length} at proposal stage — follow up today.`;
    }

    let tasksSection = `TASKS: ${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}.`;
    if (overdueCount > 0 && mostUrgentTask) {
      tasksSection += ` Most urgent: ${mostUrgentTask.title}.`;
    }

    let leadsSection = `LEADS: ${leadsThisWeek} new lead${leadsThisWeek !== 1 ? 's' : ''} this week.`;
    if (topSource) {
      leadsSection += ` Top source: ${topSource.source_platform}.`;
    }

    let topPriority;
    if (highChurnClient) {
      topPriority = `Reach out to ${highChurnClient.name} immediately — they are at high risk of churning.`;
    } else if (proposalProspects.length > 0) {
      topPriority = `Follow up with ${proposalProspects[0].name} on their proposal — your most actionable revenue opportunity today.`;
    } else if (trialClients.length > 0) {
      topPriority = `Have a conversion conversation with ${trialClients[0].name} — move them from trial to a paid plan.`;
    } else if (revenueGoal > 0 && revPct < 50) {
      topPriority = `Revenue is at ${revPct}% of goal. Focus on closing new business or upselling existing clients today.`;
    } else {
      topPriority = `You are on track. Keep delivering excellent results for your clients and have a great day.`;
    }

    // ── Assemble response ────────────────────────────────────────────────────────

    res.json({
      success: true,
      data: {
        greeting:      `Good morning Kash. Here is your business snapshot for ${dateStr}.`,
        summary:       `${revenueSection}\n\n${clientSection}`,
        focus_today:   [tasksSection, leadsSection, pipelineSection],
        pipeline_note: pipelineSection,
        motivation:    `TOP PRIORITY TODAY: ${topPriority}`,
      },
    });
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
