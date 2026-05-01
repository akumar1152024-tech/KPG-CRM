const express = require('express');
const router = express.Router();
const { getDB } = require('../database');


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
  try {
    const { prospect_id } = req.body;
    if (!prospect_id) return res.status(400).json({ success: false, error: 'prospect_id required' });

    const db = getDB();
    const p = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(prospect_id);
    if (!p) return res.status(404).json({ success: false, error: 'Prospect not found' });

    const calendly = process.env.CALENDLY_BOOKING_URL || '[CALENDLY_BOOKING_URL]';
    const firstName = p.name.split(' ')[0];

    // ── Next step by stage ────────────────────────────────────────────────────────

    const NEXT_STEP = {
      new_lead:           'Send intro message and qualify with 3 questions: What is your goal? What have you tried before? What is your timeline?',
      typeform_submitted: 'Review their answers and book a discovery call. Send your Calendly link with a personalised message referencing their form answers.',
      calendly_booked:    'Prepare for the call. Review their Typeform answers. Lead with their specific goal. Have pricing ready.',
      proposal_sent:      'Follow up in 48 hours if no response. Address the most common objection: price. Offer a payment plan option.',
      lost:               'Wait 30 days then re-engage with a new angle or special offer.',
    };

    const best_next_step = NEXT_STEP[p.stage] || 'Review the prospect\'s details and decide the most appropriate next contact.';

    // ── Likely objections by source ───────────────────────────────────────────────

    const OBJECTIONS = {
      Meta_Ad:   ['Price — they are comparison shopping. Focus on your unique results and ROI.', 'Skeptical about ads — share real client stories.', 'Timing — they filled the form impulsively. Create urgency.'],
      Instagram: ['Not sure if coaching is right for them. Share a relevant client transformation.', 'Price — justify the investment with outcome data.', 'Too busy — show them how you work around packed schedules.'],
      TikTok:    ['Skeptical about online coaching. Show proof — screenshots, testimonials.', 'Think it\'s a trend, not a real service. Emphasise your track record.', 'Price sensitivity — they may expect a low-cost product.'],
      Referral:  ['Timing — they are interested but busy. Create urgency with limited spots.', 'Comparing you to what their friend paid. Be consistent on pricing.', 'High expectations from the referral — clarify what you deliver.'],
      Typeform:  ['Already interested — move fast. Book the call within 24 hours.', 'May ghost if you wait — follow up the same day.', 'Over-thinking it — make the next step easy and low commitment.'],
    };

    const likely_objections = OBJECTIONS[p.source] || [
      'Price and timing are the most common objections. Be ready for both.',
      'They may need more social proof — share a relevant transformation.',
      'Uncertainty about results — have specific outcome examples ready.',
    ];

    // ── Suggested message by stage ────────────────────────────────────────────────

    const MESSAGES = {
      new_lead:           `Hey ${firstName}! Saw you reached out — I help South Asian professionals get in the best shape of their lives around busy schedules. Quick question — what is your main goal right now?`,
      typeform_submitted: `Hey ${firstName}, just reviewed your application — love your goals. I think we can get you there. Here is my calendar to chat: ${calendly}`,
      calendly_booked:    `Hey ${firstName}, looking forward to our call! Just to make the most of our time — what is the #1 thing you want to walk away knowing from our conversation?`,
      proposal_sent:      `Hey ${firstName}, just checking in on the proposal I sent over. Any questions I can answer? Happy to jump on a quick call or work out a payment plan if that helps.`,
    };

    const suggested_message = MESSAGES[p.stage] || `Hey ${firstName}, just wanted to check in and see where your head is at. Let me know if you have any questions — happy to help.`;

    res.json({ success: true, data: { best_next_step, likely_objections, suggested_message } });
  } catch (err) {
    console.error('[AI] pipeline-advice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
