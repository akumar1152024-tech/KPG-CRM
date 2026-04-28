const Tasks = (() => {
  let activeTab = 'all', allClients = [];

  async function load() {
    const clientsData = await api.get('/api/clients');
    if (clientsData.success) {
      allClients = clientsData.data;
      populateClientSelect();
    }
    switchTab(activeTab);
  }

  function populateClientSelect() {
    const sel = document.getElementById('taskClientSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="">No client linked</option>` +
      allClients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  async function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('#section-tasks .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const data = await api.get(`/api/tasks?tab=${tab}`);
    if (data.success) renderTasks(data.data, tab);
  }

  function renderTasks(tasks, tab) {
    const el = document.getElementById('tasksList');
    if (!el) return;
    if (!tasks.length) {
      const labels = { all: 'No tasks', today: 'Nothing due today', overdue: '✅ No overdue tasks!', done: 'Nothing completed yet', high: 'No urgent/high tasks' };
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">${tab === 'overdue' ? '🎉' : '📋'}</div>${labels[tab] || 'No tasks'}</div>`;
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    el.innerHTML = tasks.map(t => {
      const overdue = t.status === 'pending' && t.due_date && t.due_date < today;
      const todayTask = t.status === 'pending' && t.due_date === today;
      return `
        <div class="task-row ${overdue ? 'overdue' : todayTask ? 'today' : ''} ${t.status === 'done' ? 'done' : ''}">
          <input type="checkbox" class="task-check" ${t.status === 'done' ? 'checked' : ''} onchange="Tasks.toggleDone(${t.id}, this.checked)">
          <div class="task-body">
            <div class="task-title">${t.title}</div>
            <div class="task-meta">
              ${PRIORITY_BADGE(t.priority)}
              <span class="badge" style="background:var(--bg);color:var(--text-muted);border:1px solid var(--border)">${t.category}</span>
              ${t.due_date ? `<span>${overdue ? '🔴' : todayTask ? '🟡' : '📅'} ${fmtDate(t.due_date)}</span>` : ''}
              ${t.client_name ? `<span>👤 ${t.client_name}</span>` : ''}
              ${t.recurring !== 'none' ? `<span>↻ ${t.recurring}</span>` : ''}
            </div>
            ${t.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${t.description}</div>` : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-outline btn-sm" onclick="Tasks.openEdit(${t.id})">Edit</button>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="Tasks.deleteTask(${t.id})">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  async function toggleDone(id, done) {
    if (done) {
      await api.put(`/api/tasks/${id}/done`);
      showToast('Task marked done!', 'success');
    } else {
      await api.put(`/api/tasks/${id}`, { status: 'pending' });
    }
    App.updateTaskBadge();
    switchTab(activeTab);
  }

  function openAddModal() {
    document.getElementById('taskId').value = '';
    document.getElementById('taskModalTitle').textContent = 'Add Task';
    document.getElementById('taskSubmitBtn').textContent  = 'Add Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskDue').value = new Date().toISOString().split('T')[0];
    populateClientSelect();
    document.getElementById('taskModal')?.classList.add('open');
  }

  async function openEdit(id) {
    const data = await api.get(`/api/tasks?tab=all`);
    if (!data.success) return;
    const task = data.data.find(t => t.id === id);
    if (!task) return;
    document.getElementById('taskId').value             = task.id;
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskSubmitBtn').textContent  = 'Save Changes';
    document.getElementById('taskTitle').value          = task.title || '';
    document.getElementById('taskDesc').value           = task.description || '';
    document.getElementById('taskCategory').value       = task.category || 'admin';
    document.getElementById('taskClientSelect').value   = task.related_client_id || '';
    document.getElementById('taskDue').value            = task.due_date || '';
    document.getElementById('taskPriority').value       = task.priority || 'medium';
    document.getElementById('taskRecurring').value      = task.recurring || 'none';
    document.getElementById('taskNotes').value          = task.notes || '';
    document.getElementById('taskModal')?.classList.add('open');
  }

  async function submitTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const payload = {
      title:             document.getElementById('taskTitle').value,
      description:       document.getElementById('taskDesc').value,
      category:          document.getElementById('taskCategory').value,
      related_client_id: document.getElementById('taskClientSelect').value || null,
      due_date:          document.getElementById('taskDue').value,
      priority:          document.getElementById('taskPriority').value,
      recurring:         document.getElementById('taskRecurring').value,
      notes:             document.getElementById('taskNotes').value,
      status:            'pending',
    };
    const data = id ? await api.put(`/api/tasks/${id}`, payload) : await api.post('/api/tasks', payload);
    if (data.success) { showToast(data.message, 'success'); closeModal('taskModal'); App.updateTaskBadge(); switchTab(activeTab); }
    else showToast(data.error || 'Failed to save', 'error');
  }

  async function deleteTask(id) {
    const ok = await confirmDialog('Delete this task?');
    if (!ok) return;
    const data = await api.delete(`/api/tasks/${id}`);
    if (data.success) { showToast('Task deleted', 'success'); App.updateTaskBadge(); switchTab(activeTab); }
    else showToast(data.error, 'error');
  }

  function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

  return { load, switchTab, toggleDone, openAddModal, openEdit, submitTask, deleteTask, closeModal };
})();
