const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

router.post('/client-insight', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ success: false, error: 'ANTHROPIC_API_KEY not configured in .env' });
  }

  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ success: false, error: 'client_id required' });

    const db = getDB();

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const interactions = db.prepare(
      'SELECT * FROM interactions WHERE client_id = ? ORDER BY date DESC LIMIT 10'
    ).all(client_id);

    const incomeRow = db.prepare(
      "SELECT SUM(amount) as total FROM income WHERE client_id = ?"
    ).get(client_id);
    const totalClientRevenue = incomeRow?.total || client.total_paid || 0;

    const interactionText = interactions.length
      ? interactions.map(i => `- ${i.date} [${i.type}]: ${i.summary || '(no summary)'}`).join('\n')
      : '- No interactions recorded yet';

    const prompt = `You are a business advisor for Kash, a fitness coach at Kash Performance Group specializing in South Asian professionals.

Here is data about a client:
Name: ${client.name}
Status: ${client.status}
Program: ${client.program_type || 'Not set'}
Monthly value: $${client.monthly_value || 0}
Start date: ${client.start_date || 'Unknown'}
Total paid: $${Number(totalClientRevenue).toLocaleString()}
Source: ${client.source || 'Unknown'}
Notes: ${client.notes || 'None'}

Last 10 interactions:
${interactionText}

Based on this data provide:
1. A 2 sentence client health summary
2. Top 3 action items Kash should take with this client right now
3. Risk assessment: is this client at risk of churning? Why?
4. Upsell opportunity: is there a chance to upgrade their program?

Be specific, actionable and concise. Reference the actual client name and specific details.
Format your response as JSON with exactly these keys:
summary (string), action_items (array of 3 strings), churn_risk (object with: level (one of: low, medium, high), reason (string)), upsell_opportunity (string)`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[AI] Anthropic error:', anthropicRes.status, errText);
      return res.status(502).json({ success: false, error: `Anthropic API error ${anthropicRes.status}` });
    }

    const apiData = await anthropicRes.json();
    const text = apiData.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.json({ success: true, data: {
        summary: text,
        action_items: [],
        churn_risk: { level: 'unknown', reason: 'Could not parse structured response' },
        upsell_opportunity: '',
      }});
    }

    const insight = JSON.parse(jsonMatch[0]);
    res.json({ success: true, data: insight });
  } catch (err) {
    console.error('[AI] client-insight error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
