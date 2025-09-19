// ==UserScript==
// @name         Neopets SDB Logger
// @version      1.3
// @author       x_x
// @description  SDB Logger & Exporter
// @match        https://www.neopets.com/safetydeposit.phtml*
// @icon          https://cdn9.neopets.com/app_icons/816098ae647bce91fb4ba4590b0f3e6b.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/SDBLogger.user.js
// @downloadURL  https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/SDBLogger.user.js
// @connect      itemdb.com.br
// @connect      www.neopets.com
// ==/UserScript==

(function () {
  'use strict';
  let autoExportEnabled = true;

  /************************************************************************
   * Configuration
   ************************************************************************/
  const DEFAULT_MIN_DELAY_MS = 950;
  const DEFAULT_MAX_DELAY_MS = 1600;
  const PAGE_STEP = 30;
  const ITEMDB_CHUNK = 500;
  const ITEMDB_DELAY_MIN_MS = 1500;
  const ITEMDB_DELAY_MAX_MS = 3000;
  /************************************************************************
   * UI
   ************************************************************************/
 function addUI() {
    const container = document.createElement('div');
    container.id = 'sdb-aggregator-container';
    container.style = 'border:2px solid #3a6ea5;padding:15px;margin:15px auto;background:#f6fbff;font-family: Verdana,Arial,Helvetica,sans-serif;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);max-width:600px;display:flex;flex-direction:column;align-items:center;';

    container.innerHTML = `
      <h2 style="margin-top:0;color:#3a6ea5;border-bottom:1px solid #ccc;padding-bottom:8px;text-align:center;width:100%;">Safety Deposit Box Logger</h2>
      <div style="margin-top:12px;display:flex;justify-content:center;gap:8px;width:100%;">
        <button id="sdb-start-btn" style="background:#4caf50;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Start</button>
        <button id="sdb-stop-btn" disabled style="background:#f44336;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Stop</button>
        <button id="sdb-open-last" title="Open last exported blob" style="display:none;background:#2196f3;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Open last export</button>
      </div>
      <div style="margin-top:12px;font-size:13px;background:#e8f4fc;padding:10px;border-radius:4px;width:100%;box-sizing:border-box;">
        <div style="margin-bottom:8px;text-align:center;">
          <label style="font-weight:bold;">Delay per page (ms):</label><br>
          <input type="number" id="sdb-min-delay" style="width:80px;margin:4px 4px 4px 0;" /> -
          <input type="number" id="sdb-max-delay" style="width:80px;margin:4px 0 4px 4px;" />
        </div>
        <div style="margin-bottom:8px;text-align:center;">
          <input type="checkbox" id="sdb-fetch-itemdb" />
          <label for="sdb-fetch-itemdb">Fetch ItemDB data</label>
        </div>
        <div style="text-align:center;">
          <label style="font-weight:bold;">Export format:</label>
          <select id="sdb-export-format" style="margin-left:8px;">
            <option value="csv">CSV (Excel)</option>
            <option value="html">HTML Source</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px;width:100%;">
        <div id="sdb-progress-container" style="display:none;margin-bottom:10px;width:100%;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span id="sdb-progress-text">Processing pages: 0%</span>
            <span id="sdb-progress-percent">0%</span>
          </div>
          <div style="height:20px;background:#e0e0e0;border-radius:10px;overflow:hidden;width:100%;">
            <div id="sdb-progress-bar" style="height:100%;width:0%;background:#4caf50;transition:width 0.3s;"></div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector('.content') || document.body;
    content.insertBefore(container, content.firstChild);

    document.getElementById('sdb-min-delay').value = GM_getValue('sdb_min_delay', DEFAULT_MIN_DELAY_MS);
    document.getElementById('sdb-max-delay').value = GM_getValue('sdb_max_delay', DEFAULT_MAX_DELAY_MS);
    document.getElementById('sdb-fetch-itemdb').checked = true;

    document.getElementById('sdb-start-btn').addEventListener('click', startCrawl);
    document.getElementById('sdb-stop-btn').addEventListener('click', stopCrawl);
    document.getElementById('sdb-open-last').addEventListener('click', () => {
      const lastBlobUrl = GM_getValue('sdb_last_blob_url', null);
      if (lastBlobUrl) window.open(lastBlobUrl, '_blank');
      else alert('No saved export found.');
    });
  }

  /************************************************************************
   * Helper / storage
   ************************************************************************/
  function $qs(sel, root = document) { return root.querySelector(sel); }
  function $qsa(sel, root = document) { return Array.from((root || document).querySelectorAll(sel)); }
  function safeText(node) { return (node && node.textContent || '').trim(); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function formatNumberWithCommas(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  let crawling = false;
  let shouldStop = false;
  let aggregatedItems = [];
  let itemDBLookup = {};
  let lastBlobUrl = null;
  let totalPages = 1;
  let currentPage = 0;

  /************************************************************************
   * Progress Bar Functions
   ************************************************************************/
  function updateProgressBar(progress, text) {
    const progressBar = document.getElementById('sdb-progress-bar');
    const progressPercent = document.getElementById('sdb-progress-percent');
    const progressText = document.getElementById('sdb-progress-text');

    if (progressBar && progressPercent) {
      progressBar.style.width = `${progress}%`;
      progressPercent.textContent = `${Math.round(progress)}%`;
    }

    if (progressText && text) {
      progressText.textContent = text;
    }
  }

  function showProgressBar() {
    const progressContainer = document.getElementById('sdb-progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
  }

  function hideProgressBar() {
    const progressContainer = document.getElementById('sdb-progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
  }

  /************************************************************************
   * Core: GM_xmlhttpRequest
   ************************************************************************/
  function startCrawl() {
    if (crawling) return;
     const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
     const lastUpdate = GM_getValue('itemDataDate', 0);
     const now = Date.now();

  if (now - lastUpdate > CACHE_EXPIRY_MS) {
    GM_deleteValue('itemDatabase');
    console.log('Cache expired, fetching fresh prices...');
  }

    const minDelay = parseInt(document.getElementById('sdb-min-delay').value) || DEFAULT_MIN_DELAY_MS;
    const maxDelay = parseInt(document.getElementById('sdb-max-delay').value) || DEFAULT_MAX_DELAY_MS;
    const doFetchItemDB = document.getElementById('sdb-fetch-itemdb').checked;
    const exportFormat = document.getElementById('sdb-export-format').value;

    GM_setValue('sdb_min_delay', minDelay);
    GM_setValue('sdb_max_delay', maxDelay);
    GM_setValue('sdb_fetch_itemdb', doFetchItemDB);

    crawling = true;
    shouldStop = false;
    aggregatedItems = [];
    itemDBLookup = JSON.parse(GM_getValue('itemDatabase', '{}')) || {};

    document.getElementById('sdb-start-btn').disabled = true;
    document.getElementById('sdb-stop-btn').disabled = false;

    let offsetSelect = document.querySelector("select[name='offset']");
    totalPages = 1;
    if (offsetSelect) totalPages = offsetSelect.length;
    const totalStr = document.querySelector('.content > table') ? document.querySelector('.content > table').textContent : '';
    const matchItems = totalStr.match(/Items:\s*([\d,]+)/i);
    if (matchItems) {
      const totalItems = parseInt(matchItems[1].replace(/,/g,'')) || 0;
      totalPages = Math.max(totalPages, Math.ceil(totalItems / PAGE_STEP));
    }

    const offsets = [];
    for (let p = 0; p < totalPages; p++) offsets.push(p * PAGE_STEP);

    showProgressBar();
    updateProgressBar(0, `Processing page: 0/${totalPages}`);

    let idx = 0;

    function nextPage() {
      if (shouldStop) {
        finishCrawl();
        return;
      }
      if (idx >= offsets.length) {
        finishCrawl();
        return;
      }
      const curOffset = offsets[idx];
      const url = location.origin + '/safetydeposit.phtml?category=' + (getCategory() || 0) + '&obj_name=' + encodeURIComponent(getObjName() || '') + '&offset=' + curOffset;

      currentPage = idx + 1;
      const progress = (currentPage / totalPages) * 100;
      updateProgressBar(progress, `Processing pages: ${currentPage}/${totalPages}`);

      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: function(response) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.responseText, 'text/html');

            const rows = selectSDBRows(doc);
            parseRowsIntoAggregate(rows, idx, curOffset);

            idx++;

            const delay = minDelay + Math.floor(Math.random() * (Math.max(0, maxDelay - minDelay) + 1));
            setTimeout(nextPage, delay);
          } catch (ex) {
            console.error('Parse error', ex);
            idx++;
            setTimeout(nextPage, minDelay);
          }
        },
        onerror: function(error) {
          console.error('Request error', error);
          idx++;
          setTimeout(nextPage, minDelay);
        },
        ontimeout: function() {
          console.error('Request timeout');
          idx++;
          setTimeout(nextPage, minDelay);
        },
        timeout: 30000
      });
    }

    nextPage();

    function finishCrawl() {
      crawling = false;
      shouldStop = false;
      document.getElementById('sdb-start-btn').disabled = false;
      document.getElementById('sdb-stop-btn').disabled = true;

      hideProgressBar();

      const doFetch = document.getElementById('sdb-fetch-itemdb').checked;
      if (doFetch && Object.keys(aggregatedItems).length > 0) {
        fetchItemDBDataThenExport().then(() => {
            const exportBtn = showExportButton();
            if (autoExportEnabled && exportBtn) {
                exportBtn.click();
            }
        }).catch(err => {
            console.warn('ItemDB fetch failed', err);
            const exportBtn = showExportButton();
            if (autoExportEnabled && exportBtn) {
                exportBtn.click();
            }
             });
      } else {
        const exportBtn = showExportButton();
        if (autoExportEnabled && exportBtn) {
            exportBtn.click();
        }
    }
}

      }



  function showExportButton() {
    const existingBtn = document.getElementById('sdb-export-btn');
    if (existingBtn) existingBtn.remove();

    const exportBtn = document.createElement('button');
    exportBtn.id = 'sdb-export-btn';
    exportBtn.textContent = 'Generate Report';
    exportBtn.style.marginTop = '10px';
    exportBtn.style.background = '#ff9800';
    exportBtn.style.color = 'white';
    exportBtn.style.border = 'none';
    exportBtn.style.padding = '8px 16px';
    exportBtn.style.borderRadius = '4px';
    exportBtn.style.cursor = 'pointer';
    exportBtn.addEventListener('click', () => {
      const exportFormat = document.getElementById('sdb-export-format').value;
      buildAndOpenBlob(exportFormat);
    });

    const container = document.getElementById('sdb-aggregator-container');
    container.appendChild(exportBtn);

     return exportBtn;
  }

  function stopCrawl() {
    if (!crawling) return;
    shouldStop = true;
  }

  /************************************************************************
   * Parse and Return Items
   ************************************************************************/
  function selectSDBRows(doc) {
    const mainContent = doc.querySelector('.content');
    if (!mainContent) return [];

    const allTables = mainContent.querySelectorAll('table');

    for (const table of allTables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        if (row.querySelector('input[name^="back_to_inv"]')) {
          return Array.from(table.querySelectorAll('tr')).filter(r =>
            r.querySelector('input[name^="back_to_inv"]')
          );
        }
      }
    }

    return [];
  }

  function parseRowsIntoAggregate(rows, pageIndex, offset) {
    rows.forEach(row => {
      try {
   const cells = Array.from(row.children);
      const img = row.querySelector('img');
      let imageUrl = img ? (img.getAttribute('src') || '').trim() : '';
      let name = '';
      let qty = 0;
      let id = null;
      let type = '';

      if (cells.length >= 4) {
        const typeCell = cells[3];
        type = safeText(typeCell).replace(/^<b>|<\/b>$/g, '').trim();
      }
           const input = row.querySelector('input[name^="back_to_inv"]');
      if (input) {
        const m = input.name.match(/back_to_inv\[(\d+)\]/);
        if (m) id = parseInt(m[1], 10);
      }
        for (let c of cells.slice()) {
          const t = safeText(c);
          if (/^\d+$/.test(t)) {
            qty = parseInt(t, 10);
            break;
          }
        }
        const bolds = row.querySelectorAll('b');
        if (bolds && bolds.length) {
          for (let b of bolds) {
                       const txt = safeText(b);
            if (txt && /[A-Za-z0-9'’\-\u00C0-\u024F]/.test(txt) && txt.length < 120 && !/^\d+$/.test(txt)) {
              name = txt.replace(/\s*\([^)]*\)\s*$/, '').trim();
              break;
            }
          }
        }
        if (!id) {
          const a = row.querySelector('a[href*="iteminfo.phtml"]');
          if (a) {
            const m = a.href.match(/obj_info\.phtml.*?id=(\d+)/) || a.href.match(/item_id=(\d+)/) || a.href.match(/\/items\/(\d+)/);
            if (m) id = parseInt(m[1], 10);
          }
        }

        if (imageUrl && imageUrl.startsWith('//')) imageUrl = location.protocol + imageUrl;
        if (imageUrl && imageUrl.startsWith('/')) imageUrl = location.origin + imageUrl;

    const uniqueKey = id ? `id:${id}` : `name:${name.toLowerCase().replace(/\s+/g,' ').trim()}`;
      if (!aggregatedItems.find(it => it._key === uniqueKey)) {
        aggregatedItems.push({
          _key: uniqueKey,
          id: id,
          image: imageUrl,
          name: name,
          qty: qty || 0,
          type: type,
          pageOffset: offset
        });
         } else {
        const already = aggregatedItems.find(it => it._key === uniqueKey);
        already.qty = (already.qty || 0) + (qty || 0);
        }
      } catch (errRow) {
        console.warn('Row parse fail', errRow, row);
      }
    });
  }

  function getCategory() {
    const s = (new URL(location.href)).searchParams.get('category');
    return s;
  }
  function getObjName() {
    const s = (new URL(location.href)).searchParams.get('obj_name');
    return s;
  }

  /************************************************************************
   * ItemDB data fetcher
   ************************************************************************/
  function fetchItemDBDataThenExport() {
    return new Promise((resolve, reject) => {
      const ids = Array.from(new Set(aggregatedItems.map(it => it.id).filter(Boolean)));
      if (!ids.length) {
        resolve();
        return;
      }
      const stored = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
      const missing = ids.filter(id => !stored.hasOwnProperty(id));

      if (missing.length === 0) {
        itemDBLookup = Object.assign({}, stored);
        GM_setValue('itemDatabase', JSON.stringify(stored));
        resolve();
        return;
      }

      const chunks = [];
      const chunkSize = ITEMDB_CHUNK;
      for (let i=0;i<missing.length;i+=chunkSize) chunks.push(missing.slice(i,i+chunkSize));

      let completed = 0;
      const combined = Object.assign({}, stored);

      function processChunk(index) {
        if (index >= chunks.length) {
          itemDBLookup = combined;
          GM_setValue('itemDatabase', JSON.stringify(combined));
          GM_setValue('itemDataDate', Date.now());
          resolve();
          return;
        }

        const theChunk = chunks[index];
        updateProgressBar((index / chunks.length) * 100, `Requesting ItemDB chunk ${index+1}/${chunks.length} (${theChunk.length} items)...`);

        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://itemdb.com.br/api/v1/items/many',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ item_id: theChunk }),
          responseType: 'json',
          onload: function(res) {
            try {
              if (res.status === 200) {
                const respJson = (typeof res.response === 'object') ? res.response : JSON.parse(res.responseText || '{}');
                Object.entries(respJson).forEach(([keyId, itemObj]) => {
                  combined[parseInt(keyId,10)] = {
                    name: itemObj.name,
                    cat: itemObj.category,
                    value: (itemObj.price && itemObj.price.value) ? itemObj.price.value : null,
                    rarity: itemObj.rarity,
                    isNC: itemObj.isNC,
                    isBD: itemObj.isBD,
                    isWearable: itemObj.isWearable
                  };
                });

                const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));

                updateProgressBar(((index + 1) / chunks.length) * 100, `Processed chunk ${index+1}/${chunks.length}. Next in ${(delay/1000).toFixed(1)}s...`);
                setTimeout(() => processChunk(index + 1), delay);

              } else if (res.status === 429) {
                const retryDelay = 10000 + Math.floor(Math.random() * 5000);
                updateProgressBar((index / chunks.length) * 100, `Rate limited! Retrying chunk ${index+1} in ${(retryDelay/1000).toFixed(1)}s...`);
                setTimeout(() => processChunk(index), retryDelay);
              } else {
                console.warn('ItemDB chunk failed: status', res.status);
                const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));
                setTimeout(() => processChunk(index + 1), delay);
              }
            } catch (e) {
              console.error('ItemDB parse error', e, res);
              const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));
              setTimeout(() => processChunk(index + 1), delay);
            }
          },
          onerror: function(err) {
            console.error('ItemDB request error', err);
            const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));
            setTimeout(() => processChunk(index + 1), delay);
          },
          ontimeout: function() {
            console.error('ItemDB request timed out');
            const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));
            setTimeout(() => processChunk(index + 1), delay);
          },
          timeout: 120000
        });
      }
      processChunk(0);
    });
  }

  /************************************************************************
   * Build blob page
   ************************************************************************/
  function buildAndOpenBlob(exportFormat) {
  const itemdb = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
  const data = aggregatedItems.map(it => {
  const meta = (it.id && itemdb[it.id]) ? itemdb[it.id] : {};
  return {
    id: it.id || '',
    image: it.image || '',
    name: it.name || '',
    qty: it.qty || 0,
    type: it.type || '', //
    rarity: meta.rarity || null,
    value: (meta && meta.value !== undefined) ? meta.value : null,
    cat: meta.cat || null,
    isNC: meta && meta.isNC
  };
});

    const pageHtml = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>SDB Export - Consolidated</title>
        <style>
          :root {
            --bg-primary: #f6fbff;
            --bg-secondary: white;
            --bg-tertiary: #f8f9fa;
            --text-primary: #333;
            --text-secondary: #3a6ea5;
            --border-color: #ddd;
            --table-header-bg: #3a6ea5;
            --table-header-text: white;
            --table-row-even: #f8f9fa;
            --table-row-odd: #ffffff;
            --table-row-hover: #e9ecef;
            --stats-bg: #e8f4fc;
            --stats-border: #3a6ea5;
            --button-bg: #3a6ea5;
            --button-hover: #2c5282;
            --input-bg: white;
            --input-border: #ccc;
            --input-text: #333;
          }

          .dark-mode {
            --bg-primary: #121212;
            --bg-secondary: #1e1e1e;
            --bg-tertiary: #2d2d2d;
            --text-primary: #e0e0e0;
            --text-secondary: #a0a0a0;
            --border-color: #404040;
            --table-header-bg: #333333;
            --table-header-text: #ffffff;
            --table-row-even: #2a2a2a;
            --table-row-odd: #1e1e1e;
            --table-row-hover: #3a3a3a;
            --stats-bg: #2d2d2d;
            --stats-border: #555555;
            --button-bg: #555555;
            --button-hover: #666666;
            --input-bg: #2d2d2d;
            --input-border: #555555;
            --input-text: #e0e0e0;
            scrollbar-color: #555555 #2d2d2d;
            scrollbar-width: thin;
          }
          .dark-mode ::-webkit-scrollbar {
            width: 12px;
          }
          .dark-mode ::-webkit-scrollbar-track {
            background: #2d2d2d;
            border-radius: 6px;
          }
          .dark-mode ::-webkit-scrollbar-thumb {
            background: #555555;
            border-radius: 6px;
            border: 2px solid #2d2d2d;
          }
          .dark-mode ::-webkit-scrollbar-thumb:hover {
            background: #666666;
          }

          body {
            font-family: Verdana, Arial, Helvetica, sans-serif;
            margin: 20px;
            background-color: var(--bg-primary);
            color: var(--text-primary);
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: var(--bg-secondary);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h2 {
            color: var(--text-secondary);
            margin-top: 0;
            padding: 15px 30px;
            text-align: center;
            font-size: 2em;
            font-weight: 600;
            font-family: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
            background: var(--bg-tertiary);
            border: 2px solid var(--border-color);
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            display: block;
            width: 100%
            margin: 0 auto 20px auto;
          }
          .container {
            text-align: center;
            max-width: 1200px;
            margin: 0 auto;
            background: var(--bg-secondary);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
            .container > *:not(h2) {
            text-align: left;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 15px 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          th, td {
            border: 1px solid var(--border-color);
            padding: 10px;
            text-align: left;
            font-size: 14px;
          }
          th {
            background: var(--table-header-bg);
            color: var(--table-header-text);
            font-weight: bold;
            padding: 12px 10px;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          tr:nth-child(even) {
            background-color: var(--table-row-even);
          }
          tr:nth-child(odd) {
            background-color: var(--table-row-odd);
          }
          tbody tr td:nth-child(2) {
          font-weight: bold;
          }
          tr:hover {
            background-color: var(--table-row-hover);
          }
          img {
            max-width: 60px;
            max-height: 60px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
          }
          .link-icon {
            width: 30px;
            height: 30px;
            margin: 0 2px;
            vertical-align: middle;
            border: 1px solid var(--border-color);
            border-radius: 3px;
          }
          .controls {
            margin-bottom: 20px;
            padding: 15px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            border: 1px solid var(--border-color);
          }
          button {
            background: var(--button-bg);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            font-size: 14px;
          }
          button:hover {
            background: var(--button-hover);
          }
          select, input[type="number"], input[type="checkbox"], input[type="text"] {
            padding: 6px;
            border: 1px solid var(--input-border);
            border-radius: 4px;
            margin: 0 8px;
            background: var(--input-bg);
            color: var(--input-text);
          }
          label {
            margin-right: 15px;
            font-size: 14px;
          }
          .stats {
            background: var(--stats-bg);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            font-size: 14px;
            border-left: 4px solid var(--stats-border);
          }
          .table-container {
            max-height: 70vh;
            overflow: auto;
            border: 1px solid var(--border-color);
            border-radius: 6px;
          }
          .sort-order {
            display: inline-block;
            margin-left: 8px;
            cursor: pointer;
            font-size: 16px;
          }
          .search-container {
            margin: 10px 0;
          }
          .dark-mode-toggle {
            position: absolute;
            top: 20px;
            right: 20px;
            background: var(--button-bg);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            z-index: 1000;
          }
          .dark-mode-toggle:hover {
            background: var(--button-hover);
          }
        </style>
      </head>
      <body>
      <body>

        <button class="dark-mode-toggle" id="dark-mode-toggle">🌙</button>
        <div class="container">
          <h2>SDB Report</h2>
          <div class="controls">
            <button id="download-csv">Download CSV</button>
            <button id="download-html">Download HTML Source</button>
            <button id="copy-clip">Copy CSV to Clipboard</button>
            <div style="margin-top: 10px;">
              <label> Show NC items <input type="checkbox" id="show-nc" checked /></label>
              <label> Min rarity <input type="number" id="min-rarity" style="width:70px" /></label>
              <label> Max rarity <input type="number" id="max-rarity" style="width:70px" /></label>
              <label> Sort by:
                <select id="sort-by">
                  <option value="value">Value</option>
                  <option value="name">Name</option>
                  <option value="qty">Qty</option>
                  <option value="stackValue">Stack value</option>
                  <option value="rarity">Rarity</option>
                  <option value="id">Item id</option>
                </select>
                <span id="sort-order" class="sort-order" title="Toggle sort order">⬇️</span>
              </label>
            </div>
            <div class="search-container">
              <label>Search: <input type="text" id="search-text" placeholder="Type to filter items..." style="width: 250px;" /></label>
            </div>
            <label>Filter by type:
            <select id="filter-type" style="width: 120px;">
            <option value="">All types</option>
           </select>
           </label>
          </div>
          <div id="stats" class="stats"></div>
          <div class="table-container">
            <table id="sdb-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Rarity</th>
                  <th>ItemDB Value</th>
                  <th>Stack Value</th>
                  <th>ItemID</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        <script>
          const darkModeToggle = document.getElementById('dark-mode-toggle');
          const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

          const savedTheme = localStorage.getItem('sdb-theme');
          const currentTheme = savedTheme || (prefersDarkScheme.matches ? 'dark' : 'light');

          if (currentTheme === 'dark') {
            document.body.classList.add('dark-mode');
            darkModeToggle.textContent = '☀️';
          }

          darkModeToggle.addEventListener('click', () => {
            const isDarkMode = document.body.classList.toggle('dark-mode');
            localStorage.setItem('sdb-theme', isDarkMode ? 'dark' : 'light');
            darkModeToggle.textContent = isDarkMode ? '☀️' : '🌙';
          });

          prefersDarkScheme.addEventListener('change', e => {
            if (!localStorage.getItem('sdb-theme')) {
              if (e.matches) {
                document.body.classList.add('dark-mode');
                darkModeToggle.textContent = '☀️';
              } else {
                document.body.classList.remove('dark-mode');
                darkModeToggle.textContent = '🌙';
              }
            }
          });

          const data = ${JSON.stringify(data)};
          const $ = sel => document.querySelector(sel);
          const tbody = document.querySelector('#sdb-table tbody');
          const stats = document.getElementById('stats');
          let sortAscending = false;
          let currentSortBy = 'value';
          let currentSearchTerm = '';

          function populateTypeFilter() {
            const typeSelect = document.getElementById('filter-type');
            const types = [...new Set(data.map(item => item.type).filter(Boolean))].sort();

            while (typeSelect.options.length > 1) {
            typeSelect.remove(1);
            }

            types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
           });
          }
          function formatNumberWithCommas(num) {
            return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
          }



function render() {
    const showNC = document.getElementById('show-nc').checked;
    const minR = parseInt(document.getElementById('min-rarity').value) || -Infinity;
    const maxR = parseInt(document.getElementById('max-rarity').value) || Infinity;
    const searchTerm = document.getElementById('search-text').value.toLowerCase();
    const filterType = document.getElementById('filter-type').value;
    currentSearchTerm = searchTerm;
    currentSortBy = document.getElementById('sort-by').value;

    let list = data.filter(d => showNC || !d.isNC)
                  .filter(d => (d.rarity === null) ? true : (d.rarity >= minR))
                  .filter(d => (d.rarity === null) ? true : (d.rarity <= maxR))
                  .filter(d => d.name && d.name.toLowerCase().includes(searchTerm))
                  .filter(d => !filterType || d.type === filterType);

    list.forEach(it => { it.stackValue = (it.qty || 0) * (Number(it.value) || 0); });

    if (currentSortBy === 'name') {
        list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    } else if (currentSortBy === 'qty') {
        list.sort((a,b) => (b.qty||0)-(a.qty||0));
    } else if (currentSortBy === 'value') {
        list.sort((a,b) => (Number(b.value)||0)-(Number(a.value)||0));
    } else if (currentSortBy === 'stackValue') {
        list.sort((a,b) => (Number(b.stackValue)||0)-(Number(a.stackValue)||0));
    } else if (currentSortBy === 'rarity') {
        list.sort((a,b) => (Number(b.rarity)||0)-(Number(a.rarity)||0));
    } else if (currentSortBy === 'id') {
        list.sort((a,b) => (Number(a.id)||0)-(Number(b.id)||0));
    }

    if (sortAscending) {
        list.reverse();
    }

    tbody.innerHTML = '';
    list.forEach(it => {
        const tr = document.createElement('tr');
        const itemNameForItemDB = encodeURIComponent(it.name || '').toLowerCase() .replace(/%20/g, '-').replace(/%[0-9A-F]{2}/g, '');
        const itemNameForJellyNeo = encodeURIComponent(it.name || '').replace(/%20/g, '+');
        const itemNameForSDB = encodeURIComponent(it.name || '').replace(/%20/g, '+');

        const linksHtml =
            '<a href="https://itemdb.com.br/item/' + itemNameForItemDB + '" target="_blank" title="View on ItemDB">' +
                '<img src="https://i.imgur.com/vgp1HHw.png" alt="ItemDB" class="link-icon">' +
            '</a>' +
            '<a href="https://items.jellyneo.net/search/?name=' + itemNameForJellyNeo + '&name_type=3" target="_blank" title="Search on Jellyneo">' +
                '<img src="https://i.imgur.com/TrJp26O.png" alt="Jellyneo" class="link-icon">' +
            '</a>' +
            '<a href="https://www.neopets.com/safetydeposit.phtml?obj_name=' + itemNameForSDB + '&category=0" target="_blank" title="Search in SDB">' +
                '<img src="https://i.imgur.com/8X7djHT.png" alt="SDB" class="link-icon">' +
            '</a>';

        tr.innerHTML =
            '<td>' + (it.image ? '<img src="' + escapeHtml(it.image) + '" />' : '') + '</td>' +
            '<td>' + escapeHtml(it.name || '') + '</td>' +
            '<td>' + escapeHtml(it.type || '') + '</td>' +
            '<td>' + formatNumberWithCommas(it.qty || 0) + '</td>' +
            '<td>' + (it.rarity !== null && it.rarity !== undefined ? escapeHtml(it.rarity.toString()) : '-') + '</td>' +
            '<td>' + (it.value !== null && it.value !== undefined ? formatNumberWithCommas(it.value) : '-') + '</td>' +
            '<td>' + ((it.stackValue && !isNaN(it.stackValue)) ? formatNumberWithCommas(it.stackValue) : '-') + '</td>' +
            '<td>' + (it.id || '') + '</td>' +
            '<td style="white-space: nowrap;">' + linksHtml + '</td>';

        tbody.appendChild(tr);
    });

    const totalValue = list.reduce((s,x) => s + ((Number(x.stackValue) || 0)), 0);
    const totalQty = list.reduce((s,x) => s + (Number(x.qty) || 0), 0);
    stats.textContent = 'Items shown: ' + list.length + ' | Total qty: ' + formatNumberWithCommas(totalQty) + ' | Est total value: ' + formatNumberWithCommas(totalValue);
}

  function escapeHtml(s){ return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; }
          document.getElementById('show-nc').addEventListener('change', render);
          document.getElementById('min-rarity').addEventListener('input', render);
          document.getElementById('max-rarity').addEventListener('input', render);
          document.getElementById('search-text').addEventListener('input', render);
          document.getElementById('sort-by').addEventListener('change', render);
          document.getElementById('sort-order').addEventListener('click', () => {
            sortAscending = !sortAscending;
            document.getElementById('sort-order').textContent = sortAscending ? '⬆️' : '⬇️';
            render();
          });

          document.getElementById('filter-type').addEventListener('change', render);

          document.getElementById('download-csv').addEventListener('click', ()=> {
            const csv = toCSV(data);
            downloadBlob(csv, 'sdb_export.csv','text/csv;charset=utf-8;');
          });
          document.getElementById('download-html').addEventListener('click', ()=> {
            const html = document.documentElement.outerHTML;
            downloadBlob(html, 'sdb_export.html','text/html;charset=utf-8;');
          });
          document.getElementById('copy-clip').addEventListener('click', ()=> {
            navigator.clipboard.writeText(toCSV(data)).then(()=> alert('CSV copied to clipboard'));
          });

          function toCSV(list) {
            const showNC = document.getElementById('show-nc').checked;
            const minR = parseInt(document.getElementById('min-rarity').value) || -Infinity;
            const maxR = parseInt(document.getElementById('max-rarity').value) || Infinity;
            const searchTerm = currentSearchTerm;
            const filterType = document.getElementById('filter-type').value;

            let filteredList = list.filter(d => showNC || !d.isNC)
                                  .filter(d => (d.rarity === null) ? true : (d.rarity >= minR))
                                  .filter(d => (d.rarity === null) ? true : (d.rarity <= maxR))
                                  .filter(d => d.name && d.name.toLowerCase().includes(searchTerm))
                                  .filter(d => !filterType || d.type === filterType);

            filteredList.forEach(it => { it.stackValue = (it.qty || 0) * (Number(it.value) || 0); });

            if (currentSortBy === 'name') {
              filteredList.sort((a,b) => (a.name||'').localeCompare(b.name||''));
            } else if (currentSortBy === 'qty') {
              filteredList.sort((a,b) => (b.qty||0)-(a.qty||0));
            } else if (currentSortBy === 'value') {
              filteredList.sort((a,b) => (Number(b.value)||0)-(Number(a.value)||0));
            } else if (currentSortBy === 'stackValue') {
              filteredList.sort((a,b) => (Number(b.stackValue)||0)-(Number(a.stackValue)||0));
            } else if (currentSortBy === 'rarity') {
              filteredList.sort((a,b) => (Number(b.rarity)||0)-(Number(a.rarity)||0));
            } else if (currentSortBy === 'id') {
              filteredList.sort((a,b) => (Number(a.id)||0)-(Number(b.id)||0));
            }

            if (sortAscending) {
              filteredList.reverse();
            }

            const header = ['name','type','qty','rarity','value','stackValue','id'];
            const rows = [header.join(',')];
            filteredList.forEach(it => {
              const r = [
                '"' + (it.name||'').replace(/"/g,'""') + '"',
                '"' + (it.type||'').replace(/"/g,'""') + '"',
                (it.qty||0),
                (it.rarity===null?'':it.rarity),
                (it.value===null?'':it.value),
                ((it.qty||0) * (Number(it.value)||0)),
                (it.id||'')
              ];
              rows.push(r.join(','));
            });
            return rows.join('\\n');
          }
          function downloadBlob(content, filename, mime) {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }

          populateTypeFilter();
          render();
        </script>
      </body>
      </html>
    `;

    const blob = new Blob([pageHtml], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    lastBlobUrl = blobUrl;
    GM_setValue('sdb_last_blob_url', blobUrl);
    GM_setValue('sdb_last_export_time', Date.now());
    window.open(blobUrl, '_blank');
    const btn = document.getElementById('sdb-open-last');
    if (btn) btn.style.display = 'inline-block';
  }

  /************************************************************************
   * Initialize
   ************************************************************************/
  addUI();

  window._sdbAggregator = {
    aggregatedItems: () => aggregatedItems,
    itemDBLookup: () => JSON.parse(GM_getValue('itemDatabase','{}') || '{}'),
    lastExportUrl: () => GM_getValue('sdb_last_blob_url', null)
  };

})();
