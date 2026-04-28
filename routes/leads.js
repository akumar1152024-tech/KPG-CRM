const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/leads
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { platform, status, search } = req.query;
    let query = 'SELECT l.*, c.name as client_name FROM leads l LEFT JOIN clients c ON l.client_id = c.id WHERE 1=1';
    const params = [];

    if (platform) { query += ' AND l.source_platform = ?'; params.push(platform); }
    if (status) { query += ' AND l.status = ?'; params.push(status); }
    if (search) { query += ' AND l.name LIKE ?'; params.push(`%${search}%`); }

    query += ' ORDER BY l.date_captured DESC';
    const rows = db.prepare(query).all(...params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/stats
router.get('/stats', (req, res) => {
  try {
    const db = getDB();

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const byPlatform = db.prepare(`
      SELECT source_platform,
        COUNT(*) as total,
        SUM(CASE WHEN status='converted' THEN 1 ELSE 0 END) as converted
      FROM leads
      GROUP BY source_platform
      ORDER BY total DESC
    `).all();

    const topThisMonth = db.prepare(`
      SELECT source_platform, COUNT(*) as count FROM leads
      WHERE strftime('%m', date_captured) = ? AND strftime('%Y', date_captured) = ?
      GROUP BY source_platform ORDER BY count DESC LIMIT 1
    `).get(String(month).padStart(2, '0'), String(year));

    res.json({ success: true, data: { byPlatform, topThisMonth } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/clients-list — for convert dropdown
router.get('/clients-list', (req, res) => {
  try {
    const db = getDB();
    const clients = db.prepare("SELECT id, name, email FROM clients WHERE status != 'churned' ORDER BY name").all();
    res.json({ success: true, data: clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { name, email, source_platform, source_detail, status, date_captured, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO leads (name, email, source_platform, source_detail, status, date_captured, notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(name, email, source_platform, source_detail, status || 'new', date_captured || new Date().toISOString().split('T')[0], notes);

    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: row, message: 'Lead logged' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leads/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const { name, email, source_platform, source_detail, status, date_captured, notes, client_id } = req.body;
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });

    db.prepare(`
      UPDATE leads SET name=?, email=?, source_platform=?, source_detail=?, status=?,
        date_captured=?, notes=?, client_id=? WHERE id=?
    `).run(name, email, source_platform, source_detail, status, date_captured, notes, client_id || null, req.params.id);

    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: row, message: 'Lead updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/convert — link lead to client
router.post('/:id/convert', (req, res) => {
  try {
    const db = getDB();
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ success: false, error: 'client_id required' });

    const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    db.prepare("UPDATE leads SET status='converted', client_id=? WHERE id=?").run(client_id, req.params.id);
    res.json({ success: true, message: 'Lead converted to client' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
