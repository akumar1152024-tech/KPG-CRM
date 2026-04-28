const Automations = (() => {
  async function load() {
    const [listData, logData] = await Promise.all([
      api.get('/api/automations/list'),
      api.get('/api/automations/log'),
    ]);
    if (listData.success) renderCards(listData.data);
    if (logData.success)  renderLog(logData.data);
  }

  function renderCards(automations) {
    const el = document.getElementById('automationCards');
    if (!el) return;
    el.innerHTML = `<div class="auto-cards">${automations.map(a => `
      <div class="auto-card">
        <div class="auto-card-header">
          <span class="auto-card-name">${a.name}</span>
          <span style="font-size:11px;color:var(--text-muted)">${a.timesRunThisMonth}x this month</span>
        </div>
        <div class="auto-card-desc">${a.description}</div>
        <div class="auto-card-steps">
          ${a.steps.map(s => `<div class="auto-card-step">${s}</div>`).join('')}
        </div>
        <div class="auto-card-footer">
          <span class="auto-count">${a.triggers.join(' · ')}</span>
          <button class="btn btn-primary btn-sm" onclick="Automations.runManually('${a.id}','${a.name}')">▶ Run</button>
        </div>
      </div>`).join('')}</div>`;
  }

  async function runManually(automationId, automationName) {
    const clientData = await api.get('/api/clients?status=active');
    if (!clientData.success) return showToast('Failed to load clients', 'error');
    const allClients = [...(clientData.data || [])];

    if (automationId === 'followUpLead' || automationId === 'sendProposal') {
      const leadsData = await api.get('/api/clients?status=lead');
      if (leadsData.success) allClients.unshift(...leadsData.data);
    }
    if (automationId === 'reEngageChurned') {
      const churnedData = await api.get('/api/clients?status=churned');
      if (churnedData.success) allClients.unshift(...churnedData.data);
    }
    if (!allClients.length) return showToast('No eligible clients found', 'warning');

    showClientPicker(automationId, automationName, allClients);
  }

  function showClientPicker(automationId, automationName, clients) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2>Run: ${automationName}</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div style="padding:20px">
          <div class="form-group">
            <label>Select Client</label>
            <select id="autoClientSelect" class="form-input">
              ${clients.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name} (${c.status})</option>`).join('')}
            </select>
          </div>
          <p style="font-size:12px;color:var(--text-muted)">This will send emails and create tasks automatically. Check Mailchimp config first.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" id="runAutoBtn" onclick="Automations.confirmRun('${automationId}','${automationName}',this)">Run Automation</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function confirmRun(automationId, automationName, btn) {
    const sel = document.getElementById('autoClientSelect');
    const clientId   = sel?.value;
    const clientName = sel?.options[sel.selectedIndex]?.dataset.name || 'this client';
    if (!clientId) return;

    const overlay = btn.closest('.modal-overlay');
    setLoadingBtn(btn, true, 'Run Automation');
    const data = await api.post('/api/automations/run', { automation: automationId, client_id: clientId });
    setLoadingBtn(btn, false, 'Run Automation');
    overlay?.remove();

    if (data.success) {
      showToast(`${automationName} complete for ${clientName}`, 'success', data.steps || [], 6000);
      App.updateTaskBadge();
      load();
    } else {
      showToast(data.error || 'Automation failed', 'error');
    }
  }

  function renderLog(logs) {
    const el = document.getElementById('automationLog');
    if (!el) return;
    if (!logs.length) { el.innerHTML = '<div class="loading-cell">No automation runs yet</div>'; return; }
    el.innerHTML = logs.map(l => {
      const steps = (() => { try { return JSON.parse(l.steps_completed); } catch { return []; } })();
      return `<tr>
        <td style="font-weight:500">${l.automation_name.replace(/([A-Z])/g,' $1').trim()}</td>
        <td>${l.client_name || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted)">${fmtAgo(l.run_at)}</td>
        <td style="font-size:12px">${steps.length} steps</td>
        <td>${STATUS_BADGE(l.status)}</td>
      </tr>`;
    }).join('');
  }

  return { load, runManually, confirmRun };
})();
