// ==UserScript==
// @name         Neopets SDB Logger
// @version      1.5
// @author       TamperPanda
// @description  SDB Logger & Exporter (token auto‑retrieve)
// @match        https://www.neopets.com/safetydeposit.phtml*
// @icon         https://cdn9.neopets.com/app_icons/816098ae647bce91fb4ba4590b0f3e6b.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/SDBLogger.user.js
// @downloadURL  https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/SDBLogger.user.js
// @connect      itemdb.com.br
// @connect      www.neopets.com
// @connect      raw.githubusercontent.com
// ==/UserScript==
GM_addStyle('.nl-ads-wrapper { display: none !important; }');
GM_addStyle('#sdb-aggregator-container { margin-top: 100px !important; }');

(function() {
    'use strict';

    // ── Configuration ──────────────────────────────────────────
    const DEFAULT_MIN_DELAY_MS = 500;
    const DEFAULT_MAX_DELAY_MS = 750;
    const ITEMDB_CHUNK = 500;
    const ITEMDB_DELAY_MIN_MS = 1500;
    const ITEMDB_DELAY_MAX_MS = 3000;

    // ── Helpers ────────────────────────────────────────────────
    function $qs(sel, root = document) { return root.querySelector(sel); }
    function $qsa(sel, root = document) { return Array.from((root || document).querySelectorAll(sel)); }
    function safeText(node) { return (node && node.textContent || '').trim(); }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function formatNumberWithCommas(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

    // ── Lebron values ──────────────────────────────────────────
    async function fetchLebronValues() {
        try {
            const resp = await fetch('https://lebron-values.netlify.app/item_values.json');
            return await resp.json();
        } catch (e) {
            console.warn('Failed to fetch Lebron values:', e);
            return {};
        }
    }

    // ── Removal tracking ───────────────────────────────────────
    function getRemovedItems() {
        let removed = {};
        try {
            const local = localStorage.getItem('sdb_removed_items');
            if (local) removed = JSON.parse(local);
            const gm = JSON.parse(GM_getValue('sdb_removed_items', '{}'));
            Object.assign(removed, gm);
        } catch (e) {
            removed = JSON.parse(GM_getValue('sdb_removed_items', '{}'));
        }
        return removed;
    }

    function saveRemovedItem(itemId, quantity) {
        const removed = getRemovedItems();
        removed[itemId] = (removed[itemId] || 0) + quantity;
        GM_setValue('sdb_removed_items', JSON.stringify(removed));
    }

    function applyRemovalsToData(data) {
        const removed = getRemovedItems();
        if (Object.keys(removed).length === 0) return data;
        const updated = [];
        for (const item of data) {
            if (item.id && removed[item.id]) {
                const newQty = Math.max(0, (item.qty || 0) - removed[item.id]);
                if (newQty > 0) updated.push({ ...item, qty: newQty });
            } else {
                updated.push(item);
            }
        }
        return updated;
    }

    function reconstructLastExport() {
        const lastData = GM_getValue('sdb_last_export_data', null);
        if (!lastData) {
            alert('No previous export found. Please run a fresh scan first.');
            return;
        }
        try {
            // sync localStorage removals to GM storage
            try {
                const local = localStorage.getItem('sdb_removed_items');
                if (local) {
                    const localParsed = JSON.parse(local);
                    const gmParsed = JSON.parse(GM_getValue('sdb_removed_items', '{}'));
                    GM_setValue('sdb_removed_items', JSON.stringify({ ...gmParsed, ...localParsed }));
                }
            } catch (e) {}
            const data = applyRemovalsToData(JSON.parse(lastData));
            GM_deleteValue('sdb_removed_items');
            localStorage.removeItem('sdb_removed_items');
            GM_setValue('sdb_last_export_data', JSON.stringify(data));
            buildAndOpenBlobFromData(data);
        } catch (e) {
            alert('Could not rebuild last export data.');
        }
    }

    // ── UI ─────────────────────────────────────────────────────
    function addUI() {

        const container = document.createElement('div');
        container.id = 'sdb-aggregator-container';
        container.style = 'border:2px solid #3a6ea5;padding:15px;margin:15px auto;background:#f6fbff;font-family:Verdana,Arial,Helvetica,sans-serif;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);max-width:600px;display:flex;flex-direction:column;align-items:center;';
        const hasLastExport = !!GM_getValue('sdb_last_export_data', null);

        container.innerHTML = `
        <h2 style="margin-top:0;color:#3a6ea5;border-bottom:1px solid #ccc;padding-bottom:8px;text-align:center;width:100%;">Safety Deposit Box Logger</h2>
        <div style="margin-top:12px;display:flex;justify-content:center;gap:8px;width:100%;">
          <button id="sdb-start-btn" style="background:#4caf50;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Start</button>
          <button id="sdb-stop-btn" disabled style="background:#f44336;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Stop</button>
          <button id="sdb-open-last" title="Reconstruct last export with removals applied" style="${hasLastExport ? 'display:inline-block;' : 'display:none;'}background:#2196f3;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Open last export</button>
          <button id="sdb-clear-last" title="Clear last export data" style="${hasLastExport ? 'display:inline-block;' : 'display:none;'}background:#dc3545;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;">Clear last export</button>
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
        </div>`;


        const content = document.querySelector('.content') || document.body;
        content.insertBefore(container, content.firstChild);


        document.getElementById('sdb-min-delay').value = GM_getValue('sdb_min_delay', DEFAULT_MIN_DELAY_MS);
        document.getElementById('sdb-max-delay').value = GM_getValue('sdb_max_delay', DEFAULT_MAX_DELAY_MS);
        document.getElementById('sdb-fetch-itemdb').checked = true;

        document.getElementById('sdb-start-btn').addEventListener('click', startCrawl);
        document.getElementById('sdb-stop-btn').addEventListener('click', stopCrawl);
        document.getElementById('sdb-open-last').addEventListener('click', reconstructLastExport);
        document.getElementById('sdb-clear-last').addEventListener('click', clearLastExport);

    }


    function clearLastExport() {
        if (confirm('Are you sure you want to clear the last export data?')) {
            GM_deleteValue('sdb_last_export_data');
            GM_deleteValue('sdb_removed_items');
            document.getElementById('sdb-open-last').style.display = 'none';
            document.getElementById('sdb-clear-last').style.display = 'none';
            alert('Last export deleted!');
        }
    }

    function updateProgressBar(progress, text) {
        const bar = document.getElementById('sdb-progress-bar');
        const pct = document.getElementById('sdb-progress-percent');
        const txt = document.getElementById('sdb-progress-text');
        if (bar) bar.style.width = `${progress}%`;
        if (pct) pct.textContent = `${Math.round(progress)}%`;
        if (txt && text) txt.textContent = text;
    }

    function showProgressBar() {
        const pc = document.getElementById('sdb-progress-container');
        if (pc) pc.style.display = 'block';
    }

    function hideProgressBar() {
        const pc = document.getElementById('sdb-progress-container');
        if (pc) pc.style.display = 'none';
    }

    // ── Token retrieval ────────────────────────────────────────
    function getRefCk() {
        return new Promise((resolve) => {
            // First try the global variable
            const token = (window.__sdbData && window.__sdbData.refCk) || '';
            if (token) {
                resolve(token);
                return;
            }

            // Fallback: fetch the page source and extract refCk
            console.log('[SDBLogger] window.__sdbData not found, fetching page for token...');
            GM_xmlhttpRequest({
                method: 'GET',
                url: location.href,
                timeout: 15000,
                onload: function(resp) {
                    const match = resp.responseText.match(/"refCk"\s*:\s*"([^"]+)"/);
                    if (match) {
                        resolve(match[1]);
                    } else {
                        alert('Could not extract security token from page.');
                        resolve('');
                    }
                },
                onerror: () => resolve(''),
                ontimeout: () => resolve('')
            });
        });
    }

    // ── Crawl state ────────────────────────────────────────────
    let crawling = false;
    let shouldStop = false;
    let aggregatedItems = [];
    let itemDBLookup = {};
    let lastBlobUrl = null;

    // ── Revised crawl: direct API with token ─────────────────
    async function startCrawl() {
        if (crawling) return;
        GM_deleteValue('sdb_removed_items');

        const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
        const lastUpdate = GM_getValue('itemDataDate', 0);
        if (Date.now() - lastUpdate > CACHE_EXPIRY_MS) {
            GM_deleteValue('itemDatabase');
        }

        const minDelay = parseInt(document.getElementById('sdb-min-delay').value) || DEFAULT_MIN_DELAY_MS;
        const maxDelay = parseInt(document.getElementById('sdb-max-delay').value) || DEFAULT_MAX_DELAY_MS;
        const doFetchItemDB = document.getElementById('sdb-fetch-itemdb').checked;
        GM_setValue('sdb_min_delay', minDelay);
        GM_setValue('sdb_max_delay', maxDelay);
        GM_setValue('sdb_fetch_itemdb', doFetchItemDB);

        crawling = true;
        shouldStop = false;
        aggregatedItems = [];
        itemDBLookup = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
        document.getElementById('sdb-start-btn').disabled = true;
        document.getElementById('sdb-stop-btn').disabled = false;

        const refCk = await getRefCk();
        if (!refCk) {
            alert('Cannot start without security token. Reload the page and try again.');
            finishCrawl();
            return;
        }

        const PER_PAGE = 90;
        let currentApiPage = 1;
        let totalApiPages = 1;

        showProgressBar();
        updateProgressBar(0, 'Fetching page 1...');

        function fetchPage() {
            if (shouldStop || currentApiPage > totalApiPages) {
                finishCrawl();
                return;
            }

            const progress = ((currentApiPage - 1) / totalApiPages) * 100;
            updateProgressBar(progress, `Fetching page ${currentApiPage}/${totalApiPages}`);

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.neopets.com/np-templates/ajax/safetydeposit/get-items.php',
                headers: {
                    'Content-Type': 'application/json',
                    'x-requested-with': 'XMLHttpRequest'
                },
                data: JSON.stringify({
                    page: currentApiPage,
                    per_page: PER_PAGE,
                    search: '',
                    category: '',
                    sort: '',
                    _ref_ck: refCk
                }),
                timeout: 30000,
                onload: function(resp) {
                    try {
                        const data = JSON.parse(resp.responseText);
                        if (!data.success) throw new Error(data.error || 'API error');

                        totalApiPages = data.data.pagination.total_pages;

                        const items = data.data.items || [];
                        items.forEach(item => {
                            const id = item.obj_info_id;
                            const name = item.obj_name;
                            const qty = item.amount;
                            const type = item.type_name;
                            const image = 'https://images.neopets.com/items/' + item.obj_filename + '.gif';
                            const rarity = item.obj_rarity ?? null;
                            const key = id ? 'id:' + id : 'name:' + name.toLowerCase().replace(/\s+/g, ' ').trim();

                            const existing = aggregatedItems.find(it => it._key === key);
                            if (!existing) {
                                aggregatedItems.push({
                                    _key: key,
                                    id, image, name, qty, type, rarity,
                                    pageOffset: currentApiPage
                                });
                            } else {
                                existing.qty += qty;
                            }
                        });

                        currentApiPage++;
                        const delay = minDelay + Math.floor(Math.random() * (Math.max(0, maxDelay - minDelay) + 1));
                        setTimeout(fetchPage, delay);
                    } catch (e) {
                        console.error('Parse error on page', currentApiPage, e);
                        currentApiPage++;
                        setTimeout(fetchPage, minDelay);
                    }
                },
                onerror: function() {
                    currentApiPage++;
                    setTimeout(fetchPage, minDelay);
                },
                ontimeout: function() {
                    currentApiPage++;
                    setTimeout(fetchPage, minDelay);
                }
            });
        }

        fetchPage();

        function finishCrawl() {
            crawling = false;
            shouldStop = false;
            document.getElementById('sdb-start-btn').disabled = false;
            document.getElementById('sdb-stop-btn').disabled = true;
            hideProgressBar();

            const doFetch = document.getElementById('sdb-fetch-itemdb').checked;
            if (doFetch && aggregatedItems.length > 0) {
                fetchItemDBDataThenExport().then(() => buildAndOpenBlob()).catch(err => {
                    console.warn('ItemDB fetch failed', err);
                    buildAndOpenBlob();
                });
            } else {
                buildAndOpenBlob();
            }

            GM_setValue('sdb_last_aggregated_data', JSON.stringify(aggregatedItems));
            GM_setValue('sdb_last_itemdb_data', JSON.stringify(itemDBLookup));
        }
    }

    function stopCrawl() {
        if (crawling) shouldStop = true;
    }

    // ── ItemDB fetch (unchanged) ───────────────────────────────
    function fetchItemDBDataThenExport() {
        return new Promise((resolve, reject) => {
            const ids = Array.from(new Set(aggregatedItems.map(it => it.id).filter(Boolean)));
            if (!ids.length) { resolve(); return; }

            const stored = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
            const missing = ids.filter(id => !stored.hasOwnProperty(id));
            if (!missing.length) {
                itemDBLookup = Object.assign({}, stored);
                GM_setValue('itemDatabase', JSON.stringify(stored));
                resolve();
                return;
            }

            const chunks = [];
            for (let i = 0; i < missing.length; i += ITEMDB_CHUNK) chunks.push(missing.slice(i, i + ITEMDB_CHUNK));
            const combined = Object.assign({}, stored);

            function processChunk(index) {
                if (index >= chunks.length) {
                    itemDBLookup = combined;
                    GM_setValue('itemDatabase', JSON.stringify(combined));
                    GM_setValue('itemDataDate', Date.now());
                    resolve();
                    return;
                }

                const chunk = chunks[index];
                updateProgressBar((index / chunks.length) * 100, `ItemDB chunk ${index+1}/${chunks.length} (${chunk.length} items)`);

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://itemdb.com.br/api/v1/items/many',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ item_id: chunk }),
                    responseType: 'json',
                    timeout: 120000,
                    onload: function(res) {
                        try {
                            if (res.status === 200) {
                                const json = (typeof res.response === 'object') ? res.response : JSON.parse(res.responseText || '{}');
                                Object.entries(json).forEach(([id, obj]) => {
                                    combined[parseInt(id)] = {
                                        name: obj.name,
                                        cat: obj.category,
                                        value: (obj.price && obj.price.value) ? obj.price.value : null,
                                        rarity: obj.rarity,
                                        isNC: obj.isNC,
                                        isBD: obj.isBD,
                                        isWearable: obj.isWearable
                                    };
                                });
                                const delay = ITEMDB_DELAY_MIN_MS + Math.floor(Math.random() * (ITEMDB_DELAY_MAX_MS - ITEMDB_DELAY_MIN_MS + 1));
                                setTimeout(() => processChunk(index + 1), delay);
                            } else if (res.status === 429) {
                                const retryDelay = 10000 + Math.floor(Math.random() * 5000);
                                updateProgressBar((index / chunks.length) * 100, `Rate limited, retrying in ${retryDelay/1000}s`);
                                setTimeout(() => processChunk(index), retryDelay);
                            } else {
                                console.warn('ItemDB chunk failed', res.status);
                                setTimeout(() => processChunk(index + 1), ITEMDB_DELAY_MIN_MS);
                            }
                        } catch (e) {
                            console.error('ItemDB parse error', e);
                            setTimeout(() => processChunk(index + 1), ITEMDB_DELAY_MIN_MS);
                        }
                    },
                    onerror: () => setTimeout(() => processChunk(index + 1), ITEMDB_DELAY_MIN_MS),
                    ontimeout: () => setTimeout(() => processChunk(index + 1), ITEMDB_DELAY_MIN_MS)
                });
            }
            processChunk(0);
        });
    }

    // ── Template / blob export (unchanged) ────────────────────
    async function fetchTemplate() {
        try {
            const resp = await fetch('https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/template.html', { cache: 'no-cache' });
            return await resp.text();
        } catch (e) {
            console.error('Failed to fetch template:', e);
            return null;
        }
    }

    async function buildAndOpenBlobFromData(data) {
        const itemdb = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
        const lebronValues = await fetchLebronValues();
        const template = await fetchTemplate();
        if (!template) { alert('Template failed to load.'); return; }

        const processed = data.map(it => {
            const meta = (it.id && itemdb[it.id]) ? itemdb[it.id] : {};
            let value = meta.value ?? null;
            if (it.rarity === 500 && (!value || value === '-') && lebronValues[it.name?.toLowerCase()]) {
                const lb = lebronValues[it.name.toLowerCase()];
                if (lb && lb !== '-') value = lb;
            }
            return {
                id: it.id || '',
                image: it.image || '',
                name: it.name || '',
                qty: it.qty || 0,
                type: it.type || '',
                rarity: meta.rarity || null,
                value,
                cat: meta.cat || null,
                isNC: meta.isNC || false
            };
        });

        const jsonString = JSON.stringify(processed).replace(/</g, '\\u003c');
        const filled = template.replace('{{SDB_DATA}}', jsonString);
        const blob = new Blob([filled], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        lastBlobUrl = blobUrl;
        GM_setValue('sdb_last_blob_url', blobUrl);
        GM_setValue('sdb_last_export_time', Date.now());

        const win = window.open(blobUrl, '_blank');
        if (!win) alert('Popup blocked — please allow popups.');
        const btn = document.getElementById('sdb-open-last');
        if (btn) btn.style.display = 'inline-block';
    }

    function buildAndOpenBlob() {
        const itemdb = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
        fetchLebronValues().then(lebronValues => {
            const data = aggregatedItems.map(it => {
                const meta = (it.id && itemdb[it.id]) ? itemdb[it.id] : {};
                let value = (meta && meta.value !== undefined) ? meta.value : null;
                if (it.rarity === 500 && (!value || value === '-') && lebronValues[it.name?.toLowerCase()]) {
                    const lb = lebronValues[it.name.toLowerCase()];
                    if (lb && lb !== '-') value = lb;
                }
                return {
                    id: it.id || '',
                    image: it.image || '',
                    name: it.name || '',
                    qty: it.qty || 0,
                    type: it.type || '',
                    rarity: meta.rarity || null,
                    value,
                    cat: meta.cat || null,
                    isNC: meta?.isNC
                };
            });
            GM_setValue('sdb_last_export_data', JSON.stringify(data));
            GM_setValue('sdb_last_export_format', 'html');
            GM_setValue('sdb_last_export_time', Date.now());
            buildAndOpenBlobFromData(data);
        });
    }

    window.addEventListener('message', function(event) {
        if (event.data.type === 'sdb_item_removed') {
            const removed = getRemovedItems();
            removed[event.data.itemId] = (removed[event.data.itemId] || 0) + event.data.quantity;
            GM_setValue('sdb_removed_items', JSON.stringify(removed));
        }
    });

    // ── Initialize ─────────────────────────────────────────────
    addUI();

    window._sdbAggregator = {
        aggregatedItems: () => aggregatedItems,
        itemDBLookup: () => JSON.parse(GM_getValue('itemDatabase', '{}') || '{}'),
        lastExportUrl: () => GM_getValue('sdb_last_blob_url', null),
        getRemovedItems: () => getRemovedItems()
    };
})();
