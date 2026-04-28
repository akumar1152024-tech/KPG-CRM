const Content = (() => {
  let activeTab = 'planning';

  async function load() { switchTab(activeTab); }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('#section-content .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('#section-content .tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
    if (tab === 'planning')    loadPlanning();
    if (tab === 'analytics')   loadAnalytics();
    if (tab === 'competitors') loadCompetitors();
    if (tab === 'hashtags')    loadHashtags();
    if (tab === 'ideas')       loadIdeas();
  }

  // ─── PLANNING ──────────────────────────────────────────────────────────────
  async function loadPlanning() {
    const data = await api.get('/api/content/calendar');
    const el = document.getElementById('calendarList');
    if (!el) return;
    if (!data.success || !data.data.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div>No content planned yet</div>'; return; }
    el.innerHTML = data.data.map(c => `
      <div class="task-row" style="margin-bottom:8px">
        <div class="task-body">
          <div class="task-title">${c.platform} — ${c.content_type || 'Post'}</div>
          <div class="task-meta">
            ${STATUS_BADGE(c.status)}
            ${c.post_date ? `<span>📅 ${fmtDate(c.post_date)}</span>` : ''}
            ${c.caption_notes ? `<span style="color:var(--text-muted)">${c.caption_notes.substring(0,60)}...</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <select class="select-filter" style="font-size:12px" onchange="Content.updateCalStatus(${c.id},this.value)">
            <option ${c.status==='idea'?'selected':''}>idea</option>
            <option ${c.status==='drafted'?'selected':''}>drafted</option>
            <option ${c.status==='scheduled'?'selected':''}>scheduled</option>
            <option ${c.status==='posted'?'selected':''}>posted</option>
          </select>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="Content.deleteCalItem(${c.id})">✕</button>
        </div>
      </div>`).join('');
  }

  async function addCalItem(e) {
    e.preventDefault();
    const data = await api.post('/api/content/calendar', {
      platform:      document.getElementById('calPlatform').value,
      content_type:  document.getElementById('calType').value,
      caption_notes: document.getElementById('calNotes').value,
      post_date:     document.getElementById('calDate').value,
      status:        document.getElementById('calStatus').value,
    });
    if (data.success) { showToast('Added to calendar', 'success'); e.target.reset(); loadPlanning(); }
    else showToast(data.error, 'error');
  }

  async function updateCalStatus(id, status) {
    await api.put(`/api/content/calendar/${id}`, { status });
    showToast('Status updated', 'success');
    loadPlanning();
  }

  async function deleteCalItem(id) {
    const ok = await confirmDialog('Delete this content item?');
    if (!ok) return;
    await api.delete(`/api/content/calendar/${id}`);
    loadPlanning();
  }

  // ─── ANALYTICS ────────────────────────────────────────────────────────────
  let analyticsPlatform = 'YouTube', analyticsSort = 'views';

  async function loadAnalytics() {
    const [summaryData, postsData] = await Promise.all([
      api.get('/api/content/analytics/summary'),
      api.get(`/api/content/analytics/${analyticsPlatform}?sort=${analyticsSort}`),
    ]);

    const summaryEl = document.getElementById('analyticsSummary');
    if (summaryEl && summaryData.success) {
      const platforms = summaryData.data.byPlatform;
      summaryEl.innerHTML = platforms.length ? platforms.map(p => `
        <div class="stat-card">
          <div class="stat-value" style="font-size:20px">${(p.total_views||0).toLocaleString()}</div>
          <div class="stat-label">${p.platform} Views</div>
          <div class="stat-sub">${p.posts} posts · ${p.avg_engagement}% eng.</div>
        </div>`).join('') :
        `<div class="stat-card"><div class="stat-value" style="font-size:20px">0</div><div class="stat-label">No data yet</div><div class="stat-sub">Scrape your platforms below</div></div>`;
    }

    const postsEl = document.getElementById('analyticsGrid');
    if (postsEl) {
      if (!postsData.success || !postsData.data.length) {
        postsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>No posts scraped for ${analyticsPlatform} yet.<br><button class="btn btn-primary mt-16" onclick="Content.scrape('${analyticsPlatform.toLowerCase()}')">Scrape ${analyticsPlatform} Now</button></div>`;
      } else {
        postsEl.innerHTML = `<div class="content-grid">${postsData.data.map(p => `
          <div class="content-post-card">
            ${p.thumbnail_url ? `<img src="${p.thumbnail_url}" class="content-post-thumb" onerror="this.style.display='none'">` : `<div class="content-post-thumb-placeholder">${analyticsPlatform==='YouTube'?'▶':'📱'}</div>`}
            <div class="content-post-body">
              <div class="content-post-caption">${p.caption || 'No caption'}</div>
              <div class="content-post-stats">
                <span>👁 ${(p.views||0).toLocaleString()}</span>
                <span>❤ ${(p.likes||0).toLocaleString()}</span>
                <span>💬 ${p.comments||0}</span>
                <span>📈 ${p.engagement_rate}%</span>
              </div>
            </div>
          </div>`).join('')}</div>`;
      }
    }
  }

  function setAnalyticsPlatform(platform) {
    analyticsPlatform = platform;
    document.querySelectorAll('#analyticsTabBtns button').forEach(b => b.classList.toggle('active', b.dataset.platform === platform));
    loadAnalytics();
  }
  function setAnalyticsSort(sort) { analyticsSort = sort; loadAnalytics(); }

  async function scrape(platform) {
    const btn = event.target;
    setLoadingBtn(btn, true, `Scrape ${platform}`);
    const endpoint = platform === 'all' ? '/api/content/scrape/all' : `/api/content/scrape/${platform}`;
    const method   = platform === 'all' ? 'post' : 'get';
    const data     = method === 'post' ? await api.post(endpoint) : await api.get(endpoint);
    setLoadingBtn(btn, false, `Scrape ${platform}`);
    if (data.success) { showToast(data.message, 'success'); loadAnalytics(); }
    else showToast(data.message || data.error || 'Scraping failed — check Apify token', 'warning');
  }

  // ─── COMPETITORS ──────────────────────────────────────────────────────────
  async function loadCompetitors() {
    const data = await api.get('/api/content/competitors');
    const el = document.getElementById('competitorsList');
    if (!el) return;
    if (!data.success || !data.data.length) { el.innerHTML = '<div class="empty-state">No competitors added yet</div>'; return; }
    el.innerHTML = `<div class="content-grid">${data.data.map(c => `
      <div class="competitor-card">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">@${c.username}</div>
        <span class="badge badge-platform">${c.platform}</span>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          ${c.follower_count ? `${c.follower_count.toLocaleString()} followers` : 'No data yet'}
          ${c.avg_views ? ` · ${c.avg_views.toLocaleString()} avg views` : ''}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${c.last_scraped ? 'Last scraped: ' + fmtRelative(c.last_scraped) : 'Not yet scraped'}</div>
      </div>`).join('')}</div>`;
  }

  async function addCompetitor(e) {
    e.preventDefault();
    const data = await api.post('/api/content/scrape/competitor', {
      platform: document.getElementById('compPlatform').value,
      username: document.getElementById('compUsername').value,
    });
    if (data.success) { showToast(data.message, 'success'); e.target.reset(); loadCompetitors(); }
    else showToast(data.error, 'error');
  }

  // ─── HASHTAGS ──────────────────────────────────────────────────────────────
  async function loadHashtags() {
    const hashtag  = document.getElementById('hashtagInput')?.value;
    const platform = document.getElementById('hashtagPlatform')?.value || 'TikTok';
    if (!hashtag) return;
    const data = await api.get(`/api/content/hashtags?platform=${platform}&hashtag=${hashtag}`);
    const el = document.getElementById('hashtagResults');
    if (!el) return;
    if (!data.success || !data.data.length) { el.innerHTML = '<div class="empty-state">No data. Click Search to scrape.</div>'; return; }
    el.innerHTML = `<table class="data-table"><thead><tr><th>Caption</th><th>Views</th><th>Likes</th><th>Engagement</th></tr></thead><tbody>
      ${data.data.map(h => `<tr><td style="font-size:12px;max-width:300px">${(h.caption||'').substring(0,100)}</td><td>${(h.views||0).toLocaleString()}</td><td>${(h.likes||0).toLocaleString()}</td><td>${h.engagement_rate}%</td></tr>`).join('')}
    </tbody></table>`;
  }

  async function searchHashtag(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    setLoadingBtn(btn, true, 'Search');
    const data = await api.post('/api/content/scrape/hashtag', {
      platform: document.getElementById('hashtagPlatform').value,
      hashtag:  document.getElementById('hashtagInput').value,
      limit:    20,
    });
    setLoadingBtn(btn, false, 'Search');
    if (data.success) { showToast(data.message, 'success'); loadHashtags(); }
    else showToast(data.message || 'Configure Apify to scrape hashtags', 'warning');
  }

  // ─── IDEAS ─────────────────────────────────────────────────────────────────
  async function loadIdeas() {
    const data = await api.get('/api/content/ideas');
    const el = document.getElementById('savedIdeas');
    if (!el) return;
    if (!data.success || !data.data.length) { el.innerHTML = '<div class="empty-state">No saved ideas. Generate some below!</div>'; return; }
    el.innerHTML = `<div class="ideas-grid">${data.data.map(idea => `
      <div class="idea-card">
        <div class="idea-platform">${idea.platform || 'General'}</div>
        <div class="idea-text">${idea.idea_text}</div>
        <div style="display:flex;gap:8px;align-items:center">
          ${STATUS_BADGE(idea.status)}
          <button class="btn btn-primary btn-sm" onclick="Content.saveIdeaToCalendar('${idea.idea_text.replace(/'/g,"\\'").replace(/"/g,"&quot;")}','${idea.platform||'Instagram'}')">Save to Calendar</button>
        </div>
      </div>`).join('')}</div>`;
  }

  async function generateIdeas(btn) {
    setLoadingBtn(btn, true, '✨ Generate Ideas');
    const data = await api.post('/api/content/ideas/generate');
    setLoadingBtn(btn, false, '✨ Generate Ideas');
    if (data.success) {
      const el = document.getElementById('generatedIdeas');
      if (el) el.innerHTML = `<div class="ideas-grid">${data.data.map(idea => `
        <div class="idea-card">
          <div class="idea-platform">${idea.platform || 'General'}</div>
          <div class="idea-text">${idea.idea_text}</div>
          <button class="btn btn-primary btn-sm" onclick="Content.saveIdea('${idea.platform||'Instagram'}','${idea.idea_text.replace(/'/g,"\\'").replace(/"/g,"&quot;")}')">Save Idea</button>
        </div>`).join('')}</div>`;
      showToast(`${data.data.length} ideas generated`, 'success');
    } else showToast(data.error || 'Failed to generate ideas', 'error');
  }

  async function saveIdea(platform, idea_text) {
    const data = await api.post('/api/content/ideas', { platform, idea_text });
    if (data.success) { showToast('Idea saved!', 'success'); loadIdeas(); }
    else showToast(data.error, 'error');
  }

  async function saveIdeaToCalendar(idea_text, platform) {
    const data = await api.post('/api/content/calendar', {
      platform, content_type: 'Post',
      caption_notes: idea_text,
      status: 'idea',
    });
    if (data.success) { showToast('Added to content calendar!', 'success'); }
    else showToast(data.error, 'error');
  }

  return { load, switchTab, addCalItem, updateCalStatus, deleteCalItem, setAnalyticsPlatform, setAnalyticsSort, scrape, addCompetitor, loadHashtags, searchHashtag, loadIdeas, generateIdeas, saveIdea, saveIdeaToCalendar };
})();
