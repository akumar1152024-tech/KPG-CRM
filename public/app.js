// ─── GLOBAL APP ──────────────────────────────────────────────────────────────

const App = (() => {
  const SECTIONS = {
    dashboard:   { title: 'Dashboard',       loader: () => Dashboard.load() },
    crm:         { title: 'CRM',             loader: () => CRM.load() },
    finance:     { title: 'Finance',         loader: () => Finance.load() },
    pipeline:    { title: 'Pipeline',        loader: () => Pipeline.load() },
    leads:       { title: 'Leads',           loader: () => Leads.load() },
    'meta-ads':  { title: 'Meta Ads',        loader: () => MetaAds.load() },
    content:     { title: 'Content',         loader: () => Content.load() },
    automations: { title: 'Automations',     loader: () => Automations.load() },
    tasks:       { title: 'Tasks',           loader: () => Tasks.load() },
    sheets:      { title: 'Google Sheets',   loader: () => Sheets.load() },
    settings:    { title: 'Settings',        loader: () => Settings.load() },
  };

  let currentSection = 'dashboard';

  function navigate(section) {
    if (!SECTIONS[section]) return;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('[data-section]').forEach(l => l.classList.remove('active'));
    const el = document.getElementById(`section-${section}`);
    if (el) el.classList.add('active');
    const navEl = document.querySelector(`[data-section="${section}"]`);
    if (navEl) navEl.classList.add('active');
    document.getElementById('pageTitle').textContent = SECTIONS[section].title;
    currentSection = section;
    try { SECTIONS[section].loader(); } catch (e) { console.error('Section load error:', e); }
    if (window.innerWidth < 768) closeSidebar();
  }

  function setupNav() {
    document.querySelectorAll('[data-section]').forEach(link => {
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.section); });
    });
  }

  function setupMobileSidebar() {
    const hamburger = document.getElementById('hamburger');
    const overlay   = document.getElementById('sidebarOverlay');
    const closeBtn  = document.getElementById('sidebarClose');
    hamburger?.addEventListener('click', openSidebar);
    overlay?.addEventListener('click', closeSidebar);
    closeBtn?.addEventListener('click', closeSidebar);
  }

  function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
  function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

  function updateGreeting() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const coachName = document.body.dataset.coachName || 'Kash';
    const el = document.getElementById('greeting');
    if (el) el.textContent = `${greeting}, ${coachName}`;
    const dateEl = document.getElementById('topbarDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  async function updateTaskBadge() {
    try {
      const data = await api.get('/api/tasks/overdue/count');
      const badge = document.getElementById('tasksBadge');
      if (!badge) return;
      if (data.count > 0) { badge.textContent = data.count; badge.style.display = 'inline-flex'; }
      else badge.style.display = 'none';
    } catch {}
  }

  function init() {
    setupNav();
    setupMobileSidebar();
    updateGreeting();
    updateTaskBadge();
    setInterval(updateTaskBadge, 60000);
    navigate('dashboard');
  }

  return { init, navigate, updateTaskBadge, closeSidebar };
})();

// ─── API HELPER ───────────────────────────────────────────────────────────────

const api = {
  async _req(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
    return json;
  },
  get:    (url)       => api._req('GET', url),
  post:   (url, body) => api._req('POST', url, body),
  put:    (url, body) => api._req('PUT', url, body),
  patch:  (url, body) => api._req('PATCH', url, body),
  delete: (url)       => api._req('DELETE', url),
};

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'success', steps = [], duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${icons[type] || '✓'}</span>
    <div style="flex:1">
      <div class="toast-title">${message}</div>
      ${steps.length ? `<div class="toast-steps">${steps.map(s => `<div class="toast-step">✓ ${s}</div>`).join('')}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + steps.length * 400);
}

// ─── CONFIRM ─────────────────────────────────────────────────────────────────

function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Confirm</h2></div>
        <div style="padding:20px;font-size:14px">${message}</div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="confirmNo">Cancel</button>
          <button class="btn btn-danger" id="confirmYes">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmYes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#confirmNo').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ─── AUTOMATION CONFIRM ───────────────────────────────────────────────────────

function automationDialog(automationName, clientName) {
  const labels = {
    onboardClient:   'Onboard Client',   followUpLead:   'Follow Up Lead',
    sendProposal:    'Send Proposal',    reEngageChurned:'Re-engage Churned',
    monthlyCheckIn:  'Monthly Check-in', paymentFailed:  'Payment Failed',
    endOfProgram:    'End of Program',
  };
  const label = labels[automationName] || automationName;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Run Automation</h2></div>
        <div style="padding:20px">
          <p style="margin-bottom:8px">Run <strong>${label}</strong> for <strong>${clientName}</strong>?</p>
          <p style="font-size:13px;color:var(--text-muted)">This will send emails and create tasks automatically.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="autoNo">Cancel</button>
          <button class="btn btn-primary" id="autoYes">Run Automation</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#autoYes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#autoNo').onclick  = () => { overlay.remove(); resolve(false); };
  });
}

async function runAutomation(automationName, clientId, clientName, btn) {
  const confirmed = await automationDialog(automationName, clientName);
  if (!confirmed) return;
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try {
    const data = await api.post('/api/automations/run', { automation: automationName, client_id: clientId });
    if (data.success) {
      showToast(`${automationName.replace(/([A-Z])/g, ' $1').trim()} complete`, 'success', data.steps || [], 5000);
      App.updateTaskBadge();
    } else {
      showToast(data.error || 'Automation failed', 'error');
    }
  } catch (e) {
    showToast('Automation error', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

function fmt$  (n)  { return '$' + (parseFloat(n) || 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmtPct(n)  { return (parseFloat(n) || 0).toFixed(1) + '%'; }
function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtRelative(d) {
  if (!d) return 'never';
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days === 0) return 'today'; if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
function fmtAgo(iso) {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return fmtRelative(iso.split('T')[0]);
}

const STATUS_BADGE = s => `<span class="badge badge-${s}">${s.replace(/_/g,' ')}</span>`;
const PRIORITY_BADGE = p => `<span class="badge badge-priority-${p}">${p}</span>`;

const INT_ICONS = { email:'📧', call:'📞', whatsapp:'💬', dm:'📩', meeting:'📅', note:'📝', stripe_payment:'💳', calendly_booking:'📅', form_submission:'📋' };

function setLoadingBtn(btn, loading, label = '') {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span> Loading…' : label || btn.dataset.label || btn.textContent;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => App.init());
