let revenueChart = null;

// ── Daily briefing cache ──────────────────────────────────────────────────────

const BRIEFING_CACHE_KEY = 'kpg_daily_briefing';
const BRIEFING_TTL_MS    = 6 * 60 * 60 * 1000; // 6 hours

function getBriefingCache() {
  try {
    const raw = localStorage.getItem(BRIEFING_CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > BRIEFING_TTL_MS) { localStorage.removeItem(BRIEFING_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function setBriefingCache(data) {
  try { localStorage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}

// ── Dashboard loader ──────────────────────────────────────────────────────────

async function loadDashboard() {
  const el = document.getElementById('section-dashboard');
  el.innerHTML = '<div class="loading-cell">Loading…</div>';

  let d;
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API error');
    d = json.data;
  } catch (err) {
    el.innerHTML = `<div class="alert-bar" style="margin:20px">⚠️ Failed to load dashboard: ${err.message}. <a href="#" onclick="loadDashboard();return false">Retry</a></div>`;
    return;
  }

  const cached = getBriefingCache();

  el.innerHTML = `
    ${renderBriefingCard(cached)}

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
    </div>

    <div class="card mt-20" style="border-color:var(--danger)20">
      <div class="panel-header">
        <div>
          <h3 style="margin:0">Sample Data</h3>
          <p style="font-size:12px;color:var(--text-muted);margin:3px 0 0">Remove the pre-loaded demo clients, transactions and leads to start fresh.</p>
        </div>
        <button class="btn btn-danger btn-sm" onclick="dashClearData()">🗑 Clear Sample Data</button>
      </div>
    </div>`;

  buildChart(d.sixMonthChart);
}

// ── Briefing card ─────────────────────────────────────────────────────────────

function renderBriefingCard(cached) {
  if (cached) {
    return `
      <div class="card" id="briefingCard" style="border-left:3px solid #C9A84C;margin-bottom:20px">
        ${briefingHeader(true)}
        ${briefingContent(cached)}
      </div>`;
  }
  return `
    <div class="card" id="briefingCard" style="border-left:3px solid #C9A84C;margin-bottom:20px">
      ${briefingHeader(false)}
      <div id="briefingBody" style="padding:4px 0 8px">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
          Get a personalised AI briefing based on your live business data — clients, tasks, pipeline and revenue.
        </p>
        <button class="btn btn-primary" onclick="dashGenerateBriefing(this)">✨ Generate AI Briefing</button>
      </div>
    </div>`;
}

function briefingHeader(hasData) {
  const ts = hasData ? (() => {
    try { return JSON.parse(localStorage.getItem(BRIEFING_CACHE_KEY)).timestamp; } catch { return null; }
  })() : null;
  const age = ts ? timeSince(ts) : null;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">✨</span>
        <span style="font-weight:700;color:#C9A84C;font-size:13px;letter-spacing:.04em">MORNING BRIEFING</span>
        ${age ? `<span style="font-size:11px;color:var(--text-muted)">· ${age}</span>` : ''}
      </div>
      ${hasData ? `<button class="btn btn-outline btn-sm" onclick="dashGenerateBriefing(this)">↺ Regenerate</button>` : ''}
    </div>`;
}

function briefingContent(d) {
  return `
    <div id="briefingBody">
      <div style="font-size:15px;font-weight:600;color:#FFFFFF;margin-bottom:10px">${d.greeting || ''}</div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:14px">${d.summary || ''}</div>
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96;margin-bottom:8px">Today's Focus</div>
        ${(d.focus_today || []).map((item, i) => `
          <div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #2A2A2A;font-size:13px;align-items:flex-start">
            <span style="color:#C9A84C;font-weight:700;flex-shrink:0">${i + 1}.</span>
            <span style="line-height:1.5">${item}</span>
          </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:#111111;border-radius:6px;padding:10px 12px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96;margin-bottom:5px">Pipeline</div>
          <div style="font-size:12px;color:#A8B4C0;line-height:1.5">${d.pipeline_note || '—'}</div>
        </div>
        <div style="background:#111111;border-radius:6px;padding:10px 12px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A8A96;margin-bottom:5px">Mindset</div>
          <div style="font-size:12px;color:#A8B4C0;line-height:1.5;font-style:italic">${d.motivation || '—'}</div>
        </div>
      </div>
    </div>`;
}

function timeSince(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'Generated just now';
  if (mins < 60) return `Generated ${mins}m ago`;
  return `Generated ${Math.floor(mins / 60)}h ago`;
}

async function dashGenerateBriefing(btn) {
  const bodyEl = document.getElementById('briefingBody');
  const card   = document.getElementById('briefingCard');
  if (!bodyEl) return;

  btn.disabled = true;
  btn.textContent = '✨ Generating…';
  bodyEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;color:var(--text-muted);font-size:13px">
      <div class="spinner"></div> Claude is reading your business data…
    </div>`;

  let res;
  try {
    res = await fetch('/api/ai/daily-briefing', { method: 'POST' }).then(r => r.json());
  } catch (err) {
    bodyEl.innerHTML = `<div class="alert-bar" style="margin:0">⚠️ Network error: ${err.message}</div>`;
    btn.disabled = false; btn.textContent = '✨ Generate AI Briefing';
    return;
  }

  btn.disabled = false;

  if (!res.success) {
    bodyEl.innerHTML = `<div class="alert-bar" style="margin:0">⚠️ ${res.error}</div>`;
    btn.textContent = '✨ Generate AI Briefing';
    return;
  }

  setBriefingCache(res.data);
  // Re-render the whole card with fresh header + content
  card.innerHTML = briefingHeader(true) + briefingContent(res.data);
}

// ── Follow-ups & activity ─────────────────────────────────────────────────────

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

// ── Chart ─────────────────────────────────────────────────────────────────────

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
        { label: 'Revenue',  data: chartData.map(m => m.revenue),  backgroundColor: '#C9A84C' },
        { label: 'Expenses', data: chartData.map(m => m.expenses), backgroundColor: '#E24B4A30' },
        { label: 'Profit',   data: chartData.map(m => m.profit),   backgroundColor: '#A8B4C080', type: 'line', tension: 0.3, borderColor: '#A8B4C0', fill: false },
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}

// ── Clear data ────────────────────────────────────────────────────────────────

async function dashClearData() {
  if (!confirm('⚠️ This permanently deletes ALL clients, transactions, leads and tasks. Are you sure?')) return;
  if (!confirm('Last warning — this cannot be undone. Delete everything?')) return;
  const res = await fetch('/api/settings/clear-sample-data', { method: 'POST' }).then(r => r.json());
  if (res.success) { alert(res.message || 'All data cleared.'); loadDashboard(); }
  else alert(res.error || 'Clear failed');
}
