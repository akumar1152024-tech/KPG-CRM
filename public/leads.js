const Leads = (() => {
  let allLeads = [], convertLeadId = null, leadsChart = null;

  async function load() {
    const [leadsData, statsData] = await Promise.all([
      api.get('/api/leads'),
      api.get('/api/leads/stats'),
    ]);
    if (leadsData.success) { allLeads = leadsData.data; renderTable(allLeads); }
    if (statsData.success) { renderCharts(statsData.data); renderConvRates(statsData.data.byPlatform); }
  }

  function renderTable(leads) {
    const tbody = document.getElementById('leadsTableBody');
    if (!tbody) return;
    if (!leads.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No leads found</td></tr>'; return; }
    tbody.innerHTML = leads.map(l => `
      <tr>
        <td>
          <div style="font-weight:600;font-size:13px">${l.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${l.email || ''}</div>
        </td>
        <td><span class="badge badge-platform">${l.source_platform || '—'}</span></td>
        <td style="font-size:12px;color:var(--text-muted)">${l.source_detail || '—'}</td>
        <td>${STATUS_BADGE(l.status)}</td>
        <td style="font-size:12px">${fmtDate(l.date_captured?.split('T')[0] || l.date_captured)}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${l.status !== 'converted' ? `<button class="btn btn-primary btn-sm" onclick="Leads.openConvert(${l.id})">Convert</button>` : `<span style="font-size:12px;color:var(--success)">✓ ${l.client_name || 'Converted'}</span>`}
            <button class="btn btn-outline btn-sm" onclick="Leads.openEdit(${l.id})">Edit</button>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="Leads.deleteLead(${l.id},'${l.name.replace(/'/g,"\\'")}')">✕</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function renderCharts(stats) {
    const canvas = document.getElementById('leadsDonutChart');
    if (!canvas || !stats.byPlatform?.length) return;
    if (leadsChart) { leadsChart.destroy(); leadsChart = null; }
    const colors = ['#0F6E56','#1565C0','#7c3aed','#BA7517','#E24B4A','#3B6D11','#868e96'];
    leadsChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: stats.byPlatform.map(p => p.source_platform),
        datasets: [{ data: stats.byPlatform.map(p => p.total), backgroundColor: colors, borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
  }

  function renderConvRates(platforms) {
    const el = document.getElementById('conversionRates');
    if (!el || !platforms?.length) return;
    el.innerHTML = `<table class="conv-table" style="width:100%">
      <tr><th style="text-align:left;font-size:11px;color:var(--text-muted);padding:4px 8px">Platform</th><th style="text-align:right;font-size:11px;color:var(--text-muted);padding:4px 8px">Leads</th><th style="text-align:right;font-size:11px;color:var(--text-muted);padding:4px 8px">Conv.</th></tr>
      ${platforms.map(p => {
        const rate = p.total > 0 ? (p.converted / p.total * 100).toFixed(0) : 0;
        return `<tr>
          <td style="padding:5px 8px;font-size:13px">${p.source_platform || '—'}</td>
          <td style="padding:5px 8px;text-align:right;font-size:13px">${p.total}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:600;color:${rate > 10 ? 'var(--success)' : 'var(--text-muted)'}">${rate}%</td>
        </tr>`;
      }).join('')}
    </table>`;
  }

  function filter() {
    const search   = document.getElementById('leadsSearch')?.value.toLowerCase() || '';
    const platform = document.getElementById('leadsFilterPlatform')?.value || '';
    const status   = document.getElementById('leadsFilterStatus')?.value || '';
    renderTable(allLeads.filter(l =>
      (!search   || l.name.toLowerCase().includes(search) || (l.email||'').toLowerCase().includes(search)) &&
      (!platform || l.source_platform === platform) &&
      (!status   || l.status === status)
    ));
  }

  function openAddModal() {
    document.getElementById('leadsModalTitle').textContent = 'Log Lead';
    document.getElementById('leadId').value = '';
    document.getElementById('leadSubmitBtn').textContent = 'Log Lead';
    document.getElementById('leadsForm').reset();
    document.getElementById('leadDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('leadsModal')?.classList.add('open');
  }

  async function openEdit(id) {
    const l = allLeads.find(l => l.id === id);
    if (!l) return;
    document.getElementById('leadsModalTitle').textContent = 'Edit Lead';
    document.getElementById('leadId').value           = l.id;
    document.getElementById('leadSubmitBtn').textContent = 'Save';
    document.getElementById('leadName').value         = l.name || '';
    document.getElementById('leadEmail').value        = l.email || '';
    document.getElementById('leadPlatform').value     = l.source_platform || '';
    document.getElementById('leadSourceDetail').value = l.source_detail || '';
    document.getElementById('leadStatus').value       = l.status || 'new';
    document.getElementById('leadDate').value         = l.date_captured?.split('T')[0] || '';
    document.getElementById('leadNotes').value        = l.notes || '';
    document.getElementById('leadsModal')?.classList.add('open');
  }

  async function submitLead(e) {
    e.preventDefault();
    const id = document.getElementById('leadId').value;
    const payload = {
      name:          document.getElementById('leadName').value,
      email:         document.getElementById('leadEmail').value,
      source_platform: document.getElementById('leadPlatform').value,
      source_detail: document.getElementById('leadSourceDetail').value,
      status:        document.getElementById('leadStatus').value,
      date_captured: document.getElementById('leadDate').value,
      notes:         document.getElementById('leadNotes').value,
    };
    const data = id ? await api.put(`/api/leads/${id}`, payload) : await api.post('/api/leads', payload);
    if (data.success) { showToast(data.message, 'success'); closeModal('leadsModal'); load(); }
    else showToast(data.error || 'Failed to save', 'error');
  }

  async function deleteLead(id, name) {
    const ok = await confirmDialog(`Delete lead <strong>${name}</strong>?`);
    if (!ok) return;
    const data = await api.delete(`/api/leads/${id}`);
    if (data.success) { showToast('Lead deleted', 'success'); load(); }
    else showToast(data.error, 'error');
  }

  async function openConvert(id) {
    convertLeadId = id;
    const clients = await api.get('/api/leads/clients-list');
    const sel = document.getElementById('convertClientSelect');
    if (!sel) return;
    if (clients.success) {
      sel.innerHTML = `<option value="">-- Create new client --</option>` +
        clients.data.map(c => `<option value="${c.id}">${c.name} (${c.email || 'no email'})</option>`).join('');
    }
    document.getElementById('convertModal')?.classList.add('open');
  }

  async function confirmConvert() {
    const clientId = document.getElementById('convertClientSelect').value;
    if (!clientId) {
      showToast('Please select an existing client to link to', 'warning');
      return;
    }
    const data = await api.post(`/api/leads/${convertLeadId}/convert`, { client_id: clientId });
    if (data.success) { showToast('Lead converted!', 'success'); closeConvertModal(); load(); }
    else showToast(data.error, 'error');
  }

  function closeConvertModal() { document.getElementById('convertModal')?.classList.remove('open'); convertLeadId = null; }
  function closeModal(id)      { document.getElementById(id)?.classList.remove('open'); }

  return { load, filter, openAddModal, openEdit, submitLead, deleteLead, openConvert, confirmConvert, closeConvertModal, closeModal };
})();
