async function loadSettings() {
  const el = document.getElementById('section-settings');
  el.innerHTML = '<div class="loading-cell">Loading…</div>';
  const res = await fetch('/api/settings').then(r => r.json());
  if (!res.success) { el.innerHTML = '<div class="loading-cell">Failed to load settings</div>'; return; }
  const { settings: s, webhooks, connections } = res.data;
  const base = window.location.origin;

  el.innerHTML = `
    <div class="settings-grid">

      <div class="card">
        <div class="panel-header"><h3>Business Info</h3></div>
        <form onsubmit="settingsSave(event)">
          <div class="form-group"><label>Business name</label>
            <input id="setBiz" class="form-input" value="${s.business_name||''}" /></div>
          <div class="form-group"><label>Coach name</label>
            <input id="setCoach" class="form-input" value="${s.coach_name||''}" /></div>
          <div class="form-group"><label>Website</label>
            <input id="setWeb" class="form-input" value="${s.website||''}" /></div>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
      </div>

      <div class="card">
        <div class="panel-header"><h3>API Connections</h3></div>
        ${Object.entries(connections).map(([, c]) => `
          <div class="connection-row">
            <span>${c.label}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <div class="conn-dot ${c.connected?'on':'off'}"></div>
              <span style="font-size:12px;color:${c.connected?'var(--success)':'var(--text-muted)'}">${c.connected?'Connected':'Not configured'}</span>
            </div>
          </div>`).join('')}
        <p style="font-size:11px;color:var(--text-muted);margin-top:12px">Edit <code>.env</code> and redeploy to connect services.</p>
      </div>
    </div>

    <div class="card mt-20">
      <div class="panel-header">
        <h3>Webhook URLs</h3>
        <span style="font-size:12px;color:var(--text-muted)">Paste these into Zapier / your tools</span>
      </div>
      <div class="settings-grid">
        ${Object.entries(webhooks).filter(([k]) => k !== 'test').map(([name, url]) => {
          const liveUrl = url.replace('http://localhost:3000', base);
          return `
          <div>
            <div class="field-label">${name.replace(/_/g,' ')}</div>
            <div class="webhook-url-box">
              <span style="font-size:12px;word-break:break-all">${liveUrl}</span>
              <button class="btn btn-sm btn-outline" onclick="settingsCopy('${liveUrl}',this)">Copy</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card mt-20">
      <div class="panel-header"><h3>Data Management</h3></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="/api/settings/export-db" class="btn btn-outline" target="_blank">⬇ Export Full DB (JSON)</a>
        <button class="btn btn-danger" onclick="settingsClearData()">🗑 Clear All Data</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Export creates a full JSON backup. Clear removes all rows so you can start fresh.</p>
    </div>`;
}

async function settingsSave(e) {
  e.preventDefault();
  const pairs = [
    ['business_name', document.getElementById('setBiz').value],
    ['coach_name',    document.getElementById('setCoach').value],
    ['website',       document.getElementById('setWeb').value],
  ];
  await Promise.all(pairs.map(([key, value]) =>
    fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, value }) })
  ));
  alert('Settings saved');
}

function settingsCopy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied'; btn.style.color = 'var(--success)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  }).catch(() => alert('Copy failed'));
}

async function settingsClearData() {
  if (!confirm('⚠️ This permanently deletes ALL data. Are you sure?')) return;
  if (!confirm('Last warning — this cannot be undone. Delete everything?')) return;
  const res = await fetch('/api/settings/clear-sample-data', { method:'POST' }).then(r => r.json());
  if (res.success) { alert(res.message || 'Cleared'); navigate('dashboard'); }
  else alert(res.error || 'Failed');
}
