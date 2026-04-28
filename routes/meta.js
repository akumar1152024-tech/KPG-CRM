const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/meta/sync
router.get('/sync', async (req, res) => {
  try {
    const metaAds = require('../services/meta-ads');
    const result = await metaAds.syncCampaigns();
    res.json({ success: true, message: 'Meta Ads synced', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/meta/campaigns
router.get('/campaigns', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM meta_ads_cache ORDER BY spend DESC').all();
    const lastSync = rows.length > 0 ? rows[0].cached_at : null;
    res.json({ success: true, data: rows, lastSync, configured: !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/meta/summary
router.get('/summary', (req, res) => {
  try {
    const db = getDB();
    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(spend),0) as total_spend,
        COALESCE(SUM(impressions),0) as total_impressions,
        COALESCE(SUM(clicks),0) as total_clicks,
        COALESCE(SUM(leads),0) as total_leads,
        CASE WHEN SUM(leads)>0 THEN ROUND(SUM(spend)/SUM(leads),2) ELSE 0 END as avg_cpl,
        CASE WHEN SUM(spend)>0 THEN ROUND(SUM(clicks)*100.0/SUM(impressions),2) ELSE 0 END as avg_ctr
      FROM meta_ads_cache
    `).get();

    const byCampaign = db.prepare(`
      SELECT campaign_name, SUM(spend) as spend, SUM(leads) as leads,
        CASE WHEN SUM(leads)>0 THEN ROUND(SUM(spend)/SUM(leads),2) ELSE 0 END as cpl
      FROM meta_ads_cache GROUP BY campaign_name ORDER BY spend DESC
    `).all();

    const configured = !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
    res.json({ success: true, data: { summary, byCampaign, configured } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
