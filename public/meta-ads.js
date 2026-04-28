const MetaAds = (() => {
  async function load() {
    const data = await api.get('/api/meta/summary');
    if (!data.success) return;
    const { summary, byCampaign, configured } = data.data;
    const el = document.getElementById('metaAdsContent');
    if (!el) return;

    if (!configured) {
      el.innerHTML = `
        <div class="unconfigured-notice">
          <div style="font-size:48px;margin-bottom:16px">📊</div>
          <h3>Meta Ads Not Connected</h3>
          <p style="margin:10px 0">Add your Meta Ads credentials to <code>.env</code> to see live data.</p>
          <p style="font-size:13px;margin-top:16px">Required variables:<br>
            <code>META_ACCESS_TOKEN</code> and <code>META_AD_ACCOUNT_ID</code></p>
          <p style="font-size:13px;margin-top:8px">Get these from <strong>Facebook Business Manager → Ad Account → Settings</strong></p>
          <button class="btn btn-primary mt-16" onclick="MetaAds.sync()">Try Sync Anyway</button>
        </div>`;
      return;
    }

    const s = summary || {};
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div></div>
        <button class="btn btn-primary" onclick="MetaAds.sync(this)">⟳ Sync Now</button>
      </div>
      <div class="stat-cards">
        <div class="stat-card"><div class="stat-value">${fmt$(s.total_spend||0)}</div><div class="stat-label">Total Spend</div></div>
        <div class="stat-card"><div class="stat-value">${(s.total_impressions||0).toLocaleString()}</div><div class="stat-label">Impressions</div></div>
        <div class="stat-card"><div class="stat-value">${(s.total_leads||0)}</div><div class="stat-label">Leads</div></div>
        <div class="stat-card"><div class="stat-value">${fmt$(s.avg_cpl||0)}</div><div class="stat-label">Cost Per Lead</div></div>
      </div>

      <div class="table-wrapper mt-20">
        <table class="data-table">
          <thead><tr><th>Campaign</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Leads</th><th>CPL</th></tr></thead>
          <tbody>
            ${byCampaign && byCampaign.length ? byCampaign.map(c => `
              <tr>
                <td style="font-weight:500">${c.campaign_name}</td>
                <td>${fmt$(c.spend)}</td>
                <td>${(c.impressions||0).toLocaleString()}</td>
                <td>${(c.clicks||0).toLocaleString()}</td>
                <td style="font-weight:600">${c.leads||0}</td>
                <td>${fmt$(c.cpl)}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="loading-cell">No campaign data. Click Sync Now.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="roi-calc card mt-20">
        <h3 style="margin-bottom:14px">ROI Calculator</h3>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-group" style="margin:0">
            <label>Avg client value (monthly)</label>
            <input type="number" id="roiClientValue" class="form-input" placeholder="e.g. 800" value="800" oninput="MetaAds.calcROI()" />
          </div>
          <div class="form-group" style="margin:0">
            <label>Close rate (%)</label>
            <input type="number" id="roiCloseRate" class="form-input" placeholder="e.g. 20" value="20" oninput="MetaAds.calcROI()" />
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Estimated ROI</div>
            <div class="roi-result" id="roiResult">—</div>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Based on ${s.total_leads||0} leads generated from ${fmt$(s.total_spend||0)} ad spend.</p>
      </div>`;

    calcROI();
  }

  function calcROI() {
    const leads      = parseInt(document.querySelector('#metaAdsContent .stat-value')?.nextElementSibling?.textContent === 'Leads' ? 0 : 0) || 0;
    const clientVal  = parseFloat(document.getElementById('roiClientValue')?.value) || 800;
    const closeRate  = parseFloat(document.getElementById('roiCloseRate')?.value) || 20;
    const resultEl   = document.getElementById('roiResult');
    if (!resultEl) return;
    // Fetch current spend from DOM
    const spendEls = document.querySelectorAll('#metaAdsContent .stat-value');
    const spend    = parseFloat((spendEls[0]?.textContent || '0').replace(/[$,]/g,'')) || 0;
    const leadsVal = parseInt((spendEls[2]?.textContent || '0').replace(/,/g,'')) || 0;
    const clients  = leadsVal * (closeRate / 100);
    const revenue  = clients * clientVal;
    const roi      = spend > 0 ? ((revenue - spend) / spend * 100).toFixed(0) : 0;
    resultEl.textContent = `${fmt$(revenue)} (${roi > 0 ? '+' : ''}${roi}% ROI)`;
    resultEl.style.color = roi >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  async function sync(btn) {
    if (btn) setLoadingBtn(btn, true, '⟳ Sync Now');
    const data = await api.get('/api/meta/sync');
    if (btn) setLoadingBtn(btn, false, '⟳ Sync Now');
    if (data.success || data.skipped) {
      showToast(data.message || 'Sync complete', data.skipped ? 'warning' : 'success');
      if (!data.skipped) load();
    } else showToast(data.error || 'Sync failed', 'error');
  }

  return { load, sync, calcROI };
})();
