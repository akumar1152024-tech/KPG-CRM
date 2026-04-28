const { getDB } = require('../database');

async function triggerSequence(clientId, trigger) {
  const db = getDB();
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!client) { console.log(`[SeqEngine] Client ${clientId} not found`); return; }

    const sequence = db.prepare("SELECT * FROM email_sequences WHERE trigger=? AND status='active'").get(trigger);
    if (!sequence) { console.log(`[SeqEngine] No active sequence for trigger: ${trigger}`); return; }

    const steps = db.prepare('SELECT * FROM email_sequence_steps WHERE sequence_id=? ORDER BY step_number').all(sequence.id);
    if (!steps.length) return;

    const email = client.email;
    if (!email) { console.log(`[SeqEngine] Client ${clientId} has no email`); return; }

    const firstName = client.name.split(' ')[0];
    const calendlyUrl = process.env.CALENDLY_BOOKING_URL || '#';
    const stripeLink  = process.env.STRIPE_PAYMENT_LINK  || '#';
    const typeformUrl = process.env.TYPEFORM_FEEDBACK_URL || '#';

    for (const step of steps) {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + (step.delay_days || 0));

      const subject = step.subject
        .replace(/{{first_name}}/g, firstName)
        .replace(/{{name}}/g, client.name);

      const body = step.body_html
        .replace(/{{first_name}}/g, firstName)
        .replace(/{{name}}/g, client.name)
        .replace(/{{calendly_url}}/g, calendlyUrl)
        .replace(/{{stripe_link}}/g, stripeLink)
        .replace(/{{typeform_url}}/g, typeformUrl);

      db.prepare(`
        INSERT INTO email_queue (client_id, sequence_id, step_id, recipient_email, subject, body_html, status, scheduled_at)
        VALUES (?,?,?,?,?,?,'pending',?)
      `).run(clientId, sequence.id, step.id, email, subject, body, scheduledAt.toISOString());
    }

    console.log(`[SeqEngine] Queued ${steps.length} emails for client ${client.name} (trigger: ${trigger})`);
    return { queued: steps.length };
  } catch (err) {
    console.error('[SeqEngine] Error:', err.message);
  }
}

module.exports = { triggerSequence };
