const STAGES = [
  { id: 'new_lead',           label: 'New Lead',           color: '#868e96' },
  { id: 'typeform_submitted', label: 'Typeform Submitted', color: '#A8B4C0' },
  { id: 'calendly_booked',   label: 'Calendly Booked',    color: '#C9A84C' },
  { id: 'proposal_sent',     label: 'Proposal Sent',       color: '#E8C96B' },
  { id: 'signed',            label: 'Signed ✓',            color: '#C9A84C' },
  { id: 'lost',              label: 'Lost',                color: '#E24B4A' },
];

let pipeProspects = [], dragId = null;

async function loadPipeline() {
  const el = document.getElementById('section-pipeline');
  el.innerHTML = `
    <div class="section-header">
      <div style="display:flex;gap:16px;font-size:13px;color:var(--text-muted)">
        <span>Total value: <strong id="pipeTotalVal">—</strong></span>
        <span>Conv. rate: <strong id="pipeConvRate">—</strong></span>
      </div>
      <button class="btn btn-primary" onclick="pipeOpenAdd()">+ Add Prospect</button>
    </div>
    <div class="kanban-board" id="kanbanBoard"></div>

    <!-- Edit modal -->
    <div class="modal-overlay" id="pipeModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2 id="pipeModalTitle">Add Prospect</h2>
          <button class="modal-close" onclick="pipeCloseModal()">✕</button>
        </div>
        <form onsubmit="pipeSubmit(event)">
          <input type="hidden" id="pipeId" />
          <div class="form-grid">
            <div class="form-group"><label>Name *</label><input id="pipeName" class="form-input" required /></div>
            <div class="form-group"><label>Email</label><input id="pipeEmail" type="email" class="form-input" /></div>
            <div class="form-group"><label>Phone</label><input id="pipePhone" class="form-input" /></div>
            <div class="form-group"><label>Source</label><input id="pipeSource" class="form-input" placeholder="Instagram, Referral…" /></div>
            <div class="form-group"><label>Stage</label>
              <select id="pipeStage" class="form-input">
                ${STAGES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Potential value ($)</label><input id="pipeValue" type="number" class="form-input" min="0" /></div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="pipeNotes" class="form-input" rows="2"></textarea></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="pipeCloseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="pipeSubmitBtn">Add</button>
          </div>
        </form>
      </div>
    </div>

    <!-- AI advice modal -->
    <div class="modal-overlay" id="pipeAIModal">
      <div class="modal modal-sm">
        <div class="modal-header" style="border-bottom:1px solid rgba(201,168,76,.2);background:rgba(201,168,76,.05)">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">✨</span>
              <span style="font-weight:700;color:#C9A84C;font-size:13px;letter-spacing:.04em">AI PIPELINE ADVICE</span>
            </div>
            <div id="pipeAIName" style="font-size:12px;color:var(--text-muted);margin-top:2px"></div>
          </div>
          <button class="modal-close" onclick="pipeCloseAI()">✕</button>
        </div>
        <div id="pipeAIBody" style="padding:20px"></div>
      </div>
    </div>`;

  await refreshPipeline();
}

async function refreshPipeline() {
  const [pRes, sRes] = await Promise.all([
    fetch('/api/pipeline').then(r => r.json()),
    fetch('/api/pipeline/stats').then(r => r.json()),
  ]);
  if (pRes.success) pipeProspects = pRes.data;
  if (sRes.success) {
    const total = Object.values(sRes.data.stages).reduce((s, st) => s + (st.value || 0), 0);
    const tv = document.getElementById('pipeTotalVal');
    const cr = document.getElementById('pipeConvRate');
    if (tv) tv.textContent = '$' + total.toLocaleString();
    if (cr) cr.textContent = sRes.data.conversionRate + '%';
  }
  renderBoard();
}

