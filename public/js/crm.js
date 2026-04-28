let allClients = [], activeStatus = '', crmSearch = '';

async function loadCRM() {
  const el = document.getElementById('section-crm');
  el.innerHTML = crmShell();
  document.getElementById('crmSearchInput').addEventListener('input', e => { crmSearch = e.target.value; renderTable(); });

  const [listRes, statsRes] = await Promise.all([
    fetch('/api/clients').then(r => r.json()),
    fetch('/api/clients/stats/summary').then(r => r.json()),
  ]);
  if (listRes.success)  allClients = listRes.data;
  if (statsRes.success) renderStats(statsRes.data);
  renderTable();
}

function crmShell() {
  return `
    <div class="section-header">
      <div class="status-chips" id="crmChips">
        ${['','active','trial','lead','paused','churned'].map(s => `
          <button class="chip ${s===''?'active':''}" data-status="${s}" onclick="crmSetStatus('${s}')">
            ${s||'All'}
          </button>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <input id="crmSearchInput" class="input-search" placeholder="Search…" style="width:180px" />
        <button class="btn btn-primary" onclick="crmOpenAdd()">+ Add Client</button>
      </div>
    </div>
    <div id="crmStats" class="crm-stat-row"></div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Client</th><th>Program</th><th>Value/mo</th><th>Source</th><th>Status</th><th>Last contact</th><th></th></tr></thead>
        <tbody id="crmTableBody"><tr><td colspan="7" class="loading-cell">Loading…</td></tr></tbody>
      </table>
    </div>
    <div class="modal-overlay" id="crmDetailPanel">
      <div class="modal modal-large">
        <div class="modal-header">
          <h2 id="detailName">Client</h2>
          <button class="modal-close" onclick="crmCloseDetail()">✕</button>
        </div>
        <div id="detailBody"></div>
      </div>
    </div>
    <div class="modal-overlay" id="crmAddModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2 id="crmFormTitle">Add Client</h2>
          <button class="modal-close" onclick="crmCloseAdd()">✕</button>
        </div>
        ${clientForm()}
      </div>
    </div>`;
}

function clientForm() {
  return `<form onsubmit="crmSubmit(event)">
    <input type="hidden" id="cfId" />
    <div class="form-grid">
      <div class="form-group"><label>Name *</label><input id="cfName" class="form-input" required /></div>
      <div class="form-group"><label>Email</label><input id="cfEmail" type="email" class="form-input" /></div>
      <div class="form-group"><label>Phone</label><input id="cfPhone" class="form-input" /></div>
      <div class="form-group"><label>Status</label>
        <select id="cfStatus" class="form-input">
          <option value="lead">Lead</option><option value="trial">Trial</option>
          <option value="active">Active</option><option value="paused">Paused</option><option value="churned">Churned</option>
        </select>
      </div>
      <div class="form-group"><label>Source</label>
        <select id="cfSource" class="form-input">
          <option value="">—</option>
          ${['Instagram','TikTok','YouTube','Typeform','Referral','Calendly','WhatsApp','Other'].map(s=>`<option>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Program</label>
        <select id="cfProgram" class="form-input">
          <option value="">—</option>
          <option value="1:1 coaching">1:1 Coaching</option>
          <option value="group program">Group Program</option>
          <option value="course">Course</option>
        </select>
      </div>
      <div class="form-group"><label>Monthly value ($)</label><input id="cfValue" type="number" class="form-input" min="0" /></div>
      <div class="form-group"><label>Start date</label><input id="cfStart" type="date" class="form-input" /></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea id="cfNotes" class="form-input" rows="2"></textarea></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline" onclick="crmCloseAdd()">Cancel</button>
      <button type="submit" class="btn btn-primary" id="crmSubmitBtn">Add Client</button>
    </div>
  </form>`;
}

function renderStats(s) {
  const el = document.getElementById('crmStats');
  if (!el) return;
  el.innerHTML = `<span class="badge badge-active">Active: ${s.active}</span>
    <span class="badge badge-trial">Trial: ${s.trials}</span>
    <span class="badge badge-lead">Leads: ${s.leads}</span>
    <span class="badge badge-churned">Churned: ${s.churned}</span>
    <span class="badge" style="background:var(--bg);border:1px solid var(--border)">MRR: $${(s.mrr||0).toLocaleString()}</span>`;
}

const STATUS_COLORS = { active:'badge-active', trial:'badge-trial', lead:'badge-lead', churned:'badge-churned', paused:'badge-paused' };
const INT_ICON = { call:'📞', whatsapp:'💬', email:'📧', note:'📝', meeting:'🤝', dm:'💌' };

function renderTable() {
  const q = crmSearch.toLowerCase();
  const rows = allClients.filter(c =>
    (!activeStatus || c.status === activeStatus) &&
    (!q || c.name.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q))
  );
  const el = document.getElementById('crmTableBody');
  if (!el) return;
  if (!rows.length) { el.innerHTML = `<tr><td colspan="7" class="loading-cell">No clients found</td></tr>`; return; }
  el.innerHTML = rows.map(c => `
    <tr onclick="crmOpenDetail(${c.id})" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="avatar">${c.avatar_initials||c.name[0]}</div>
        <div><div style="font-weight:600">${c.name}</div><div style="font-size:11px;color:var(--text-muted)">${c.email||''}</div></div>
      </div></td>
      <td>${c.program_type||'—'}</td>
      <td>${c.monthly_value ? '$'+c.monthly_value.toLocaleString() : '—'}</td>
      <td>${c.source||'—'}</td>
      <td><span class="badge ${STATUS_COLORS[c.status]||''}">${c.status}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${c.last_interaction_date||'Never'}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-sm" onclick="crmOpenEdit(${c.id})">Edit</button>
        <button class="btn btn-sm" style="color:var(--danger)" onclick="crmDelete(${c.id})">✕</button>
      </td>
    </tr>`).join('');
}

async function crmOpenDetail(id) {
  const res = await fetch(`/api/clients/${id}`).then(r => r.json());
  if (!res.success) return;
  const c = res.data;
  document.getElementById('detailName').textContent = c.name;
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;padding:20px 20px 0">
      <div><span class="field-label">Email</span><div>${c.email||'—'}</div></div>
      <div><span class="field-label">Phone</span><div>${c.phone||'—'}</div></div>
      <div><span class="field-label">Program</span><div>${c.program_type||'—'}</div></div>
      <div><span class="field-label">Monthly value</span><div>$${(c.monthly_value||0).toLocaleString()}</div></div>
      <div><span class="field-label">Total paid</span><div>$${(c.total_paid||0).toLocaleString()}</div></div>
      <div><span class="field-label">Start date</span><div>${c.start_date||'—'}</div></div>
      <div><span class="field-label">Source</span><div>${c.source||'—'}</div></div>
      <div><span class="field-label">Status</span><div><span class="badge ${STATUS_COLORS[c.status]||''}">${c.status}</span></div></div>
      ${c.notes ? `<div style="grid-column:1/-1"><span class="field-label">Notes</span><div style="font-size:13px">${c.notes}</div></div>` : ''}
    </div>
    <div style="padding:20px">
      <h3 style="margin-bottom:12px">Interaction history</h3>
      <div class="interaction-list">
        ${(c.interactions||[]).map(i => `
          <div class="activity-row">
            <span class="activity-icon">${INT_ICON[i.type]||'📝'}</span>
            <div class="activity-body">
              <div class="activity-name">${i.type} · ${i.date}</div>
              <div style="font-size:13px;color:var(--text-muted)">${i.summary||''}</div>
            </div>
            <button class="btn btn-sm" style="color:var(--danger);flex-shrink:0" onclick="crmDeleteInteraction(${i.id},${c.id})">✕</button>
          </div>`).join('')||'<div class="loading-cell">No interactions yet</div>'}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <h4 style="margin-bottom:8px">Log interaction</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="intType" class="form-input" style="width:130px">
            ${Object.keys(INT_ICON).map(t=>`<option value="${t}">${t}</option>`).join('')}
          </select>
          <input type="date" id="intDate" class="form-input" style="width:150px" value="${new Date().toISOString().split('T')[0]}" />
          <button class="btn btn-primary" onclick="crmLogInteraction(${c.id})">Log</button>
        </div>
        <textarea id="intSummary" class="form-input" rows="2" placeholder="Summary…" style="margin-top:8px;width:100%"></textarea>
      </div>
    </div>`;
  document.getElementById('crmDetailPanel').classList.add('open');
}

function crmCloseDetail() { document.getElementById('crmDetailPanel')?.classList.remove('open'); }

async function crmLogInteraction(clientId) {
  const payload = { type: document.getElementById('intType').value, date: document.getElementById('intDate').value, summary: document.getElementById('intSummary').value };
  const res = await fetch(`/api/clients/${clientId}/interactions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }).then(r=>r.json());
  if (res.success) { crmOpenDetail(clientId); }
}

