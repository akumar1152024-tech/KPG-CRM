const Finance = (() => {
  const now = new Date();
  let currentMonth = now.getMonth() + 1;
  let currentYear  = now.getFullYear();
  let barChart = null, donutChart = null;

  async function load() { await loadMonth(); }

  async function loadMonth() {
    const q = `?month=${currentMonth}&year=${currentYear}`;
    updateMonthDisplay();
    const [summary, income, expenses, categories] = await Promise.all([
      api.get(`/api/finance/summary${q}`),
      api.get(`/api/finance/income${q}`),
      api.get(`/api/finance/expenses${q}`),
      api.get(`/api/finance/categories${q}`),
    ]);

    if (summary.success) renderSummary(summary.data);
    if (income.success)  renderIncomeList(income.data);
    if (expenses.success) renderExpenseList(expenses.data);
    if (categories.success) renderCategoryBars(categories.data.expenses);
    await loadChart();
    await loadGoals();
  }

  function updateMonthDisplay() {
    const label = new Date(currentYear, currentMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const el = document.getElementById('financeMonthDisplay');
    if (el) el.textContent = label;
  }

  function prevMonth() {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadMonth();
  }
  function nextMonth() {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    loadMonth();
  }

  function renderSummary(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('fRevenue', fmt$(d.totalRevenue));
    set('fExpenses', fmt$(d.totalExpenses));
    set('fProfit', fmt$(d.netProfit));
    set('fMargin', fmtPct(d.profitMargin));
    const profEl = document.getElementById('fProfit');
    if (profEl) profEl.className = `stat-value ${d.netProfit < 0 ? 'red' : ''}`;

    set('revGoalLabel',  `${fmt$(d.totalRevenue)} / ${fmt$(d.revenueGoal)}`);
    set('profGoalLabel', `${fmt$(d.netProfit)} / ${fmt$(d.profitGoal)}`);
    const rBar = document.getElementById('revGoalBar');
    const pBar = document.getElementById('profGoalBar');
    if (rBar) rBar.style.width = d.revenueProgress + '%';
    if (pBar) pBar.style.width = d.profitProgress + '%';
  }

  function renderIncomeList(rows) {
    const el = document.getElementById('incomeList');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="loading-cell">No income entries this month</div>'; return; }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    el.innerHTML = rows.map(r => `
      <div class="entry-row">
        <span class="entry-date">${r.date?.slice(5) || ''}</span>
        <div style="flex:1;min-width:0">
          <div class="entry-desc">${r.description}</div>
          <div class="entry-cat">${r.category}</div>
        </div>
        <span class="entry-amt income">${fmt$(r.amount)}</span>
        <button class="btn-icon" style="color:var(--danger)" onclick="Finance.deleteIncome(${r.id})">✕</button>
      </div>`).join('') +
      `<div class="entry-row" style="font-weight:700;border-top:2px solid var(--border)"><span style="flex:1">Total</span><span class="entry-amt income">${fmt$(total)}</span></div>`;
  }

  function renderExpenseList(rows) {
    const el = document.getElementById('expenseList');
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="loading-cell">No expense entries this month</div>'; return; }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    el.innerHTML = rows.map(r => `
      <div class="entry-row">
        <span class="entry-date">${r.date?.slice(5) || ''}</span>
        <div style="flex:1;min-width:0">
          <div class="entry-desc">${r.description} ${r.recurring ? '<span style="font-size:10px;color:var(--primary)">↻</span>' : ''}</div>
          <div class="entry-cat">${r.category}</div>
        </div>
        <span class="entry-amt expense">${fmt$(r.amount)}</span>
        <button class="btn-icon" style="color:var(--danger)" onclick="Finance.deleteExpense(${r.id})">✕</button>
      </div>`).join('') +
      `<div class="entry-row" style="font-weight:700;border-top:2px solid var(--border)"><span style="flex:1">Total</span><span class="entry-amt expense">${fmt$(total)}</span></div>`;
  }

  function renderCategoryBars(cats) {
    const el = document.getElementById('expCategoryBars');
    if (!el || !cats) return;
    if (!cats.length) { el.innerHTML = '<div class="loading-cell">No expenses</div>'; return; }
    const max = Math.max(...cats.map(c => c.total));
    el.innerHTML = cats.map(c => `
      <div class="cat-bar-row">
        <span class="cat-bar-label">${c.category}</span>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${max > 0 ? (c.total/max*100).toFixed(1) : 0}%"></div></div>
        <span class="cat-bar-val">${fmt$(c.total)}</span>
      </div>`).join('');
  }

  async function loadChart() {
    const data = await api.get('/api/finance/chart');
    if (!data.success) return;
    const canvas = document.getElementById('financeBarChart');
    if (!canvas) return;
    if (barChart) { barChart.destroy(); barChart = null; }
    barChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.data.map(d => d.label),
        datasets: [
          { label: 'Revenue',  data: data.data.map(d => d.revenue),  backgroundColor: 'rgba(15,110,86,.7)', borderRadius: 4 },
          { label: 'Expenses', data: data.data.map(d => d.expenses), backgroundColor: 'rgba(226,75,74,.6)', borderRadius: 4 },
          { label: 'Profit',   data: data.data.map(d => d.profit),   backgroundColor: 'rgba(59,109,17,.6)', borderRadius: 4 },
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '$'+v } } } }
    });
  }

  async function loadGoals() {
    const data = await api.get(`/api/finance/goals?month=${currentMonth}&year=${currentYear}`);
    if (!data.success) return;
    const el1 = document.getElementById('goalRevenue');
    const el2 = document.getElementById('goalProfit');
    if (el1) el1.value = data.data.revenue_goal || '';
    if (el2) el2.value = data.data.profit_goal  || '';
  }

  async function saveGoals(e) {
    e.preventDefault();
    const data = await api.post('/api/finance/goals', {
      month: currentMonth, year: currentYear,
      revenue_goal: document.getElementById('goalRevenue').value,
      profit_goal:  document.getElementById('goalProfit').value,
    });
    if (data.success) { showToast('Goals saved', 'success'); loadMonth(); }
    else showToast(data.error, 'error');
  }

  async function deleteIncome(id) {
    const ok = await confirmDialog('Delete this income entry?');
    if (!ok) return;
    const data = await api.delete(`/api/finance/income/${id}`);
    if (data.success) { showToast('Deleted', 'success'); loadMonth(); }
    else showToast(data.error, 'error');
  }

  async function deleteExpense(id) {
    const ok = await confirmDialog('Delete this expense entry?');
    if (!ok) return;
    const data = await api.delete(`/api/finance/expenses/${id}`);
    if (data.success) { showToast('Deleted', 'success'); loadMonth(); }
    else showToast(data.error, 'error');
  }

  function openIncomeModal() {
    document.getElementById('incDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('incomeModal')?.classList.add('open');
  }
  function closeIncomeModal() { document.getElementById('incomeModal')?.classList.remove('open'); }

  async function submitIncome(e) {
    e.preventDefault();
    const data = await api.post('/api/finance/income', {
      description: document.getElementById('incDesc').value,
      amount:      document.getElementById('incAmount').value,
      category:    document.getElementById('incCategory').value,
      date:        document.getElementById('incDate').value,
    });
    if (data.success) { showToast('Income logged', 'success'); closeIncomeModal(); e.target.reset(); loadMonth(); }
    else showToast(data.error, 'error');
  }

  function openExpenseModal() {
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expenseModal')?.classList.add('open');
  }
  function closeExpenseModal() { document.getElementById('expenseModal')?.classList.remove('open'); }

  async function submitExpense(e) {
    e.preventDefault();
    const data = await api.post('/api/finance/expenses', {
      description: document.getElementById('expDesc').value,
      amount:      document.getElementById('expAmount').value,
      category:    document.getElementById('expCategory').value,
      date:        document.getElementById('expDate').value,
      recurring:   document.getElementById('expRecurring')?.checked ? 1 : 0,
    });
    if (data.success) { showToast('Expense logged', 'success'); closeExpenseModal(); e.target.reset(); loadMonth(); }
    else showToast(data.error, 'error');
  }

  function exportCSV() {
    window.open(`/api/finance/export/csv?month=${currentMonth}&year=${currentYear}`, '_blank');
  }

  return { load, prevMonth, nextMonth, saveGoals, deleteIncome, deleteExpense, openIncomeModal, closeIncomeModal, submitIncome, openExpenseModal, closeExpenseModal, submitExpense, exportCSV };
})();
