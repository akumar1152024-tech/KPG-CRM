const { getDB } = require('../database');

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
}

async function getAuth() {
  const { google } = require('googleapis');
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

async function writeSheet(tabName, headers, rows) {
  const { google } = require('googleapis');
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  // Try to find or create the sheet tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === tabName);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
  }

  // Clear + write
  const range = `${tabName}!A1`;
  const values = [headers, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
  });

  return { rows: rows.length };
}

async function syncClients() {
  if (!isConfigured()) throw new Error('Google Sheets not configured');
  const db = getDB();
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  const headers = ['ID', 'Name', 'Email', 'Phone', 'Status', 'Source', 'Program', 'Monthly Value', 'Total Paid', 'Start Date', 'Notes', 'Created'];
  const rows = clients.map(c => [c.id, c.name, c.email||'', c.phone||'', c.status, c.source||'', c.program_type||'', c.monthly_value, c.total_paid, c.start_date||'', c.notes||'', c.created_at]);
  return writeSheet('Clients', headers, rows);
}

async function syncFinance() {
  if (!isConfigured()) throw new Error('Google Sheets not configured');
  const db = getDB();
  const income = db.prepare('SELECT * FROM income ORDER BY date DESC').all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC').all();

  const iHeaders = ['ID', 'Date', 'Description', 'Category', 'Amount', 'Client ID', 'Created'];
  const iRows = income.map(r => [r.id, r.date, r.description, r.category, r.amount, r.client_id||'', r.created_at]);
  await writeSheet('Income', iHeaders, iRows);

  const eHeaders = ['ID', 'Date', 'Description', 'Category', 'Amount', 'Recurring', 'Created'];
  const eRows = expenses.map(r => [r.id, r.date, r.description, r.category, r.amount, r.recurring ? 'Yes' : 'No', r.created_at]);
  return writeSheet('Expenses', eHeaders, eRows);
}

async function syncLeads() {
  if (!isConfigured()) throw new Error('Google Sheets not configured');
  const db = getDB();
  const leads = db.prepare('SELECT * FROM leads ORDER BY date_captured DESC').all();
  const headers = ['ID', 'Name', 'Email', 'Phone', 'Platform', 'Source Detail', 'Status', 'Date Captured', 'Notes'];
  const rows = leads.map(l => [l.id, l.name, l.email||'', l.phone||'', l.source_platform||'', l.source_detail||'', l.status, l.date_captured||'', l.notes||'']);
  return writeSheet('Leads', headers, rows);
}

module.exports = { syncClients, syncFinance, syncLeads, isConfigured };
