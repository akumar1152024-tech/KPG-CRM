const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

router.get('/', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const monthPad = String(month).padStart(2, '0');
    const yearStr = String(year);

    const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status='active'").get().c;
    const trialClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status='trial'").get().c;
    const pipelineCount = db.prepare("SELECT COUNT(*) as c FROM pipeline WHERE stage != 'lost'").get().c;

    const leadsThisMonth = db.prepare(`
      SELECT COUNT(*) as c FROM leads
      WHERE strftime('%m', date_captured) = ? AND strftime('%Y', date_captured) = ?
    `).get(monthPad, yearStr).c;

    const revenue = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM income WHERE month=? AND year=?').get(month, year).t;
    const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE month=? AND year=?').get(month, year).t;
    const goals = db.prepare('SELECT * FROM monthly_goals WHERE month=? AND year=?').get(month, year);

    const recentInteractions = db.prepare(`
      SELECT i.*, c.name as client_name, c.avatar_initials
      FROM interactions i JOIN clients c ON i.client_id = c.id
      ORDER BY i.date DESC, i.created_at DESC LIMIT 10
    `).all();

    const fourteenAgo = new Date(now); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
    const cutoff = fourteenAgo.toISOString().split('T')[0];
    const needsFollowUp = db.prepare(`
      SELECT c.id, c.name, c.email, c.status, c.source, c.avatar_initials,
        MAX(i.date) as last_interaction
      FROM clients c LEFT JOIN interactions i ON c.id = i.client_id
      WHERE c.status IN ('active','trial')
      GROUP BY c.id HAVING last_interaction IS NULL OR last_interaction < ?
      ORDER BY last_interaction ASC
    `).all(cutoff);

    const hotPipeline = db.prepare(`
      SELECT * FROM pipeline WHERE stage NOT IN ('signed','lost')
      ORDER BY CASE stage
        WHEN 'proposal_sent' THEN 1 WHEN 'calendly_booked' THEN 2
        WHEN 'typeform_submitted' THEN 3 ELSE 4 END
      LIMIT 3
    `).all();

    const weekFromNow = new Date(now); weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekTasks = db.prepare(`
      SELECT t.*, c.name as client_name FROM tasks t
      LEFT JOIN clients c ON t.related_client_id = c.id
      WHERE t.status='pending' AND t.due_date <= ?
      ORDER BY t.due_date ASC, CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      LIMIT 8
    `).all(weekFromNow.toISOString().split('T')[0]);

    const overdueCount = db.prepare(`
      SELECT COUNT(*) as c FROM tasks WHERE status='pending' AND due_date < ?
    `).get(now.toISOString().split('T')[0]).c;

    const topLeadSource = db.prepare(`
      SELECT source_platform, COUNT(*) as count FROM leads
      WHERE strftime('%m', date_captured) = ? AND strftime('%Y', date_captured) = ?
      GROUP BY source_platform ORDER BY count DESC LIMIT 1
    `).get(monthPad, yearStr);

    const sixMonthChart = (() => {
      const data = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const mo = d.getMonth() + 1, yr = d.getFullYear();
        const rev = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM income WHERE month=? AND year=?').get(mo, yr).t;
        const exp = db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE month=? AND year=?').get(mo, yr).t;
        data.push({ label: d.toLocaleString('default', { month: 'short', year: '2-digit' }), revenue: rev, expenses: exp, profit: rev - exp });
      }
      return data;
    })();

    const metaSnapshot = db.prepare(`
      SELECT SUM(spend) as spend, SUM(leads) as leads,
        CASE WHEN SUM(leads)>0 THEN ROUND(SUM(spend)/SUM(leads),2) ELSE 0 END as cpl
      FROM meta_ads_cache
      WHERE date_start >= date('now','-30 days')
    `).get();

    const bestContent = db.prepare(`
      SELECT platform, caption, views, likes, engagement_rate, post_url
      FROM content_analytics
      WHERE scraped_at >= datetime('now', '-7 days')
      ORDER BY engagement_rate DESC LIMIT 1
    `).get();

    res.json({
      success: true,
      data: {
        today: now.toISOString().split('T')[0],
        coachName: process.env.COACH_NAME || 'Kash',
        activeClients, trialClients, pipelineCount, leadsThisMonth,
        monthlyRevenue: revenue,
        monthlyExpenses: expenses,
        netProfit: revenue - expenses,
        revenueGoal: goals?.revenue_goal || 0,
        profitGoal: goals?.profit_goal || 0,
        clientGoal: goals?.client_goal || 0,
        revenueProgress: goals?.revenue_goal > 0 ? Math.min(100, +((revenue / goals.revenue_goal * 100).toFixed(1))) : 0,
        profitProgress: goals?.profit_goal > 0 ? Math.min(100, +(((revenue - expenses) / goals.profit_goal * 100).toFixed(1))) : 0,
        recentInteractions,
        needsFollowUp,
        hotPipeline,
        weekTasks,
        overdueCount,
        topLeadSource: topLeadSource?.source_platform || null,
        topLeadSourceCount: topLeadSource?.count || 0,
        sixMonthChart,
        metaSnapshot: metaSnapshot || { spend: 0, leads: 0, cpl: 0 },
        bestContent,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