async function crmDeleteInteraction(intId, clientId) {
  await fetch(`/api/clients/interactions/${intId}`, { method:'DELETE' });
  crmOpenDetail(clientId);
}

function crmSetStatus(s) {
  activeStatus = s;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.status === s));
  renderTable();
}

function crmOpenAdd() {
  document.getElementById('cfId').value = '';
  document.getElementById('crmFormTitle').textContent = 'Add Client';
  document.getElementById('crmSubmitBtn').textContent = 'Add Client';
  document.getElementById('crmAddModal').classList.add('open');
}

function crmOpenEdit(id) {
  const c = allClients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cfId').value = c.id;
  document.getElementById('crmFormTitle').textContent = 'Edit Client';
  document.getElementById('crmSubmitBtn').textContent = 'Save';
  document.getElementById('cfName').value    = c.name||'';
  document.getElementById('cfEmail').value   = c.email||'';
  document.getElementById('cfPhone').value   = c.phone||'';
  document.getElementById('cfStatus').value  = c.status||'lead';
  document.getElementById('cfSource').value  = c.source||'';
  document.getElementById('cfProgram').value = c.program_type||'';
  document.getElementById('cfValue').value   = c.monthly_value||'';
  document.getElementById('cfStart').value   = c.start_date||'';
  document.getElementById('cfNotes').value   = c.notes||'';
  document.getElementById('crmAddModal').classList.add('open');
}

function crmCloseAdd() { document.getElementById('crmAddModal')?.classList.remove('open'); }

async function crmSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('cfId').value;
  const payload = {
    name: document.getElementById('cfName').value,
    email: document.getElementById('cfEmail').value,
    phone: document.getElementById('cfPhone').value,
    status: document.getElementById('cfStatus').value,
    source: document.getElementById('cfSource').value,
    program_type: document.getElementById('cfProgram').value,
    monthly_value: document.getElementById('cfValue').value,
    start_date: document.getElementById('cfStart').value,
    notes: document.getElementById('cfNotes').value,
  };
  const res = await fetch(id ? `/api/clients/${id}` : '/api/clients', {
    method: id ? 'PUT' : 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  }).then(r => r.json());
  if (res.success) { crmCloseAdd(); loadCRM(); }
  else alert(res.error || 'Save failed');
}

async function crmDelete(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  await fetch(`/api/clients/${id}`, { method:'DELETE' });
  loadCRM();
}
