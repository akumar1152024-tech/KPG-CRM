const { getDB } = require('../database');
const mailchimp = require('./mailchimp');

const CALENDLY_URL = () => process.env.CALENDLY_BOOKING_URL || '#';
const STRIPE_LINK  = () => process.env.STRIPE_PAYMENT_LINK  || '#';
const TYPEFORM_URL = () => process.env.TYPEFORM_FEEDBACK_URL || '#';

function firstName(name) { return (name || '').split(' ')[0]; }

function logAutomation(db, name, clientId, steps, status = 'success') {
  db.prepare("INSERT INTO automations_log (automation_name, client_id, steps_completed, status) VALUES (?,?,?,?)")
    .run(name, clientId, JSON.stringify(steps), status);
}

function logInteraction(db, clientId, type, summary) {
  db.prepare("INSERT INTO interactions (client_id, type, summary, date) VALUES (?,?,?,date('now'))").run(clientId, type, summary);
}

function createTask(db, title, clientId, priority, daysFromNow, category = 'client follow-up') {
  const due = new Date(); due.setDate(due.getDate() + daysFromNow);
  db.prepare("INSERT INTO tasks (title, category, related_client_id, due_date, priority) VALUES (?,?,?,?,?)")
    .run(title, category, clientId, due.toISOString().split('T')[0], priority);
}

function emailHtml(preview, body) {
  return `<div style="font-family:Inter,sans-serif;max-width:600px;margin:auto;padding:32px;color:#212529">
    <div style="background:#0F6E56;padding:16px 24px;border-radius:8px 8px 0 0">
      <h1 style="color:white;margin:0;font-size:20px">Kash Performance Group</h1>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e9ecef;border-radius:0 0 8px 8px">
      ${body}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e9ecef"/>
      <p style="color:#6c757d;font-size:13px;margin:0">
        Kash Performance Group &bull; <a href="${process.env.WEBSITE_URL||'#'}" style="color:#0F6E56">${process.env.WEBSITE_URL||'kash-performance-group.com'}</a>
      </p>
    </div>
  </div>`;
}

