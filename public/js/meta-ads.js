async function loadMetaAds() {
  const el = document.getElementById('section-meta-ads');
  el.innerHTML = '<div class="loading-cell">Loading…</div>';
  const res = await fetch('/api/meta/summary').then(r => r.json());
  if (!res.success) { el.innerHTML = '<div class="loading-cell">Failed to load</div>'; return; }
  const { summary: s, byCampaign, configured } = res.data;

  if (!configured) {
    el.innerHTML = `
      <div class="unconfigured-notice">
        <div style="font-size:48px;margin-bottom:16px">📊</div>
        <h3>Meta Ads Not Connected</h3>
        <p style="margin:10px 0 0">Add these to your <code>.env</code> file and redeploy:</p>
        <div class="webhook-url-box" style="margin:16px 0;font-family:monospace;font-size:13px;text-align:left">
          META_ACCESS_TOKEN=your_token_here<br>
          META_AD_ACCOUNT_ID=act_123456789
        </div>
        <p style="font-size:13px;color:var(--text-muted)">Get these from <strong>Facebook Business Manager → Ad Account → Settings → Access Token</strong></p>
        <button class="btn btn-outline mt-16" onclick="metaSync(this)">Try Sync Anyway</button>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="section-header">
      <div class="stat-cards" style="margin:0;flex:1">
        <div class="stat-card"><div class="stat-value">$${(s.total_spend||0).toLocaleString()}</div><div class="stat-label">Total spend</div></div>
        <div class="stat-card"><div class="stat-value">${s.total_leads||0}</div><div class="stat-label">Leads generated</div></div>
        <div class="stat-card"><div class="stat-value">$${(s.avg_cpl||0).toFixed(2)}</div><div class="stat-label">Cost per lead</div></div>
        <div class="stat-card"><div class="stat-value">${(s.avg_ctr||0).toFixed(2)}%</div><div class="stat-label">Avg CTR</div></div>
      </div>
      <button class="btn btn-primary" onclick="metaSync(this)">⟳ Sync Now</button>
    </div>

    <div class="table-wrapper mt-20">
      <table class="data-table">
        <thead><tr><th>Campaign</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Leads</th><th>CPL</th></tr></thead>
        <tbody>
          ${byCampaign && byCampaign.length ? byCampaign.map(c => `
            <tr>
              <td style="font-weight:500">${c.campaign_name}</td>
              <td>$${(c.spend||0).toLocaleString()}</td>
              <td>${(c.impressions||0).toLocaleString()}</td>
              <td>${(c.clicks||0).toLocaleString()}</td>
              <td style="font-weight:600">${c.leads||0}</td>
              <td>$${(c.cpl||0).toFixed(2)}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="loading-cell">No campaign data — click Sync Now</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card mt-20">
      <div class="panel-header"><h3>ROI Calculator</h3></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;padding-top:4px">
        <div class="form-group" style="margin:0">
          <label>Client value / month ($)</label>
          <input type="number" id="roiVal" class="form-input" value="800" oninput="metaCalcROI()" style="width:160px" />
        </div>
        <div class="form-group" style="margin:0">
          <label>Close rate (%)</label>
          <input type="number" id="roiRate" class="form-input" value="20" oninput="metaCalcROI()" style="width:120px" />
        </div>
        <div><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Estimated ROI</div>
          <div id="roiResult" style="font-size:20px;font-weight:700">—</div>
        </div>
      </div>
    </div>`;

  metaCalcROI();
}

function metaCalcROI() {
  const spend   = parseFloat(document.querySelector('#section-meta-ads .stat-value')?.textContent?.replace(/[$,]/g,'')) || 0;
  const leads   = parseInt(document.querySelectorAll('#section-meta-ads .stat-value')?.[1]?.textContent) || 0;
  const val     = parseFloat(document.getElementById('roiVal')?.value) || 800;
  const rate    = parseFloat(document.getElementById('roiRate')?.value) || 20;
  const revenue = leads * (rate / 100) * val;
  const roi     = spend > 0 ? ((revenue - spend) / spend * 100).toFixed(0) : 0;
  const el      = document.getElementById('roiResult');
  if (el) {
    el.textContent = `$${revenue.toLocaleString()} (${roi > 0 ? '+' : ''}${roi}% ROI)`;
    el.style.color = roi >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

async function metaSync(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  const res = await fetch('/api/meta/sync').then(r => r.json());
  if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync Now'; }
  if (res.success) loadMetaAds();
  else alert(res.message || res.error || 'Sync failed — check META_ACCESS_TOKEN');
}
