const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/automations/list
router.get('/list', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    const automations = [
      { id: 'onboardClient',    name: 'Onboard Client',       description: 'Activates a new client — sends welcome email, Mailchimp tag, creates tasks', triggers: ['Manual'], steps: ['Update status → active', 'Move pipeline → signed', 'Send welcome email', 'Add to Mailchimp (active-client)', 'Create 2 onboarding tasks', 'Log interaction'] },
      { id: 'followUpLead',     name: 'Follow Up Lead',        description: 'Re-engages a cold lead with a personal check-in email + Calendly link', triggers: ['Manual', 'Auto: 14d no contact'], steps: ['Send follow-up email', 'Update lead status → contacted', 'Create follow-up task'] },
      { id: 'sendProposal',     name: 'Send Proposal',         description: 'Sends pricing proposal email with Stripe payment link', triggers: ['Manual'], steps: ['Send proposal email', 'Move pipeline → proposal_sent', 'Create follow-up task'] },
      { id: 'reEngageChurned',  name: 'Re-engage Churned',     description: 'Reaches out to churned clients with a returning-client offer', triggers: ['Manual'], steps: ['Send re-engagement email', 'Update status → lead', 'Create pipeline entry', 'Create call task'] },
      { id: 'monthlyCheckIn',   name: 'Monthly Check-in',      description: 'Sends monthly feedback request + Calendly review link to active clients', triggers: ['Manual', 'Auto: Monthly'], steps: ['Send check-in email', 'Create feedback review task'] },
      { id: 'paymentFailed',    name: 'Payment Failed',        description: 'Handles failed Stripe payments — email + urgent task + Mailchimp tag', triggers: ['Stripe Webhook (failed)'], steps: ['Send payment failed email', 'Create urgent chase task', 'Tag "payment-issue" in Mailchimp'] },
      { id: 'endOfProgram',     name: 'End of Program',        description: 'Sends renewal offer email + creates pipeline entry for retention', triggers: ['Manual'], steps: ['Send renewal email', 'Create pipeline entry (proposal_sent)', 'Create renewal call task'] },
    ];

    const runCounts = {};
    for (const a of automations) {
      const row = db.prepare("SELECT COUNT(*) as c FROM automations_log WHERE automation_name=? AND run_at >= ?").get(a.id, monthStart);
      runCounts[a.id] = row.c;
    }

    const withCounts = automations.map(a => ({ ...a, timesRunThisMonth: runCounts[a.id] || 0 }));
    res.json({ success: true, data: withCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/automations/run
router.post('/run', async (req, res) => {
  try {
    const { automation, client_id } = req.body;
    if (!automation || !client_id) return res.status(400).json({ success: false, error: 'automation and client_id required' });

    const { runAutomation } = require('../services/automations');
    const steps = await runAutomation(automation, parseInt(client_id));
    res.json({ success: true, steps, message: `${automation} completed with ${steps.length} steps` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/automations/log
router.get('/log', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare(`
      SELECT al.*, c.name as client_name, c.avatar_initials
      FROM automations_log al LEFT JOIN clients c ON al.client_id = c.id
      ORDER BY al.run_at DESC LIMIT 50
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
