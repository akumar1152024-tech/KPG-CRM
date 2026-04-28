const Settings = (() => {
  async function load() {
    const data = await api.get('/api/settings');
    if (!data.success) return;
    const { settings, webhooks, connections, env } = data.data;
    const el = document.getElementById('settingsContent');
    if (!el) return;

    el.innerHTML = `
      <div class="settings-grid">
        <!-- Business Info -->
        <div class="card">
          <div class="panel-header"><h3>Business Info</h3></div>
          <form onsubmit="Settings.saveSettings(event)">
            <div class="form-group"><label>Business Name</label><input id="setBizName" class="form-input" value="${env.businessName || ''}" /></div>
            <div class="form-group"><label>Coach Name</label><input id="setCoachName" class="form-input" value="${env.coachName || ''}" /></div>
            <div class="form-group"><label>Website</label><input id="setWebsite" class="form-input" value="${env.website || ''}" /></div>
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>

        <!-- API Connections -->
        <div class="card">
          <div class="panel-header"><h3>API Connections</h3></div>
          ${Object.entries(connections).map(([key, c]) => `
            <div class="connection-row">
              <span class="connection-label">${c.label}</span>
              <div class="connection-status">
                <div class="connection-dot ${c.connected ? 'on' : 'off'}"></div>
                ${c.connected ? '<span style="color:var(--success)">Connected</span>' : '<span>Not configured</span>'}
              </div>
            </div>`).join('')}
          <p style="font-size:12px;color:var(--text-muted);margin-top:12px">Edit <code>.env</code> to connect services. Restart the server after changes.</p>
        </div>
      </div>

      <!-- Webhook URLs -->
      <div class="card mt-20">
        <div class="panel-header"><h3>Webhook URLs</h3><span style="font-size:12px;color:var(--text-muted)">Add these to Zapier / your tools</span></div>
        <div class="settings-grid">
          ${Object.entries(webhooks).map(([name, url]) => `
            <div>
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:4px">${name.replace(/_/g,' ')}</div>
              <div class="webhook-url-box">
                <span>${url}</span>
                <button class="copy-btn btn-ghost btn btn-sm" onclick="Settings.copyURL('${url}',this)">Copy</button>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Data Management -->
      <div class="card mt-20">
        <div class="panel-header"><h3>Data Management</h3></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a href="/api/settings/export-db" class="btn btn-outline">⬇ Export Full DB (JSON)</a>
          <button class="btn btn-danger" onclick="Settings.clearSampleData()">🗑 Clear Sample Data</button>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Export creates a JSON backup of all data. Clear removes all rows so you can start fresh.</p>
      </div>

      <!-- Webhook Log -->
      <div class="card mt-20">
        <div class="panel-header">
          <h3>Recent Webhooks (last 50)</h3>
          <button class="btn btn-outline btn-sm" onclick="Settings.refreshLog()">Refresh</button>
        </div>
        <div id="webhookLogContainer"><div class="loading-cell">Loading…</div></div>
      </div>`;

    loadWebhookLog();
  }

  async function saveSettings(e) {
    e.preventDefault();
    const data = await api.post('/api/settings', {
      settings: {
        business_name: document.getElementById('setBizName')?.value,
        coach_name:    document.getElementById('setCoachName')?.value,
        website:       document.getElementById('setWebsite')?.value,
      }
    });
    if (data.success) showToast('Settings saved', 'success');
    else showToast(data.error, 'error');
  }

  async function loadWebhookLog() {
    const data = await api.get('/api/settings/webhooks-log');
    const el = document.getElementById('webhookLogContainer');
    if (!el) return;
    if (!data.success || !data.data.length) { el.innerHTML = '<div class="loading-cell">No webhooks received yet</div>'; return; }
    el.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Endpoint</th><th>Status</th><th>Received</th><th>Payload Preview</th></tr></thead><tbody>
      ${data.data.map(w => `<tr>
        <td><code style="font-size:12px">${w.endpoint}</code></td>
        <td>${STATUS_BADGE(w.status || 'received')}</td>
        <td style="font-size:12px;color:var(--text-muted)">${fmtAgo(w.created_at)}</td>
        <td style="font-size:11px;color:var(--text-muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.payload?.substring(0,80)}…</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  function refreshLog() { loadWebhookLog(); }

  function copyURL(url, btn) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.color = 'var(--success)';
      setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
    }).catch(() => showToast('Copy failed', 'error'));
  }

  async function clearSampleData() {
    const ok = await confirmDialog('⚠️ This will permanently delete ALL data. Are you sure?');
    if (!ok) return;
    const ok2 = await confirmDialog('Last warning — this cannot be undone. Delete everything?');
    if (!ok2) return;
    const data = await api.post('/api/settings/clear-sample-data');
    if (data.success) { showToast(data.message, 'success'); App.navigate('dashboard'); }
    else showToast(data.error, 'error');
  }

  return { load, saveSettings, refreshLog, copyURL, clearSampleData };
})();
