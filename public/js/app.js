// Map section keys to loader function names (looked up at call time via window[])
const SECTION_FN = {
  dashboard:   'loadDashboard',
  crm:         'loadCRM',
  finance:     'loadFinance',
  pipeline:    'loadPipeline',
  leads:       'loadLeads',
  'meta-ads':  'loadMetaAds',
  content:     'loadContent',
  automations: 'loadAutomations',
  tasks:       'loadTasks',
  sheets:      'loadSheets',
  settings:    'loadSettings',
};

const TITLES = {
  dashboard:   'Dashboard',
  crm:         'CRM',
  finance:     'Finance',
  pipeline:    'Pipeline',
  leads:       'Leads',
  'meta-ads':  'Meta Ads',
  content:     'Content',
  automations: 'Automations',
  tasks:       'Tasks',
  sheets:      'Google Sheets',
  settings:    'Settings',
};

function navigate(section) {
  // Hide all sections, show target
  document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('section-' + section);
  if (target) target.classList.add('active');

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.section === section);
  });

  // Update page title
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = TITLES[section] || section;

  // Look up loader at call time so feature files can override stubs
  const fn = window[SECTION_FN[section]];
  if (fn) fn();
}

function setGreeting() {
  const el = document.getElementById('topbarGreeting');
  if (!el) return;
  const h = new Date().getHours();
  const time = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const coach = document.body.dataset.coachName || 'Coach';
  const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  el.textContent = `${time}, ${coach} · ${date}`;
}

function initNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.section);
    });
  });

  // Mobile sidebar toggle
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('active');
  });
  const closeBar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  };
  document.getElementById('sidebarClose')?.addEventListener('click', closeBar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeBar);
}

// ── Section loaders (stubs — replaced by feature JS files) ──────────────────

function loadDashboard()   { document.getElementById('section-dashboard').innerHTML   = '<div class="loading-cell">Dashboard coming soon…</div>'; }
function loadCRM()         { document.getElementById('section-crm').innerHTML         = '<div class="loading-cell">CRM coming soon…</div>'; }
function loadFinance()     { document.getElementById('section-finance').innerHTML     = '<div class="loading-cell">Finance coming soon…</div>'; }
function loadPipeline()    { document.getElementById('section-pipeline').innerHTML    = '<div class="loading-cell">Pipeline coming soon…</div>'; }
function loadLeads()       { document.getElementById('section-leads').innerHTML       = '<div class="loading-cell">Leads coming soon…</div>'; }
function loadMetaAds()     { document.getElementById('section-meta-ads').innerHTML    = '<div class="loading-cell">Meta Ads coming soon…</div>'; }
function loadContent()     { document.getElementById('section-content').innerHTML     = '<div class="loading-cell">Content coming soon…</div>'; }
function loadAutomations() { document.getElementById('section-automations').innerHTML = '<div class="loading-cell">Automations coming soon…</div>'; }
function loadTasks()       { document.getElementById('section-tasks').innerHTML       = '<div class="loading-cell">Tasks coming soon…</div>'; }
function loadSheets()      { document.getElementById('section-sheets').innerHTML      = '<div class="loading-cell">Google Sheets coming soon…</div>'; }
function loadSettings()    { document.getElementById('section-settings').innerHTML    = '<div class="loading-cell">Settings coming soon…</div>'; }

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  setGreeting();
  navigate('dashboard');
});