async function runAutomation(automationName, clientId) {
  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const fn = firstName(client.name);
  const steps = [];

  try {
    switch (automationName) {

      case 'onboardClient': {
        // 1. Status → active
        db.prepare("UPDATE clients SET status='active', start_date=COALESCE(start_date, date('now')), updated_at=datetime('now') WHERE id=?").run(clientId);
        steps.push('Status updated → active');

        // 2. Pipeline → signed
        if (client.email) db.prepare("UPDATE pipeline SET stage='signed', updated_at=datetime('now') WHERE email=?").run(client.email);
        steps.push('Pipeline moved → signed');

        // 3. Welcome email
        const welcomeBody = emailHtml('Welcome!', `
          <p>Hi ${fn},</p>
          <p>Welcome to <strong>Kash Performance Group</strong>! I'm beyond excited to work with you on your health and fitness journey.</p>
          <p><strong>Here's what to expect this week:</strong></p>
          <ul>
            <li>📋 Your personalised training plan will arrive within 24 hours</li>
            <li>🥗 We'll review your nutrition together on our first call</li>
            <li>📱 Join the WhatsApp coaching group for daily check-ins</li>
          </ul>
          <p><strong>Action needed:</strong> Please book your onboarding call using the link below so we can hit the ground running.</p>
          <p><a href="${CALENDLY_URL()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Book Onboarding Call →</a></p>
          <p>Your Trainerize login will be sent separately. If you have any questions, just reply to this email.</p>
          <p>Let's go, ${fn}! 💪<br><strong>Kash</strong></p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Welcome to Kash Performance Group, ${fn}!`, welcomeBody);
        steps.push(emailResult.skipped ? 'Welcome email (logged — Mailchimp not configured)' : 'Welcome email sent');

        // 4. Mailchimp tag
        const mcResult = await mailchimp.addToAudience(client.email, client.name, ['active-client']);
        steps.push(mcResult.skipped ? 'Mailchimp (not configured — skipped)' : 'Added to Mailchimp (active-client)');

        // 5. Tasks
        createTask(db, `Send welcome pack to ${client.name}`, clientId, 'urgent', 0);
        createTask(db, `Schedule first check-in with ${client.name}`, clientId, 'high', 2);
        steps.push('2 onboarding tasks created');

        // 6. Log
        logInteraction(db, clientId, 'note', `Onboard Client automation run. ${steps.length} steps completed.`);
        break;
      }

      case 'followUpLead': {
        const followBody = emailHtml('Still thinking?', `
          <p>Hey ${fn},</p>
          <p>I've been thinking about you and wanted to personally check in. How are your fitness goals going?</p>
          <p>I know life gets hectic — especially for professionals managing work, family, and health all at once. That's exactly why I built a coaching program specifically for South Asian professionals like you.</p>
          <p><strong>Here's what clients typically see in 12 weeks:</strong></p>
          <ul>
            <li>✅ 8–15lbs of sustainable fat loss</li>
            <li>✅ More energy throughout the day</li>
            <li>✅ A clear plan that fits your culture and schedule</li>
          </ul>
          <p>If you're still thinking about it, let's just have a quick chat. No pressure, no pitch — just a conversation about your goals.</p>
          <p><a href="${CALENDLY_URL()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Book a Free Call →</a></p>
          <p>Talk soon,<br><strong>Kash</strong></p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Hey ${fn}, still thinking about your goals?`, followBody);
        steps.push(emailResult.skipped ? 'Follow-up email (logged — Mailchimp not configured)' : 'Follow-up email sent');

        // Update lead status
        if (client.email) db.prepare("UPDATE leads SET status='contacted' WHERE email=? AND status='new'").run(client.email);
        steps.push('Lead status updated → contacted');

        createTask(db, `Check if ${client.name} replied to follow-up`, clientId, 'high', 2);
        steps.push('Follow-up task created (due 2 days)');

        logInteraction(db, clientId, 'email', `Follow Up Lead automation run. Follow-up email sent.`);
        break;
      }

      case 'sendProposal': {
        const proposalBody = emailHtml('Your personalised plan', `
          <p>Hi ${fn},</p>
          <p>Based on our conversation, I've put together a personalised coaching plan for you. Here's what I recommend:</p>
          <h3 style="color:#0F6E56">Option 1: 1:1 Coaching — $800/month</h3>
          <ul>
            <li>Weekly 1:1 video calls</li>
            <li>Custom training + nutrition plan</li>
            <li>Daily WhatsApp check-ins</li>
            <li>Full access to the coaching app (Trainerize)</li>
          </ul>
          <h3 style="color:#0F6E56">Option 2: Group Coaching — $400/month</h3>
          <ul>
            <li>Bi-weekly group calls</li>
            <li>Shared training program</li>
            <li>Group WhatsApp community</li>
          </ul>
          <p><strong>Spots are limited.</strong> I only take on 5 new 1:1 clients per month to maintain quality.</p>
          <p><a href="${STRIPE_LINK()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Secure Your Spot →</a></p>
          <p>Any questions? Just reply to this email.</p>
          <p>Kash</p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Your personalised coaching plan, ${fn}`, proposalBody);
        steps.push(emailResult.skipped ? 'Proposal email (logged — Mailchimp not configured)' : 'Proposal email sent');

        if (client.email) db.prepare("UPDATE pipeline SET stage='proposal_sent', updated_at=datetime('now') WHERE email=?").run(client.email);
        steps.push('Pipeline moved → proposal_sent');

        createTask(db, `Follow up proposal with ${client.name}`, clientId, 'high', 2, 'sales');
        steps.push('Proposal follow-up task created (due 2 days)');

        logInteraction(db, clientId, 'email', `Send Proposal automation run. Proposal email sent.`);
        break;
      }

      case 'reEngageChurned': {
        const reEngageBody = emailHtml('Checking in on you', `
          <p>Hey ${fn},</p>
          <p>It's Kash here. I know it's been a while and I just wanted to check in on how you're doing.</p>
          <p>A lot has changed in the program since we last worked together — we now have a South Asian-specific nutrition framework, a new community of professionals just like you, and more flexible scheduling.</p>
          <p><strong>Returning client offer:</strong> If you'd like to give it another go, I'm offering a <strong>free re-assessment call</strong> to see where you're at and what would work best for you now.</p>
          <p><a href="${CALENDLY_URL()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Book Free Re-assessment →</a></p>
          <p>No pressure at all — just wanted to reach out personally.</p>
          <p>Kash</p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Kash here — checking in on you, ${fn}`, reEngageBody);
        steps.push(emailResult.skipped ? 'Re-engagement email (logged — Mailchimp not configured)' : 'Re-engagement email sent');

        db.prepare("UPDATE clients SET status='lead', updated_at=datetime('now') WHERE id=?").run(clientId);
        steps.push('Client status updated → lead');

        const existing = client.email ? db.prepare("SELECT id FROM pipeline WHERE email=?").get(client.email) : null;
        if (!existing) {
          db.prepare("INSERT INTO pipeline (name, email, source, stage, notes) VALUES (?,?,'Re-engagement','new_lead','Re-engaged via automation')").run(client.name, client.email);
          steps.push('New pipeline entry created');
        }

        createTask(db, `Call ${client.name} re: returning client offer`, clientId, 'high', 3, 'sales');
        steps.push('Re-engagement call task created (due 3 days)');

        logInteraction(db, clientId, 'email', 'Re-engage Churned automation run. Re-engagement email sent.');
        break;
      }

      case 'monthlyCheckIn': {
        const checkInBody = emailHtml('Monthly check-in', `
          <p>Hi ${fn},</p>
          <p>It's your monthly check-in from Kash! First — I want to acknowledge how far you've come. Consistency like yours is rare and you should be proud.</p>
          <p>To make sure we're always moving in the right direction, I'd love 3 minutes of your time to complete this quick feedback form:</p>
          <p><a href="${TYPEFORM_URL()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Complete Monthly Feedback →</a></p>
          <p>Once you've done that, let's book your monthly review call:</p>
          <p><a href="${CALENDLY_URL()}" style="color:#0F6E56;text-decoration:none">📅 Book Monthly Review Call →</a></p>
          <p>Keep going,<br><strong>Kash</strong></p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Checking in on you, ${fn}`, checkInBody);
        steps.push(emailResult.skipped ? 'Check-in email (logged — Mailchimp not configured)' : 'Monthly check-in email sent');

        createTask(db, `Review ${client.name} monthly feedback form`, clientId, 'medium', 5);
        steps.push('Feedback review task created (due 5 days)');

        logInteraction(db, clientId, 'email', 'Monthly Check-in automation run. Check-in email sent.');
        break;
      }

      case 'paymentFailed': {
        const paymentBody = emailHtml('Payment issue', `
          <p>Hi ${fn},</p>
          <p>I just wanted to give you a quick heads up — it looks like there was an issue with your most recent payment.</p>
          <p>Don't worry, these things happen! Your spot in the program is still held for the next 48 hours.</p>
          <p><a href="${STRIPE_LINK()}" style="background:#E24B4A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Retry Payment →</a></p>
          <p>If you're having any issues, just reply to this email and we'll sort it out together.</p>
          <p>Kash</p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Action needed — payment issue, ${fn}`, paymentBody);
        steps.push(emailResult.skipped ? 'Payment failed email (logged — Mailchimp not configured)' : 'Payment failed email sent');

        createTask(db, `Chase payment from ${client.name}`, clientId, 'urgent', 1, 'admin');
        steps.push('Urgent payment chase task created (due tomorrow)');

        const mcResult = await mailchimp.tagContact(client.email, ['payment-issue']);
        steps.push(mcResult.skipped ? 'Mailchimp tag (not configured)' : 'Tagged "payment-issue" in Mailchimp');

        logInteraction(db, clientId, 'note', 'Payment Failed automation run. Payment follow-up email sent.');
        break;
      }

      case 'endOfProgram': {
        const renewalBody = emailHtml('Your transformation continues', `
          <p>Hi ${fn},</p>
          <p>I can't believe how far you've come! The progress you've made over this program is something you should be genuinely proud of.</p>
          <p><strong>Your results speak for themselves</strong> — and the best part? This is just the beginning.</p>
          <p>I'd love to continue working together and help you maintain and build on everything you've achieved. Here are your renewal options:</p>
          <h3 style="color:#0F6E56">Continuation packages:</h3>
          <ul>
            <li>1:1 Coaching — <strong>$800/month</strong> (you've already seen what this does)</li>
            <li>Maintenance Group — <strong>$200/month</strong> (community + monthly check-ins)</li>
          </ul>
          <p><a href="${STRIPE_LINK()}" style="background:#0F6E56;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:8px 0">Renew Your Program →</a></p>
          <p>Or if you'd like to chat first:<br><a href="${CALENDLY_URL()}" style="color:#0F6E56">📅 Book Renewal Call →</a></p>
          <p>Whatever you decide, I'm proud of you.<br><strong>Kash</strong></p>
        `);
        const emailResult = await mailchimp.sendEmail(client.email, `Your transformation continues, ${fn}`, renewalBody);
        steps.push(emailResult.skipped ? 'Renewal email (logged — Mailchimp not configured)' : 'Renewal email sent');

        const existing = client.email ? db.prepare("SELECT id FROM pipeline WHERE email=?").get(client.email) : null;
        if (!existing) {
          db.prepare("INSERT INTO pipeline (name, email, source, stage, potential_value, notes) VALUES (?,?,'Renewal','proposal_sent',800,'End of program — renewal in progress')").run(client.name, client.email);
          steps.push('Renewal pipeline entry created (proposal_sent)');
        }

        createTask(db, `Renewal call with ${client.name}`, clientId, 'urgent', 3, 'sales');
        steps.push('Renewal call task created (due 3 days)');

        logInteraction(db, clientId, 'email', 'End of Program automation run. Renewal email sent.');
        break;
      }

      default:
        throw new Error(`Unknown automation: ${automationName}`);
    }

    logAutomation(db, automationName, clientId, steps, 'success');
    return steps;

  } catch (err) {
    logAutomation(db, automationName, clientId, [...steps, `ERROR: ${err.message}`], 'partial');
    throw err;
  }
}

module.exports = { runAutomation };
