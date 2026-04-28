const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/finance/summary?month=&year=
router.get('/summary', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();

    const revenue = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM income WHERE month=? AND year=?').get(month, year);
    const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE month=? AND year=?').get(month, year);
    const goals = db.prepare('SELECT * FROM monthly_goals WHERE month=? AND year=?').get(month, year);

    const totalRevenue = revenue.total;
    const totalExpenses = expenses.total;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        month, year,
        totalRevenue,
        totalExpenses,
        netProfit,
        profitMargin,
        revenueGoal: goals?.revenue_goal || 0,
        profitGoal: goals?.profit_goal || 0,
        revenueProgress: goals?.revenue_goal > 0 ? Math.min(100, (totalRevenue / goals.revenue_goal * 100).toFixed(1)) : 0,
        profitProgress: goals?.profit_goal > 0 ? Math.min(100, (netProfit / goals.profit_goal * 100).toFixed(1)) : 0,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/income?month=&year=
router.get('/income', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const rows = db.prepare('SELECT * FROM income WHERE month=? AND year=? ORDER BY date DESC').all(month, year);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/income
router.post('/income', (req, res) => {
  try {
    const db = getDB();
    const { description, amount, category, date } = req.body;
    if (!description || !amount) return res.status(400).json({ success: false, error: 'Description and amount required' });

    const d = date ? new Date(date) : new Date();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const dateStr = d.toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO income (description, amount, category, date, month, year) VALUES (?,?,?,?,?,?)
    `).run(description, parseFloat(amount), category || 'other', dateStr, month, year);

    const row = db.prepare('SELECT * FROM income WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: row, message: 'Income logged' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/finance/income/:id
router.delete('/income/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM income WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Income entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/expenses?month=&year=
router.get('/expenses', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const rows = db.prepare('SELECT * FROM expenses WHERE month=? AND year=? ORDER BY date DESC').all(month, year);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/expenses
router.post('/expenses', (req, res) => {
  try {
    const db = getDB();
    const { description, amount, category, date } = req.body;
    if (!description || !amount) return res.status(400).json({ success: false, error: 'Description and amount required' });

    const d = date ? new Date(date) : new Date();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const dateStr = d.toISOString().split('T')[0];

    const result = db.prepare(`
      INSERT INTO expenses (description, amount, category, date, month, year) VALUES (?,?,?,?,?,?)
    `).run(description, parseFloat(amount), category || 'other', dateStr, month, year);

    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: row, message: 'Expense logged' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/finance/expenses/:id
router.delete('/expenses/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Expense entry deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/goals?month=&year=
router.get('/goals', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();
    const goals = db.prepare('SELECT * FROM monthly_goals WHERE month=? AND year=?').get(month, year);
    res.json({ success: true, data: goals || { month, year, revenue_goal: 0, profit_goal: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/finance/goals
router.post('/goals', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.body.month) || now.getMonth() + 1;
    const year = parseInt(req.body.year) || now.getFullYear();
    const { revenue_goal, profit_goal } = req.body;

    db.prepare(`
      INSERT INTO monthly_goals (month, year, revenue_goal, profit_goal)
      VALUES (?,?,?,?)
      ON CONFLICT(month, year) DO UPDATE SET revenue_goal=excluded.revenue_goal, profit_goal=excluded.profit_goal
    `).run(month, year, parseFloat(revenue_goal) || 0, parseFloat(profit_goal) || 0);

    const goals = db.prepare('SELECT * FROM monthly_goals WHERE month=? AND year=?').get(month, year);
    res.json({ success: true, data: goals, message: 'Goals saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/chart — last 6 months
router.get('/chart', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const data = months.map(({ month, year }) => {
      const rev = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM income WHERE month=? AND year=?').get(month, year).total;
      const exp = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE month=? AND year=?').get(month, year).total;
      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
      return { label: monthName, revenue: rev, expenses: exp, profit: rev - exp };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/categories?month=&year=
router.get('/categories', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();

    const incomeByCategory = db.prepare(`
      SELECT category, SUM(amount) as total FROM income WHERE month=? AND year=? GROUP BY category ORDER BY total DESC
    `).all(month, year);

    const expensesByCategory = db.prepare(`
      SELECT category, SUM(amount) as total FROM expenses WHERE month=? AND year=? GROUP BY category ORDER BY total DESC
    `).all(month, year);

    res.json({ success: true, data: { income: incomeByCategory, expenses: expensesByCategory } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/finance/export?month=&year= — CSV export
router.get('/export', (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const year = parseInt(req.query.year) || now.getFullYear();

    const income = db.prepare('SELECT * FROM income WHERE month=? AND year=? ORDER BY date').all(month, year);
    const expenses = db.prepare('SELECT * FROM expenses WHERE month=? AND year=? ORDER BY date').all(month, year);

    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    let csv = `KPG Coaching Dashboard - ${monthName}\n\n`;

    csv += 'INCOME\n';
    csv += 'Date,Description,Category,Amount\n';
    income.forEach(r => { csv += `${r.date},"${r.description}",${r.category},${r.amount}\n`; });

    const totalRev = income.reduce((s, r) => s + r.amount, 0);
    csv += `,,Total Revenue,$${totalRev.toFixed(2)}\n\n`;

    csv += 'EXPENSES\n';
    csv += 'Date,Description,Category,Amount\n';
    expenses.forEach(r => { csv += `${r.date},"${r.description}",${r.category},${r.amount}\n`; });

    const totalExp = expenses.reduce((s, r) => s + r.amount, 0);
    csv += `,,Total Expenses,$${totalExp.toFixed(2)}\n`;
    csv += `,,Net Profit,$${(totalRev - totalExp).toFixed(2)}\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="finance-${year}-${String(month).padStart(2,'0')}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
