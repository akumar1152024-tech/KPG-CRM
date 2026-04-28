let autoClients = [];

async function loadAutomations() {
  const el = document.getElementById('section-automations');
  el.innerHTML = `
    <div class="section-header">
      <div>
        <h3 style="margin:0">Automations</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">Run manually or trigger via webhooks. Requires Mailchimp to send emails.</p>
      </div>
    </div>
    <div id="autoCards" class="auto-grid"><div class="loading-cell">Loading…</div></div>
    <div class="card mt-20">
      <div class="panel-header"><h3>Run history</h3></div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Automation</th><th>Client</th><th>Ran</th><th>Steps</th><th>Status</th></tr></thead>
          <tbody id="autoLog"><tr><td colspan="5" class="loading-cell">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="modal-overlay" id="autoPickerModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2 id="autoPickerTitle">Run Automation</h2>
          <button class="modal-close" onclick="autoCloseModal()">✕</button>
        </div>
        <div style="padding:20px">
          <div class="form-group">
            <label>Select client</label>
            <select id="autoClientSel" class="form-input"></select>
          </div>
          <p style="font-size:12px;color:var(--text-muted)">This will send emails and create tasks. Ensure Mailchimp is configured.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="autoCloseModal()">Cancel</button>
          <button class="btn btn-primary" id="autoRunBtn" onclick="autoConfirmRun()">▶ Run</button>
        </div>
      </div>
    </div>`;

  const [listRes, logRes, clientRes] = await Promise.all([
    fetch('/api/automations/list').then(r => r.json()),
    fetch('/api/automations/log').then(r => r.json()),
    fetch('/api/clients').then(r => r.json()),
  ]);
  if (clientRes.success) autoClients = clientRes.data;
  if (listRes.success)   renderAutoCards(listRes.data);
  if (logRes.success)    renderAutoLog(logRes.data);
}

function renderAutoCards(automations) {
  document.getElementById('autoCards').innerHTML = automations.map(a => `
    <div class="auto-card">
      <div class="auto-card-header">
        <span class="auto-card-name">${a.name}</span>
        <span class="badge badge-platform" style="font-size:10px">${a.timesRunThisMonth}x this month</span>
      </div>
      <div class="auto-card-desc">${a.description}</div>
      <div class="auto-card-steps">${a.steps.map(s => `<div class="auto-step">✓ ${s}</div>`).join('')}</div>
      <div class="auto-card-footer">
        <span style="font-size:11px;color:var(--text-muted)">${a.triggers.join(' · ')}</span>
        <button class="btn btn-primary btn-sm" onclick="autoOpenPicker('${a.id}','${a.name}')">▶ Run</button>
      </div>
    </div>`).join('');
}

function renderAutoLog(logs) {
  const el = document.getElementById('autoLog');
  if (!logs.length) { el.innerHTML = '<tr><td colspan="5" class="loading-cell">No runs yet</td></tr>'; return; }
  el.innerHTML = logs.map(l => {
    const steps = (() => { try { return JSON.parse(l.steps_completed); } catch { return []; } })();
    return `<tr>
      <td style="font-weight:500">${l.automation_name}</td>
      <td>${l.client_name || '—'}</td>
      <td style="font-size:12px;color:var(--text-muted)">${l.run_at?.split('T')[0] || l.run_at || '—'}</td>
      <td style="font-size:12px">${steps.length} steps</td>
      <td><span class="badge ${l.status==='success'?'badge-active':'badge-churned'}">${l.status}</span></td>
    </tr>`;
  }).join('');
}

let currentAutoId = '';
function autoOpenPicker(id, name) {
  currentAutoId = id;
  document.getElementById('autoPickerTitle').textContent = `Run: ${name}`;
  document.getElementById('autoClientSel').innerHTML =
    autoClients.map(c => `<option value="${c.id}">${c.name} (${c.status})</option>`).join('');
  document.getElementById('autoPickerModal').classList.add('open');
}
function autoCloseModal() { document.getElementById('autoPickerModal')?.classList.remove('open'); }

async function autoConfirmRun() {
  const clientId = document.getElementById('autoClientSel').value;
  if (!clientId) return;
  const btn = document.getElementById('autoRunBtn');
  btn.disabled = true; btn.textContent = 'Running…';
  const res = await fetch('/api/automations/run', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ automation: currentAutoId, client_id: clientId }),
  }).then(r => r.json());
  btn.disabled = false; btn.textContent = '▶ Run';
  autoCloseModal();
  if (res.success) { alert('✅ ' + (res.message || 'Automation complete!')); loadAutomations(); }
  else alert('❌ ' + (res.error || 'Automation failed'));
}
