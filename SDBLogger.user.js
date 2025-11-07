// ==UserScript==
// @name         Neopets SDB Logger
// @version      1.4
// @author       TamperPanda
// @description  SDB Logger & Exporter
// @match        https://www.neopets.com/safetydeposit.phtml*
// @icon         https://cdn9.neopets.com/app_icons/816098ae647bce91fb4ba4590b0f3e6b.png
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
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';
    let autoExportEnabled = true;

    // Configuration

    const DEFAULT_MIN_DELAY_MS = 500;
    const DEFAULT_MAX_DELAY_MS = 750;
    const PAGE_STEP = 30;
    const ITEMDB_CHUNK = 500;
    const ITEMDB_DELAY_MIN_MS = 1500;
    const ITEMDB_DELAY_MAX_MS = 3000;

    // Helper / Storage

    function $qs(sel, root = document) {
        return root.querySelector(sel);
    }

    function $qsa(sel, root = document) {
        return Array.from((root || document).querySelectorAll(sel));
    }

    function safeText(node) {
        return (node && node.textContent || '').trim();
    }

    function clamp(n, a, b) {
        return Math.max(a, Math.min(b, n));
    }

    function formatNumberWithCommas(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    async function fetchLebronValues() {
        try {
            const response = await fetch('https://lebron-values.netlify.app/item_values.json');
            const lebronData = await response.json();
            return lebronData;
        } catch (error) {
            console.warn('Failed to fetch Lebron values:', error);
            return {};
        }
    }

    let crawling = false;
    let shouldStop = false;
    let aggregatedItems = [];
    let itemDBLookup = {};
    let lastBlobUrl = null;
    let totalPages = 1;
    let currentPage = 0;

    //Removal Tracking

    function getRemovedItems() {
        let removed = {};

        try {
            const localRemoved = localStorage.getItem('sdb_removed_items');
            if (localRemoved) {
                removed = JSON.parse(localRemoved);
                console.log('Found removals in localStorage:', removed);
            }

            const gmRemoved = GM_getValue('sdb_removed_items', '{}');
            const gmParsed = JSON.parse(gmRemoved);

            removed = {
                ...removed,
                ...gmParsed
            };

        } catch (e) {
            console.warn('Error reading removals, using GM storage only:', e);
            removed = JSON.parse(GM_getValue('sdb_removed_items', '{}'));
        }

        return removed;
    }

    function saveRemovedItem(itemId, quantity) {
        const removed = getRemovedItems();
        if (removed[itemId]) {
            removed[itemId] += quantity;
        } else {
            removed[itemId] = quantity;
        }
        GM_setValue('sdb_removed_items', JSON.stringify(removed));
    }

    function applyRemovalsToData(data) {
        const removed = getRemovedItems();
        if (Object.keys(removed).length === 0) {
            return data;
        }

        const updatedData = [];
        const removedItems = [];

        for (const item of data) {
            if (item.id && removed[item.id]) {
                const removedQty = removed[item.id];
                const newQty = Math.max(0, (item.qty || 0) - removedQty);

                if (newQty > 0) {
                    updatedData.push({
                        ...item,
                        qty: newQty
                    });
                } else {
                    removedItems.push(item.name || item.id);
                }
            } else {
                updatedData.push(item);
            }
        }

        if (removedItems.length > 0) {
            console.log('Completely removed items:', removedItems);
        }
        console.log(`Applied removals to ${Object.keys(removed).length} items`);

        return updatedData;
    }
    // Reconstruct Last Export

    function reconstructLastExport() {
        const lastDataStr = GM_getValue('sdb_last_export_data', null);

        if (!lastDataStr) {
            alert('No previous export found. Please run a fresh scan first.');
            return;
        }

        try {
            try {
                const localRemoved = localStorage.getItem('sdb_removed_items');
                if (localRemoved) {
                    const localParsed = JSON.parse(localRemoved);
                    const gmRemoved = JSON.parse(GM_getValue('sdb_removed_items', '{}'));
                    const merged = {
                        ...gmRemoved,
                        ...localParsed
                    };
                    GM_setValue('sdb_removed_items', JSON.stringify(merged));
                    console.log('Synced localStorage removals to GM storage');
                }
            } catch (syncError) {
                console.warn('Could not sync localStorage removals:', syncError);
            }

            const originalData = JSON.parse(lastDataStr);
            const dataWithRemovals = applyRemovalsToData(originalData);

            GM_deleteValue('sdb_removed_items');
            localStorage.removeItem('sdb_removed_items');

            GM_setValue('sdb_last_export_data', JSON.stringify(dataWithRemovals));
            buildAndOpenBlobFromData(dataWithRemovals);

            console.log('Removals applied and cleared from storage');

        } catch (e) {
            console.error('Failed to rebuild last export:', e);
            alert('Could not rebuild last export data.');
        }
    }
    // UI

    function addUI() {
        const container = document.createElement('div');
        container.id = 'sdb-aggregator-container';
        container.style = 'border:2px solid #3a6ea5;padding:15px;margin:15px auto;background:#f6fbff;font-family: Verdana,Arial,Helvetica,sans-serif;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);max-width:600px;display:flex;flex-direction:column;align-items:center;';

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
      </div>
    `;

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

    // Progress Bar

    function updateProgressBar(progress, text) {
        const progressBar = document.getElementById('sdb-progress-bar');
        const progressPercent = document.getElementById('sdb-progress-percent');
        const progressText = document.getElementById('sdb-progress-text');
        if (progressBar && progressPercent) progressBar.style.width = `${progress}%`;
        if (progressPercent) progressPercent.textContent = `${Math.round(progress)}%`;
        if (progressText && text) progressText.textContent = text;
    }

    function showProgressBar() {
        const progressContainer = document.getElementById('sdb-progress-container');
        if (progressContainer) progressContainer.style.display = 'block';
    }

    function hideProgressBar() {
        const progressContainer = document.getElementById('sdb-progress-container');
        if (progressContainer) progressContainer.style.display = 'none';
    }

    // GM_xmlhttpRequest

    function startCrawl() {
        if (crawling) return;
        GM_deleteValue('sdb_removed_items');
        const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
        const lastUpdate = GM_getValue('itemDataDate', 0);
        const now = Date.now();
        if (now - lastUpdate > CACHE_EXPIRY_MS) {
            GM_deleteValue('itemDatabase');
            console.log('Cache expired, fetching fresh prices...');
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
        itemDBLookup = JSON.parse(GM_getValue('itemDatabase', '{}')) || {};

        document.getElementById('sdb-start-btn').disabled = true;
        document.getElementById('sdb-stop-btn').disabled = false;

        let offsetSelect = document.querySelector("select[name='offset']");
        totalPages = 1;
        if (offsetSelect) totalPages = offsetSelect.length;
        const totalStr = document.querySelector('.content > table') ? document.querySelector('.content > table').textContent : '';
        const matchItems = totalStr.match(/Items:\s*([\d,]+)/i);
        if (matchItems) {
            const totalItems = parseInt(matchItems[1].replace(/,/g, '')) || 0;
            totalPages = Math.max(totalPages, Math.ceil(totalItems / PAGE_STEP));
        }

        const offsets = [];
        for (let p = 0; p < totalPages; p++) offsets.push(p * PAGE_STEP);

        showProgressBar();
        updateProgressBar(0, `Processing page: 0/${totalPages}`);

        let idx = 0;

        function nextPage() {
            if (shouldStop || idx >= offsets.length) {
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
                timeout: 30000,
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
                }
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
                fetchItemDBDataThenExport().then(() => buildAndOpenBlob())
                    .catch(err => {
                        console.warn('ItemDB fetch failed', err);
                        buildAndOpenBlob();
                    });
            } else buildAndOpenBlob();

            GM_setValue('sdb_last_aggregated_data', JSON.stringify(aggregatedItems));
            GM_setValue('sdb_last_itemdb_data', JSON.stringify(itemDBLookup));
        }
    }

    function stopCrawl() {
        if (crawling) shouldStop = true;
    }

    // Parse and Return Items

    function selectSDBRows(doc) {
        const mainContent = doc.querySelector('.content');
        if (!mainContent) return [];
        const allTables = mainContent.querySelectorAll('table');
        for (const table of allTables) {
            const rows = table.querySelectorAll('tr');
            for (const row of rows) {
                if (row.querySelector('input[name^="back_to_inv"]')) {
                    return Array.from(table.querySelectorAll('tr')).filter(r => r.querySelector('input[name^="back_to_inv"]'));
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
                let name = '',
                    qty = 0,
                    id = null,
                    type = '';

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
                const nameCell = row.querySelector('td:first-child');
                if (nameCell) {
                    const textContent = nameCell.textContent || '';
                    name = textContent.split('\n')[0].trim();
                }
                if (!name) {
                    const bolds = row.querySelectorAll('b');
                    if (bolds && bolds.length) {
                        for (let b of bolds) {
                            const txt = safeText(b);
                            if (txt && /[A-Za-z0-9'’\-\u00C0-\u024F]/.test(txt) && txt.length < 120 && !/^\d+$/.test(txt)) {
                                name = txt.replace(/\s*\([^)]*\).*$/, '').trim();
                                break;
                            }
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
        return (new URL(location.href)).searchParams.get('category');
    }

    function getObjName() {
        return (new URL(location.href)).searchParams.get('obj_name');
    }

    // ItemDB data fetcher
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
            for (let i = 0; i < missing.length; i += chunkSize) chunks.push(missing.slice(i, i + chunkSize));
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
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        item_id: theChunk
                    }),
                    responseType: 'json',
                    timeout: 120000,
                    onload: function(res) {
                        try {
                            if (res.status === 200) {
                                const respJson = (typeof res.response === 'object') ? res.response : JSON.parse(res.responseText || '{}');
                                Object.entries(respJson).forEach(([keyId, itemObj]) => {
                                    combined[parseInt(keyId, 10)] = {
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
                    }
                });
            }
            processChunk(0);
        });
    }

    // Build blob page
    async function fetchTemplate() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/TamperPanda/SDBLogger/main/template.html', {
                cache: 'no-cache'
            });
            return await response.text();
        } catch (error) {
            console.error('Failed to fetch template:', error);
            return null;
        }
    }

    async function buildAndOpenBlobFromData(data) {
        const itemdb = JSON.parse(GM_getValue('itemDatabase', '{}') || '{}');
        const lebronValues = await fetchLebronValues();
        const template = await fetchTemplate();

        if (!template) {
            console.error('Template failed to load');
            alert('Template failed to load.');
            return;
        }

        const processedData = data.map(it => {
            const meta = (it.id && itemdb[it.id]) ? itemdb[it.id] : {};
            let value = meta.value ?? null;
            if (it.rarity === 500 && (!value || value === '-') && lebronValues[it.name?.toLowerCase()]) {
                const lebronValue = lebronValues[it.name.toLowerCase()];
                if (lebronValue && lebronValue !== '-') value = lebronValue;
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

        const jsonString = JSON.stringify(processedData).replace(/</g, '\\u003c');
        const filledTemplate = template.replace('{{SDB_DATA}}', jsonString);

        const blob = new Blob([filledTemplate], {
            type: 'text/html'
        });
        const blobUrl = URL.createObjectURL(blob);

        lastBlobUrl = blobUrl;
        GM_setValue('sdb_last_blob_url', blobUrl);
        GM_setValue('sdb_last_export_time', Date.now());

        const newWindow = window.open(blobUrl, '_blank');
        if (!newWindow) {
            alert('Popup blocked — please allow popups for this site.');
            return;
        }
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
                    const lebronValue = lebronValues[it.name.toLowerCase()];
                    if (lebronValue && lebronValue !== '-') value = lebronValue;
                }
                return {
                    id: it.id || '',
                    image: it.image || '',
                    name: it.name || '',
                    qty: it.qty || 0,
                    type: it.type || '',
                    rarity: meta.rarity || null,
                    value: value,
                    cat: meta.cat || null,
                    isNC: meta && meta.isNC
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
            console.log('Received removal from blob:', event.data);
            const removed = getRemovedItems();
            removed[event.data.itemId] = (removed[event.data.itemId] || 0) + event.data.quantity;
            GM_setValue('sdb_removed_items', JSON.stringify(removed));
            console.log('Removal saved to GM storage');
        }
    });

    // Initialize

    addUI();

    window._sdbAggregator = {
        aggregatedItems: () => aggregatedItems,
        itemDBLookup: () => JSON.parse(GM_getValue('itemDatabase', '{}') || '{}'),
        lastExportUrl: () => GM_getValue('sdb_last_blob_url', null),
        getRemovedItems: () => getRemovedItems()
    };

})();
