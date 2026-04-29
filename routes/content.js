const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// ─── CALENDAR ──────────────────────────────────────────────────────────

router.get('/calendar', (req, res) => {
  try {
    const db = getDB();
    const { month, year, platform, status } = req.query;
    let q = 'SELECT * FROM content_calendar WHERE 1=1';
    const p = [];
    if (month && year) { q += " AND strftime('%m', post_date)=? AND strftime('%Y', post_date)=?"; p.push(String(month).padStart(2,'0'), year); }
    if (platform) { q += ' AND platform=?'; p.push(platform); }
    if (status) { q += ' AND status=?'; p.push(status); }
    q += ' ORDER BY post_date ASC';
    res.json({ success: true, data: db.prepare(q).all(...p) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/calendar', (req, res) => {
  try {
    const db = getDB();
    const { platform, content_type, caption_notes, post_date, status, link } = req.body;
    const result = db.prepare('INSERT INTO content_calendar (platform, content_type, caption_notes, post_date, status, link) VALUES (?,?,?,?,?,?)')
      .run(platform, content_type, caption_notes, post_date, status || 'idea', link || null);
    res.json({ success: true, data: db.prepare('SELECT * FROM content_calendar WHERE id=?').get(result.lastInsertRowid), message: 'Content added to calendar' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/calendar/:id', (req, res) => {
  try {
    const db = getDB();
    const { platform, content_type, caption_notes, post_date, status, link } = req.body;
    db.prepare('UPDATE content_calendar SET platform=?, content_type=?, caption_notes=?, post_date=?, status=?, link=? WHERE id=?')
      .run(platform, content_type, caption_notes, post_date, status, link || null, req.params.id);
    res.json({ success: true, data: db.prepare('SELECT * FROM content_calendar WHERE id=?').get(req.params.id), message: 'Content updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/calendar/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM content_calendar WHERE id=?').run(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── ANALYTICS / SCRAPING ─────────────────────────────────────────────

router.get('/analytics/summary', (req, res) => {
  try {
    const db = getDB();
    const byPlatform = db.prepare(`
      SELECT platform, COUNT(*) as posts, SUM(views) as total_views, SUM(likes) as total_likes,
        ROUND(AVG(engagement_rate),2) as avg_engagement, MAX(views) as best_views
      FROM content_analytics GROUP BY platform
    `).all();
    const bestPost = db.prepare('SELECT * FROM content_analytics ORDER BY engagement_rate DESC LIMIT 1').get();
    const lastScraped = db.prepare('SELECT MAX(scraped_at) as t FROM content_analytics').get().t;
    res.json({ success: true, data: { byPlatform, bestPost, lastScraped } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/analytics/:platform/stats', (req, res) => {
  try {
    const db = getDB();
    const { platform } = req.params;

    const summary = db.prepare(`
      SELECT COUNT(*) as total_posts, SUM(views) as total_views,
        ROUND(AVG(views),0) as avg_views, ROUND(AVG(engagement_rate),2) as avg_engagement,
        MAX(engagement_rate) as best_engagement, MAX(views) as best_views
      FROM content_analytics WHERE platform=?
    `).get(platform);

    const bestDay = db.prepare(`
      SELECT strftime('%w', posted_at) as dow, SUM(views) as total_views
      FROM content_analytics WHERE platform=? AND posted_at IS NOT NULL
      GROUP BY dow ORDER BY total_views DESC LIMIT 1
    `).get(platform);

    const growth = db.prepare(`
      SELECT
        SUM(CASE WHEN posted_at >= date('now','-7 days') THEN views ELSE 0 END) as this_week_views,
        SUM(CASE WHEN posted_at >= date('now','-14 days') AND posted_at < date('now','-7 days') THEN views ELSE 0 END) as last_week_views,
        COUNT(CASE WHEN posted_at >= date('now','-7 days') THEN 1 END) as this_week_posts,
        COUNT(CASE WHEN posted_at >= date('now','-14 days') AND posted_at < date('now','-7 days') THEN 1 END) as last_week_posts
      FROM content_analytics WHERE platform=?
    `).get(platform);

    const bestPost = db.prepare(
      'SELECT * FROM content_analytics WHERE platform=? ORDER BY engagement_rate DESC LIMIT 1'
    ).get(platform);

    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    res.json({
      success: true,
      data: {
        summary,
        bestDayOfWeek: bestDay ? DAYS[parseInt(bestDay.dow)] : null,
        growth,
        bestPost,
      }
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/analytics/:platform', (req, res) => {
  try {
    const db = getDB();
    const { sort = 'views', days } = req.query;
    const orderMap = { views: 'views DESC', likes: 'likes DESC', recent: 'posted_at DESC', engagement: 'engagement_rate DESC' };
    let where = 'platform=?';
    const params = [req.params.platform];
    if (days && parseInt(days) > 0) {
      where += ` AND (scraped_at >= datetime('now', '-${parseInt(days)} days') OR posted_at >= date('now', '-${parseInt(days)} days'))`;
    }
    const rows = db.prepare(`SELECT * FROM content_analytics WHERE ${where} ORDER BY ${orderMap[sort] || 'views DESC'} LIMIT 50`)
      .all(...params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

async function runScraper(platform, res) {
  if (!process.env.APIFY_API_TOKEN) {
    return res.json({ success: false, message: 'Apify not configured. Add APIFY_API_TOKEN to .env to enable scraping.' });
  }
  try {
    const scraper = require('../services/content-scraper');
    const data = await scraper[`scrape${platform}`]();
    res.json({ success: true, data, message: `${platform} scraped: ${data?.length || 0} posts` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

router.get('/scrape/youtube',   (req, res) => runScraper('YouTube', res));
router.get('/scrape/tiktok',    (req, res) => runScraper('TikTok', res));
router.get('/scrape/instagram', (req, res) => runScraper('Instagram', res));

router.post('/scrape/all', async (req, res) => {
  if (!process.env.APIFY_API_TOKEN) return res.json({ success: false, message: 'Apify not configured.' });
  try {
    const scraper = require('../services/content-scraper');
    const results = await scraper.scrapeAll();
    res.json({ success: true, message: 'All platforms scraped', results });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/scrape/competitor', async (req, res) => {
  const db = getDB();
  try {
    const { platform, username, profile_url } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'username required' });
    const existing = db.prepare('SELECT * FROM competitor_profiles WHERE platform=? AND username=?').get(platform, username);
    if (!existing) {
      db.prepare('INSERT INTO competitor_profiles (platform, username, profile_url) VALUES (?,?,?)').run(platform, username, profile_url || null);
    }
    res.json({ success: true, message: `Competitor ${username} added. Scrape requires Apify token.` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/competitors', (req, res) => {
  try {
    const db = getDB();
    res.json({ success: true, data: db.prepare('SELECT * FROM competitor_profiles ORDER BY platform, username').all() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/scrape/hashtag', async (req, res) => {
  if (!process.env.APIFY_API_TOKEN) return res.json({ success: false, message: 'Apify not configured.' });
  try {
    const { platform, hashtag, limit = 20 } = req.body;
    if (!hashtag) return res.status(400).json({ success: false, error: 'hashtag required' });
    const scraper = require('../services/content-scraper');
    const data = await scraper.scrapeHashtag(platform, hashtag, limit);
    res.json({ success: true, data, message: `${data?.length || 0} posts found for #${hashtag}` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/hashtags', (req, res) => {
  try {
    const db = getDB();
    const { platform, hashtag } = req.query;
    let q = 'SELECT * FROM hashtag_research WHERE 1=1';
    const p = [];
    if (platform) { q += ' AND platform=?'; p.push(platform); }
    if (hashtag) { q += ' AND hashtag=?'; p.push(hashtag); }
    q += ' ORDER BY engagement_rate DESC LIMIT 100';
    res.json({ success: true, data: db.prepare(q).all(...p) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── IDEAS ─────────────────────────────────────────────────────────────

router.post('/ideas/generate', async (req, res) => {
  try {
    const { generateContentIdeas } = require('../services/content-ideas');
    const ideas = await generateContentIdeas();
    res.json({ success: true, data: ideas });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/ideas', (req, res) => {
  try {
    const db = getDB();
    res.json({ success: true, data: db.prepare("SELECT * FROM content_ideas WHERE status != 'discarded' ORDER BY created_at DESC").all() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/ideas', (req, res) => {
  try {
    const db = getDB();
    const { platform, idea_text, based_on_post_id } = req.body;
    if (!idea_text) return res.status(400).json({ success: false, error: 'idea_text required' });
    const result = db.prepare('INSERT INTO content_ideas (platform, idea_text, based_on_post_id) VALUES (?,?,?)').run(platform, idea_text, based_on_post_id || null);
    res.json({ success: true, data: db.prepare('SELECT * FROM content_ideas WHERE id=?').get(result.lastInsertRowid), message: 'Idea saved' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/ideas/:id', (req, res) => {
  try {
    const db = getDB();
    const { status } = req.body;
    db.prepare('UPDATE content_ideas SET status=? WHERE id=?').run(status, req.params.id);
    res.json({ success: true, message: 'Idea updated' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
