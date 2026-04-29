let contentTab = 'planning';

async function loadContent() {
  const el = document.getElementById('section-content');
  el.innerHTML = `
    <div class="tabs-bar">
      ${['planning','analytics','ideas','competitors','hashtags'].map(t => `
        <button class="tab-btn ${t==='planning'?'active':''}" data-tab="${t}" onclick="contentSwitch('${t}')">
          ${{planning:'📅 Planning',analytics:'📈 Analytics',ideas:'💡 Ideas',competitors:'🕵️ Competitors',hashtags:'🏷 Hashtags'}[t]}
        </button>`).join('')}
    </div>
    <div id="contentPanel"></div>
    <div class="modal-overlay" id="contentModal">
      <div class="modal modal-sm">
        <div class="modal-header"><h2>Add to Calendar</h2>
          <button class="modal-close" onclick="document.getElementById('contentModal').classList.remove('open')">✕</button>
        </div>
        <form onsubmit="contentAddCal(event)">
          <div class="form-grid">
            <div class="form-group"><label>Platform</label>
              <select id="calPlat" class="form-input">
                ${['Instagram','TikTok','YouTube','LinkedIn','Email'].map(p=>`<option>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Type</label>
              <select id="calType" class="form-input">
                ${['Post','Reel','Story','Video','Newsletter'].map(t=>`<option>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Post date</label><input id="calDate" type="date" class="form-input" /></div>
            <div class="form-group"><label>Status</label>
              <select id="calStatus" class="form-input">
                ${['idea','drafted','scheduled','posted'].map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group"><label>Caption / notes</label><textarea id="calNotes" class="form-input" rows="3" placeholder="Caption idea or topic notes…"></textarea></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="document.getElementById('contentModal').classList.remove('open')">Cancel</button>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>`;
  contentSwitch('planning');
}

function contentSwitch(tab) {
  contentTab = tab;
  document.querySelectorAll('#section-content .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const el = document.getElementById('contentPanel');
  if (tab === 'planning')       loadPlanning(el);
  else if (tab === 'analytics') loadAnalytics(el);
  else if (tab === 'ideas')     loadIdeas(el);
  else el.innerHTML = `<div class="empty-state"><div class="empty-icon">🚧</div>${tab.charAt(0).toUpperCase()+tab.slice(1)} — coming soon</div>`;
}

// ─── PLANNING ─────────────────────────────────────────────────────────────────

async function loadPlanning(el) {
  el.innerHTML = '<div class="loading-cell">Loading…</div>';
  const res = await fetch('/api/content/calendar').then(r => r.json());
  const STATUS_COLOR = { idea:'badge-lead', drafted:'badge-trial', scheduled:'badge-active', posted:'badge-active' };
  const PLAT_COLOR = { Instagram:'#E1306C', TikTok:'#010101', YouTube:'#FF0000', LinkedIn:'#0077B5', Email:'#0F6E56' };
  el.innerHTML = `
    <div class="section-header">
      <h3 style="margin:0">Content Calendar</h3>
      <button class="btn btn-primary" onclick="document.getElementById('contentModal').classList.add('open')">+ Add Content</button>
    </div>
    ${res.success && res.data.length ? `
    <div class="content-cal-grid">
      ${res.data.map(c => `
        <div class="content-cal-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <span class="badge badge-platform" style="background:${PLAT_COLOR[c.platform]||'#888'}20;color:${PLAT_COLOR[c.platform]||'#888'}">${c.platform}</span>
            <span class="badge ${STATUS_COLOR[c.status]||''}">${c.status}</span>
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${c.content_type||'Post'}</div>
          ${c.caption_notes ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.4">${c.caption_notes.substring(0,80)}${c.caption_notes.length>80?'…':''}</div>` : ''}
          ${c.post_date ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">📅 ${c.post_date}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:10px">
            <select class="select-filter" style="font-size:11px;flex:1" onchange="contentUpdateStatus(${c.id},this.value)">
              ${['idea','drafted','scheduled','posted'].map(s=>`<option value="${s}" ${c.status===s?'selected':''}>${s}</option>`).join('')}
            </select>
            <button class="btn btn-sm" style="color:var(--danger)" onclick="contentDeleteCal(${c.id})">✕</button>
          </div>
        </div>`).join('')}
    </div>` : '<div class="empty-state"><div class="empty-icon">📅</div>No content planned yet. Add some!</div>'}`;
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

let analyticsPlatform = 'YouTube', analyticsDays = '30', analyticsSort = 'views';
let analyticsLineChart = null, analyticsEngChart = null;

const _PLAT_ICON  = { YouTube: '▶️', TikTok: '🎵', Instagram: '📷' };
const _PLAT_COLOR = { YouTube: '#FF0000', TikTok: '#555555', Instagram: '#E1306C' };

async function loadAnalytics(el) {
  el.innerHTML = '<div class="loading-cell">Loading analytics…</div>';

  let sumRes, postsRes, statsRes;
  try {
    [sumRes, postsRes, statsRes] = await Promise.all([
      fetch('/api/content/analytics/summary').then(r => r.json()),
      fetch(`/api/content/analytics/${analyticsPlatform}?days=${analyticsDays}&sort=${analyticsSort}`).then(r => r.json()),
      fetch(`/api/content/analytics/${analyticsPlatform}/stats`).then(r => r.json()),
    ]);
  } catch (err) {
    el.innerHTML = `<div class="alert-bar" style="margin:20px">⚠️ Failed to load analytics: ${err.message}</div>`;
    return;
  }

  const platforms = ['YouTube', 'TikTok', 'Instagram'];
  const posts  = (postsRes.success && postsRes.data) ? postsRes.data : [];
  const stats  = statsRes.success ? statsRes.data : null;
  const color  = _PLAT_COLOR[analyticsPlatform] || '#888';
  const icon   = _PLAT_ICON[analyticsPlatform]  || '📱';

  // Growth badge
  let growthHtml = 'No weekly data yet';
  if (stats?.growth) {
    const tw = stats.growth.this_week_views || 0;
    const lw = stats.growth.last_week_views || 0;
    if (lw > 0 || tw > 0) {
      const pct   = lw > 0 ? Math.round((tw - lw) / lw * 100) : (tw > 0 ? 100 : 0);
      const arrow = pct >= 0 ? '↑' : '↓';
      const col   = pct >= 0 ? 'var(--success)' : 'var(--danger)';
      growthHtml  = `<span style="color:${col};font-weight:700">${arrow} ${Math.abs(pct)}%</span> vs last week · ${tw.toLocaleString()} views this week`;
    }
  }

  el.innerHTML = `
    <!-- Controls -->
    <div class="section-header" style="flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${platforms.map(p => `
          <button class="chip ${p===analyticsPlatform?'active':''}" onclick="contentSetPlatform('${p}')">${_PLAT_ICON[p]} ${p}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="select-filter" onchange="contentSetDays(this.value)">
          <option value="7"  ${analyticsDays==='7' ?'selected':''}>Last 7 days</option>
          <option value="30" ${analyticsDays==='30'?'selected':''}>Last 30 days</option>
          <option value="90" ${analyticsDays==='90'?'selected':''}>Last 90 days</option>
          <option value=""   ${analyticsDays===''  ?'selected':''}>All time</option>
        </select>
        <select class="select-filter" onchange="contentSetSort(this.value)">
          <option value="views"      ${analyticsSort==='views'     ?'selected':''}>Most Viewed</option>
          <option value="likes"      ${analyticsSort==='likes'     ?'selected':''}>Most Liked</option>
          <option value="recent"     ${analyticsSort==='recent'    ?'selected':''}>Most Recent</option>
          <option value="engagement" ${analyticsSort==='engagement'?'selected':''}>Highest Engagement</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="contentScrape('${analyticsPlatform.toLowerCase()}',this)">⟳ Scrape Now</button>
      </div>
    </div>

    <!-- Summary stat cards -->
    ${stats?.summary?.total_posts ? `
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value" style="font-size:20px">${(stats.summary.total_views||0).toLocaleString()}</div>
        <div class="stat-label">Total Views</div>
        <div class="stat-sub">${stats.summary.total_posts} posts scraped</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:20px">${(stats.summary.avg_views||0).toLocaleString()}</div>
        <div class="stat-label">Avg Views / Post</div>
        <div class="stat-sub">Best: ${(stats.summary.best_views||0).toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:20px">${stats.summary.avg_engagement||0}%</div>
        <div class="stat-label">Avg Engagement</div>
        <div class="stat-sub">Best post: ${stats.summary.best_engagement||0}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:20px">${stats.bestDayOfWeek||'—'}</div>
        <div class="stat-label">Best Day to Post</div>
        <div class="stat-sub" style="font-size:11px;line-height:1.4">${growthHtml}</div>
      </div>
    </div>` : ''}

    ${posts.length === 0 ? `
    <div class="empty-state mt-20">
      <div class="empty-icon">${icon}</div>
      No ${analyticsPlatform} posts scraped yet.<br>
      <button class="btn btn-primary mt-16" onclick="contentScrape('${analyticsPlatform.toLowerCase()}',this)">⟳ Scrape ${analyticsPlatform} Now</button>
    </div>` : `

    <!-- Best post highlight -->
    ${stats?.bestPost ? renderBestPost(stats.bestPost, color, icon) : ''}

    <!-- Charts row -->
    <div class="dash-grid mt-20">
      <div class="card">
        <div class="panel-header"><h3>Views Over Time</h3></div>
        <canvas id="analyticsLineChart" height="140"></canvas>
      </div>
      <div class="card">
        <div class="panel-header"><h3>Engagement Rate Per Post</h3></div>
        <canvas id="analyticsEngChart" height="140"></canvas>
      </div>
    </div>

    <!-- Top 10 posts grid -->
    <div class="panel-header mt-20" style="margin-bottom:12px">
      <h3>Top Posts — ${analyticsPlatform}</h3>
      <span style="font-size:12px;color:var(--text-muted)">${posts.length} posts · sorted by ${analyticsSort}</span>
    </div>
    <div class="content-posts-grid">
      ${posts.slice(0, 10).map(p => renderPostCard(p, icon, color)).join('')}
    </div>`}
  `;

  if (posts.length > 0) {
    const chrono = [...posts]
      .filter(p => p.posted_at)
      .sort((a, b) => a.posted_at.localeCompare(b.posted_at))
      .slice(-20);
    buildAnalyticsCharts(chrono.length ? chrono : posts.slice(0, 20), color);
  }
}

function renderBestPost(p, color, icon) {
  const date = p.posted_at ? p.posted_at.split('T')[0] : null;
  return `
    <div class="card mt-20" style="border:2px solid ${color}">
      <div class="panel-header" style="background:${color}12;border-bottom:1px solid ${color}30">
        <div>
          <h3 style="margin:0;color:${color}">⭐ Best Performing Post</h3>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${analyticsPlatform} · highest engagement rate</div>
        </div>
        <span class="badge" style="background:${color}20;color:${color};font-size:14px;font-weight:700">${p.engagement_rate||0}% eng.</span>
      </div>
      <div style="display:flex;gap:16px;padding:16px;flex-wrap:wrap;align-items:flex-start">
        ${p.thumbnail_url
          ? `<img src="${p.thumbnail_url}" style="width:130px;height:100px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display='none'">`
          : `<div style="width:130px;height:100px;background:${color}20;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0">${icon}</div>`}
        <div style="flex:1;min-width:200px">
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">
            ${(p.caption||'No caption').substring(0,200)}${(p.caption||'').length>200?'…':''}
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px">
            <span>👁 <strong>${(p.views||0).toLocaleString()}</strong></span>
            <span>❤ <strong>${(p.likes||0).toLocaleString()}</strong></span>
            <span>💬 <strong>${p.comments||0}</strong></span>
            <span>📈 <strong>${p.engagement_rate||0}%</strong></span>
            ${date ? `<span>📅 ${date}</span>` : ''}
          </div>
          ${p.post_url ? `<a href="${p.post_url}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="margin-top:12px;display:inline-block">🔗 View Original Post</a>` : ''}
        </div>
      </div>
    </div>`;
}

function renderPostCard(p, icon, color) {
  const date = p.posted_at ? p.posted_at.split('T')[0] : null;
  return `
    <div class="content-post-card">
      ${p.thumbnail_url
        ? `<img src="${p.thumbnail_url}" class="content-post-thumb" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="content-post-thumb-placeholder">${icon}</div>`}
      <div class="content-post-body">
        <div class="content-post-caption">${(p.caption||'No caption').substring(0,100)}${(p.caption||'').length>100?'…':''}</div>
        <div class="content-post-stats">
          <span>👁 ${(p.views||0).toLocaleString()}</span>
          <span>❤ ${(p.likes||0).toLocaleString()}</span>
          <span>💬 ${p.comments||0}</span>
          <span>📈 ${p.engagement_rate||0}%</span>
        </div>
        ${date ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">📅 ${date}</div>` : ''}
        ${p.post_url ? `<a href="${p.post_url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--primary);margin-top:6px;display:block">🔗 View post</a>` : ''}
      </div>
    </div>`;
}

function buildAnalyticsCharts(posts, color) {
  const labels = posts.map((p, i) => p.posted_at ? p.posted_at.split('T')[0].slice(5) : `#${i+1}`);

  const lineCtx = document.getElementById('analyticsLineChart');
  if (lineCtx) {
    if (analyticsLineChart) analyticsLineChart.destroy();
    analyticsLineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Views',
          data: posts.map(p => p.views || 0),
          borderColor: color,
          backgroundColor: color + '25',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  const engCtx = document.getElementById('analyticsEngChart');
  if (engCtx) {
    if (analyticsEngChart) analyticsEngChart.destroy();
    analyticsEngChart = new Chart(engCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Engagement %',
          data: posts.map(p => p.engagement_rate || 0),
          backgroundColor: color + '80',
          borderColor: color,
          borderWidth: 1,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

function contentSetPlatform(p) { analyticsPlatform = p; contentSwitch('analytics'); }
function contentSetDays(d)     { analyticsDays = d;      contentSwitch('analytics'); }
function contentSetSort(s)     { analyticsSort = s;      contentSwitch('analytics'); }

// ─── IDEAS ────────────────────────────────────────────────────────────────────

async function loadIdeas(el) {
  el.innerHTML = '<div class="loading-cell">Loading…</div>';
  const res = await fetch('/api/content/ideas').then(r => r.json());
  el.innerHTML = `
    <div class="section-header">
      <h3 style="margin:0">Content Ideas</h3>
      <button class="btn btn-primary" onclick="contentGenIdeas(this)">✨ Generate Ideas</button>
    </div>
    <div id="generatedIdeas"></div>
    <div class="panel-header" style="margin:20px 0 12px"><h3>Saved Ideas</h3></div>
    <div id="savedIdeas">${res.success && res.data.length ? `<div class="auto-grid">
      ${res.data.map(i => `
        <div class="auto-card">
          <div class="auto-card-header"><span class="badge badge-platform">${i.platform||'General'}</span></div>
          <div style="font-size:13px;margin:8px 0">${i.idea_text}</div>
          <button class="btn btn-primary btn-sm" onclick="contentSaveToCal('${encodeURIComponent(i.idea_text)}','${i.platform||'Instagram'}')">📅 Save to Calendar</button>
        </div>`).join('')}
    </div>` : '<div class="empty-state">No saved ideas. Generate some!</div>'}</div>`;
}

async function contentGenIdeas(btn) {
  btn.disabled = true; btn.textContent = '✨ Generating…';
  const res = await fetch('/api/content/ideas/generate', { method:'POST' }).then(r => r.json());
  btn.disabled = false; btn.textContent = '✨ Generate Ideas';
  const el = document.getElementById('generatedIdeas');
  if (!el) return;
  if (res.success && res.data.length) {
    el.innerHTML = `<div class="auto-grid">${res.data.map(i => `
      <div class="auto-card">
        <div class="auto-card-header"><span class="badge badge-platform">${i.platform||'General'}</span></div>
        <div style="font-size:13px;margin:8px 0">${i.idea_text}</div>
        <button class="btn btn-primary btn-sm" onclick="contentSaveToCal('${encodeURIComponent(i.idea_text)}','${i.platform||'Instagram'}')">💾 Save Idea</button>
      </div>`).join('')}</div>`;
  } else el.innerHTML = `<div class="alert-bar">⚠️ ${res.error||'No ideas generated — add some content analytics data first.'}</div>`;
}

// ─── SCRAPE / CALENDAR CRUD ───────────────────────────────────────────────────

async function contentScrape(platform, btn) {
  btn.disabled = true; btn.textContent = 'Scraping…';
  const res = await fetch(`/api/content/scrape/${platform}`).then(r => r.json());
  btn.disabled = false; btn.textContent = '⟳ Scrape Now';
  alert(res.message || res.error || (res.success ? 'Done!' : 'Failed — check Apify token'));
  if (res.success) loadAnalytics(document.getElementById('contentPanel'));
}

async function contentAddCal(e) {
  e.preventDefault();
  const payload = {
    platform: document.getElementById('calPlat').value,
    content_type: document.getElementById('calType').value,
    post_date: document.getElementById('calDate').value,
    status: document.getElementById('calStatus').value,
    caption_notes: document.getElementById('calNotes').value,
  };
  const res = await fetch('/api/content/calendar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json());
  if (res.success) { document.getElementById('contentModal').classList.remove('open'); contentSwitch('planning'); }
  else alert(res.error||'Save failed');
}

async function contentUpdateStatus(id, status) {
  await fetch(`/api/content/calendar/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) });
}

async function contentDeleteCal(id) {
  if (!confirm('Delete this content item?')) return;
  await fetch(`/api/content/calendar/${id}`, { method:'DELETE' });
  contentSwitch('planning');
}

async function contentSaveToCal(encodedText, platform) {
  const idea_text = decodeURIComponent(encodedText);
  const res = await fetch('/api/content/calendar', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ platform, content_type:'Post', caption_notes: idea_text, status:'idea' }) }).then(r=>r.json());
  if (res.success) alert('Added to content calendar!'); else alert(res.error||'Failed');
}
