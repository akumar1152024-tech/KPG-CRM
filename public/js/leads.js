let allLeads = [], leadsChart = null, leadsFilterPlat = '', leadsFilterStat = '';

async function loadLeads() {
  const el = document.getElementById('section-leads');
  el.innerHTML = `
    <div class="section-header">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="leadsSearch" class="input-search" placeholder="Search…" style="width:160px" oninput="leadsRender()" />
        <select id="leadsPlat" class="select-filter" onchange="leadsFilterPlat=this.value;leadsRender()">
          <option value="">All Platforms</option>
          ${['Instagram','TikTok','YouTube','Website','ManyChat','WhatsApp','Referral'].map(p=>`<option>${p}</option>`).join('')}
        </select>
        <select id="leadsStat" class="select-filter" onchange="leadsFilterStat=this.value;leadsRender()">
          <option value="">All Status</option>
          ${['new','contacted','qualified','converted'].map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="leadsOpenAdd()">+ Log Lead</button>
    </div>
    <div class="leads-grid">
      <div class="leads-panel">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Platform</th><th>Detail</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody id="leadsTableBody"><tr><td colspan="6" class="loading-cell">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
      <div class="leads-charts">
        <div class="chart-card"><h3>By platform</h3><canvas id="leadsDonut" height="200"></canvas></div>
        <div class="chart-card" id="convRates"><h3>Conversion rates</h3><div class="loading-cell">Loading…</div></div>
      </div>
    </div>
    <div class="modal-overlay" id="leadsModal">
      <div class="modal modal-sm">
        <div class="modal-header"><h2 id="leadsModalTitle">Log Lead</h2>
          <button class="modal-close" onclick="leadsCloseModal()">✕</button>
        </div>
        <form onsubmit="leadsSubmit(event)">
          <input type="hidden" id="leadId" />
          <div class="form-grid">
            <div class="form-group"><label>Name *</label><input id="leadName" class="form-input" required /></div>
            <div class="form-group"><label>Email</label><input id="leadEmail" type="email" class="form-input" /></div>
            <div class="form-group"><label>Platform</label>
              <select id="leadPlat" class="form-input">
                <option value="">—</option>
                ${['Instagram','TikTok','YouTube','Website','ManyChat','WhatsApp','Referral'].map(p=>`<option>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Status</label>
              <select id="leadStat" class="form-input">
                ${['new','contacted','qualified','converted'].map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Source detail</label><input id="leadDetail" class="form-input" placeholder="e.g. fat loss reel" /></div>
            <div class="form-group"><label>Date</label><input id="leadDate" type="date" class="form-input" /></div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="leadNotes" class="form-input" rows="2"></textarea></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="leadsCloseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  const res = await fetch('/api/leads').then(r => r.json());
  if (res.success) { allLeads = res.data; leadsRender(); buildLeadsChart(); }
}

const STAT_COLORS = { new:'badge-lead', contacted:'badge-trial', qualified:'badge-active', converted:'badge-active' };
const PLAT_COLORS = { Instagram:'#E1306C', TikTok:'#010101', YouTube:'#FF0000', Website:'#3b82f6', ManyChat:'#0084FF', WhatsApp:'#25D366', Referral:'#0F6E56' };

function leadsRender() {
  const q = (document.getElementById('leadsSearch')?.value || '').toLowerCase();
  const rows = allLeads.filter(l =>
    (!leadsFilterPlat || l.source_platform === leadsFilterPlat) &&
    (!leadsFilterStat || l.status === leadsFilterStat) &&
    (!q || l.name.toLowerCase().includes(q) || (l.notes||'').toLowerCase().includes(q))
  );
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(l => `
    <tr>
      <td><strong>${l.name}</strong>${l.email ? `<div style="font-size:11px;color:var(--text-muted)">${l.email}</div>` : ''}</td>
      <td><span class="badge badge-platform" style="background:${PLAT_COLORS[l.source_platform]||'#888'}20;color:${PLAT_COLORS[l.source_platform]||'#888'}">${l.source_platform||'—'}</span></td>
      <td style="font-size:12px;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.source_detail||l.notes||'—'}</td>
      <td><span class="badge ${STAT_COLORS[l.status]||''}">${l.status}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${l.date_captured||'—'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="leadsOpenEdit(${l.id})">Edit</button>
        ${l.status !== 'converted' ? `<button class="btn btn-primary btn-sm" onclick="leadsConvert(${l.id})">→ Client</button>` : ''}
        <button class="btn btn-sm" onclick="leadsMovePipeline(${l.id})" title="Move to pipeline">📊</button>
        <button class="btn btn-sm" style="color:var(--danger)" onclick="leadsDelete(${l.id})">✕</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="6" class="loading-cell">No leads found</td></tr>`;
}

function buildLeadsChart() {
  const counts = {};
  allLeads.forEach(l => { counts[l.source_platform || 'Other'] = (counts[l.source_platform || 'Other'] || 0) + 1; });
  const labels = Object.keys(counts), data = Object.values(counts);
  const ctx = document.getElementById('leadsDonut');
  if (!ctx) return;
  if (leadsChart) leadsChart.destroy();
  leadsChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map(l => PLAT_COLORS[l] || '#888') }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
  const convEl = document.getElementById('convRates');
  if (convEl) {
    const byPlat = {};
    allLeads.forEach(l => {
      const p = l.source_platform || 'Other';
      if (!byPlat[p]) byPlat[p] = { total: 0, converted: 0 };
      byPlat[p].total++;
      if (l.status === 'converted') byPlat[p].converted++;
    });
    convEl.innerHTML = `<h3>Conversion rates</h3>` + Object.entries(byPlat).map(([p, v]) => {
      const pct = v.total > 0 ? ((v.converted / v.total) * 100).toFixed(0) : 0;
      return `<div class="cat-bar-row"><div class="cat-bar-label">${p}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${PLAT_COLORS[p]||'#888'}"></div></div>
        <div class="cat-bar-val">${pct}%</div></div>`;
    }).join('');
  }
}

function leadsOpenAdd() {
  document.getElementById('leadId').value = '';
  document.getElementById('leadsModalTitle').textContent = 'Log Lead';
  document.getElementById('leadsModal').querySelector('form').reset();
  document.getElementById('leadDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('leadsModal').classList.add('open');
}
function leadsOpenEdit(id) {
  const l = allLeads.find(x => x.id === id); if (!l) return;
  document.getElementById('leadId').value    = l.id;
  document.getElementById('leadsModalTitle').textContent = 'Edit Lead';
  document.getElementById('leadName').value   = l.name || '';
  document.getElementById('leadEmail').value  = l.email || '';
  document.getElementById('leadPlat').value   = l.source_platform || '';
  document.getElementById('leadStat').value   = l.status || 'new';
  document.getElementById('leadDetail').value = l.source_detail || '';
  document.getElementById('leadDate').value   = l.date_captured || '';
  document.getElementById('leadNotes').value  = l.notes || '';
  document.getElementById('leadsModal').classList.add('open');
}
function leadsCloseModal() { document.getElementById('leadsModal')?.classList.remove('open'); }

async function leadsSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('leadId').value;
  const payload = {
    name: document.getElementById('leadName').value, email: document.getElementById('leadEmail').value,
    source_platform: document.getElementById('leadPlat').value, status: document.getElementById('leadStat').value,
    source_detail: document.getElementById('leadDetail').value, date_captured: document.getElementById('leadDate').value,
    notes: document.getElementById('leadNotes').value,
  };
  const res = await fetch(id ? `/api/leads/${id}` : '/api/leads', {
    method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  }).then(r => r.json());
  if (res.success) { leadsCloseModal(); loadLeads(); } else alert(res.error || 'Save failed');
}

async function leadsConvert(id) {
  if (!confirm('Mark this lead as converted and create/link a client record?')) return;
  const res = await fetch(`/api/leads/${id}/convert`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }).then(r => r.json());
  if (res.success) loadLeads(); else alert(res.error || 'Convert failed');
}
async function leadsMovePipeline(id) {
  const l = allLeads.find(x => x.id === id); if (!l) return;
  const res = await fetch('/api/pipeline', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name: l.name, email: l.email, source: l.source_platform, stage: 'new_lead' }),
  }).then(r => r.json());
  if (res.success) alert('Added to pipeline as New Lead'); else alert(res.error || 'Failed');
}
async function leadsDelete(id) {
  if (!confirm('Delete this lead?')) return;
  await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  loadLeads();
}
