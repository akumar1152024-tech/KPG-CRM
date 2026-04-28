const { getDB } = require('../database');

const DEFAULT_IDEAS = [
  { platform: 'TikTok',     idea_text: 'Morning routine for busy South Asian professionals (5-minute version)', content_type: 'Short video' },
  { platform: 'Instagram',  idea_text: 'Debunking 3 Indian diet myths that are killing your fat loss', content_type: 'Carousel' },
  { platform: 'YouTube',    idea_text: 'How I help South Asian clients balance family pressure + fitness goals', content_type: 'Long-form video' },
  { platform: 'TikTok',     idea_text: 'Desi meal prep for muscle building (chapati, dal, rice — the right way)', content_type: 'Short video' },
  { platform: 'Instagram',  idea_text: 'Why South Asian men struggle to lose belly fat — and the real fix', content_type: 'Carousel' },
  { platform: 'YouTube',    idea_text: 'PCOS and weight loss for South Asian women: what actually works', content_type: 'Long-form video' },
  { platform: 'TikTok',     idea_text: 'What I eat in a day as a South Asian fitness coach', content_type: 'Short video' },
  { platform: 'Instagram',  idea_text: '5 South Asian snacks that are actually great for fat loss', content_type: 'Carousel' },
  { platform: 'TikTok',     idea_text: 'The night shift worker fitness guide (for South Asian healthcare workers)', content_type: 'Short video' },
  { platform: 'Instagram',  idea_text: 'Client transformation: from 0 gym experience to running a 5K in 8 weeks', content_type: 'Before/After' },
];

async function generateContentIdeas() {
  const db = getDB();

  // Try to generate ideas based on top performing posts
  const topPosts = db.prepare(`
    SELECT platform, caption, engagement_rate, views
    FROM content_analytics
    WHERE caption IS NOT NULL AND caption != ''
    ORDER BY engagement_rate DESC LIMIT 10
  `).all();

  let ideas = [];

  if (topPosts.length >= 5) {
    // Extract patterns from top posts and generate variants
    for (const post of topPosts.slice(0, 5)) {
      const caption = post.caption || '';
      const words = caption.split(' ').slice(0, 6).join(' ');
      ideas.push({
        platform: post.platform,
        idea_text: `Content inspired by top post: "${words}..." (${Math.round(post.engagement_rate * 100) / 100}% eng.)`,
        content_type: post.platform === 'YouTube' ? 'Long-form video' : post.platform === 'TikTok' ? 'Short video' : 'Carousel',
        based_on_performance: true,
        engagement_rate: post.engagement_rate,
      });
    }
  }

  // Pad with South Asian coaching defaults to always return 5+
  const needed = Math.max(0, 5 - ideas.length);
  const shuffled = [...DEFAULT_IDEAS].sort(() => Math.random() - 0.5);
  ideas = [...ideas, ...shuffled.slice(0, needed + 3)];

  // Save generated ideas to DB (avoid duplicates)
  const insert = db.prepare("INSERT INTO content_ideas (platform, idea_text) VALUES (?,?)");
  for (const idea of ideas.slice(0, 5)) {
    const existing = db.prepare("SELECT id FROM content_ideas WHERE idea_text=?").get(idea.idea_text);
    if (!existing) insert.run(idea.platform || 'Instagram', idea.idea_text);
  }

  return ideas.slice(0, 10);
}

module.exports = { generateContentIdeas, DEFAULT_IDEAS };
