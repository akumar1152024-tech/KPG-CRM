const Dashboard = (() => {
  let revenueChart = null;

  async function load() {
    const el = document.getElementById('dashboardContent');
    if (!el) return;
    el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading dashboard…</div>';
    const data = await api.get('/api/dashboard');
    if (!data.success) { el.innerHTML = `<div class="empty-state">Failed to load dashboard</div>`; return; }
    const d = data.data;
    document.body.dataset.coachName = d.coachName || 'Kash';
    App.updateTaskBadge?.();
    render(d, el);
  }

  function render(d, el) {
    const netColor = d.netProfit >= 0 ? '' : 'red';
    el.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-value">${fmt$(d.monthlyRevenue)}</div><div class="stat-label">Revenue This Month</div></div>
        <div class="stat-card"><div class="stat-value ${netColor}">${fmt$(d.netProfit)}</div><div class="stat-label">Net Profit</div></div>
        <div class="stat-card"><div class="stat-value">${d.activeClients}</div><div class="stat-label">Active Clients</div><div class="stat-sub">${d.trialClients} on trial</div></div>
        <div class="stat-card"><div class="stat-value">${d.leadsThisMonth}</div><div class="stat-label">Leads This Month</div><div class="stat-sub">${d.pipelineCount} in pipeline</div></div>
      </div>

      <div class="progress-block">
        <div class="progress-item">
          <div class="progress-header"><span>Revenue Goal</span><span>${fmt$(d.monthlyRevenue)} / ${fmt$(d.revenueGoal)}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${d.revenueProgress}%"></div></div>
        </div>
        <div class="progress-item mb-0">
          <div class="progress-header"><span>Profit Goal</span><span>${fmt$(d.netProfit)} / ${fmt$(d.profitGoal)}</span></div>
          <div class="progress-bar"><div class="progress-fill green" style="width:${d.profitProgress}%"></div></div>
        </div>
      </div>

      <div class="dash-grid-2">
        <div>
          ${renderFollowUps(d.needsFollowUp)}
          ${renderTasks(d.weekTasks)}
        </div>
        <div>
          ${renderActivity(d.recentInteractions)}
          ${renderHotPipeline(d.hotPipeline)}
        </div>
      </div>

      <div class="dash-grid-2 mt-20">
        <div class="chart-card"><h3>Revenue (6 months)</h3><canvas id="dashRevenueChart" height="180"></canvas></div>
        <div class="chart-card" id="dashMeta">
          <h3>Meta Ads Snapshot</h3>
          ${renderMetaSnapshot(d.metaSnapshot, d.topLeadSource, d.topLeadSourceCount)}
        </div>
      </div>
    `;

    buildRevenueChart(d.sixMonthChart);
  }

  function renderFollowUps(clients) {
    if (!clients || !clients.length) return `<div class="card mb-0"><div class="panel-header"><h3>🎉 No follow-ups needed</h3></div><p style="font-size:13px;color:var(--text-muted)">All active clients contacted in the last 14 days.</p></div>`;
    return `
      <div class="card" style="margin-bottom:20px">
        <div class="panel-header">
          <h3>⚠️ Needs Follow-up (${clients.length})</h3>
          <span style="font-size:12px;color:var(--text-muted)">No contact 14+ days</span>
        </div>
        ${clients.map(c => `
          <div class="followup-card">
            <div class="avatar" style="background:var(--warning)">${c.avatar_initials || c.name[0]}</div>
            <div class="info">
              <div class="name">${c.name}</div>
              <div class="sub">Last contact: ${fmtRelative(c.last_interaction)}</div>
            </div>
            <button class="automation-btn followup" onclick="runAutomation('followUpLead',${c.id},'${c.name.replace(/'/g,"\\'")}',this)">Follow Up</button>
          </div>`).join('')}
      </div>`;
  }

  function renderTasks(tasks) {
    if (!tasks || !tasks.length) return `<div class="card"><div class="panel-header"><h3>✅ No tasks due this week</h3></div></div>`;
    const today = new Date().toISOString().split('T')[0];
    return `
      <div class="card">
        <div class="panel-header"><h3>📋 This Week's Tasks</h3><a href="#" data-section="tasks" onclick="App.navigate('tasks');return false" style="font-size:12px;color:var(--primary)">View all →</a></div>
        ${tasks.map(t => {
          const overdue = t.due_date < today;
          const todayTask = t.due_date === today;
          return `
            <div class="task-row ${overdue ? 'overdue' : todayTask ? 'today' : ''}" style="margin-bottom:8px">
              <div class="task-body">
                <div class="task-title">${t.title}</div>
                <div class="task-meta">
                  ${PRIORITY_BADGE(t.priority)}
                  ${t.due_date ? `<span>${overdue ? '🔴' : '📅'} ${fmtDate(t.due_date)}</span>` : ''}
                  ${t.client_name ? `<span>👤 ${t.client_name}</span>` : ''}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  function renderActivity(interactions) {
    if (!interactions || !interactions.length) return `<div class="card"><div class="panel-header"><h3>Recent Activity</h3></div><div class="empty-state">No interactions yet</div></div>`;
    return `
      <div class="card" style="margin-bottom:20px">
        <div class="panel-header"><h3>Recent Activity</h3></div>
        ${interactions.map(i => `
          <div class="activity-item">
            <div class="activity-icon">${INT_ICONS[i.type] || '📝'}</div>
            <div class="activity-info">
              <div class="activity-name">${i.client_name}</div>
              <div class="activity-text">${i.summary}</div>
            </div>
            <div class="activity-time">${fmtRelative(i.date)}</div>
          </div>`).join('')}
      </div>`;
  }

  function renderHotPipeline(prospects) {
    if (!prospects || !prospects.length) return '';
    return `
      <div class="card">
        <div class="panel-header"><h3>🔥 Hot Pipeline</h3><a href="#" onclick="App.navigate('pipeline');return false" style="font-size:12px;color:var(--primary)">View all →</a></div>
        ${prospects.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:13px">${p.name}</div>
              <div style="font-size:12px;color:var(--text-muted)">${p.source || ''}</div>
            </div>
            <div style="text-align:right">
              ${STATUS_BADGE(p.stage)}
              <div style="font-size:13px;font-weight:600;color:var(--primary)">${fmt$(p.potential_value)}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function renderMetaSnapshot(meta, topSource, topCount) {
    const hasData = meta && (meta.spend > 0 || meta.leads > 0);
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div class="stat-value" style="font-size:20px">${fmt$(meta?.spend || 0)}</div><div class="stat-label">Ad Spend</div></div>
        <div><div class="stat-value" style="font-size:20px">${meta?.leads || 0}</div><div class="stat-label">Ad Leads</div></div>
        <div><div class="stat-value" style="font-size:20px">${fmt$(meta?.cpl || 0)}</div><div class="stat-label">Cost Per Lead</div></div>
        <div><div class="stat-value" style="font-size:20px">${topSource || '—'}</div><div class="stat-label">Top Source ${topCount ? `(${topCount})` : ''}</div></div>
      </div>
      ${!hasData ? '<p style="font-size:12px;color:var(--text-muted)">Connect Meta Ads in Settings to see data.</p>' : ''}`;
  }

  function buildRevenueChart(chartData) {
    const canvas = document.getElementById('dashRevenueChart');
    if (!canvas || !chartData) return;
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
    revenueChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: chartData.map(d => d.label),
        datasets: [
          { label: 'Revenue',  data: chartData.map(d => d.revenue),  backgroundColor: 'rgba(15,110,86,.7)', borderRadius: 4 },
          { label: 'Expenses', data: chartData.map(d => d.expenses), backgroundColor: 'rgba(226,75,74,.6)', borderRadius: 4 },
          { label: 'Profit',   data: chartData.map(d => d.profit),   backgroundColor: 'rgba(59,109,17,.6)', borderRadius: 4 },
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '$'+v } } } }
    });
  }

  return { load };
})();
