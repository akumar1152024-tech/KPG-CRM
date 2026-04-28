let revenueChart = null;

async function loadDashboard() {
  const el = document.getElementById('section-dashboard');
  el.innerHTML = '<div class="loading-cell">Loading…</div>';

  const res = await fetch('/api/dashboard');
  const { data: d } = await res.json();

  el.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">$${d.monthlyRevenue.toLocaleString()}</div>
        <div class="stat-label">Revenue this month</div>
        <div class="stat-sub">${d.revenueProgress}% of $${d.revenueGoal.toLocaleString()} goal</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${d.netProfit>=0?'var(--success)':'var(--danger)'}">$${d.netProfit.toLocaleString()}</div>
        <div class="stat-label">Net profit</div>
        <div class="stat-sub">${d.profitProgress}% of $${d.profitGoal.toLocaleString()} goal</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${d.activeClients + d.trialClients}</div>
        <div class="stat-label">Active clients</div>
        <div class="stat-sub">${d.trialClients} on trial · ${d.clientGoal} target</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${d.leadsThisMonth}</div>
        <div class="stat-label">Leads this month</div>
        <div class="stat-sub">${d.pipelineCount} in pipeline · top: ${d.topLeadSource || '—'}</div>
      </div>
    </div>

    ${d.overdueCount ? `
    <div class="alert-bar">
      ⚠️ <strong>${d.overdueCount} overdue task${d.overdueCount>1?'s':''}</strong> —
      <a href="#" onclick="navigate('tasks');return false">View tasks →</a>
    </div>` : ''}

    <div class="dash-grid">
      <div class="card">
        <div class="panel-header"><h3>Needs Follow-up</h3></div>
        <div id="dash-followup">${renderFollowUps(d.needsFollowUp)}</div>
      </div>
      <div class="card">
        <div class="panel-header"><h3>Recent Activity</h3></div>
        <div id="dash-activity">${renderActivity(d.recentInteractions)}</div>
      </div>
    </div>

    <div class="card mt-20">
      <div class="panel-header"><h3>Revenue vs Expenses — last 6 months</h3></div>
      <canvas id="revenueChart" height="120"></canvas>
    </div>`;

  buildChart(d.sixMonthChart);
}

function renderFollowUps(clients) {
  if (!clients || !clients.length)
    return '<div class="empty-state" style="padding:20px">✅ Everyone contacted recently</div>';
  return clients.map(c => `
    <div class="followup-row">
      <div class="avatar">${c.avatar_initials || c.name[0]}</div>
      <div class="followup-body">
        <div class="followup-name">${c.name}</div>
        <div class="followup-meta">Last contact: ${c.last_interaction ? c.last_interaction : 'Never'}</div>
      </div>
      <a href="#" class="btn btn-outline btn-sm" onclick="navigate('crm');return false">View</a>
    </div>`).join('');
}

const INT_ICONS = { call:'📞', whatsapp:'💬', email:'📧', note:'📝', meeting:'🤝', dm:'💌' };

function renderActivity(interactions) {
  if (!interactions || !interactions.length)
    return '<div class="empty-state" style="padding:20px">No activity yet</div>';
  return interactions.slice(0, 8).map(i => `
    <div class="activity-row">
      <span class="activity-icon">${INT_ICONS[i.type] || '📝'}</span>
      <div class="activity-body">
        <div class="activity-name">${i.client_name}</div>
        <div class="activity-summary">${i.summary || i.type}</div>
      </div>
      <div class="activity-date">${i.date}</div>
    </div>`).join('');
}

function buildChart(chartData) {
  if (!chartData || !chartData.length) return;
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartData.map(m => m.label),
      datasets: [
        { label: 'Revenue',  data: chartData.map(m => m.revenue),  backgroundColor: '#0F6E56' },
        { label: 'Expenses', data: chartData.map(m => m.expenses), backgroundColor: '#e2534420' },
        { label: 'Profit',   data: chartData.map(m => m.profit),   backgroundColor: '#3b82f660', type: 'line', tension: 0.3, borderColor: '#3b82f6', fill: false },
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}
