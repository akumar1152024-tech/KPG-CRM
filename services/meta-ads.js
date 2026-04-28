const axios = require('axios');
const { getDB } = require('../database');

let lastSyncAt = null;
const CACHE_MINUTES = 60;

function isConfigured() {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

async function syncCampaigns(dateRange = 'last_30d') {
  if (!isConfigured()) {
    console.log('[Meta Ads] Not configured — skipping sync');
    return { skipped: true, reason: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set' };
  }

  const now = new Date();
  if (lastSyncAt && (now - lastSyncAt) < CACHE_MINUTES * 60 * 1000) {
    return { cached: true, lastSyncAt };
  }

  try {
    const accountId = process.env.META_AD_ACCOUNT_ID;
    const token     = process.env.META_ACCESS_TOKEN;
    const fields    = 'campaign_name,adset_name,spend,impressions,clicks,date_start,date_stop';

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${accountId}/insights`,
      {
        params: {
          access_token: token,
          fields,
          date_preset: dateRange,
          level: 'adset',
          limit: 100,
          action_breakdowns: 'action_type',
        }
      }
    );

    const db = getDB();
    db.prepare('DELETE FROM meta_ads_cache').run();

    const insert = db.prepare(`
      INSERT INTO meta_ads_cache (campaign_id, campaign_name, adset_name, spend, impressions, clicks, leads, cost_per_lead, date_start, date_end)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);

    const rows = response.data?.data || [];
    for (const row of rows) {
      const leads = row.actions?.find(a => a.action_type === 'lead')?.value || 0;
      const spend = parseFloat(row.spend) || 0;
      const cpl   = leads > 0 ? +(spend / leads).toFixed(2) : 0;

      insert.run(
        row.campaign_id || null, row.campaign_name || 'Unknown', row.adset_name || '',
        spend, parseInt(row.impressions) || 0, parseInt(row.clicks) || 0,
        parseInt(leads), cpl, row.date_start, row.date_stop
      );
    }

    lastSyncAt = now;
    console.log(`[Meta Ads] Synced ${rows.length} rows`);
    return { success: true, count: rows.length, syncedAt: now };
  } catch (err) {
    console.error(`[Meta Ads] syncCampaigns error: ${err.response?.data?.error?.message || err.message}`);
    return { success: false, error: err.message };
  }
}

async function getSummary(dateRange = 'last_30d') {
  await syncCampaigns(dateRange);
  const db = getDB();
  return db.prepare(`
    SELECT SUM(spend) as spend, SUM(impressions) as impressions, SUM(clicks) as clicks,
      SUM(leads) as leads, CASE WHEN SUM(leads)>0 THEN ROUND(SUM(spend)/SUM(leads),2) ELSE 0 END as cpl
    FROM meta_ads_cache
  `).get();
}

module.exports = { syncCampaigns, getSummary, isConfigured };
