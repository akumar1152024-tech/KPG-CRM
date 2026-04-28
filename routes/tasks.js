const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/tasks/overdue/count
router.get('/overdue/count', (req, res) => {
  try {
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    const count = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status='pending' AND due_date < ?").get(today).c;
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { status, priority, category, tab } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const weekFromNow = new Date(); weekFromNow.setDate(weekFromNow.getDate() + 7);

    let query = `
      SELECT t.*, c.name as client_name, c.avatar_initials
      FROM tasks t LEFT JOIN clients c ON t.related_client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (tab === 'today') { query += ` AND t.due_date = ? AND t.status='pending'`; params.push(today); }
    else if (tab === 'overdue') { query += ` AND t.due_date < ? AND t.status='pending'`; params.push(today); }
    else if (tab === 'done') { query += ` AND t.status='done'`; }
    else if (tab === 'high') { query += ` AND t.priority IN ('high','urgent') AND t.status='pending'`; }
    else {
      if (status) { query += ' AND t.status = ?'; params.push(status); }
    }

    if (priority && !tab) { query += ' AND t.priority = ?'; params.push(priority); }
    if (category) { query += ' AND t.category = ?'; params.push(category); }

    query += ` ORDER BY
      CASE t.status WHEN 'pending' THEN 0 ELSE 1 END,
      CASE WHEN t.due_date < ? THEN 0 ELSE 1 END,
      t.due_date ASC,
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`;
    params.push(today);

    const rows = db.prepare(query).all(...params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { title, description, category, related_client_id, due_date, priority, recurring, notes } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });

    const result = db.prepare(`
      INSERT INTO tasks (title, description, category, related_client_id, due_date, priority, recurring, notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(title, description || null, category || 'admin', related_client_id || null, due_date || null, priority || 'medium', recurring || 'none', notes || null);

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: row, message: 'Task created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const { title, description, category, related_client_id, due_date, priority, status, recurring, notes } = req.body;
    db.prepare(`
      UPDATE tasks SET title=?, description=?, category=?, related_client_id=?, due_date=?,
        priority=?, status=?, recurring=?, notes=? WHERE id=?
    `).run(title, description || null, category, related_client_id || null, due_date || null, priority, status || 'pending', recurring || 'none', notes || null, req.params.id);

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: row, message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id/done
router.put('/:id/done', (req, res) => {
  try {
    const db = getDB();
    db.prepare("UPDATE tasks SET status='done' WHERE id=?").run(req.params.id);
    res.json({ success: true, message: 'Task marked as done' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/sync-calendar — stub for Google Calendar sync
router.post('/sync-calendar', async (req, res) => {
  try {
    if (!process.env.GOOGLE_CALENDAR_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.json({ success: false, message: 'Google Calendar not configured. Set GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON in .env' });
    }
    res.json({ success: true, message: 'Calendar sync not yet implemented. Configure Google Calendar credentials to enable.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
