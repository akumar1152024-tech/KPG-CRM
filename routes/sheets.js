const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

router.get('/status', (req, res) => {
  res.json({ success: true, configured: isConfigured() });
});

router.get('/sync-clients', async (req, res) => {
  if (!isConfigured()) return res.json({ success: false, message: 'Google Sheets not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_SPREADSHEET_ID to .env' });
  try {
    const sheets = require('../services/google-sheets');
    const result = await sheets.syncClients();
    res.json({ success: true, message: `Clients synced to Google Sheets`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync-finance', async (req, res) => {
  if (!isConfigured()) return res.json({ success: false, message: 'Google Sheets not configured.' });
  try {
    const sheets = require('../services/google-sheets');
    const result = await sheets.syncFinance();
    res.json({ success: true, message: 'Finance synced to Google Sheets', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync-leads', async (req, res) => {
  if (!isConfigured()) return res.json({ success: false, message: 'Google Sheets not configured.' });
  try {
    const sheets = require('../services/google-sheets');
    const result = await sheets.syncLeads();
    res.json({ success: true, message: 'Leads synced to Google Sheets', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
