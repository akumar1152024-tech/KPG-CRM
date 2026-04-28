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
  if (tab === 'planning')   loadPlanning(el);
  else if (tab === 'analytics') loadAnalytics(el);
  else if (tab === 'ideas')     loadIdeas(el);
  else el.innerHTML = `<div class="empty-state"><div class="empty-icon">🚧</div>${tab.charAt(0).toUpperCase()+tab.slice(1)} — coming soon</div>`;
}

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

async function loadAnalytics(el) {
  const res = await fetch('/api/content/analytics/summary').then(r => r.json());
  const platforms = ['YouTube','TikTok','Instagram'];
  el.innerHTML = `
    <div class="section-header"><h3 style="margin:0">Content Analytics</h3></div>
    ${res.success && res.data.byPlatform.length ? `
    <div class="stat-cards">${res.data.byPlatform.map(p => `
      <div class="stat-card">
        <div class="stat-value" style="font-size:20px">${(p.total_views||0).toLocaleString()}</div>
        <div class="stat-label">${p.platform} Views</div>
        <div class="stat-sub">${p.posts} posts · ${p.avg_engagement}% eng.</div>
      </div>`).join('')}</div>` : ''}
    <div class="auto-grid mt-20">
      ${platforms.map(p => `
        <div class="card" style="text-align:center;padding:24px">
          <div style="font-size:32px;margin-bottom:8px">${{YouTube:'▶️',TikTok:'🎵',Instagram:'📷'}[p]}</div>
          <div style="font-weight:700;margin-bottom:4px">${p}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">
            ${res.data?.lastScraped ? 'Last scraped: '+res.data.lastScraped : 'Never scraped'}
          </div>
          <button class="btn btn-primary btn-sm" onclick="contentScrape('${p.toLowerCase()}',this)">⟳ Scrape Now</button>
        </div>`).join('')}
    </div>`;
}

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

async function contentScrape(platform, btn) {
  btn.disabled = true; btn.textContent = 'Scraping…';
  const res = await fetch(`/api/content/scrape/${platform}`).then(r => r.json());
  btn.disabled = false; btn.textContent = '⟳ Scrape Now';
  alert(res.message || res.error || (res.success ? 'Done!' : 'Failed — check Apify token'));
  if (res.success) loadAnalytics(document.getElementById('contentPanel'));
}

async function contentAddCal(e) {
  e.preventDefault();
  const payload = { platform: document.getElementById('calPlat').value, content_type: document.getElementById('calType').value,
    post_date: document.getElementById('calDate').value, status: document.getElementById('calStatus').value,
    caption_notes: document.getElementById('calNotes').value };
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
