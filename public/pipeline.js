const Pipeline = (() => {
  const STAGES = [
    { id: 'new_lead',           label: 'New Lead',            color: '#868e96' },
    { id: 'typeform_submitted', label: 'Typeform Submitted',  color: '#1565C0' },
    { id: 'calendly_booked',    label: 'Calendly Booked',     color: '#7c3aed' },
    { id: 'proposal_sent',      label: 'Proposal Sent',       color: '#BA7517' },
    { id: 'signed',             label: 'Signed ✓',            color: '#3B6D11' },
    { id: 'lost',               label: 'Lost',                color: '#E24B4A' },
  ];

  let allProspects = [], dragId = null;

  async function load() {
    const [pipeData, statsData] = await Promise.all([
      api.get('/api/pipeline'),
      api.get('/api/pipeline/stats'),
    ]);
    if (pipeData.success) allProspects = pipeData.data;
    if (statsData.success) renderStats(statsData.data);
    renderBoard(allProspects);
  }

  function renderStats(s) {
    const totalValue = Object.values(s.stages).reduce((sum, st) => sum + (st.value || 0), 0);
    const el1 = document.getElementById('pipelineTotalValue');
    const el2 = document.getElementById('pipelineConvRate');
    if (el1) el1.textContent = fmt$(totalValue);
    if (el2) el2.textContent = fmtPct(s.conversionRate);
  }

  function renderBoard(prospects) {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;
    const byStage = {};
    STAGES.forEach(s => byStage[s.id] = []);
    prospects.forEach(p => { if (byStage[p.stage]) byStage[p.stage].push(p); });

    board.innerHTML = STAGES.map(stage => {
      const cards = byStage[stage.id];
      const totalVal = cards.reduce((s, p) => s + (p.potential_value || 0), 0);
      return `
        <div class="kanban-col" id="col-${stage.id}">
          <div class="kanban-col-header" style="border-top:3px solid ${stage.color}">
            <div class="kanban-col-title">${stage.label}</div>
            <div class="kanban-col-meta">${cards.length} prospect${cards.length !== 1 ? 's' : ''} · ${fmt$(totalVal)}</div>
          </div>
          <div class="kanban-cards" id="cards-${stage.id}"
            ondragover="Pipeline.dragOver(event)"
            ondrop="Pipeline.drop(event,'${stage.id}')"
            ondragenter="Pipeline.dragEnter(event)">
            ${cards.map(p => renderCard(p)).join('')}
          </div>
          <div class="kanban-footer">
            <span style="font-weight:600;color:${stage.color}">${fmt$(totalVal)}</span>
            <button class="btn btn-ghost btn-sm" onclick="Pipeline.openAddModal('${stage.id}')">+</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderCard(p) {
    const daysInStage = Math.floor((Date.now() - new Date(p.updated_at || p.created_at)) / 86400000);
    const ageClass = daysInStage < 7 ? 'green' : daysInStage < 14 ? 'amber' : 'red';
    return `
      <div class="kanban-card" draggable="true"
        ondragstart="Pipeline.dragStart(event,${p.id})"
        ondragend="Pipeline.dragEnd(event)">
        <div class="kanban-card-name">${p.name}</div>
        <div class="kanban-card-meta">
          ${p.source ? `<span class="badge badge-platform" style="font-size:10px">${p.source}</span>` : ''}
          <span class="kanban-card-days ${ageClass}">${daysInStage}d</span>
        </div>
        <div class="kanban-card-value">${p.potential_value ? fmt$(p.potential_value) : 'No value set'}</div>
        <div class="kanban-card-actions">
          ${p.stage === 'typeform_submitted' || p.stage === 'calendly_booked' ?
            `<button class="automation-btn proposal" style="font-size:11px;padding:3px 8px" onclick="runAutomation('sendProposal',${p.id},'${p.name.replace(/'/g,"\\'")}',this)">Proposal</button>` : ''}
          ${p.stage === 'proposal_sent' ?
            `<button class="automation-btn onboard" style="font-size:11px;padding:3px 8px" onclick="runAutomation('onboardClient',${p.id},'${p.name.replace(/'/g,"\\'")}',this)">Onboard</button>` : ''}
          <button class="automation-btn followup" style="font-size:11px;padding:3px 8px" onclick="runAutomation('followUpLead',${p.id},'${p.name.replace(/'/g,"\\'")}',this)">Follow Up</button>
          <button class="btn btn-outline btn-sm" style="font-size:11px;padding:3px 8px" onclick="Pipeline.openEdit(${p.id})">Edit</button>
          <button class="btn btn-sm" style="color:var(--danger);font-size:11px;padding:3px 8px" onclick="Pipeline.deleteProspect(${p.id},'${p.name.replace(/'/g,"\\'")}')">✕</button>
        </div>
      </div>`;
  }

  // ─── DRAG AND DROP ─────────────────────────────────────────────────────────
  function dragStart(e, id) { dragId = id; e.currentTarget.classList.add('dragging'); }
  function dragEnd(e)       { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over')); }
  function dragOver(e)      { e.preventDefault(); }
  function dragEnter(e)     { e.currentTarget.classList.add('drag-over'); }

  async function drop(e, stage) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!dragId) return;
    const data = await api.patch(`/api/pipeline/${dragId}/stage`, { stage });
    if (data.success) { showToast(`Moved to ${stage.replace(/_/g,' ')}`, 'success'); load(); }
    else showToast('Failed to update stage', 'error');
    dragId = null;
  }

  // ─── ADD / EDIT MODAL ──────────────────────────────────────────────────────
  function openAddModal(preStage = 'new_lead') {
    document.getElementById('pipelineModalTitle').textContent = 'Add Prospect';
    document.getElementById('prospectId').value = '';
    document.getElementById('prospectSubmitBtn').textContent = 'Add Prospect';
    document.getElementById('pipelineForm').reset();
    document.getElementById('prospectStage').value = preStage;
    document.getElementById('pipelineModal')?.classList.add('open');
  }

  async function openEdit(id) {
    const p = allProspects.find(p => p.id === id);
    if (!p) return;
    document.getElementById('pipelineModalTitle').textContent = 'Edit Prospect';
    document.getElementById('prospectId').value      = p.id;
    document.getElementById('prospectSubmitBtn').textContent = 'Save Changes';
    document.getElementById('prospectName').value    = p.name || '';
    document.getElementById('prospectEmail').value   = p.email || '';
    document.getElementById('prospectPhone').value   = p.phone || '';
    document.getElementById('prospectSource').value  = p.source || '';
    document.getElementById('prospectStage').value   = p.stage || 'new_lead';
    document.getElementById('prospectValue').value   = p.potential_value || '';
    document.getElementById('prospectNotes').value   = p.notes || '';
    document.getElementById('pipelineModal')?.classList.add('open');
  }

  async function submitProspect(e) {
    e.preventDefault();
    const id = document.getElementById('prospectId').value;
    const payload = {
      name: document.getElementById('prospectName').value,
      email: document.getElementById('prospectEmail').value,
      phone: document.getElementById('prospectPhone').value,
      source: document.getElementById('prospectSource').value,
      stage: document.getElementById('prospectStage').value,
      potential_value: document.getElementById('prospectValue').value,
      notes: document.getElementById('prospectNotes').value,
    };
    const data = id ? await api.put(`/api/pipeline/${id}`, payload) : await api.post('/api/pipeline', payload);
    if (data.success) {
      showToast(data.message, 'success');
      closeModal('pipelineModal');
      load();
    } else showToast(data.error || 'Failed to save', 'error');
  }

  async function deleteProspect(id, name) {
    const ok = await confirmDialog(`Delete <strong>${name}</strong> from pipeline?`);
    if (!ok) return;
    const data = await api.delete(`/api/pipeline/${id}`);
    if (data.success) { showToast('Prospect deleted', 'success'); load(); }
    else showToast(data.error, 'error');
  }

  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

  return { load, dragStart, dragEnd, dragOver, dragEnter, drop, openAddModal, openEdit, submitProspect, deleteProspect, closeModal };
})();
