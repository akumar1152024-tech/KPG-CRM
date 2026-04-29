let finMonth = new Date().getMonth() + 1, finYear = new Date().getFullYear(), finChart = null;

async function loadFinance() {
  const el = document.getElementById('section-finance');
  el.innerHTML = finShell();
  document.getElementById('finPrev').addEventListener('click', () => { stepMonth(-1); });
  document.getElementById('finNext').addEventListener('click', () => { stepMonth(1); });
  await refreshFinance();
}

function finShell() {
  return `
    <div class="fin-month-bar">
      <button id="finPrev" class="btn btn-outline">&#8249; Prev</button>
      <span id="finMonthLabel" class="month-display"></span>
      <button id="finNext" class="btn btn-outline">Next &#8250;</button>
      <a id="finExportBtn" class="btn btn-outline" target="_blank">⬇ Export CSV</a>
    </div>
    <div class="stat-cards" id="finStats"></div>
    <div id="finGoals" class="goals-progress"></div>
    <div class="finance-grid">
      <div class="finance-panel">
        <div class="panel-header"><h3>Income</h3>
          <button class="btn btn-primary btn-sm" onclick="finOpenModal('income')">+ Add</button>
        </div>
        <div id="incomeList" class="entry-list"></div>
      </div>
      <div class="finance-panel">
        <div class="panel-header"><h3>Expenses</h3>
          <button class="btn btn-primary btn-sm" onclick="finOpenModal('expense')">+ Add</button>
        </div>
        <div id="expenseList" class="entry-list"></div>
      </div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Revenue vs Expenses — 6 months</h3><canvas id="finBarChart" height="200"></canvas></div>
      <div class="chart-card"><h3>Expense categories</h3><div id="expCatBars"></div></div>
    </div>
    <div class="modal-overlay" id="finModal">
      <div class="modal modal-sm">
        <div class="modal-header"><h2 id="finModalTitle">Log Income</h2>
          <button class="modal-close" onclick="finCloseModal()">✕</button>
        </div>
        <form onsubmit="finSubmit(event)">
          <input type="hidden" id="finType" />
          <div class="form-group"><label>Description *</label><input id="finDesc" class="form-input" required /></div>
          <div class="form-group"><label>Amount ($) *</label><input id="finAmount" type="number" class="form-input" min="0" step="0.01" required /></div>
          <div class="form-group"><label>Category</label><select id="finCat" class="form-input"></select></div>
          <div class="form-group"><label>Date</label><input id="finDate" type="date" class="form-input" /></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="finCloseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;
}

async function refreshFinance() {
  const m = finMonth, y = finYear;
  document.getElementById('finMonthLabel').textContent =
    new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  document.getElementById('finExportBtn').href = `/api/finance/export?month=${m}&year=${y}`;

  const [sumR, incR, expR, catR, chartR] = await Promise.all([
    fetch(`/api/finance/summary?month=${m}&year=${y}`).then(r => r.json()),
    fetch(`/api/finance/income?month=${m}&year=${y}`).then(r => r.json()),
    fetch(`/api/finance/expenses?month=${m}&year=${y}`).then(r => r.json()),
    fetch(`/api/finance/categories?month=${m}&year=${y}`).then(r => r.json()),
    fetch('/api/finance/chart').then(r => r.json()),
  ]);

  if (sumR.success)   renderSummary(sumR.data);
  if (incR.success)   renderList('incomeList',  incR.data,  'income');
  if (expR.success)   renderList('expenseList', expR.data,  'expense');
  if (catR.success)   renderCatBars(catR.data.expenses);
  if (chartR.success) buildChart(chartR.data);
}

function renderSummary(d) {
  document.getElementById('finStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">$${d.totalRevenue.toLocaleString()}</div><div class="stat-label">Revenue</div></div>
    <div class="stat-card"><div class="stat-value red">$${d.totalExpenses.toLocaleString()}</div><div class="stat-label">Expenses</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${d.netProfit>=0?'var(--success)':'var(--danger)'}">$${d.netProfit.toLocaleString()}</div><div class="stat-label">Net profit</div></div>
    <div class="stat-card"><div class="stat-value">${d.profitMargin}%</div><div class="stat-label">Margin</div></div>`;
  document.getElementById('finGoals').innerHTML = `
    <div class="progress-item">
      <div class="progress-header"><span>Revenue goal</span><span>$${d.totalRevenue.toLocaleString()} / $${d.revenueGoal.toLocaleString()}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(d.revenueProgress,100)}%"></div></div>
    </div>
    <div class="progress-item">
      <div class="progress-header"><span>Profit goal</span><span>$${d.netProfit.toLocaleString()} / $${d.profitGoal.toLocaleString()}</span></div>
      <div class="progress-bar"><div class="progress-fill green" style="width:${Math.min(d.profitProgress,100)}%"></div></div>
    </div>`;
}

