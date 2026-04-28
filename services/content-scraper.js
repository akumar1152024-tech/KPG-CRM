const axios = require('axios');
const { getDB } = require('../database');

const APIFY_BASE = 'https://api.apify.com/v2';

async function runApifyActor(actorId, input) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN not configured');

  // Start run
  const start = await axios.post(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, input);
  const runId = start.data.data.id;

  // Poll for completion (max 120 seconds)
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await axios.get(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (status.data.data.status === 'SUCCEEDED') {
      const dataset = await axios.get(`${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${token}&limit=50`);
      return dataset.data;
    }
    if (['FAILED','ABORTED','TIMED-OUT'].includes(status.data.data.status)) {
      throw new Error(`Apify run failed: ${status.data.data.status}`);
    }
  }
  throw new Error('Apify run timed out after 120 seconds');
}

function saveContentAnalytics(db, platform, posts) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO content_analytics
      (platform, post_id, post_url, thumbnail_url, caption, views, likes, comments, shares, saves, engagement_rate, posted_at, scraped_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `);

  for (const post of posts) {
    const views     = parseInt(post.viewCount || post.playCount || post.views || 0);
    const likes     = parseInt(post.likeCount || post.likesCount || post.likes || 0);
    const comments  = parseInt(post.commentCount || post.commentsCount || post.comments || 0);
    const shares    = parseInt(post.shareCount || post.shares || 0);
    const saves     = parseInt(post.saveCount || post.saves || 0);
    const total     = likes + comments + shares + saves;
    const engRate   = views > 0 ? +((total / views * 100).toFixed(2)) : 0;

    insert.run(
      platform,
      post.id || post.videoId || post.shortCode || null,
      post.url || post.postUrl || null,
      post.thumbnailUrl || post.displayUrl || null,
      (post.text || post.caption || post.title || '').substring(0, 500),
      views, likes, comments, shares, saves, engRate,
      post.timestamp || post.publishedAt || null,
    );
  }
  return posts.length;
}

async function scrapeYouTube() {
  const db = getDB();
  const channelUrl = process.env.YOUTUBE_CHANNEL_URL;
  if (!channelUrl) throw new Error('YOUTUBE_CHANNEL_URL not set in .env');

  const items = await runApifyActor('streamers~youtube-scraper', {
    startUrls: [{ url: channelUrl }],
    maxResults: 30,
  });

  const count = saveContentAnalytics(db, 'YouTube', items);
  console.log(`[Scraper] YouTube: ${count} posts saved`);
  return items;
}

async function scrapeTikTok() {
  const db = getDB();
  const username = process.env.TIKTOK_USERNAME;
  if (!username) throw new Error('TIKTOK_USERNAME not set in .env');

  const items = await runApifyActor('clockworks~tiktok-scraper', {
    profiles: [username],
    resultsPerPage: 30,
  });

  const count = saveContentAnalytics(db, 'TikTok', items);
  console.log(`[Scraper] TikTok: ${count} posts saved`);
  return items;
}

async function scrapeInstagram() {
  const db = getDB();
  const username = process.env.INSTAGRAM_USERNAME;
  if (!username) throw new Error('INSTAGRAM_USERNAME not set in .env');

  const items = await runApifyActor('apify~instagram-profile-scraper', {
    usernames: [username],
    resultsLimit: 30,
  });

  const posts = items.flatMap(u => u.latestPosts || []);
  const count = saveContentAnalytics(db, 'Instagram', posts);
  console.log(`[Scraper] Instagram: ${count} posts saved`);
  return posts;
}

async function scrapeHashtag(platform, hashtag, limit = 20) {
  const db = getDB();
  let items = [];

  if (platform === 'TikTok') {
    items = await runApifyActor('clockworks~tiktok-hashtag-scraper', { hashtags: [hashtag], resultsPerPage: limit });
  } else if (platform === 'Instagram') {
    items = await runApifyActor('apify~instagram-hashtag-scraper', { hashtags: [hashtag], resultsLimit: limit });
  }

  const insert = db.prepare(`
    INSERT INTO hashtag_research (platform, hashtag, post_id, post_url, caption, views, likes, comments, engagement_rate, scraped_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
  `);

  for (const item of items) {
    const views    = parseInt(item.viewCount || item.playCount || item.views || 0);
    const likes    = parseInt(item.likeCount || item.likes || 0);
    const comments = parseInt(item.commentCount || item.comments || 0);
    const engRate  = views > 0 ? +((( likes + comments) / views * 100).toFixed(2)) : 0;
    insert.run(platform, hashtag, item.id || null, item.url || null, (item.text || item.caption || '').substring(0,300), views, likes, comments, engRate);
  }

  return items;
}

async function scrapeAll() {
  const results = {};
  const tasks = [
    ['YouTube',   scrapeYouTube],
    ['TikTok',    scrapeTikTok],
    ['Instagram', scrapeInstagram],
  ];
  for (const [name, fn] of tasks) {
    try { results[name] = await fn(); } catch (e) { results[name] = { error: e.message }; }
  }
  return results;
}

module.exports = { scrapeYouTube, scrapeTikTok, scrapeInstagram, scrapeHashtag, scrapeAll };
