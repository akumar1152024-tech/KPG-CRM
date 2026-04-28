let tasksTab = 'all', allTaskClients = [];

async function loadTasks() {
  const el = document.getElementById('section-tasks');
  el.innerHTML = `
    <div class="section-header">
      <div class="tabs-bar" style="margin:0">
        ${['all','today','overdue','done'].map(t => `
          <button class="tab-btn ${t==='all'?'active':''}" data-tab="${t}" onclick="tasksSwitchTab('${t}')">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}
      </div>
      <button class="btn btn-primary" onclick="tasksOpenAdd()">+ Add Task</button>
    </div>
    <div id="tasksList"><div class="loading-cell">Loading…</div></div>
    <div class="modal-overlay" id="taskModal">
      <div class="modal modal-sm">
        <div class="modal-header"><h2 id="taskModalTitle">Add Task</h2>
          <button class="modal-close" onclick="tasksCloseModal()">✕</button>
        </div>
        <form onsubmit="tasksSubmit(event)">
          <input type="hidden" id="taskId" />
          <div class="form-grid">
            <div class="form-group"><label>Title *</label><input id="taskTitle" class="form-input" required /></div>
            <div class="form-group"><label>Category</label>
              <select id="taskCat" class="form-input">
                ${['admin','client','content','marketing','finance','personal'].map(c=>`<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Priority</label>
              <select id="taskPriority" class="form-input">
                ${['low','medium','high','urgent'].map(p=>`<option value="${p}" ${p==='medium'?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Due date</label><input id="taskDue" type="date" class="form-input" /></div>
            <div class="form-group"><label>Linked client</label>
              <select id="taskClient" class="form-input">
                <option value="">None</option>
              </select>
            </div>
            <div class="form-group"><label>Recurring</label>
              <select id="taskRecurring" class="form-input">
                ${['none','daily','weekly','monthly'].map(r=>`<option value="${r}">${r}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="taskNotes" class="form-input" rows="2"></textarea></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="tasksCloseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="taskSubmitBtn">Add Task</button>
          </div>
        </form>
      </div>
    </div>`;

  const clientRes = await fetch('/api/clients').then(r => r.json());
  if (clientRes.success) {
    allTaskClients = clientRes.data;
    document.getElementById('taskClient').innerHTML =
      '<option value="">None</option>' + clientRes.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
  tasksSwitchTab('all');
}

const PRIO_COLORS = { low:'var(--text-muted)', medium:'var(--info)', high:'var(--warning)', urgent:'var(--danger)' };

async function tasksSwitchTab(tab) {
  tasksTab = tab;
  document.querySelectorAll('#section-tasks .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const res = await fetch(`/api/tasks?tab=${tab}`).then(r => r.json());
  const el = document.getElementById('tasksList');
  if (!el) return;
  if (!res.success || !res.data.length) {
    const msgs = { all:'No tasks yet', today:'Nothing due today', overdue:'🎉 No overdue tasks!', done:'Nothing completed yet' };
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">${tab==='overdue'?'🎉':'✅'}</div>${msgs[tab]||'No tasks'}</div>`;
    return;
  }
  const today = new Date().toISOString().split('T')[0];
  el.innerHTML = res.data.map(t => {
    const overdue = t.status === 'pending' && t.due_date && t.due_date < today;
    const dueToday = t.status === 'pending' && t.due_date === today;
    return `
      <div class="task-row ${overdue?'overdue':dueToday?'today':''} ${t.status==='done'?'done':''}">
        <input type="checkbox" class="task-check" ${t.status==='done'?'checked':''} onchange="tasksToggleDone(${t.id},this.checked)" />
        <div class="task-body">
          <div class="task-title">${t.title}</div>
          <div class="task-meta">
            <span style="color:${PRIO_COLORS[t.priority]||'inherit'};font-size:11px;font-weight:600">${t.priority}</span>
            <span class="badge" style="background:var(--bg);border:1px solid var(--border);font-size:10px">${t.category}</span>
            ${t.due_date ? `<span style="font-size:11px">${overdue?'🔴':dueToday?'🟡':'📅'} ${t.due_date}</span>` : ''}
            ${t.client_name ? `<span style="font-size:11px">👤 ${t.client_name}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" onclick="tasksOpenEdit(${t.id})">Edit</button>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="tasksDelete(${t.id})">✕</button>
        </div>
      </div>`;
  }).join('');
}

async function tasksToggleDone(id, done) {
  await fetch(`/api/tasks/${id}${done?'/done':''}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: done ? '{}' : JSON.stringify({ status: 'pending' }),
  });
  tasksSwitchTab(tasksTab);
}

function tasksOpenAdd() {
  document.getElementById('taskId').value = '';
  document.getElementById('taskModalTitle').textContent = 'Add Task';
  document.getElementById('taskSubmitBtn').textContent  = 'Add Task';
  document.getElementById('taskModal').querySelector('form').reset();
  document.getElementById('taskDue').value = new Date().toISOString().split('T')[0];
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskModal').classList.add('open');
}

function tasksOpenEdit(id) {
  fetch(`/api/tasks?tab=all`).then(r => r.json()).then(res => {
    const t = res.data?.find(x => x.id === id); if (!t) return;
    document.getElementById('taskId').value         = t.id;
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskSubmitBtn').textContent  = 'Save';
    document.getElementById('taskTitle').value      = t.title || '';
    document.getElementById('taskCat').value        = t.category || 'admin';
    document.getElementById('taskPriority').value   = t.priority || 'medium';
    document.getElementById('taskDue').value        = t.due_date || '';
    document.getElementById('taskClient').value     = t.related_client_id || '';
    document.getElementById('taskRecurring').value  = t.recurring || 'none';
    document.getElementById('taskNotes').value      = t.notes || '';
    document.getElementById('taskModal').classList.add('open');
  });
}

function tasksCloseModal() { document.getElementById('taskModal')?.classList.remove('open'); }

async function tasksSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('taskId').value;
  const payload = {
    title:             document.getElementById('taskTitle').value,
    category:          document.getElementById('taskCat').value,
    priority:          document.getElementById('taskPriority').value,
    due_date:          document.getElementById('taskDue').value,
    related_client_id: document.getElementById('taskClient').value || null,
    recurring:         document.getElementById('taskRecurring').value,
    notes:             document.getElementById('taskNotes').value,
    status:            'pending',
  };
  const res = await fetch(id ? `/api/tasks/${id}` : '/api/tasks', {
    method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  }).then(r => r.json());
  if (res.success) { tasksCloseModal(); tasksSwitchTab(tasksTab); } else alert(res.error || 'Save failed');
}

async function tasksDelete(id) {
  if (!confirm('Delete this task?')) return;
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  tasksSwitchTab(tasksTab);
}