function renderList(elId, rows, type) {
  const el = document.getElementById(elId);
  if (!rows.length) { el.innerHTML = '<div class="loading-cell">None this month</div>'; return; }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  el.innerHTML = rows.map(r => `
    <div class="entry-row">
      <div class="entry-body">
        <div class="entry-desc">${r.description}</div>
        <div class="entry-meta">${r.category} · ${r.date}</div>
      </div>
      <div class="entry-amount ${type==='expense'?'red':''}">$${r.amount.toLocaleString()}</div>
      <button class="btn btn-sm" style="color:var(--danger)" onclick="finDelete('${type}',${r.id})">✕</button>
    </div>`).join('') +
    `<div class="entry-row total-row"><div class="entry-body"><strong>Total</strong></div>
      <div class="entry-amount"><strong>$${total.toLocaleString()}</strong></div><div></div></div>`;
}

function renderCatBars(cats) {
  const el = document.getElementById('expCatBars');
  if (!cats || !cats.length) { el.innerHTML = '<div class="loading-cell">No expense data</div>'; return; }
  const max = cats[0].total;
  el.innerHTML = cats.map(c => `
    <div class="cat-bar-row">
      <div class="cat-bar-label">${c.category}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(c.total/max*100).toFixed(0)}%"></div></div>
      <div class="cat-bar-val">$${c.total.toLocaleString()}</div>
    </div>`).join('');
}

function buildChart(data) {
  const ctx = document.getElementById('finBarChart');
  if (!ctx) return;
  if (finChart) finChart.destroy();
  finChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'Revenue',  data: data.map(d => d.revenue),  backgroundColor: '#C9A84C' },
        { label: 'Expenses', data: data.map(d => d.expenses), backgroundColor: '#E24B4A40' },
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}

const INC_CATS = ['1:1 coaching','group program','course sale','stripe payment','other'];
const EXP_CATS = ['software','advertising','content creation','education','equipment','contractor','other'];

function finOpenModal(type) {
  document.getElementById('finType').value = type;
  document.getElementById('finModalTitle').textContent = type === 'income' ? 'Log Income' : 'Log Expense';
  document.getElementById('finCat').innerHTML = (type === 'income' ? INC_CATS : EXP_CATS)
    .map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('finDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('finDesc').value = '';
  document.getElementById('finAmount').value = '';
  document.getElementById('finModal').classList.add('open');
}

function finCloseModal() { document.getElementById('finModal')?.classList.remove('open'); }

async function finSubmit(e) {
  e.preventDefault();
  const type = document.getElementById('finType').value;
  const payload = {
    description: document.getElementById('finDesc').value,
    amount:      document.getElementById('finAmount').value,
    category:    document.getElementById('finCat').value,
    date:        document.getElementById('finDate').value,
  };
  const res = await fetch(`/api/finance/${type === 'income' ? 'income' : 'expenses'}`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
  }).then(r => r.json());
  if (res.success) { finCloseModal(); refreshFinance(); }
  else alert(res.error || 'Save failed');
}

async function finDelete(type, id) {
  if (!confirm('Delete this entry?')) return;
  await fetch(`/api/finance/${type === 'income' ? 'income' : 'expenses'}/${id}`, { method: 'DELETE' });
  refreshFinance();
}

function stepMonth(dir) {
  finMonth += dir;
  if (finMonth > 12) { finMonth = 1; finYear++; }
  if (finMonth < 1)  { finMonth = 12; finYear--; }
  refreshFinance();
}
