const Sheets = (() => {
  let lastSynced = { clients: null, finance: null, leads: null };

  async function load() {
    const data = await api.get('/api/sheets/status');
    const el = document.getElementById('sheetsContent');
    if (!el) return;
    const configured = data.configured;

    el.innerHTML = `
      ${!configured ? `
        <div class="unconfigured-notice" style="margin-bottom:24px">
          <div style="font-size:40px;margin-bottom:12px">📊</div>
          <h3>Google Sheets Not Connected</h3>
          <p style="margin:8px 0">Add your Google credentials to sync data automatically.</p>
          <p style="font-size:13px;margin-top:12px">Required: <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> and <code>GOOGLE_SHEETS_SPREADSHEET_ID</code></p>
          <a href="#" onclick="App.navigate('settings');return false" class="btn btn-primary mt-16">Go to Settings →</a>
        </div>` : ''}
      <div class="sync-cards">
        <div class="sync-card">
          <div class="sync-card-icon">👥</div>
          <div class="sync-card-title">Clients</div>
          <div class="sync-card-meta" id="syncClientsLastSync">Never synced</div>
          <button class="btn btn-primary" onclick="Sheets.sync('clients', this)" ${!configured?'disabled':''}>Sync Clients</button>
        </div>
        <div class="sync-card">
          <div class="sync-card-icon">💰</div>
          <div class="sync-card-title">Finance</div>
          <div class="sync-card-meta" id="syncFinanceLastSync">Never synced</div>
          <button class="btn btn-primary" onclick="Sheets.sync('finance', this)" ${!configured?'disabled':''}>Sync Finance</button>
        </div>
        <div class="sync-card">
          <div class="sync-card-icon">🎯</div>
          <div class="sync-card-title">Leads</div>
          <div class="sync-card-meta" id="syncLeadsLastSync">Never synced</div>
          <button class="btn btn-primary" onclick="Sheets.sync('leads', this)" ${!configured?'disabled':''}>Sync Leads</button>
        </div>
      </div>
      <div class="card mt-20">
        <div class="panel-header"><h3>Auto-sync Schedule</h3></div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">When configured, data syncs automatically:</p>
        <ul style="font-size:13px;color:var(--text-muted);padding-left:16px;line-height:2">
          <li>Every day at midnight — full sync of all sheets</li>
          <li>Manual sync via buttons above</li>
        </ul>
      </div>`;
  }

  async function sync(type, btn) {
    setLoadingBtn(btn, true, `Sync ${type}`);
    const data = await api.get(`/api/sheets/sync-${type}`);
    setLoadingBtn(btn, false, `Sync ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (data.success) {
      showToast(data.message, 'success');
      const el = document.getElementById(`sync${type.charAt(0).toUpperCase() + type.slice(1)}LastSync`);
      if (el) el.textContent = 'Last synced: just now';
    } else {
      showToast(data.message || data.error || 'Sync failed', 'warning');
    }
  }

  return { load, sync };
})();
