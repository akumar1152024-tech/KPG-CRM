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

  console.log('Database initialized.');
  return db;
}

module.exports = { getDB, initDB };