function renderBoard() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;
  board.innerHTML = STAGES.map(stage => {
    const cards = pipeProspects.filter(p => p.stage === stage.id);
    const total = cards.reduce((s, p) => s + (p.potential_value || 0), 0);
    return `
      <div class="kanban-col" id="col-${stage.id}"
        ondragover="pipeDragOver(event)" ondrop="pipeDrop(event,'${stage.id}')"
        ondragenter="this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')">
        <div class="kanban-col-header" style="border-top:3px solid ${stage.color}">
          <span class="kanban-col-title">${stage.label}</span>
          <span class="kanban-col-count">${cards.length}</span>
        </div>
        <div class="kanban-cards">
          ${cards.map(p => renderCard(p)).join('')}
        </div>
        <div class="kanban-col-footer">
          ${cards.length} prospect${cards.length !== 1 ? 's' : ''} · $${total.toLocaleString()}
        </div>
      </div>`;
  }).join('');
}

function renderCard(p) {
  const days = Math.floor((Date.now() - new Date(p.created_at)) / 86400000);
  const urgencyColor = days < 7 ? 'var(--success)' : days < 14 ? 'var(--warning)' : 'var(--danger)';
  return `
    <div class="kanban-card" draggable="true"
      ondragstart="pipeDragStart(event,${p.id})" ondragend="pipeDragEnd(event)"
      onclick="pipeOpenEdit(${p.id})">
      <div class="kanban-card-name">${p.name}</div>
      <div class="kanban-card-meta">
        ${p.source ? `<span class="badge badge-platform" style="font-size:10px">${p.source}</span>` : ''}
        ${p.potential_value ? `<span style="font-weight:600;font-size:12px;color:#C9A84C">$${p.potential_value.toLocaleString()}</span>` : ''}
      </div>
      <div style="font-size:11px;color:${urgencyColor};margin-top:4px">⏱ ${days}d in stage</div>
      ${p.notes ? `<div class="kanban-card-note">${p.notes.substring(0, 60)}${p.notes.length > 60 ? '…' : ''}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:10px" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-outline" style="flex:1;font-size:11px;padding:4px 8px"
          onclick="pipeOpenEdit(${p.id})">Edit</button>
        <button class="btn btn-sm" style="font-size:11px;padding:4px 10px;background:rgba(201,168,76,.15);color:#C9A84C;border:1px solid rgba(201,168,76,.35)"
          onclick="pipeGetAdvice(${p.id})">✨ AI</button>
      </div>
    </div>`;
}

// ── AI advice ─────────────────────────────────────────────────────────────────

async function pipeGetAdvice(id) {
  const p = pipeProspects.find(x => x.id === id);
  const nameEl = document.getElementById('pipeAIName');
  const body   = document.getElementById('pipeAIBody');
  if (!body) return;

  if (nameEl) nameEl.textContent = p ? p.name : '';
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:13px;padding:8px 0">
      <div class="spinner"></div> Generating sales advice…
    </div>`;
  document.getElementById('pipeAIModal').classList.add('open');

  let res;
  try {
    res = await fetch('/api/ai/pipeline-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: id }),
    }).then(r => r.json());
  } catch (err) {
    body.innerHTML = `<div class="alert-bar" style="margin:0">⚠️ Network error: ${err.message}</div>`;
    return;
  }

  if (!res.success) {
    body.innerHTML = `<div class="alert-bar" style="margin:0">⚠️ ${res.error}</div>`;
    return;
  }

  const d = res.data;
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">

      <div style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);border-radius:8px;padding:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96;margin-bottom:8px">Best Next Step</div>
        <div style="font-size:13px;line-height:1.6;color:#FFFFFF">${d.best_next_step || '—'}</div>
      </div>

      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96;margin-bottom:8px">Likely Objections</div>
        ${(d.likely_objections || []).map((obj, i) => `
          <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #2A2A2A;font-size:13px;align-items:flex-start">
            <span style="color:#E8C96B;font-weight:700;flex-shrink:0">${i + 1}.</span>
            <span style="color:#A8B4C0;line-height:1.5">${obj}</span>
          </div>`).join('')}
      </div>

      <div style="background:#111111;border-radius:8px;padding:14px;border:1px solid #2A2A2A">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96">Suggested Message</div>
          <button class="btn btn-sm" onclick="pipeCopyMessage(this)"
            style="font-size:11px;background:rgba(201,168,76,.15);color:#C9A84C;border:1px solid rgba(201,168,76,.3);padding:4px 10px">
            Copy
          </button>
        </div>
        <div id="pipeAISuggestedMsg" style="font-size:13px;color:#FFFFFF;line-height:1.7;white-space:pre-wrap">${d.suggested_message || '—'}</div>
      </div>

      <div style="font-size:11px;color:#7A8A96;text-align:right">claude-sonnet-4-6</div>
    </div>`;
}

function pipeCopyMessage(btn) {
  const msgEl = document.getElementById('pipeAISuggestedMsg');
  if (!msgEl) return;
  navigator.clipboard.writeText(msgEl.textContent).then(() => {
    btn.textContent = '✓ Copied';
    btn.style.color = '#C9A84C';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }).catch(() => {
    // Fallback for non-https
    const ta = document.createElement('textarea');
    ta.value = msgEl.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

function pipeCloseAI() { document.getElementById('pipeAIModal')?.classList.remove('open'); }

// ── Drag and drop ─────────────────────────────────────────────────────────────

function pipeDragStart(e, id) {
  dragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '.4';
}
function pipeDragEnd(e)       { e.currentTarget.style.opacity = ''; }
function pipeDragOver(e)      { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

async function pipeDrop(e, stage) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragId) return;
  await fetch(`/api/pipeline/${dragId}/stage`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stage })
  });
  dragId = null;
  refreshPipeline();
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function pipeOpenAdd(preStage) {
  document.getElementById('pipeId').value    = '';
  document.getElementById('pipeModalTitle').textContent = 'Add Prospect';
  document.getElementById('pipeSubmitBtn').textContent  = 'Add Prospect';
  document.getElementById('pipeName').value  = '';
  document.getElementById('pipeEmail').value = '';
  document.getElementById('pipePhone').value = '';
  document.getElementById('pipeSource').value = '';
  document.getElementById('pipeValue').value  = '';
  document.getElementById('pipeNotes').value  = '';
  document.getElementById('pipeStage').value  = preStage || 'new_lead';
  document.getElementById('pipeModal').classList.add('open');
}

function pipeOpenEdit(id) {
  const p = pipeProspects.find(x => x.id === id);
  if (!p) return;
  document.getElementById('pipeId').value    = p.id;
  document.getElementById('pipeModalTitle').textContent = 'Edit Prospect';
  document.getElementById('pipeSubmitBtn').textContent  = 'Save';
  document.getElementById('pipeName').value   = p.name || '';
  document.getElementById('pipeEmail').value  = p.email || '';
  document.getElementById('pipePhone').value  = p.phone || '';
  document.getElementById('pipeSource').value = p.source || '';
  document.getElementById('pipeValue').value  = p.potential_value || '';
  document.getElementById('pipeNotes').value  = p.notes || '';
  document.getElementById('pipeStage').value  = p.stage || 'new_lead';
  document.getElementById('pipeModal').classList.add('open');
}

function pipeCloseModal() { document.getElementById('pipeModal')?.classList.remove('open'); }

async function pipeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('pipeId').value;
  const payload = {
    name:            document.getElementById('pipeName').value,
    email:           document.getElementById('pipeEmail').value,
    phone:           document.getElementById('pipePhone').value,
    source:          document.getElementById('pipeSource').value,
    stage:           document.getElementById('pipeStage').value,
    potential_value: document.getElementById('pipeValue').value || 0,
    notes:           document.getElementById('pipeNotes').value,
  };
  const res = await fetch(id ? `/api/pipeline/${id}` : '/api/pipeline', {
    method: id ? 'PUT' : 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload),
  }).then(r => r.json());
  if (res.success) { pipeCloseModal(); refreshPipeline(); }
  else alert(res.error || 'Save failed');
}
