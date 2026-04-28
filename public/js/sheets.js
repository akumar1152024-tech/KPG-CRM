const SHEET_TYPES = [
  { id: 'clients', label: 'Clients',  icon: '👥', desc: 'All client records and contact info' },
  { id: 'finance', label: 'Finance',  icon: '💰', desc: 'Income and expenses by month' },
  { id: 'leads',   label: 'Leads',    icon: '🎯', desc: 'Lead source tracking and status' },
];

async function loadSheets() {
  const el = document.getElementById('section-sheets');
  el.innerHTML = '<div class="loading-cell">Loading…</div>';
  const res = await fetch('/api/sheets/status').then(r => r.json());

  if (!res.configured) {
    el.innerHTML = `
      <div class="unconfigured-notice">
        <div style="font-size:48px;margin-bottom:16px">📊</div>
        <h3>Google Sheets Not Connected</h3>
        <p style="margin:10px 0">Add your Google credentials to sync data automatically.</p>
        <div class="webhook-url-box" style="margin:16px 0;font-family:monospace;font-size:12px;text-align:left;flex-direction:column;align-items:flex-start;gap:4px">
          <div>GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}</div>
          <div>GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id</div>
        </div>
        <p style="font-size:13px;color:var(--text-muted)">
          1. Create a Google Service Account in Google Cloud Console<br>
          2. Share your spreadsheet with the service account email<br>
          3. Add the JSON key and spreadsheet ID to <code>.env</code> and redeploy
        </p>
        <button class="btn btn-primary mt-16" onclick="sheetsSync('clients',this)">Try Sync Anyway</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="section-header">
      <div>
        <h3 style="margin:0">Google Sheets Sync</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">Data syncs automatically every night at midnight.</p>
      </div>
    </div>
    <div class="sync-cards">
      ${SHEET_TYPES.map(s => `
        <div class="sync-card">
          <div class="sync-card-icon">${s.icon}</div>
          <div class="sync-card-title">${s.label}</div>
          <div class="sync-card-desc">${s.desc}</div>
          <div class="sync-card-meta" id="sheetsMeta-${s.id}">Never synced</div>
          <button class="btn btn-primary" onclick="sheetsSync('${s.id}',this)">Sync ${s.label}</button>
        </div>`).join('')}
    </div>
    <div class="card mt-20">
      <div class="panel-header"><h3>Auto-sync Schedule</h3></div>
      <ul style="font-size:13px;color:var(--text-muted);padding-left:16px;line-height:2.2;margin:0">
        <li>Every day at midnight — full sync of all sheets</li>
        <li>Manual sync available via buttons above</li>
        <li>Data writes to separate tabs: Clients, Income, Expenses, Leads</li>
      </ul>
    </div>`;
}

async function sheetsSync(type, btn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Syncing…';
  const res = await fetch(`/api/sheets/sync-${type}`).then(r => r.json());
  btn.disabled = false; btn.textContent = orig;
  if (res.success) {
    const meta = document.getElementById(`sheetsMeta-${type}`);
    if (meta) meta.textContent = 'Last synced: just now';
    alert(res.message || 'Sync complete!');
  } else {
    alert(res.message || res.error || 'Sync failed — check Google credentials');
  }
}
