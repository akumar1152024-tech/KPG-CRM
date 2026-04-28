const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

const STAGES = ['awareness', 'typeform_submitted', 'calendly_booked', 'proposal_sent', 'signed'];

// GET /api/pipeline
router.get('/', (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM pipeline ORDER BY updated_at DESC').all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/pipeline/stats
router.get('/stats', (req, res) => {
  try {
    const db = getDB();
    const stageStats = db.prepare(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(potential_value),0) as value
      FROM pipeline GROUP BY stage
    `).all();

    const total = db.prepare('SELECT COUNT(*) as count FROM pipeline').get().count;
    const signed = db.prepare("SELECT COUNT(*) as count FROM pipeline WHERE stage='signed'").get().count;
    const conversionRate = total > 0 ? ((signed / total) * 100).toFixed(1) : 0;

    const stageMap = {};
    for (const s of STAGES) stageMap[s] = { count: 0, value: 0 };
    for (const row of stageStats) stageMap[row.stage] = { count: row.count, value: row.value };

    res.json({ success: true, data: { stages: stageMap, total, signed, conversionRate } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/pipeline
router.post('/', (req, res) => {
  try {
    const db = getDB();
    const { name, email, phone, source, stage, notes, potential_value } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

    const result = db.prepare(`
      INSERT INTO pipeline (name, email, phone, source, stage, notes, potential_value)
      VALUES (?,?,?,?,?,?,?)
    `).run(name, email, phone, source, stage || 'awareness', notes, parseFloat(potential_value) || 0);

    const row = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, data: row, message: 'Prospect added' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/pipeline/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const { name, email, phone, source, stage, notes, potential_value } = req.body;
    const existing = db.prepare('SELECT id FROM pipeline WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Prospect not found' });

    db.prepare(`
      UPDATE pipeline SET name=?, email=?, phone=?, source=?, stage=?, notes=?, potential_value=?,
        updated_at=datetime('now') WHERE id=?
    `).run(name, email, phone, source, stage, notes, parseFloat(potential_value) || 0, req.params.id);

    const row = db.prepare('SELECT * FROM pipeline WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: row, message: 'Prospect updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/pipeline/:id/stage — quick stage update for drag-drop
router.patch('/:id/stage', (req, res) => {
  try {
    const db = getDB();
    const { stage } = req.body;
    if (!STAGES.includes(stage)) return res.status(400).json({ success: false, error: 'Invalid stage' });

    db.prepare("UPDATE pipeline SET stage=?, updated_at=datetime('now') WHERE id=?").run(stage, req.params.id);
    res.json({ success: true, message: 'Stage updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/pipeline/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM pipeline WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Prospect not found' });

    db.prepare('DELETE FROM pipeline WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Prospect deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
