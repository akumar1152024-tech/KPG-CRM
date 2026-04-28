const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './business.db';
let db;

function getDB() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      status TEXT DEFAULT 'lead' CHECK(status IN ('active','lead','trial','churned','paused')),
      source TEXT CHECK(source IN ('Instagram','TikTok','YouTube','Website','ManyChat','WhatsApp','Referral','Meta_Ad','Typeform','Calendly','Gmail','Other')),
      program_type TEXT CHECK(program_type IN ('1:1 coaching','group program','course','free challenge')),
      monthly_value REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      notes TEXT,
      tags TEXT DEFAULT '[]',
      avatar_initials TEXT,
      trainerize_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      type TEXT DEFAULT 'note' CHECK(type IN ('email','call','whatsapp','dm','meeting','note','stripe_payment','calendly_booking','form_submission')),
      summary TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT DEFAULT 'other' CHECK(category IN ('1:1 coaching','group program','course sale','stripe payment','other')),
      stripe_payment_id TEXT,
      client_id INTEGER,
      date TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT DEFAULT 'other' CHECK(category IN ('software','advertising','content creation','education','equipment','contractor','meta_ads','other')),
      date TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      recurring INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      revenue_goal REAL DEFAULT 0,
      profit_goal REAL DEFAULT 0,
      client_goal INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS pipeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source TEXT,
      stage TEXT DEFAULT 'new_lead' CHECK(stage IN ('new_lead','typeform_submitted','calendly_booked','proposal_sent','signed','lost')),
      notes TEXT,
      potential_value REAL DEFAULT 0,
      ad_campaign TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      source_platform TEXT CHECK(source_platform IN ('Instagram','TikTok','YouTube','Website','ManyChat','WhatsApp','Meta_Ad','Referral')),
      source_detail TEXT,
      utm_source TEXT,
      utm_campaign TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','converted','dead')),
      date_captured TEXT DEFAULT (datetime('now')),
      client_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS meta_ads_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT,
      campaign_name TEXT,
      adset_name TEXT,
      spend REAL DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      leads INTEGER DEFAULT 0,
      cost_per_lead REAL DEFAULT 0,
      roas REAL DEFAULT 0,
      date_start TEXT,
      date_end TEXT,
      cached_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger TEXT CHECK(trigger IN ('new_lead','new_client','trial_start','payment_received','no_contact_14d','payment_failed','renewal','re_engagement')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_sequence_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      delay_days INTEGER DEFAULT 0,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sequence_id) REFERENCES email_sequences(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      sequence_id INTEGER,
      step_id INTEGER,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhooks_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'received',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT CHECK(platform IN ('Instagram','TikTok','YouTube')),
      content_type TEXT,
      caption_notes TEXT,
      post_date TEXT,
      status TEXT DEFAULT 'idea' CHECK(status IN ('idea','drafted','scheduled','posted')),
      link TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT CHECK(platform IN ('YouTube','TikTok','Instagram')),
      post_id TEXT,
      post_url TEXT,
      thumbnail_url TEXT,
      caption TEXT,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      posted_at TEXT,
      scraped_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitor_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      username TEXT,
      profile_url TEXT,
      follower_count INTEGER DEFAULT 0,
      avg_views REAL DEFAULT 0,
      avg_engagement REAL DEFAULT 0,
      last_scraped TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hashtag_research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      hashtag TEXT,
      post_id TEXT,
      post_url TEXT,
      caption TEXT,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      engagement_rate REAL DEFAULT 0,
      scraped_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT,
      idea_text TEXT NOT NULL,
      based_on_post_id INTEGER,
      status TEXT DEFAULT 'idea' CHECK(status IN ('idea','drafted','discarded')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'admin' CHECK(category IN ('client follow-up','content creation','admin','sales','personal')),
      related_client_id INTEGER,
      due_date TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done')),
      recurring TEXT DEFAULT 'none' CHECK(recurring IN ('none','daily','weekly','monthly')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (related_client_id) REFERENCES clients(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS automations_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_name TEXT NOT NULL,
      client_id INTEGER,
      steps_completed TEXT DEFAULT '[]',
      status TEXT DEFAULT 'success' CHECK(status IN ('success','partial','failed')),
      run_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
    CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
    CREATE INDEX IF NOT EXISTS idx_income_month_year ON income(month, year);
    CREATE INDEX IF NOT EXISTS idx_expenses_month_year ON expenses(month, year);
    CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON pipeline(stage);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(source_platform);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status, scheduled_at);
  `);

  const seeded = db.prepare("SELECT COUNT(*) as count FROM clients").get();
  if (seeded.count === 0) seedDatabase(db);

  console.log('Database initialized.');
  return db;
}

function seedDatabase(db) {
  console.log('Seeding database with sample data...');

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  // --- CLIENTS ---
  const insertClient = db.prepare(`
    INSERT INTO clients (name, email, phone, status, source, program_type, monthly_value, total_paid, start_date, notes, avatar_initials, tags)
    VALUES (@name, @email, @phone, @status, @source, @program_type, @monthly_value, @total_paid, @start_date, @notes, @avatar_initials, @tags)
  `);

  const clients = [
    { name: 'Priya Ramesh', email: 'priya.ramesh@gmail.com', phone: '+1-647-555-0101', status: 'active', source: 'Instagram', program_type: '1:1 coaching', monthly_value: 800, total_paid: 2400, start_date: `${y}-01-15`, notes: 'Busy cardiologist, prefers 6am calls. Goal: lose 15lbs before wedding. Very motivated.', avatar_initials: 'PR', tags: '["vip","referral-source"]' },
    { name: 'Amit Shah', email: 'amit.shah@outlook.com', phone: '+1-416-555-0202', status: 'active', source: 'TikTok', program_type: 'group program', monthly_value: 400, total_paid: 800, start_date: `${y}-02-01`, notes: 'Software engineer, WFH. Stress eating issues. Responds well to data and tracking.', avatar_initials: 'AS', tags: '["group-cohort-2"]' },
    { name: 'Kavya Pillai', email: 'kavya.pillai@yahoo.com', phone: '+1-905-555-0303', status: 'active', source: 'Meta_Ad', program_type: '1:1 coaching', monthly_value: 800, total_paid: 800, start_date: `${y}-03-01`, notes: 'Pharmacist. Training for 5K. Came via Meta Ad campaign "South Asian Women Fitness".', avatar_initials: 'KP', tags: '["meta-ad-client"]' },
    { name: 'Rohan Nair', email: 'rohan.nair@gmail.com', phone: '+1-604-555-0404', status: 'lead', source: 'Typeform', program_type: null, monthly_value: 0, total_paid: 0, start_date: null, notes: 'Filled typeform, booked discovery call. Accountant, very busy schedule.', avatar_initials: 'RN', tags: '[]' },
    { name: 'Sneha Verma', email: 'sneha.verma@hotmail.com', phone: '+1-780-555-0505', status: 'trial', source: 'YouTube', program_type: '1:1 coaching', monthly_value: 800, total_paid: 97, start_date: `${y}-${String(m).padStart(2,'0')}-01`, notes: 'On 2-week trial. PCOS weight management. Very engaged.', avatar_initials: 'SV', tags: '["trial"]' },
  ];

  const clientIds = [];
  for (const c of clients) {
    const r = insertClient.run(c);
    clientIds.push(r.lastInsertRowid);
  }

  // --- INTERACTIONS ---
  const insertInteraction = db.prepare(`INSERT INTO interactions (client_id, type, summary, date) VALUES (?, ?, ?, ?)`);
  const today = now.toISOString().split('T')[0];
  const d = (daysAgo) => { const dt = new Date(now); dt.setDate(dt.getDate() - daysAgo); return dt.toISOString().split('T')[0]; };

  [
    [clientIds[0], 'call', 'Onboarding call. Discussed goals, current diet, training history. Sedentary 2yrs due to hospital schedule.', d(60)],
    [clientIds[0], 'whatsapp', 'Sent week 1 workout plan. She confirmed received it and started Monday.', d(55)],
    [clientIds[0], 'meeting', 'Monthly check-in. Down 5lbs! Adjusted macros to 1800 cal. Increased protein 140g.', d(30)],
    [clientIds[0], 'note', "Wedding is in September — strong deadline motivation. Use this in content!", d(20)],
    [clientIds[0], 'call', 'Week 8 check-in. Energy improving. Sleep better. Increased cardio to 4x/week.', d(7)],
    [clientIds[1], 'email', 'Welcome email sent with group program portal access and week 1 schedule.', d(45)],
    [clientIds[1], 'call', 'Week 2 check-in. Struggling with meal prep on Sundays. Sent 30-min meal prep guide.', d(38)],
    [clientIds[1], 'whatsapp', 'Motivation check-in. Shared progress photo. Down 3lbs this month!', d(10)],
    [clientIds[2], 'call', 'Trial kickoff call. Mapped 5K training plan: running 3x + strength 2x/week.', d(20)],
    [clientIds[2], 'note', 'Came via Meta Ad — ask her about ad experience for testimonial.', d(18)],
    [clientIds[3], 'whatsapp', 'Initial DM response. Sent pricing PDF and Calendly booking link.', d(5)],
    [clientIds[4], 'call', 'Trial kickoff. PCOS protocol started. Low-impact training, anti-inflammatory nutrition.', d(3)],
  ].forEach(([cid, type, summary, date]) => insertInteraction.run(cid, type, summary, date));

  // --- INCOME (4 months) ---
  const insertIncome = db.prepare(`INSERT INTO income (description, amount, category, client_id, date, month, year) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const months4 = [-3,-2,-1,0].map(offset => {
    const dt = new Date(y, m - 1 + offset, 1);
    return { m: dt.getMonth() + 1, y: dt.getFullYear() };
  });

  const incomeData = [
    // Month -3
    [months4[0], 'Priya Ramesh - 1:1 Coaching', 800, '1:1 coaching', clientIds[0], 1],
    [months4[0], 'Course Sale - Body Reset Program', 297, 'course sale', null, 10],
    [months4[0], 'Course Sale - Body Reset Program', 297, 'course sale', null, 18],
    // Month -2
    [months4[1], 'Priya Ramesh - 1:1 Coaching', 800, '1:1 coaching', clientIds[0], 1],
    [months4[1], 'Amit Shah - Group Program', 400, 'group program', clientIds[1], 1],
    [months4[1], 'Stripe - Discovery Deposit', 150, 'stripe payment', null, 12],
    // Month -1
    [months4[2], 'Priya Ramesh - 1:1 Coaching', 800, '1:1 coaching', clientIds[0], 1],
    [months4[2], 'Amit Shah - Group Program', 400, 'group program', clientIds[1], 1],
    [months4[2], 'Kavya Pillai - 1:1 Coaching', 800, '1:1 coaching', clientIds[2], 1],
    [months4[2], 'Course Sale - Body Reset Program', 297, 'course sale', null, 15],
    // This month
    [months4[3], 'Priya Ramesh - 1:1 Coaching', 800, '1:1 coaching', clientIds[0], 1],
    [months4[3], 'Amit Shah - Group Program', 400, 'group program', clientIds[1], 1],
    [months4[3], 'Kavya Pillai - 1:1 Coaching', 800, '1:1 coaching', clientIds[2], 1],
    [months4[3], 'Sneha Verma - Trial Fee', 97, '1:1 coaching', clientIds[4], 2],
    [months4[3], 'Course Sale - Desi Meal Prep Guide', 47, 'course sale', null, 8],
  ];

  for (const [mo, desc, amt, cat, cid, day] of incomeData) {
    const dateStr = `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    insertIncome.run(desc, amt, cat, cid, dateStr, mo.m, mo.y);
  }

  // --- EXPENSES ---
  const insertExpense = db.prepare(`INSERT INTO expenses (description, amount, category, date, month, year, recurring) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const cm = months4[3];
  const pm = months4[2];
  [
    [cm, 'Zapier (automations)', 49, 'software', 1, 1],
    [cm, 'Mailchimp', 55, 'software', 1, 1],
    [cm, 'Calendly Pro', 16, 'software', 1, 1],
    [cm, 'Canva Pro', 15, 'software', 1, 1],
    [cm, 'Google Workspace', 12, 'software', 1, 1],
    [cm, 'Meta Ads - South Asian Women Campaign', 300, 'meta_ads', 5, 0],
    [pm, 'Meta Ads - Fat Loss Reel Boost', 180, 'meta_ads', 10, 0],
    [pm, 'Video Editor (YouTube)', 600, 'content creation', 15, 0],
    [pm, 'Precision Nutrition Certification', 250, 'education', 20, 0],
    [months4[1], 'HubSpot CRM', 45, 'software', 1, 1],
  ].forEach(([mo, desc, amt, cat, day, rec]) => {
    const dateStr = `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    insertExpense.run(desc, amt, cat, dateStr, mo.m, mo.y, rec);
  });

  // --- GOALS ---
  db.prepare(`INSERT OR IGNORE INTO monthly_goals (month, year, revenue_goal, profit_goal, client_goal) VALUES (?, ?, ?, ?, ?)`).run(cm.m, cm.y, 15000, 10000, 20);

  // --- PIPELINE ---
  const insertPipeline = db.prepare(`INSERT INTO pipeline (name, email, phone, source, stage, notes, potential_value) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Deepa Nair', 'deepa.nair@gmail.com', '+1-416-555-0601', 'Instagram', 'new_lead', 'Liked 5 posts. Commented "This is exactly what I need" on fat loss reel.', 800],
    ['Vikram Singh', 'vikram.singh@gmail.com', '+1-647-555-0702', 'YouTube', 'typeform_submitted', 'Filled intake form. Wants to lose weight before Diwali. Works night shifts.', 800],
    ['Meera Iyer', 'meera.iyer@outlook.com', '+1-905-555-0803', 'Referral', 'calendly_booked', 'Referred by Priya. Discovery call next Tuesday. Wants 1:1 coaching.', 800],
    ['Sanjay Gupta', 'sanjay.gupta@gmail.com', '+1-604-555-0904', 'Meta_Ad', 'proposal_sent', 'Sent 3-month 1:1 package proposal ($2400). Following up Thursday.', 2400],
    ['Nisha Verma', 'nisha.verma@yahoo.com', '+1-780-555-1005', 'Typeform', 'signed', 'Starting next Monday. Accountant, data-driven personality.', 800],
  ].forEach(args => insertPipeline.run(...args));

  // --- LEADS ---
  const insertLead = db.prepare(`INSERT INTO leads (name, email, source_platform, source_detail, status, date_captured, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  [
    ['Aisha Khan', 'aisha.khan@gmail.com', 'Instagram', 'Fat loss reel - April', 'new', today, 'DM: "How much do you charge?"'],
    ['Rohit Malhotra', 'rohit.malhotra@gmail.com', 'TikTok', 'South Asian diet video', 'contacted', today, 'Sent pricing. Waiting for response.'],
    ['Sunita Pillai', 'sunita.pillai@outlook.com', 'YouTube', '10-min morning workout video', 'qualified', today, 'On call, confirmed budget. Booking discovery.'],
    ['Amit Bose', 'amit.bose@gmail.com', 'Referral', 'Referred by Amit Shah', 'converted', today, 'Converted to group program client.'],
    ['Pooja Joshi', 'pooja.joshi@gmail.com', 'WhatsApp', 'WhatsApp broadcast list', 'new', today, 'Replied to broadcast asking for info.'],
    ['Kiran Rao', 'kiran.rao@yahoo.com', 'Instagram', 'Story poll - weight loss', 'contacted', today, 'Voted on poll, sent DM follow-up.'],
    ['Suresh Kumar', 'suresh.kumar@gmail.com', 'ManyChat', 'Free guide funnel', 'qualified', today, 'Downloaded free guide, clicked email link.'],
    ['Divya Menon', 'divya.menon@gmail.com', 'Website', 'Contact form', 'new', today, 'Wants group coaching info.'],
    ['Rahul Sharma', 'rahul.sharma@outlook.com', 'TikTok', 'Chapati vs rice video (viral)', 'new', today, 'Commented on viral video, followed account.'],
    ['Leela Krishnan', 'leela.krishnan@gmail.com', 'YouTube', 'PCOS weight loss video', 'contacted', today, 'Left comment, sent resource PDF via email.'],
  ].forEach(args => insertLead.run(...args));

  // --- TASKS ---
  const insertTask = db.prepare(`INSERT INTO tasks (title, description, category, related_client_id, due_date, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const in3days = new Date(now); in3days.setDate(in3days.getDate() + 3);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  [
    ['Follow up Sanjay Gupta on proposal', 'He received the proposal 2 days ago. Call or WhatsApp to check.', 'sales', null, tomorrow.toISOString().split('T')[0], 'urgent', 'pending'],
    ['Review Priya monthly feedback form', 'She submitted Typeform feedback. Review and update program.', 'client follow-up', clientIds[0], in3days.toISOString().split('T')[0], 'high', 'pending'],
    ['Post Desi meal prep reel on TikTok', 'Video is edited. Add captions and schedule for 7pm.', 'content creation', null, tomorrow.toISOString().split('T')[0], 'medium', 'pending'],
    ['Chase overdue task — check Rohan discovery call outcome', 'Discovery call was yesterday. Did he convert?', 'client follow-up', clientIds[3], yesterday.toISOString().split('T')[0], 'high', 'pending'],
  ].forEach(args => insertTask.run(...args));

  // --- EMAIL SEQUENCES ---
  const insertSeq = db.prepare(`INSERT INTO email_sequences (name, trigger, status) VALUES (?, ?, ?)`);
  const seqs = [
    ['New Lead Welcome', 'new_lead', 'active'],
    ['Trial Client Onboarding', 'trial_start', 'active'],
    ['Payment Received Thank You', 'payment_received', 'active'],
    ['Re-engagement (14 days no contact)', 're_engagement', 'active'],
  ];
  const seqIds = seqs.map(([name, trigger, status]) => insertSeq.run(name, trigger, status).lastInsertRowid);

  const insertStep = db.prepare(`INSERT INTO email_sequence_steps (sequence_id, step_number, delay_days, subject, body_html) VALUES (?, ?, ?, ?, ?)`);
  [
    [seqIds[0], 1, 0, "Hey {{first_name}}, thanks for reaching out!", "<p>Hi {{first_name}},</p><p>Thanks for your interest in Kash Performance Group! I'm Kash and I help South Asian professionals like you build sustainable fitness habits.</p><p><a href='{{calendly_url}}'>Book your free discovery call here →</a></p><p>Talk soon,<br>Kash</p>"],
    [seqIds[0], 2, 2, "Still thinking about it, {{first_name}}?", "<p>Hi {{first_name}},</p><p>Just checking in — I know life gets busy. Your goals are still waiting for you.</p><p><a href='{{calendly_url}}'>Grab a time to chat →</a></p><p>Kash</p>"],
    [seqIds[1], 1, 0, "Welcome to Kash Performance Group, {{first_name}}! 🎉", "<p>Hi {{first_name}},</p><p>Welcome! I'm so excited to work with you. Here's what to expect in your first week...</p><p>Kash</p>"],
    [seqIds[2], 1, 0, "Payment confirmed — you're all set, {{first_name}}!", "<p>Hi {{first_name}},</p><p>Your payment has been received. Thank you! Your journey continues.</p><p>Kash</p>"],
    [seqIds[3], 1, 0, "Checking in on you, {{first_name}}", "<p>Hi {{first_name}},</p><p>It's been a while since we connected. How are your goals going?</p><p><a href='{{calendly_url}}'>Let's reconnect →</a></p><p>Kash</p>"],
  ].forEach(args => insertStep.run(...args));

  // --- DEFAULT SETTINGS ---
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  [
    ['business_name', 'Kash Performance Group'],
    ['coach_name', 'Kash'],
    ['website', 'https://kash-performance-group.com'],
    ['timezone', 'America/Toronto'],
  ].forEach(([k, v]) => insertSetting.run(k, v));

  console.log('Sample data seeded successfully.');
}

module.exports = { getDB, initDB };
