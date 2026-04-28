const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// GET /api/clients/stats/summary
router.get('/stats/summary', (req, res) => {
  try {
    const db = getDB();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status='lead' THEN 1 ELSE 0 END) as leads,
        SUM(CASE WHEN status='trial' THEN 1 ELSE 0 END) as trials,
        SUM(CASE WHEN status='churned' THEN 1 ELSE 0 END) as churned,
        SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END) as paused,
        SUM(CASE WHEN status='active' THEN monthly_value ELSE 0 END) as mrr
      FROM clients
    `).get();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const { status, source, program_type, search } = req.query;
    let query = `
      SELECT c.*,
        MAX(i.date) as last_interaction_date,
        (SELECT i2.summary FROM interactions i2 WHERE i2.client_id = c.id ORDER BY i2.date DESC, i2.created_at DESC LIMIT 1) as last_interaction_summary
      FROM clients c
      LEFT JOIN interactions i ON c.id = i.client_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { query += ' AND c.status = ?'; params.push(status); }
    if (source) { query += ' AND c.source = ?'; params.push(source); }
    if (program_type) { query += ' AND c.program_type = ?'; params.push(program_type); }
    if (search) { query += ' AND (c.name LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' GROUP BY c.id ORDER BY c.created_at DESC';
    const clients = db.prepare(query).all(...params);
    res.json({ success: true, data: clients });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDB();
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
    const interactions = db.prepare('SELECT * FROM interactions WHERE client_id = ? ORDER BY date DESC, created_at DESC').all(req.params.id);
    res.json({ success: true, data: { ...client, interactions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/clients
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { name, email, phone, status, source, program_type, monthly_value, start_date, end_date, notes, tags, trainerize_id } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const result = db.prepare(`
      INSERT INTO clients (name, email, phone, status, source, program_type, monthly_value, start_date, end_date, notes, tags, avatar_initials, trainerize_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email || null, phone || null, status || 'lead', source || null, program_type || null,
        parseFloat(monthly_value) || 0, start_date || null, end_date || null, notes || null,
        tags ? JSON.stringify(tags) : '[]', initials, trainerize_id || null);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: client, message: 'Client added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, error: 'Email already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client not found' });

    const { name, email, phone, status, source, program_type, monthly_value, total_paid, start_date, end_date, notes, tags, trainerize_id } = req.body;
    const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : null;

    db.prepare(`
      UPDATE clients SET name=?, email=?, phone=?, status=?, source=?, program_type=?,
        monthly_value=?, total_paid=?, start_date=?, end_date=?, notes=?, tags=?,
        avatar_initials=COALESCE(?, avatar_initials), trainerize_id=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(name, email || null, phone || null, status, source, program_type,
        parseFloat(monthly_value) || 0, parseFloat(total_paid) || 0,
        start_date || null, end_date || null, notes || null,
        tags ? JSON.stringify(tags) : '[]', initials, trainerize_id || null, req.params.id);

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: client, message: 'Client updated' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, error: 'Email already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client not found' });
    db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/:id/interactions
router.get('/:id/interactions', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM interactions WHERE client_id = ? ORDER BY date DESC, created_at DESC').all(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/clients/:id/interactions
router.post('/:id/interactions', (req, res) => {
  try {
    const db = getDB();
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const { type, summary, date } = req.body;
    if (!summary) return res.status(400).json({ success: false, error: 'Summary is required' });

    const result = db.prepare('INSERT INTO interactions (client_id, type, summary, date) VALUES (?, ?, ?, ?)')
      .run(req.params.id, type || 'note', summary, date || new Date().toISOString().split('T')[0]);

    const interaction = db.prepare('SELECT * FROM interactions WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: interaction, message: 'Interaction logged' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/clients/:cid/interactions/:iid
router.delete('/:cid/interactions/:iid', (req, res) => {
  try {
    const db = getDB();
    db.prepare('DELETE FROM interactions WHERE id = ? AND client_id = ?').run(req.params.iid, req.params.cid);
    res.json({ success: true, message: 'Interaction deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/clients/bulk/export
router.post('/bulk/export', (req, res) => {
  try {
    const db = getDB();
    const { ids } = req.body;
    let clients;
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      clients = db.prepare(`SELECT * FROM clients WHERE id IN (${placeholders})`).all(...ids);
    } else {
      clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
    }

    const headers = ['id','name','email','phone','status','source','program_type','monthly_value','total_paid','start_date','notes'];
    let csv = headers.join(',') + '\n';
    clients.forEach(c => {
      csv += headers.map(h => `"${(c[h] || '').toString().replace(/"/g, '""')}"`).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
