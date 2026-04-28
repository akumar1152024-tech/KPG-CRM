const { getDB } = require('../database');
const mailchimp = require('./mailchimp');

async function processQueue() {
  const db = getDB();
  const now = new Date().toISOString();

  const pending = db.prepare(`
    SELECT * FROM email_queue
    WHERE status='pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC LIMIT 20
  `).all(now);

  if (!pending.length) return { processed: 0 };

  let sent = 0, failed = 0;

  for (const item of pending) {
    try {
      const result = await mailchimp.sendEmail(item.recipient_email, item.subject, item.body_html);
      if (result.skipped) {
        // Mark as sent anyway when Mailchimp not configured (dev mode)
        db.prepare("UPDATE email_queue SET status='sent', sent_at=? WHERE id=?").run(new Date().toISOString(), item.id);
        sent++;
      } else if (result.success) {
        db.prepare("UPDATE email_queue SET status='sent', sent_at=? WHERE id=?").run(new Date().toISOString(), item.id);
        sent++;
      } else {
        db.prepare("UPDATE email_queue SET status='failed' WHERE id=?").run(item.id);
        failed++;
      }
    } catch (err) {
      console.error(`[EmailQueue] Failed to send item ${item.id}:`, err.message);
      db.prepare("UPDATE email_queue SET status='failed' WHERE id=?").run(item.id);
      failed++;
    }
  }

  console.log(`[EmailQueue] Processed ${pending.length}: ${sent} sent, ${failed} failed`);
  return { processed: pending.length, sent, failed };
}

module.exports = { processQueue };
