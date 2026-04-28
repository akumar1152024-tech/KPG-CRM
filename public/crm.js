const CRM = (() => {
  let allClients = [], detailClientId = null;

  // ─── LOAD ──────────────────────────────────────────────────────────────────
  async function load() {
    const [statsData, clientsData] = await Promise.all([
      api.get('/api/clients/stats/summary'),
      api.get('/api/clients'),
    ]);
    if (statsData.success) renderStats(statsData.data);
    if (clientsData.success) {
      allClients = clientsData.data;
      renderTable(allClients);
      updateActiveBadge(statsData.data?.active || 0);
    }
  }

  function updateActiveBadge(count) {
    const badge = document.getElementById('crmActiveBadge');
    if (badge) badge.textContent = count;
  }

  function renderStats(s) {
    document.getElementById('statActive').textContent  = `Active: ${s.active}`;
    document.getElementById('statLeads').textContent   = `Leads: ${s.leads}`;
    document.getElementById('statTrials').textContent  = `Trial: ${s.trials}`;
    document.getElementById('statChurned').textContent = `Churned: ${s.churned}`;
    document.getElementById('statMRR').textContent     = `MRR: ${fmt$(s.mrr)}`;
  }

  function renderTable(clients) {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    if (!clients.length) { tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No clients found</td></tr>`; return; }
    tbody.innerHTML = clients.map(c => {
      const lastInt = c.last_interaction_date ? fmtRelative(c.last_interaction_date) : '<span style="color:var(--danger)">Never</span>';
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="avatar-circle" style="width:30px;height:30px;font-size:11px">${c.avatar_initials || c.name[0]}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${c.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${c.email || ''}</div>
            </div>
          </div>
        </td>
        <td>${STATUS_BADGE(c.status)}</td>
        <td style="font-size:12px">${c.program_type || '—'}</td>
        <td style="font-weight:600">${c.monthly_value ? fmt$(c.monthly_value) : '—'}</td>
        <td><span class="badge badge-platform">${c.source || '—'}</span></td>
        <td style="font-size:12px">${lastInt}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${automationButtons(c)}
            <button class="btn btn-outline btn-sm" onclick="CRM.openDetail(${c.id})">View</button>
            <button class="btn btn-outline btn-sm" onclick="CRM.openEdit(${c.id})">Edit</button>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="CRM.deleteClient(${c.id},'${c.name.replace(/'/g,"\\'")}')">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function automationButtons(c) {
    const btns = [];
    if (c.status === 'lead')    btns.push(`<button class="automation-btn followup btn-sm" onclick="runAutomation('followUpLead',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Follow Up</button>`);
    if (c.status === 'lead')    btns.push(`<button class="automation-btn proposal btn-sm" onclick="runAutomation('sendProposal',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Proposal</button>`);
    if (c.status === 'lead' || c.status === 'trial') btns.push(`<button class="automation-btn onboard btn-sm" onclick="runAutomation('onboardClient',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Onboard</button>`);
    if (c.status === 'active')  btns.push(`<button class="automation-btn checkin btn-sm" onclick="runAutomation('monthlyCheckIn',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Check-in</button>`);
    if (c.status === 'active')  btns.push(`<button class="automation-btn renewal btn-sm" onclick="runAutomation('endOfProgram',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">End of Prog.</button>`);
    if (c.status === 'churned') btns.push(`<button class="automation-btn reengage btn-sm" onclick="runAutomation('reEngageChurned',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Re-engage</button>`);
    return btns.join('');
  }

  // ─── FILTERS ───────────────────────────────────────────────────────────────
  function filter() {
    const search = document.getElementById('crmSearch')?.value.toLowerCase() || '';
    const status = document.getElementById('crmFilterStatus')?.value || '';
    const source = document.getElementById('crmFilterSource')?.value || '';
    const prog   = document.getElementById('crmFilterProgram')?.value || '';
    const filtered = allClients.filter(c =>
      (!search || c.name.toLowerCase().includes(search) || (c.email||'').toLowerCase().includes(search)) &&
      (!status || c.status === status) &&
      (!source || c.source === source) &&
      (!prog   || c.program_type === prog)
    );
    renderTable(filtered);
  }

  // ─── ADD/EDIT CLIENT MODAL ─────────────────────────────────────────────────
  function openAddModal() {
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('clientId').value = '';
    document.getElementById('clientSubmitBtn').textContent = 'Add Client';
    document.getElementById('clientForm').reset();
    openModal('clientModal');
  }

  async function openEdit(id) {
    const data = await api.get(`/api/clients/${id}`);
    if (!data.success) return showToast('Failed to load client', 'error');
    const c = data.data;
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('clientId').value = c.id;
    document.getElementById('clientSubmitBtn').textContent = 'Save Changes';
    document.getElementById('clientName').value       = c.name || '';
    document.getElementById('clientEmail').value      = c.email || '';
    document.getElementById('clientPhone').value      = c.phone || '';
    document.getElementById('clientStatus').value     = c.status || 'lead';
    document.getElementById('clientSource').value     = c.source || '';
    document.getElementById('clientProgram').value    = c.program_type || '';
    document.getElementById('clientValue').value      = c.monthly_value || '';
    document.getElementById('clientTotalPaid').value  = c.total_paid || '';
    document.getElementById('clientStartDate').value  = c.start_date || '';
    document.getElementById('clientEndDate').value    = c.end_date || '';
    document.getElementById('clientTrainerize').value = c.trainerize_id || '';
    document.getElementById('clientNotes').value      = c.notes || '';
    openModal('clientModal');
  }

  async function submitClient(e) {
    e.preventDefault();
    const id = document.getElementById('clientId').value;
    const payload = {
      name: document.getElementById('clientName').value,
      email: document.getElementById('clientEmail').value,
      phone: document.getElementById('clientPhone').value,
      status: document.getElementById('clientStatus').value,
      source: document.getElementById('clientSource').value,
      program_type: document.getElementById('clientProgram').value,
      monthly_value: document.getElementById('clientValue').value,
      total_paid: document.getElementById('clientTotalPaid').value,
      start_date: document.getElementById('clientStartDate').value,
      end_date: document.getElementById('clientEndDate').value,
      trainerize_id: document.getElementById('clientTrainerize').value,
      notes: document.getElementById('clientNotes').value,
    };
    const btn = document.getElementById('clientSubmitBtn');
    setLoadingBtn(btn, true);
    const data = id ? await api.put(`/api/clients/${id}`, payload) : await api.post('/api/clients', payload);
    setLoadingBtn(btn, false, id ? 'Save Changes' : 'Add Client');
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('clientModal');
      load();
    } else {
      showToast(data.error || 'Failed to save', 'error');
    }
  }

  // ─── DELETE ────────────────────────────────────────────────────────────────
  async function deleteClient(id, name) {
    const ok = await confirmDialog(`Delete <strong>${name}</strong>? All interactions will also be deleted.`);
    if (!ok) return;
    const data = await api.delete(`/api/clients/${id}`);
    if (data.success) { showToast('Client deleted', 'success'); load(); }
    else showToast(data.error, 'error');
  }

  // ─── CLIENT DETAIL ─────────────────────────────────────────────────────────
  async function openDetail(id) {
    detailClientId = id;
    const data = await api.get(`/api/clients/${id}`);
    if (!data.success) return showToast('Failed to load client', 'error');
    const c = data.data;
    document.getElementById('detailClientName').textContent = c.name;
    document.getElementById('detailEditBtn').onclick = () => { closeModal('clientDetailModal'); openEdit(id); };

    const body = document.getElementById('clientDetailBody');
    body.innerHTML = `
      <div class="detail-field"><label>Status</label><div class="value">${STATUS_BADGE(c.status)}</div></div>
      <div class="detail-field"><label>Program</label><div class="value">${c.program_type || '—'}</div></div>
      <div class="detail-field"><label>Monthly Value</label><div class="value" style="font-weight:700;color:var(--primary)">${c.monthly_value ? fmt$(c.monthly_value) : '—'}</div></div>
      <div class="detail-field"><label>Total Paid</label><div class="value">${c.total_paid ? fmt$(c.total_paid) : '—'}</div></div>
      <div class="detail-field"><label>Source</label><div class="value">${c.source || '—'}</div></div>
      <div class="detail-field"><label>Start Date</label><div class="value">${fmtDate(c.start_date)}</div></div>
      <div class="detail-field"><label>Email</label><div class="value">${c.email || '—'}</div></div>
      <div class="detail-field"><label>Phone</label><div class="value">${c.phone || '—'}</div></div>
      ${c.trainerize_id ? `<div class="detail-field"><label>Trainerize ID</label><div class="value font-mono">${c.trainerize_id}</div></div>` : ''}
      <div class="detail-field" style="grid-column:1/-1"><label>Notes</label><div class="value" style="white-space:pre-wrap;font-size:13px">${c.notes || '—'}</div></div>
      <div class="detail-field" style="grid-column:1/-1">
        <label>Automations</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
          ${automationButtons(c)}
        </div>
      </div>
    `;

    renderInteractions(c.interactions || []);
    document.getElementById('intDate').value = new Date().toISOString().split('T')[0];
    openModal('clientDetailModal');
  }

  function renderInteractions(interactions) {
    const el = document.getElementById('interactionHistory');
    if (!el) return;
    if (!interactions.length) { el.innerHTML = '<div class="empty-state">No interactions yet</div>'; return; }
    el.innerHTML = interactions.map(i => `
      <div class="int-item">
        <div class="int-icon">${INT_ICONS[i.type] || '📝'}</div>
        <div class="int-body">
          <div class="int-meta">${i.type} · ${fmtDate(i.date)}</div>
          <div class="int-summary">${i.summary}</div>
        </div>
        <button class="int-delete" onclick="CRM.deleteInteraction(${detailClientId},${i.id})">✕</button>
      </div>`).join('');
  }

  async function addInteraction() {
    const type    = document.getElementById('intType').value;
    const summary = document.getElementById('intSummary').value.trim();
    const date    = document.getElementById('intDate').value;
    if (!summary) return showToast('Summary is required', 'warning');
    const data = await api.post(`/api/clients/${detailClientId}/interactions`, { type, summary, date });
    if (data.success) {
      showToast('Interaction logged', 'success');
      document.getElementById('intSummary').value = '';
      openDetail(detailClientId);
    } else showToast(data.error, 'error');
  }

  async function deleteInteraction(clientId, intId) {
    const ok = await confirmDialog('Delete this interaction?');
    if (!ok) return;
    await api.delete(`/api/clients/${clientId}/interactions/${intId}`);
    openDetail(clientId);
  }

  function closeDetail() { closeModal('clientDetailModal'); }

  // ─── MODAL HELPERS ─────────────────────────────────────────────────────────
  function openModal(id) { document.getElementById(id)?.classList.add('open'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

  return { load, filter, openAddModal, openEdit, submitClient, deleteClient, openDetail, addInteraction, deleteInteraction, closeModal, closeDetail };
})();
