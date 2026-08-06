// ==UserScript==
// @name         Neopets SDBCrawler
// @version      2.6.0
// @author       TamperPanda
// @description  Neopets SDB crawler: virtualized grid, ItemDB pricing, batch item management.
// @match        https://www.neopets.com/safetydeposit.phtml*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM3YzZjZmYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyMmQzZWUiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cGF0aCBmaWxsPSJ1cmwoI2cpIiBkPSJNMTk5Ljk4IDEwMkguMDJhMTAwLjAxNyAxMDAuMDE3IDAgMDAzLjM5MyAyNGgxOTMuMTc0YTEwMC4wMjggMTAwLjAyOCAwIDAwMy4zOTMtMjR6TTE5NS40MjIgMTMwSDQuNTc4YTk5LjQ0OCA5OS40NDggMCAwMDguOCAyMGgxNzMuMjQ0YTk5LjQ1IDk5LjQ1IDAgMDA4LjgtMjB6TTE4NC4xODEgMTU0SDE1LjgxOWExMDAuNDc0IDEwMC40NzQgMCAwMDEyLjc2NyAxNmgxNDIuODI4YTEwMC40MzEgMTAwLjQzMSAwIDAwMTIuNzY3LTE2ek0xNjcuMjYyIDE3NEgzMi43MzhhMTAwLjI2NyAxMDAuMjY3IDAgMDAxOS43MjQgMTRoOTUuMDc2YTEwMC4yODkgMTAwLjI4OSAwIDAwMTkuNzI0LTE0ek0xMzkuMjU3IDE5Mkg2MC43NDNjMTIuMDUyIDUuMTUgMjUuMzIyIDggMzkuMjU3IDggMTMuOTM1IDAgMjcuMjA1LTIuODUgMzkuMjU3LTh6TTE5OS45OCA5OEguMDJhOTkuNzUzIDk5Ljc1MyAwIDAxNS41NTMtMzFoMTg4Ljg1NGE5OS43MjMgOTkuNzIzIDAgMDE1LjU1MyAzMXpNMTkyLjkzMiA2M0MxNzguMjIzIDI2LjA4NyAxNDIuMTU4IDAgMTAwIDBTMjEuNzc3IDI2LjA4NyA3LjA2OCA2M2gxODUuODY0eiIvPjwvc3ZnPg==
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/TamperPanda/SDBCrawler/main/SDBCrawler.user.js
// @downloadURL  https://raw.githubusercontent.com/TamperPanda/SDBCrawler/main/SDBCrawler.user.js
// @connect      itemdb.com.br
// @connect      www.neopets.com
// @connect      lebron-values.netlify.app
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    const CFG = {
        apiUrl: 'https://www.neopets.com/np-templates/ajax/safetydeposit/get-items.php',
        moveUrl: 'https://www.neopets.com/np-templates/ajax/safetydeposit/move-items.php',
        quickstockUrl: 'https://www.neopets.com/np-templates/ajax/quickstock/get_items.php',
        quickstockMoveUrl: 'https://www.neopets.com/np-templates/ajax/process_quickstock.php',
        quickstockPage: 'https://www.neopets.com/quickstock.phtml',
        sdbPage: 'https://www.neopets.com/safetydeposit.phtml',
        origin: 'https://www.neopets.com',
        quickstockPerPage: 50,
        depositChunk: 70,
        itemdbUrl: 'https://itemdb.com.br/api/v1/items/many',
        itemdbV2Url: 'https://itemdb.com.br/api/v2/items/many',
        lebronUrl: 'https://lebron-values.netlify.app/item_values.json',
        perPage: 90,
        pageDelay: [100, 300],
        crawlConcurrency: 1,
        itemdbChunk: 1000,
        itemdbDelay: [1200, 1500],
        itemdbRetries: 8,
        itemdbMaxWait: 180000,

        cacheDays: 2,
        rowH: 44,
        overscan: 8,
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const randInt = (min, max) => min + Math.floor(Math.random() * (Math.max(0, max - min) + 1));
    const nf = new Intl.NumberFormat('en-US');
    const collator = new Intl.Collator('en');

    const debounce = (fn, ms) => {
        let t = 0;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    };

    const escHTML = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const normValue = (v) => {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
            const s = v.trim();
            if (!s || s === '-') return null;
            const n = Number(s.replace(/,/g, ''));
            return Number.isFinite(n) ? n : s;
        }
        return null;
    };

    const timeAgo = (ts) => {
        if (!ts) return 'never';
        const s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    };

    const stamp = () => {
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    };

    const LZString = (() => {
        const f = String.fromCharCode;
        function _compress(uncompressed, bitsPerChar, getCharFromInt) {
            if (uncompressed == null) return '';
            let i, value, context_dictionary = {}, context_dictionaryToCreate = {}, context_c = '',
                context_wc = '', context_w = '', context_enlargeIn = 2, context_dictSize = 3,
                context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0, ii;
            for (ii = 0; ii < uncompressed.length; ii += 1) {
                context_c = uncompressed.charAt(ii);
                if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
                    context_dictionary[context_c] = context_dictSize++;
                    context_dictionaryToCreate[context_c] = true;
                }
                context_wc = context_w + context_c;
                if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
                    context_w = context_wc;
                } else {
                    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                        if (context_w.charCodeAt(0) < 256) {
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1);
                                if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 8; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                                value = value >> 1;
                            }
                        } else {
                            value = 1;
                            for (i = 0; i < context_numBits; i++) {
                                context_data_val = (context_data_val << 1) | value;
                                if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                                value = 0;
                            }
                            value = context_w.charCodeAt(0);
                            for (i = 0; i < 16; i++) {
                                context_data_val = (context_data_val << 1) | (value & 1);
                                if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                                value = value >> 1;
                            }
                        }
                        context_enlargeIn--;
                        if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
                        delete context_dictionaryToCreate[context_w];
                    } else {
                        value = context_dictionary[context_w];
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
                    context_dictionary[context_wc] = context_dictSize++;
                    context_w = String(context_c);
                }
            }
            if (context_w !== '') {
                if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                    if (context_w.charCodeAt(0) < 256) {
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1);
                            if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 8; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                            value = value >> 1;
                        }
                    } else {
                        value = 1;
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | value;
                            if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                            value = 0;
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 16; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
                    delete context_dictionaryToCreate[context_w];
                } else {
                    value = context_dictionary[context_w];
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                        value = value >> 1;
                    }
                }
                context_enlargeIn--;
                if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
            }
            value = 2;
            for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; } else { context_data_position++; }
                value = value >> 1;
            }
            while (true) {
                context_data_val = (context_data_val << 1);
                if (context_data_position == bitsPerChar - 1) { context_data.push(getCharFromInt(context_data_val)); break; } else { context_data_position++; }
            }
            return context_data.join('');
        }
        function _decompress(length, resetValue, getNextValue) {
            let dictionary = [], enlargeIn = 4, dictSize = 4, numBits = 3, entry = '', result = [],
                i, w, bits, resb, maxpower, power, c, data = { val: getNextValue(0), position: resetValue, index: 1 };
            for (i = 0; i < 3; i += 1) { dictionary[i] = i; }
            bits = 0; maxpower = Math.pow(2, 2); power = 1;
            while (power != maxpower) {
                resb = data.val & data.position; data.position >>= 1;
                if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
            }
            switch (bits) {
                case 0:
                    bits = 0; maxpower = Math.pow(2, 8); power = 1;
                    while (power != maxpower) {
                        resb = data.val & data.position; data.position >>= 1;
                        if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                        bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
                    }
                    c = f(bits); break;
                case 1:
                    bits = 0; maxpower = Math.pow(2, 16); power = 1;
                    while (power != maxpower) {
                        resb = data.val & data.position; data.position >>= 1;
                        if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                        bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
                    }
                    c = f(bits); break;
                case 2:
                    return '';
            }
            dictionary[3] = c; w = c; result.push(c);
            while (true) {
                if (data.index > length) { return ''; }
                bits = 0; maxpower = Math.pow(2, numBits); power = 1;
                while (power != maxpower) {
                    resb = data.val & data.position; data.position >>= 1;
                    if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                    bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
                }
                switch (c = bits) {
                    case 0:
                        bits = 0; maxpower = Math.pow(2, 8); power = 1;
                        while (power != maxpower) {
                            resb = data.val & data.position; data.position >>= 1;
                            if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                            bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
                        }
                        dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
                    case 1:
                        bits = 0; maxpower = Math.pow(2, 16); power = 1;
                        while (power != maxpower) {
                            resb = data.val & data.position; data.position >>= 1;
                            if (data.position == 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                            bits |= (resb > 0 ? 1 : 0) * power; power <<= 1;
                        }
                        dictionary[dictSize++] = f(bits); c = dictSize - 1; enlargeIn--; break;
                    case 2:
                        return result.join('');
                }
                if (enlargeIn == 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
                if (dictionary[c]) { entry = dictionary[c]; }
                else { if (c === dictSize) { entry = w + w.charAt(0); } else { return null; } }
                result.push(entry);
                dictionary[dictSize++] = w + entry.charAt(0);
                enlargeIn--;
                w = entry;
                if (enlargeIn == 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
            }
        }
        return {
            compressToUTF16: (input) => input == null ? '' : _compress(input, 15, (a) => f(a + 32)) + ' ',
            decompressFromUTF16: (compressed) => compressed == null ? '' : compressed == '' ? null
                : _decompress(compressed.length, 16384, (index) => compressed.charCodeAt(index) - 32),
        };
    })();

    const LZ_KEYS = new Set(['sdb_v2_snapshot', 'itemDatabase', 'sdb_snapshots']);
    const LZ_VERSION = 1;
    const BACKUP_USE_LZ = 'sdb_backup_use_lz';
    const deadKeys = new Set();
    const Store = {
        get(key, fallback) {
            try {
                const raw = GM_getValue(key, null);
                if (raw === null || raw === undefined) return fallback;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (LZ_KEYS.has(key) && parsed && typeof parsed === 'object' && parsed._lz != null) {
                    if (parsed._lz !== LZ_VERSION) {
                        console.warn(`[SDB] "${key}" was stored by a newer version (format _lz ${parsed._lz}); please update the script. Ignoring it for now.`);
                        return fallback;
                    }
                    const json = LZString.decompressFromUTF16(parsed.d);
                    return json ? JSON.parse(json) : fallback;
                }
                return parsed;
            } catch (err) { console.warn(`[SDB] read failed for "${key}" — using fallback (data may be corrupt):`, err); return fallback; }
        },
        set(key, val) {
            if (deadKeys.has(key)) return;
            try {
                const json = JSON.stringify(val);
                if (LZ_KEYS.has(key)) GM_setValue(key, JSON.stringify({ _lz: LZ_VERSION, d: LZString.compressToUTF16(json) }));
                else GM_setValue(key, json);
            } catch (err) {
                deadKeys.add(key);
                console.warn(`[SDB] storage write failed for "${key}" — not retrying this session:`, err);
                if (typeof toast === 'function') toast('Storage full. Some data was not saved', true);
            }
        },
        del(key) { GM_deleteValue(key); },
    };

    const ALL_STORE_KEYS = [
        'sdb_queue', 'sdb_v2_snapshot', 'itemDatabase', 'itemDataDate', 'sdb_scan_meta',
        'sdb_ui_position', 'sdb_ui_size', 'sdb_ui_open', 'sdb_launcher_corner',
        'sdb_hidden_keys', 'sdb_filters', 'sdb_pager',
        'sdb_theme', 'sdb_grid_zoom', 'sdb_card_view', 'sdb_col_widths',
        'sdb_move_target', 'sdb_itemdb_intent', 'sdb_itemdb_chunk',
        'sdb_itemdb_min_delay', 'sdb_itemdb_max_delay',
        'sdb_removed_items', 'sdb_nc_mode', 'sdb_fetch_itemdb', 'sdb_min_delay', 'sdb_max_delay', 'sdb_debug',
        'sdb_keybinds', 'sdb_custom_keybinds', 'sdb_custom_theme', 'sdb_theme_presets', 'sdb_baseline',
        'sdb_card_colorize', 'sdb_card_rarity', 'sdb_link_images', 'sdb_short_values', 'sdb_cache_days',
        'sdb_deposit_rescan', 'sdb_backup_use_lz',
        'sdb_snapshots', 'sdb_snap_trend', 'sdb_snap_migrated', 'sdb_history',
        'sdb_last_export_data', 'sdb_last_export_format', 'sdb_last_export_time',
        'sdb_last_blob_url', 'sdb_last_aggregated_data', 'sdb_last_itemdb_data',
    ];

    const INTENT_LABELS = [
        ['minimal', 'Minimal'],
        ['pricer',  'Pricer'],
        ['card',    'Card'],
        ['full',    'Full'],
    ];
    const ITEMDB_INTENTS = INTENT_LABELS.map(([v]) => v);

    const ENRICH_BLOCKLIST = new Set([86984]);
    const isBlocked = (id) => ENRICH_BLOCKLIST.has(Number(id));

    const SNAPSHOT_CAP = 12;
    const TREND_CAP = 200;
    const HISTORY_CAP = 25;

    const clampInt = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
    const itemdbCfg = {
        chunk: clampInt(Store.get('sdb_itemdb_chunk', CFG.itemdbChunk), 1, 1000, CFG.itemdbChunk),
        minDelay: clampInt(Store.get('sdb_itemdb_min_delay', CFG.itemdbDelay[0]), 0, 60000, CFG.itemdbDelay[0]),
        maxDelay: clampInt(Store.get('sdb_itemdb_max_delay', CFG.itemdbDelay[1]), 0, 60000, CFG.itemdbDelay[1]),
        intent: (i => ITEMDB_INTENTS.includes(i) ? i : 'full')(Store.get('sdb_itemdb_intent', 'full')),
        cacheDays: (d => Number.isFinite(d) ? Math.max(1, Math.min(30, Math.round(d))) : CFG.cacheDays)(Store.get('sdb_cache_days', CFG.cacheDays)),
    };
    const saveItemdbCfg = () => {
        Store.set('sdb_itemdb_chunk', itemdbCfg.chunk);
        Store.set('sdb_itemdb_min_delay', itemdbCfg.minDelay);
        Store.set('sdb_itemdb_max_delay', itemdbCfg.maxDelay);
        Store.set('sdb_itemdb_intent', itemdbCfg.intent);
        Store.set('sdb_cache_days', itemdbCfg.cacheDays);
    };

    let fetchItemdb = Store.get('sdb_fetch_itemdb', true) !== false;

    const scanCfg = {
        minDelay: Store.get('sdb_min_delay', CFG.pageDelay[0]),
        maxDelay: Store.get('sdb_max_delay', CFG.pageDelay[1]),
    };
    const saveScanCfg = () => {
        Store.set('sdb_min_delay', scanCfg.minDelay);
        Store.set('sdb_max_delay', scanCfg.maxDelay);
    };

    const gmRequest = (opts) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...opts,
            onload: resolve,
            onerror: () => reject(new Error(`Network error: ${opts.url}`)),
            ontimeout: () => reject(new Error(`Timeout: ${opts.url}`)),
        });
    });

    const neoHeaders = (referer, post = false) => ({
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        dnt: '1',
        pragma: 'no-cache',
        priority: 'u=1, i',
        referer,
        'x-requested-with': 'XMLHttpRequest',
        ...(post ? { 'content-type': 'application/json', origin: CFG.origin } : {}),
    });

    const bus = new EventTarget();
    const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
    const on = (type, fn) => {
        const h = (e) => fn(e.detail);
        bus.addEventListener(type, h);
        return () => bus.removeEventListener(type, h);
    };

    const state = {
        items: [],
        byKey: new Map(),
        view: [],
        stats: { unique: 0, qty: 0, value: 0, nc: 0 },
        query: '',
        queryMatch: null,
        catFilter: {},
        ncMode: 'all',
        hiddenOnly: false,
        triFlags: { inflated: 0, canEat: 0, canRead: 0, canOpen: 0 },
        filters: { rMin: null, rMax: null, vMin: null, vMax: null, qMin: null, qMax: null },
        pager: { mode: 'virtual', page: 1, pageSize: 90 },
        theme: 'dark',
        gridZoom: 1.5,
        cardView: false,
        sort: { col: 'value', dir: -1 },
        crawling: false,
        withdrawing: false,
        depositing: false,
        stopRequested: false,
        scannedAt: null,
        queue: new Map(),
    };

    const NC_MODES = ['all', 'np', 'nc'];
    const normNcMode = (m) => (NC_MODES.includes(m) ? m : 'all');

    let itemdbUseV1 = false;
    let itemdbCooldownUntil = 0;
    let v2FailCount = 0;
    let enrichFailedIds = 0;

    const COL_DEFS = [
        { key: 'item',   def: null, min: 90, head: 'Item' },
        { key: 'value',  def: 72,   min: 50, head: 'Value' },
        { key: 'qty',    def: 52,   min: 40, head: 'Qty' },
        { key: 'total',  def: 84,   min: 50, head: 'Total' },
        { key: 'rarity', def: 50,   min: 40, head: 'Rarity' },
        { key: 'cat',    def: 92,   min: 60, head: 'Category' },
        { key: 'id',     def: 58,   min: 40, head: 'ID' },
        { key: 'move',   def: 82,   min: 56, head: 'Move' },
        { key: 'hide',   def: 56,   min: 44, head: 'Action' },
        { key: 'links',  def: 96,   min: 92, head: 'Links' },
    ];
    const LAST_COL = COL_DEFS[COL_DEFS.length - 1].key;
    const colWidths = new Map(
        Object.entries(Store.get('sdb_col_widths', {}))
            .map(([k, v]) => [k, Number(v)])
            .filter(([k, v]) => Number.isFinite(v) && COL_DEFS.some((c) => c.key === k))
    );
    const persistColWidths = () => Store.set('sdb_col_widths', Object.fromEntries(colWidths));
    const saveColWidths = debounce(persistColWidths, 400);

    const autoMin = new Map();
    let measureCtx = null;
    function textWidth(text, font) {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = font;
        return measureCtx.measureText(text).width;
    }
    function computeAutoMins() {
        autoMin.clear();
        const items = state.items;
        if (!items.length) return;
        const SANS = `12.5px ${'Inter, "SF Pro Text", -apple-system, "Segoe UI", system-ui, sans-serif'}`;
        const MONO = (px) => `${px}px ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace`;
        const widest = (toStr, font, pad) => {
            const top = [];
            for (const it of items) {
                const s = toStr(it);
                if (!s) continue;
                if (top.length < 6) { top.push(s); top.sort((a, b) => b.length - a.length); }
                else if (s.length > top[5].length) { top[5] = s; top.sort((a, b) => b.length - a.length); }
            }
            let w = 0;
            for (const s of top) w = Math.max(w, textWidth(s, font));
            return Math.ceil(w + pad);
        };
        autoMin.set('item', widest((it) => it.name, SANS, 28 + 9 + 30));
        autoMin.set('id', widest((it) => (it.id != null ? String(it.id) : ''), MONO(12), 10));
        autoMin.set('qty', widest((it) => gridNum(it.qty), MONO(12), 10));
        autoMin.set('cat', widest((it) => it.cat || it.type || '', MONO(10.5), 20));
        autoMin.set('rarity', widest((it) => (it.rarity != null ? String(it.rarity) : ''), MONO(10.5), 16));
        autoMin.set('value', widest((it) => gridNum(it.value), MONO(12), 10));
        autoMin.set('total', widest(
            (it) => (typeof it.value === 'number' ? gridNum(it.value * it.qty) : ''), MONO(12), 10));
    }
    const headMin = new Map();
    function computeHeadMins() {
        const HEAD_FONT = '600 10px Inter, "SF Pro Text", -apple-system, "Segoe UI", system-ui, sans-serif';
        for (const c of COL_DEFS) {
            const label = (c.head || '').toUpperCase();
            if (!label) continue;
            const tracking = label.length * 0.8;
            const chrome = c.def === null || c.key === LAST_COL ? 12 : 20;
            headMin.set(c.key, Math.ceil(textWidth(label, HEAD_FONT) + tracking + chrome));
        }
    }
    const AUTO_CAP = { item: 190, cat: 150 };
    const colMin = (c) => Math.max(
        c.min,
        headMin.get(c.key) || 0,
        Math.min(Math.ceil(autoMin.get(c.key) || 0), AUTO_CAP[c.key] ?? 160),
    );

    function colTemplate() {
        return COL_DEFS.map((c) => {
            const w = colWidths.get(c.key) ?? c.def;
            const min = colMin(c);
            return w == null
                ? `minmax(calc(${min}px * var(--zoom)), 1fr)`
                : `calc(${Math.max(min, w)}px * var(--zoom))`;
        }).join(' ');
    }
    function applyColTemplate() {
        if (!ui.root) return;
        ui.root.style.setProperty('--cols-template', colTemplate());
        const widths = COL_DEFS.reduce((s, c) => s + Math.max(colMin(c), colWidths.get(c.key) ?? c.def ?? 0), 0);
        const gaps = (COL_DEFS.length - 1) * 8 + 24;
        ui.root.style.setProperty('--cols-min', `calc(${widths + gaps}px * var(--zoom))`);
    }

    const queueChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('sdb_queue') : null;
    let queueSyncReady = false;
    const persistQueue = () => Store.set('sdb_queue', Object.fromEntries(state.queue));
    const saveQueue = debounce(() => {
        persistQueue();
        if (queueSyncReady) {
            queueChannel?.postMessage({ type: 'queue_update', queue: Object.fromEntries(state.queue) });
        }
    }, 250);

    const stepQueue = (cur, qty, up, shift) => up
        ? Math.min(qty, cur + (shift ? qty : 1))
        : Math.max(0, cur - (shift ? cur : 1));

    function adoptQueue(saved) {
        state.queue.clear();
        for (const [key, q] of Object.entries(saved || {})) {
            const it = state.byKey.get(key);
            if (!it) continue;
            const n = Math.min(Number(q) || 0, it.qty);
            if (n > 0) state.queue.set(key, n);
        }
    }

    function loadQueue() {
        const saved = Store.get('sdb_queue', null);
        if (!saved) return;
        adoptQueue(saved);
        if (state.items.length) persistQueue();
    }

    function wireQueueSync() {
        if (!queueChannel) return;
        queueChannel.addEventListener('message', (e) => {
            if (e.data?.type !== 'queue_update' || state.withdrawing) return;
            adoptQueue(e.data.queue);
            scheduleLight();
        });
        queueSyncReady = true;
    }

    const hiddenKeys = new Set(Store.get('sdb_hidden_keys', []));
    let showHidden = false;
    function saveHidden() { Store.set('sdb_hidden_keys', [...hiddenKeys]); }

    let shortValues = Store.get('sdb_short_values', true) !== false;

    let cardColorize = Store.get('sdb_card_colorize', false) === true;

    let cardRarity = Store.get('sdb_card_rarity', true) !== false;

    let linkImages = Store.get('sdb_link_images', false) === true;

    let backupUseLz = Store.get(BACKUP_USE_LZ, true) !== false;

    const rebuildBlob = (it) => {
        it.blob = [it.nameLC, it.cat, it.type, it.id].filter(Boolean).join(' ').toLowerCase();
    };

    let catsDirty = true;
    let catsCache = [];
    const markCatsDirty = () => { catsDirty = true; };

    const titleCase = (s) => String(s || '').replace(/[^\s-]+/g, (w) =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const catLabel = (it) => titleCase(it.cat || it.type || '');

    const entityParser = new DOMParser();
    const decodeEntities = (s) => {
        if (typeof s !== 'string' || !s.includes('&')) return s || '';
        return entityParser.parseFromString(s, 'text/html').body.textContent || '';
    };

    const termMatcher = (t) => {
        let negate = false;
        if (t.length > 1 && t[0] === '!' && t[1] !== ' ') { negate = true; t = t.slice(1); }
        let fn;
        if (!/[*?]/.test(t)) fn = (blob) => blob.includes(t);
        else {
            const rx = t.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                        .replace(/\*/g, '.*')
                        .replace(/\?/g, '.');
            try { const re = new RegExp(rx); fn = (blob) => re.test(blob); }
            catch { fn = (blob) => blob.includes(t); }
        }
        return negate ? (blob) => !fn(blob) : fn;
    };
    const NEG_RE = /(?:^|&)\s*!\S/;
    const compileQuery = (q) => {
        if (!q || (!/[*?&]/.test(q) && !NEG_RE.test(q))) return null;
        const terms = q.split('&').map((t) => t.trim()).filter(Boolean).map(termMatcher);
        if (!terms.length) return null;
        return (blob) => terms.every((fn) => fn(blob));
    };

    const hydrate = (row) => {
        const name = decodeEntities(row.name);
        const nameLC = name.toLowerCase().replace(/\s+/g, ' ').trim();
        const it = {
            key: row.id != null && row.id !== '' ? `id:${row.id}` : `name:${nameLC}`,
            id: row.id != null && row.id !== '' ? row.id : null,
            image: row.image || '',
            name,
            nameLC,
            qty: Number(row.qty) || 0,
            type: decodeEntities(row.type),
            cat: row.cat || null,
            rarity: row.rarity ?? null,
            value: normValue(row.value),
            isNC: !!row.isNC,
            inflated: !!row.inflated,
            colorHex: normHex(row.colorHex),
            description: row.description ?? null,
            canEat: !!((row.u || 0) & 1),
            canRead: !!((row.u || 0) & 2),
            canOpen: !!((row.u || 0) & 8),
            blob: '',
        };
        rebuildBlob(it);
        return it;
    };

    async function getRefCk() {
        const inline = window.__sdbData?.refCk;
        if (inline) return inline;
        try {
            const res = await gmRequest({ method: 'GET', url: location.href, timeout: 15000 });
            return res.responseText.match(/"refCk"\s*:\s*"([^"]+)"/)?.[1] ?? '';
        } catch { return ''; }
    }

    async function apiGetPage(page, refCk, filter = 'np') {
        const res = await gmRequest({
            method: 'POST',
            url: CFG.apiUrl,
            headers: neoHeaders(CFG.sdbPage, true),
            data: JSON.stringify({ page, per_page: CFG.perPage, search: '', category: '', sort: '', view_filter: filter, _ref_ck: refCk }),
            timeout: 30000,
        });
        if (res.status === 429) throw new Error('Neopets is rate-limiting. Raise the scan delay and retry');
        if (res.status !== 200) throw new Error(`SDB HTTP ${res.status}`);
        let json;
        try { json = JSON.parse(res.responseText); }
        catch {
            if (/login|templateLoginPopupIntercept/i.test(res.responseText || '')) throw new Error('Not logged in. Log into Neopets and rescan.');
            throw new Error('SDB returned a non-JSON page');
        }
        if (!json.success) throw new Error(json.error || 'API error');
        return json.data;
    }

    function ingest(rawItems) {
        for (const raw of rawItems) {
            const id = raw.obj_info_id != null && raw.obj_info_id !== '' ? raw.obj_info_id : null;
            const name = decodeEntities(raw.obj_name);
            const nameLC = name.toLowerCase().replace(/\s+/g, ' ').trim();
            const key = id != null ? `id:${id}` : `name:${nameLC}`;
            const qty = Number(raw.amount) || 0;
            const existing = state.byKey.get(key);
            if (existing) { existing.qty += qty; continue; }
            const it = {
                key, id, name, nameLC, qty,
                image: raw.obj_filename ? `https://images.neopets.com/items/${raw.obj_filename}.gif` : '',
                type: decodeEntities(raw.type_name),
                cat: null,
                rarity: raw.obj_rarity ?? null,
                value: null,
                isNC: raw.obj_rarity === 500,
                colorHex: null,
                description: null,
                canEat: false, canRead: false, canOpen: false,
                blob: '',
            };
            rebuildBlob(it);
            state.byKey.set(key, it);
            state.items.push(it);
            markCatsDirty();
        }
    }

    function normHex(v) {
        if (typeof v !== 'string') return null;
        const h = v.trim().replace(/^#/, '');
        return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
    }

    const looseName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    const IMG_BASE = 'https://images.neopets.com/items/';
    const imageUrl = (file) => (file ? `${IMG_BASE}${file}.gif` : '');

    const IMG_URL_RE = /images\.neopets\.com\/items\/([^/?#"']+?)\.gif/i;
    const IMG_STEM_RE = /^[a-z0-9][a-z0-9_.-]*$/i;
    const IMG_KEYS = ['url', 'full', 'default', 'original', 'large', 'src', 'gif', 'medium',
                      'small', 'thumb', 'thumbnail', 'file', 'filename', 'id', 'image_id', 'imageId'];
    function imageFile(v, depth = 0) {
        if (typeof v === 'string') {
            const m = v.match(IMG_URL_RE);
            if (m) return m[1];
            const s = v.trim().replace(/^.*\//, '').replace(/\.gif$/i, '');
            return (s && !/^\d+$/.test(s) && IMG_STEM_RE.test(s)) ? s : null;
        }
        if (!v || typeof v !== 'object' || depth > 2) return null;
        for (const k of IMG_KEYS) {
            const f = v[k] == null ? null : imageFile(v[k], depth + 1);
            if (f) return f;
        }
        for (const val of Object.values(v)) {
            if (typeof val === 'string' && IMG_URL_RE.test(val)) return imageFile(val, depth + 1);
        }
        return null;
    }

    const DETAIL_VERSION = 2;
    const DETAIL_INTENTS = new Set(['card', 'full']);
    const metaStale = (meta) =>
        !itemdbUseV1 && DETAIL_INTENTS.has(itemdbCfg.intent) && !(meta.d >= DETAIL_VERSION);

    function applyMeta(it, meta) {
        if (!it || !meta) return;
        const prevCat = it.cat;
        it.cat = meta.cat ?? it.cat;
        it.rarity = it.rarity ?? meta.rarity;
        if ('value' in meta) {
            it.value = normValue(meta.value);
            it.inflated = !!meta.inf;
        }
        it.isNC = it.rarity === 500;
        if (meta.hex) it.colorHex = meta.hex;
        if (!it.image && meta.img) it.image = imageUrl(meta.img);
        it.description = meta.description ?? it.description ?? null;
        if (meta.u != null) {
            it.canEat = !!(meta.u & 1);
            it.canRead = !!(meta.u & 2);
            it.canOpen = !!(meta.u & 8);
        }
        if (it.cat !== prevCat) markCatsDirty();
        rebuildBlob(it);
    }

    function applyItemdbCache(cache, ids) {
        if (ids) {
            for (const id of ids) applyMeta(state.byKey.get(`id:${id}`), cache.get(String(id)));
            return;
        }
        for (const it of state.items) {
            if (it.id != null) applyMeta(it, cache.get(String(it.id)));
        }
    }

    let persistTimer = 0;
    let lastPersist = 0;
    function persistItemdbCache(cache, force = false) {
        clearTimeout(persistTimer);
        const write = () => {
            lastPersist = Date.now();
            Store.set('itemDatabase', Object.fromEntries(cache));
            Store.set('itemDataDate', lastPersist);
        };
        const interval = state.crawling ? 12000 : 2000;
        if (force || !lastPersist || Date.now() - lastPersist > interval) write();
        else persistTimer = setTimeout(write, interval);
    }

    let loggedImageShape = false;
    function itemdbRecord(o, prev, detailed) {
        const yes = (v) => v === true || v === 'true';
        const rec = { ...prev };
        if (o.name != null) rec.name = o.name;
        if (o.category != null) rec.cat = o.category;
        if (o.rarity != null) rec.rarity = o.rarity;
        if (o.isNC != null || o.type != null) rec.isNC = !!o.isNC || o.type === 'nc';
        if ('isBD' in o) rec.isBD = !!o.isBD;
        if ('isWearable' in o) rec.isWearable = !!o.isWearable;
        if ('price' in o) {
            rec.value = o.price?.value ?? null;
            rec.inf = Array.isArray(o.price?.flags)
                ? o.price.flags.includes('inflation')
                : !!o.price?.inflated;
        }
        const hex = normHex(o.colorHex ?? o.color?.hex);
        if (hex) rec.hex = hex;
        const img = imageFile(o.image) ?? imageFile(o.image_id) ?? imageFile(o.imageId);
        if (img) rec.img = img;
        else if (o.image && !loggedImageShape) {
            loggedImageShape = true;
            console.warn('[SDB] could not resolve item image from ItemDB record:', JSON.stringify(o.image));
        }
        if (o.useTypes) {
            const t = o.useTypes;
            rec.u = (yes(t.canEat) ? 1 : 0) | (yes(t.canRead) ? 2 : 0)
                  | (yes(t.canOpen) ? 8 : 0);
        }
        if (o.description) rec.description = String(o.description).trim();
        if (detailed) rec.d = DETAIL_VERSION;
        return rec;
    }

    const itemdbId = (o) => {
        const v = o.item_id ?? o.itemId ?? o.id ?? null;
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    async function fetchItemdbByName(names, cache) {
        const out = new Map();
        if (itemdbUseV1 || !names.length) return out;
        try {
            const res = await gmRequest({
                method: 'POST',
                url: CFG.itemdbV2Url,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ intent: 'full', type: 'name', data: names }),
                timeout: 120000,
            });
            if (res.status !== 200) throw new Error(`ItemDB HTTP ${res.status}`);
            const json = JSON.parse(res.responseText || '{}');
            if (json.error) throw new Error(json.error);
            for (const [key, o] of Object.entries(json)) {
                if (!o?.name) continue;
                const id = itemdbId(o);
                if (id == null) continue;
                cache.set(String(id), itemdbRecord(o, cache.get(String(id)), true));
                for (const n of [key, o.name]) out.set(looseName(n), id);
            }
        } catch (err) {
            console.warn('[SDB] ItemDB name lookup failed:', err);
        }
        return out;
    }

    function retryAfterMs(res) {
        const m = /^\s*retry-after:\s*(\d+)/im.exec(res.responseHeaders || '');
        if (!m) return null;
        const secs = Number(m[1]);
        return Number.isFinite(secs) ? Math.min(3600000, Math.max(1000, secs * 1000)) : null;
    }

    async function fetchItemdbChunk(ids, cache, intent = itemdbCfg.intent) {
        if (Date.now() < itemdbCooldownUntil) return false;
        let rateLimits = 0;
        for (let attempt = 1; attempt <= CFG.itemdbRetries; attempt++) {
            if (state.stopRequested) return true;
            try {
                const v2 = !itemdbUseV1;
                const res = await gmRequest({
                    method: 'POST',
                    url: v2 ? CFG.itemdbV2Url : CFG.itemdbUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: v2
                        ? JSON.stringify({ intent, type: 'item_id', data: ids })
                        : JSON.stringify({ item_id: ids }),
                    timeout: 120000,
                });
                if (res.status === 429) {
                    if (++rateLimits > 20) throw new Error('ItemDB rate limit persisted');
                    const ra = retryAfterMs(res);
                    if (ra != null) {
                        let serverMsg = '';
                        try { serverMsg = JSON.parse(res.responseText || '{}').message || ''; } catch {  }
                        if (ra > CFG.itemdbMaxWait) {
                            itemdbCooldownUntil = Date.now() + ra;
                            const mins = Math.max(1, Math.round(ra / 60000));
                            const note = serverMsg || `ItemDB rate limit. Pricing paused, try again in about ${mins} min`;
                            emit('status', { text: note });
                            if (typeof toast === 'function') toast(note, true);
                            return false;
                        }
                        emit('status', { text: serverMsg || `Rate limited, retrying in ${Math.round(ra / 1000)}s` });
                        await sleep(ra);
                        attempt--;
                        continue;
                    }
                    const wait = randInt(10000, 15000);
                    emit('status', { text: `Rate limited, retrying in ${Math.round(wait / 1000)}s` });
                    await sleep(wait);
                    attempt--;
                    continue;
                }
                if (res.status !== 200) throw new Error(`ItemDB HTTP ${res.status}`);
                const json = JSON.parse(res.responseText || '{}');
                if (v2 && json.error) {
                    console.warn('[SDB] ItemDB v2 error:', json.error);
                    v2FailCount++;
                    if (v2FailCount >= 3) { itemdbUseV1 = true; console.warn('[SDB] v2 failing — switching to v1 for this session'); }
                    throw new Error('v2 error');
                }
                if (v2) {
                    const entries = Object.entries(json);
                    if (entries.length > 0) {
                        const [, sample] = entries[0];
                        const wantsPrice = intent === 'pricer' || intent === 'full';
                        if (!sample?.name || (wantsPrice && !('price' in sample))) {
                            console.warn('[SDB] ItemDB v2 shape mismatch — switching to v1:', sample);
                            v2FailCount++;
                            if (v2FailCount >= 3) { itemdbUseV1 = true; console.warn('[SDB] v2 shape mismatch — switching to v1 for this session'); }
                            throw new Error('v2 shape mismatch');
                        }
                    }
                }
                const detailed = v2 && DETAIL_INTENTS.has(intent);
                for (const [id, o] of Object.entries(json)) {
                    cache.set(String(id), itemdbRecord(o, cache.get(String(id)), detailed));
                }
                return true;
            } catch (err) {
                console.warn('[SDB] ItemDB chunk attempt', attempt, 'failed:', err);
                if (attempt < CFG.itemdbRetries) {
                    const backoff = Math.min(60000, 2000 * 2 ** (attempt - 1));
                    await sleep(backoff);
                }
            }
        }
        return false;
    }

    let scanMeta = null;
    let itemsCrawlId = null;
    const saveScanMeta = debounce(() => { if (scanMeta) Store.set('sdb_scan_meta', scanMeta); }, 300);
    function clearScanMeta() {
        scanMeta = null;
        Store.del('sdb_scan_meta');
    }

    function logCrawlTiming({ tStart, tToken, tPages, tEnrich, doneCount, concurrency, minDelay, maxDelay, enrichChunks, pageTimings }) {
        const s = (a, b) => `${((b - a) / 1000).toFixed(1)}s`;
        const tEnd = performance.now();
        console.info(
            `[SDB] crawl timing — total ${s(tStart, tEnd)}`
            + ` | token ${s(tStart, tToken)}`
            + ` | ${doneCount} pages ${s(tToken, tPages)} (x${concurrency} workers, ${minDelay}-${maxDelay}ms)`
            + ` | itemdb ${s(tPages, tEnrich)} (${enrichChunks} chunks of ${itemdbCfg.chunk},`
            + ` ${itemdbCfg.minDelay}-${itemdbCfg.maxDelay}ms)`
            + ` | finalize ${s(tEnrich, tEnd)}`,
        );
        if (!pageTimings.length) return;
        const each = pageTimings.map((t) => t.ms).sort((a, b) => a - b);
        const min = each[0], med = each[each.length >> 1], max = each[each.length - 1];
        const busy = each.reduce((a, b) => a + b, 0);
        const span = tPages - tToken;
        const iv = pageTimings.map((t) => [t.startMs, t.startMs + t.ms]).sort((a, b) => a[0] - b[0]);
        let union = 0, curS = iv[0][0], curE = iv[0][1];
        for (let i = 1; i < iv.length; i++) {
            if (iv[i][0] > curE) { union += curE - curS; [curS, curE] = iv[i]; }
            else curE = Math.max(curE, iv[i][1]);
        }
        union += curE - curS;
        const floor = each.length * min;
        let line = `[SDB] page requests — ${each.length} reqs`
            + ` | per-request min ${min}ms / median ${med}ms / max ${max}ms`
            + ` | phase ${(span / 1000).toFixed(1)}s vs a ~${(floor / 1000).toFixed(0)}s floor`
            + ` (${Math.round((floor / span) * 100)}% of it)`
            + ` | our ${minDelay}-${maxDelay}ms sleeps cost ${((span - union) / 1000).toFixed(1)}s`;
        if (concurrency > 1) {
            const issued = union > 0 ? busy / union : 0;
            const fan = min > 0 ? med / min : 1;
            line += ` | issued x${issued.toFixed(2)} of x${concurrency}`
                + ` | queueing fan-out x${fan.toFixed(2)}`;
            if (pageTimings.length >= 4 && fan >= 1.8) {
                line += ` — STILL SERIALIZED: the extra workers are not buying request`
                    + ` throughput, only hiding our own sleeps. Put crawlConcurrency back to 1.`;
            }
        }
        console.info(line);
        console.info('[SDB] page request detail (startMs is relative to crawl start):', pageTimings);
    }

    async function runCrawl({ minDelay, maxDelay, useItemdb }) {
        if (state.crawling || state.withdrawing || state.depositing) return;
        state.crawling = true;
        state.stopRequested = false;
        enrichFailedIds = 0;

        const saved = Store.get('sdb_scan_meta', null);
        const npFinished = !!saved && saved.totalPages > 0
            && saved.currentPage >= saved.totalPages && !(saved.failedPages || []).length;
        const finished = npFinished && !!saved.ncDone;
        const resuming = !!saved && saved.v === 2 && !finished && saved.currentPage > 0
            && state.items.length > 0 && itemsCrawlId === saved.crawlStartTime;
        if (resuming) {
            scanMeta = {
                v: 2,
                currentPage: saved.currentPage,
                totalPages: saved.totalPages || 0,
                donePages: Array.isArray(saved.donePages) ? saved.donePages : [],
                failedPages: Array.isArray(saved.failedPages) ? saved.failedPages : [],
                ncDone: !!saved.ncDone,
                crawlStartTime: saved.crawlStartTime || Date.now(),
            };
        } else {
            state.items = [];
            markCatsDirty();
            state.byKey.clear();
            scanMeta = { v: 2, currentPage: 0, totalPages: 0, donePages: [], failedPages: [], ncDone: false, crawlStartTime: Date.now() };
            itemsCrawlId = scanMeta.crawlStartTime;
        }
        emit('crawl:start', { resuming, fromPage: scanMeta.currentPage + 1 });
        emit('data:changed');
        const tStart = performance.now();
        let tToken = tStart, tPages = tStart, tEnrich = tStart;
        try {
            const refCk = await getRefCk();
            if (!refCk) throw new Error('Security token not found. Reload the page and try again.');
            tToken = performance.now();

            let cache = null;
            const enrichPending = new Set();
            let enrichChain = Promise.resolve();

            const refreshEvery = Math.max(1, Math.min(500, itemdbCfg.chunk));
            let sinceRefresh = 0;
            let enrichInFlight = 0;
            let enrichChunks = 0;
            const pricingOutstanding = () => enrichPending.size > 0 || enrichInFlight > 0;
            const refreshGrid = () => { sinceRefresh = 0; emit('data:changed'); };

            if (useItemdb) {
                if (Date.now() - Store.get('itemDataDate', 0) > itemdbCfg.cacheDays * 86400000) Store.del('itemDatabase');
                cache = new Map(Object.entries(Store.get('itemDatabase', {})));
            }

            const dispatchEnrichChunk = (chunk) => {
                enrichInFlight++;
                enrichChunks++;
                enrichChain = enrichChain.then(async () => {
                    try {
                        if (state.stopRequested) return;
                        if (await fetchItemdbChunk(chunk, cache) === false) enrichFailedIds += chunk.length;
                        applyItemdbCache(cache, chunk);
                        persistItemdbCache(cache);
                        refreshGrid();
                        await sleep(randInt(itemdbCfg.minDelay, itemdbCfg.maxDelay));
                    } finally { enrichInFlight--; }
                });
            };

            let enrichScanned = 0;
            const pushAndEnqueue = () => {
                if (!cache) return;
                const chunkSize = Math.max(1, itemdbCfg.chunk);
                for (; enrichScanned < state.items.length; enrichScanned++) {
                    const it = state.items[enrichScanned];
                    if (it.id == null || isBlocked(it.id)) continue;
                    const meta = cache.get(String(it.id));
                    if (meta) applyMeta(it, meta);
                    if (!meta || metaStale(meta)) enrichPending.add(it.id);
                }
                while (enrichPending.size >= chunkSize && !state.stopRequested) {
                    const chunk = [];
                    for (const id of enrichPending) {
                        chunk.push(id);
                        if (chunk.length >= chunkSize) break;
                    }
                    for (const id of chunk) enrichPending.delete(id);
                    dispatchEnrichChunk(chunk);
                }
            };

            const donePages = new Set(scanMeta.donePages);
            const failedPages = [...scanMeta.failedPages];
            const markPageDone = (page) => {
                donePages.add(page);
                while (donePages.has(scanMeta.currentPage + 1)) donePages.delete(++scanMeta.currentPage);
                scanMeta.donePages = [...donePages];
                scanMeta.failedPages = failedPages;
                saveScanMeta();
            };

            const pageTimings = [];
            const timedGetPage = async (page, filter = 'np') => {
                const t0 = performance.now();
                try {
                    return await apiGetPage(page, refCk, filter);
                } finally {
                    pageTimings.push({
                        page,
                        startMs: Math.round(t0 - tStart),
                        ms: Math.round(performance.now() - t0),
                    });
                }
            };

            const CONCURRENCY = Math.min(CFG.crawlConcurrency, 4);
            let totalPages = scanMeta.totalPages || 0;
            let doneCount = scanMeta.currentPage + donePages.size;

            const npAlreadyDone = scanMeta.totalPages > 0
                && scanMeta.currentPage >= scanMeta.totalPages && failedPages.length === 0;

            if (!npAlreadyDone) {
                const startPage = scanMeta.currentPage + 1;
                emit('crawl:progress', { page: startPage, totalPages: scanMeta.totalPages || startPage });
                const firstData = await timedGetPage(startPage, 'np');
                totalPages = firstData.pagination?.total_pages ?? scanMeta.totalPages ?? 1;
                scanMeta.totalPages = totalPages;
                if (!resuming) { state.queue.clear(); saveQueue(); }
                ingest(firstData.items || []);
                markPageDone(startPage);
                sinceRefresh += (firstData.items || []).length;
                pushAndEnqueue();
                if (!pricingOutstanding() && sinceRefresh >= refreshEvery) refreshGrid();

                let nextPage = startPage + 1;
                doneCount = scanMeta.currentPage + donePages.size;
                emit('crawl:progress', { page: doneCount, totalPages });

                if (totalPages > 1 && !state.stopRequested) {
                    const workerCount = Math.min(CONCURRENCY, totalPages - 1);
                    const workers = Array.from({ length: workerCount }, async () => {
                        while (!state.stopRequested) {
                            const page = nextPage++;
                            if (page > totalPages) break;
                            if (page <= scanMeta.currentPage || donePages.has(page)) continue;
                            try {
                                const data = await timedGetPage(page, 'np');
                                if (state.stopRequested) break;
                                ingest(data.items || []);
                                markPageDone(page);
                                sinceRefresh += (data.items || []).length;
                                pushAndEnqueue();
                                doneCount++;
                                emit('crawl:progress', { page: doneCount, totalPages });
                                if (!pricingOutstanding() && sinceRefresh >= refreshEvery) refreshGrid();
                            } catch (err) {
                                console.warn('[SDB] page', page, 'failed:', err);
                                if (!failedPages.includes(page)) failedPages.push(page);
                                scanMeta.failedPages = failedPages;
                                saveScanMeta();
                            }
                            if (state.stopRequested) break;
                            await sleep(randInt(minDelay, maxDelay));
                        }
                    });
                    await Promise.all(workers);
                }

                for (const page of [...failedPages]) {
                    if (state.stopRequested) break;
                    if (page <= scanMeta.currentPage || donePages.has(page)) continue;
                    try {
                        const data = await timedGetPage(page, 'np');
                        if (state.stopRequested) break;
                        ingest(data.items || []);
                        failedPages.splice(failedPages.indexOf(page), 1);
                        markPageDone(page);
                        sinceRefresh += (data.items || []).length;
                        pushAndEnqueue();
                        doneCount++;
                        emit('crawl:progress', { page: doneCount, totalPages });
                        if (!pricingOutstanding() && sinceRefresh >= refreshEvery) refreshGrid();
                    } catch (err) {
                        scanMeta.failedPages = failedPages;
                        saveScanMeta();
                        throw new Error(`Page ${page} failed twice, stopping so quantities stay accurate. Press Start scan to resume.`);
                    }
                }
            }

            if (!scanMeta.ncDone && !state.stopRequested && failedPages.length === 0) {
                if (!npAlreadyDone && state.items.some((it) => it.isNC)) {
                    console.info('[SDB] NP view already returned NC items (server ignored view_filter:np) — skipping the separate NC pass; NC already captured.');
                    scanMeta.ncDone = true;
                    saveScanMeta();
                } else {
                    for (let i = state.items.length - 1; i >= 0; i--) {
                        const it = state.items[i];
                        if (it.isNC) { state.byKey.delete(it.key); state.items.splice(i, 1); }
                    }
                    markCatsDirty();
                    enrichScanned = state.items.length;
                    let ncPage = 1, ncTotal = 1, ncComplete = false;
                    while (ncPage <= ncTotal && !state.stopRequested) {
                        let data;
                        try {
                            data = await timedGetPage(ncPage, 'nc');
                        } catch (err) {
                            console.warn('[SDB] NC page', ncPage, 'failed:', err);
                            break;
                        }
                        ncTotal = data.pagination?.total_pages ?? ncTotal;
                        ingest(data.items || []);
                        sinceRefresh += (data.items || []).length;
                        pushAndEnqueue();
                        doneCount++;
                        emit('crawl:progress', { page: doneCount, totalPages: totalPages + ncTotal });
                        if (!pricingOutstanding() && sinceRefresh >= refreshEvery) refreshGrid();
                        if (ncPage >= ncTotal) { ncComplete = true; break; }
                        ncPage++;
                        if (!state.stopRequested) await sleep(randInt(minDelay, maxDelay));
                    }
                    if (ncComplete) { scanMeta.ncDone = true; saveScanMeta(); }
                }
            }

            tPages = performance.now();

            if (useItemdb && cache) {
                const chunkSize = Math.max(1, itemdbCfg.chunk);
                while (enrichPending.size > 0 && !state.stopRequested) {
                    const chunk = [...enrichPending].slice(0, chunkSize);
                    for (const id of chunk) enrichPending.delete(id);
                    dispatchEnrichChunk(chunk);
                }
                await enrichChain;
                applyItemdbCache(cache);
                persistItemdbCache(cache, true);
            }
            tEnrich = performance.now();

            await applyLebronFallback();
            emit('data:changed');
            saveSnapshot(state.stopRequested ? state.scannedAt : Date.now());
            const complete = !state.stopRequested && !failedPages.length
                && scanMeta.currentPage >= totalPages && scanMeta.ncDone;
            if (complete) clearScanMeta();
            if (complete) autoCaptureSnapshot(itemsCrawlId);
            logCrawlTiming({ tStart, tToken, tPages, tEnrich, doneCount, concurrency: CONCURRENCY, minDelay, maxDelay, enrichChunks, pageTimings });
            emit('crawl:done', { stopped: state.stopRequested, count: state.items.length, unpriced: enrichFailedIds });
        } catch (err) {
            console.error('[SDB] crawl failed:', err);
            emit('crawl:error', { message: err.message });
        } finally {
            state.crawling = false;
            const stopped = state.stopRequested;
            state.stopRequested = false;
            if (scanMeta) {
                if (!state.items.length && scanMeta.currentPage === 0 && !scanMeta.donePages.length) {
                    clearScanMeta();
                } else {
                    Store.set('sdb_scan_meta', scanMeta);
                    saveSnapshot();
                }
            }
            emit('data:changed');
        }
    }

    async function runReprice() {
        if (state.crawling || state.withdrawing || state.depositing) return;
        const ids = [...new Set(state.items
            .filter((it) => it.id != null && !it.isNC && it.rarity !== 500 && !isBlocked(it.id))
            .map((it) => it.id))];
        if (!ids.length && !state.items.length) {
            toast('Nothing to reprice: scan or load a snapshot first', true);
            return;
        }

        state.crawling = true;
        state.stopRequested = false;
        enrichFailedIds = 0;
        emit('reprice:start');
        let done = 0, ok = false;
        try {
            const cache = new Map(Object.entries(Store.get('itemDatabase', {})));
            const chunkSize = Math.max(1, itemdbCfg.chunk);
            const chunks = [];
            for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
            for (let c = 0; c < chunks.length && !state.stopRequested; c++) {
                emit('enrich:progress', { chunk: c + 1, chunks: chunks.length, size: chunks[c].length });
                if (await fetchItemdbChunk(chunks[c], cache, 'pricer') === false) enrichFailedIds += chunks[c].length;
                applyItemdbCache(cache, chunks[c]);
                persistItemdbCache(cache);
                done += chunks[c].length;
                emit('data:changed');
                if (c < chunks.length - 1) await sleep(randInt(itemdbCfg.minDelay, itemdbCfg.maxDelay));
            }
            applyItemdbCache(cache);
            persistItemdbCache(cache, true);
            if (!state.stopRequested) done += await applyLebronFallback(true);
            saveSnapshot(state.scannedAt);
            ok = true;
        } catch (err) {
            emit('reprice:error', { message: err.message });
        } finally {
            state.crawling = false;
            const stopped = state.stopRequested;
            state.stopRequested = false;
            if (ok) emit('reprice:done', { stopped, count: done, unpriced: enrichFailedIds });
            emit('data:changed');
        }
    }

    async function applyLebronFallback(refresh = false) {
        const needs = state.items.filter((it) => it.rarity === 500 && (refresh || it.value == null));
        if (!needs.length) return 0;
        emit('status', { text: 'Fetching NC values…' });
        let n = 0;
        try {
            const res = await gmRequest({ method: 'GET', url: CFG.lebronUrl, timeout: 20000 });
            const lookup = new Map(Object.entries(JSON.parse(res.responseText || '{}'))
                .map(([k, v]) => [k.toLowerCase(), v]));
            for (const it of needs) {
                const v = normValue(lookup.get(it.nameLC));
                if (v != null) { it.value = v; n++; }
            }
        } catch (err) {
            console.warn('[SDB] Lebron values fetch failed:', err);
        }
        return n;
    }

    function saveSnapshot(scannedAt = state.scannedAt) {
        const items = state.items.map((it) => {
            const { id, image, name, qty, type, cat, rarity, value, isNC, inflated, colorHex } = it;
            const u = (it.canEat ? 1 : 0) | (it.canRead ? 2 : 0) | (it.canOpen ? 8 : 0);
            const row = { id, image, name, qty, type, cat, rarity, value, isNC, inflated };
            if (colorHex) row.colorHex = colorHex;
            if (it.description) row.description = it.description;
            if (u) row.u = u;
            return row;
        });
        state.scannedAt = scannedAt;
        Store.set('sdb_v2_snapshot', { v: 2, scannedAt, crawlId: itemsCrawlId, items });
    }

    function migrateV1() {
        const legacy = GM_getValue('sdb_last_export_data', null);
        if (!legacy) return null;
        try {
            const items = JSON.parse(legacy);
            if (!Array.isArray(items)) return null;
            const snap = { v: 2, scannedAt: GM_getValue('sdb_last_export_time', null) || null, items };
            Store.set('sdb_v2_snapshot', snap);
            ['sdb_last_export_data', 'sdb_last_export_format', 'sdb_last_export_time',
             'sdb_last_blob_url', 'sdb_last_aggregated_data', 'sdb_last_itemdb_data']
                .forEach((k) => GM_deleteValue(k));
            console.info('[SDB] migrated v1 export data to v2 snapshot');
            return snap;
        } catch { return null; }
    }

    function loadSnapshot() {
        let snap = Store.get('sdb_v2_snapshot', null);
        if (!snap) snap = migrateV1();
        if (!snap || !Array.isArray(snap.items) || !snap.items.length) return false;
        state.items = snap.items.map(hydrate);
        markCatsDirty();
        state.byKey = new Map(state.items.map((it) => [it.key, it]));
        state.scannedAt = snap.scannedAt || null;
        itemsCrawlId = snap.crawlId ?? null;
        return true;
    }

    function dropFromState(it) {
        state.byKey.delete(it.key);
        const i = state.items.indexOf(it);
        if (i !== -1) state.items.splice(i, 1);
        state.queue.delete(it.key);
        saveQueue();
        if (hiddenKeys.delete(it.key)) saveHidden();
        markCatsDirty();
    }

    function loadSnapshots() {
        const arr = Store.get('sdb_snapshots', []);
        return Array.isArray(arr) ? arr : [];
    }
    function loadTrend() {
        const arr = Store.get('sdb_snap_trend', []);
        return Array.isArray(arr) ? arr : [];
    }

    function deleteTrendAt(ts) {
        const trend = loadTrend();
        const ti = trend.findIndex((p) => p.ts === ts);
        if (ti >= 0) { trend.splice(ti, 1); Store.set('sdb_snap_trend', trend); }
        const ring = loadSnapshots();
        const ri = ring.findIndex((e) => e.ts === ts);
        if (ri >= 0) { ring.splice(ri, 1); Store.set('sdb_snapshots', ring); }
        return { trend, ring };
    }

    function computeTrendPoint(ts, label, crawlId) {
        let items = 0, units = 0, value = 0, valueNP = 0, valueNC = 0, unpriced = 0;
        for (const it of state.items) {
            items++;
            units += it.qty;
            if (typeof it.value === 'number' && it.value > 0) {
                const v = it.value * it.qty;
                value += v;
                if (it.isNC) valueNC += v; else valueNP += v;
            } else unpriced++;
        }
        const p = { ts, items, units, value, valueNP, valueNC, unpriced };
        if (label) p.label = label;
        if (crawlId != null) p.crawlId = crawlId;
        return p;
    }

    function captureSnapshot(label, crawlId) {
        const rows = state.items
            .filter((it) => it.id != null)
            .map((it) => [it.id, it.qty, typeof it.value === 'number' ? it.value : null]);
        const entry = { ts: Date.now(), rows };
        if (label) entry.label = label;
        if (crawlId != null) entry.crawlId = crawlId;

        const ring = loadSnapshots();
        ring.push(entry);
        if (ring.length > SNAPSHOT_CAP) ring.splice(0, ring.length - SNAPSHOT_CAP);
        Store.set('sdb_snapshots', ring);

        const trend = loadTrend();
        trend.push(computeTrendPoint(entry.ts, label, crawlId));
        if (trend.length > TREND_CAP) trend.splice(0, trend.length - TREND_CAP);
        Store.set('sdb_snap_trend', trend);
        return entry;
    }

    function autoCaptureSnapshot(crawlId) {
        const ring = loadSnapshots();
        const last = ring[ring.length - 1];
        if (last && ((crawlId != null && last.crawlId === crawlId) || Date.now() - last.ts < 120000)) return;
        captureSnapshot(null, crawlId);
    }

    function resolveSnapMeta(cache, id) {
        if (id == null) return null;
        const live = state.byKey.get(`id:${id}`);
        if (live) return { name: live.name, image: live.image || '' };
        const meta = cache.get(String(id));
        if (meta && meta.name) return { name: meta.name, image: meta.img ? imageUrl(meta.img) : '' };
        return null;
    }

    function writeHistoryEntry(action, ok, moved, failed, items) {
        const hist = Store.get('sdb_history', []);
        const arr = Array.isArray(hist) ? hist : [];
        arr.unshift({ ts: Date.now(), action, ok, moved, failed, items });
        if (arr.length > HISTORY_CAP) arr.length = HISTORY_CAP;
        Store.set('sdb_history', arr);
    }

    function finalizeItem(it, moved) {
        if (it.qty <= 0) { dropFromState(it); return; }
        const left = (state.queue.get(it.key) || 0) - moved;
        if (left > 0) state.queue.set(it.key, Math.min(left, it.qty));
        else state.queue.delete(it.key);
        saveQueue();
    }

    const MOVE_TARGETS = { inventory: 'inventory', shop: 'shop', gallery: 'gallery' };
    const targetLabel = (t) => (t === 'shop' ? 'shop' : t === 'gallery' ? 'gallery' : 'inventory');

    async function moveBatch(moves, pin, refCk) {
        const res = await gmRequest({
            method: 'POST',
            url: CFG.moveUrl,
            headers: neoHeaders(CFG.sdbPage, true),
            data: JSON.stringify({ moves, pin: pin || '', _ref_ck: refCk }),
            timeout: 60000,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        let json;
        try { json = JSON.parse(res.responseText || '{}'); }
        catch { throw new Error('Bad move-items response'); }
        if (!json.success) {
            if (json.error === 'pin_wrong') throw new Error(`PIN_WRONG:${json.message || json.error}`);
            if (json.error === 'partial_error') {
                console.warn('[SDB] partial_error payload:', res.responseText);
                throw Object.assign(new Error('partial_error'), {
                    successCount: Number(json.success_count) || 0,
                    errorCount: Number(json.error_count) || 0,
                    serverMsg: json.message || '',
                });
            }
            throw new Error(json.error || 'move-items reported failure');
        }
        return json;
    }

    async function moveOneByOne(it, q, pin, action, refCk) {
        if (action !== 'inventory') {
            await moveBatch([{ obj_info_id: it.id, quantity: q, action }], pin, refCk);
            it.qty -= q;
            emit('data:changed');
            return q;
        }
        let moved = 0;
        for (let u = 0; u < q; u++) {
            if (state.stopRequested) break;
            const pinArg = pin ? `&pin=${encodeURIComponent(pin)}` : '';
            const res = await gmRequest({
                method: 'GET',
                url: `https://www.neopets.com/process_safetydeposit.phtml?offset=0&remove_one_object=${it.id}`
                   + `&obj_name=${encodeURIComponent(it.name)}&category=0${pinArg}`,
                timeout: 30000,
            });
            if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
            const body = res.responseText || '';
            let parsed = null;
            try { parsed = JSON.parse(body); } catch {  }
            if (parsed && parsed.success === false) {
                if (parsed.error === 'pin_wrong') throw new Error(`PIN_WRONG:${parsed.message || parsed.error}`);
                throw new Error(parsed.message || parsed.error || 'Withdraw refused (wrong PIN or logged out)');
            }
            if (!parsed && /badpassword|incorrect pin|wrong pin|pin_wrong|error\.phtml|loginpage|not logged in/i.test(body)) {
                throw new Error('Withdraw refused (wrong PIN or logged out)');
            }
            moved++;
            it.qty -= 1;
            emit('data:changed');
            if (u < q - 1) await sleep(randInt(450, 750));
        }
        return moved;
    }

    let activeMoveTarget = 'inventory';

    async function runWithdraw(pin, action = 'inventory') {
        if (state.withdrawing || state.crawling || state.depositing) return;
        if (pin && !/^\d{4}$/.test(pin)) { toast('PIN must be exactly 4 digits', true); return; }
        activeMoveTarget = action;

        const PAGE = 90;
        const pageOf = new Map();
        const rankFilter = (isNC) => {
            state.items
                .filter((it) => it.id != null && !!it.isNC === isNC)
                .sort((a, b) => Number(a.id) - Number(b.id))
                .forEach((it, i) => pageOf.set(it.key, Math.floor(i / PAGE)));
        };
        rankFilter(false);
        rankFilter(true);

        const npGroups = new Map(), ncGroups = new Map();
        let ncShopSkipped = 0;
        let queueDirty = false;
        for (const [key, q] of state.queue) {
            const it = state.byKey.get(key);
            if (!it || it.id == null || it.qty <= 0) { state.queue.delete(key); queueDirty = true; continue; }
            if (action === 'shop' && it.isNC) { ncShopSkipped++; continue; }
            const groups = it.isNC ? ncGroups : npGroups;
            const pg = pageOf.get(it.key);
            if (!groups.has(pg)) groups.set(pg, []);
            groups.get(pg).push({ it, q: Math.min(q, it.qty) });
        }
        if (queueDirty) { saveQueue(); emit('data:changed'); }
        const batches = [];
        for (const groups of [npGroups, ncGroups]) {
            for (const list of groups.values()) {
                for (let i = 0; i < list.length; i += PAGE) batches.push(list.slice(i, i + PAGE));
            }
        }
        const total = batches.reduce((s, b) => s + b.reduce((x, t) => x + t.q, 0), 0);
        if (ncShopSkipped) toast(`${nf.format(ncShopSkipped)} NC item(s) skipped: NC can't be moved to a shop`, !total);
        if (!total) return;

        state.withdrawing = true;
        state.stopRequested = false;
        emit('withdraw:start', { total, action });
        let done = 0, failed = 0, consecFail = 0, ok = false;
        const refused = [];
        const movedTally = new Map();
        const tallyMoved = (it, q) => {
            if (q <= 0) return;
            const key = it.id != null ? `id:${it.id}` : `name:${it.nameLC}`;
            const cur = movedTally.get(key);
            if (cur) cur.qty += q; else movedTally.set(key, { id: it.id, name: it.name, qty: q, value: it.value });
        };
        let boxChanged = false;
        let notInBox = 0;
        const abortMsg = () => {
            const shown = refused.slice(-5).join(', ') + (refused.length > 5 ? `, +${refused.length - 5} more` : '');
            return (done === 0 && !boxChanged)
                ? `Aborted: 3 in a row failed and nothing has moved. Check your PIN and that you're still logged in. Refused: ${shown}`
                : `Aborted: these items are no longer in your box; rescan to resync. Refused: ${shown}`;
        };
        try {
            const refCk = await getRefCk();
            if (!refCk) throw new Error('Security token not found. Reload the page and try again.');

            for (const batch of batches) {
                if (state.stopRequested) break;
                emit('withdraw:progress', {
                    done, total,
                    name: batch.length === 1 ? batch[0].it.name : `${batch.length} items`,
                });

                let batchOK = false, partial = null;
                try {
                    const moves = batch.map(({ it, q }) => ({ obj_info_id: it.id, quantity: q, action }));
                    await moveBatch(moves, pin, refCk);
                    batchOK = true;
                } catch (err) {
                    if (err.message?.startsWith('PIN_WRONG:')) throw err;
                    if (err.message === 'partial_error') partial = err;
                    else console.warn('[SDB] batch move failed, falling back to per-unit:', err);
                }

                if (batchOK) {
                    for (const { it, q } of batch) {
                        it.qty -= q;
                        done += q;
                        finalizeItem(it, q);
                        tallyMoved(it, q);
                    }
                    consecFail = 0;
                    emit('withdraw:progress', { done: done - 1, total, name: batch.length === 1 ? batch[0].it.name : `${batch.length} items` });
                    emit('data:changed');
                } else if (partial) {
                    boxChanged = true;
                    notInBox += partial.errorCount || 0;
                    consecFail = 0;
                    for (const { it } of batch) state.queue.delete(it.key);
                    saveQueue();
                    emit('data:changed');
                } else {
                    for (const { it, q } of batch) {
                        if (state.stopRequested) break;
                        let moved = 0;
                        try {
                            moved = await moveOneByOne(it, q, pin, action, refCk);
                        } catch (err) {
                            if (err.message?.startsWith('PIN_WRONG:')) throw err;
                            console.warn('[SDB] withdraw refused', it.name, err);
                        }
                        done += moved;
                        finalizeItem(it, moved);
                        if (moved > 0) { consecFail = 0; tallyMoved(it, moved); }
                        if (moved >= q) continue;
                        failed += (q - moved);
                        refused.push(it.name);
                        if (++consecFail >= 3) throw new Error(abortMsg());
                    }
                    emit('data:changed');
                }

                if (!state.stopRequested && done + failed < total) await sleep(randInt(500, 1000));
            }
            ok = true;
        } catch (err) {
            emit('withdraw:error', { message: err.message.replace(/^PIN_WRONG:/, '') });
        } finally {
            state.withdrawing = false;
            const stopped = state.stopRequested;
            state.stopRequested = false;
            if ((done > 0 || boxChanged) && Store.get('sdb_scan_meta', null)) clearScanMeta();
            saveSnapshot(state.scannedAt);
            if (ok) emit('withdraw:done', { done, failed, stopped, action, refused, notInBox, items: [...movedTally.values()] });
            emit('data:changed');
        }
    }

    async function fetchQuickstockInventory(perPage = CFG.quickstockPerPage) {
        const byOii = new Map();

        const collect = async (filter, forceCash) => {
            let page = 1, totalPages = 1;
            while (page <= totalPages) {
                if (state.stopRequested) break;
                emit('status', { text: `Reading ${filter.toUpperCase()} inventory page ${page}/${totalPages}` });
                const res = await gmRequest({
                    method: 'GET',
                    url: `${CFG.quickstockUrl}?page=${page}&per_page=${perPage}&filter=${filter}&sort=recent&stack=1`,
                    headers: neoHeaders(CFG.quickstockPage),
                    timeout: 30000,
                });
                if (res.status !== 200) throw new Error(`Inventory HTTP ${res.status}`);
                let json;
                try { json = JSON.parse(res.responseText || '{}'); }
                catch { throw new Error('Bad quickstock inventory response'); }
                if (!json.success) throw new Error(json.error || 'Quickstock refused the inventory request');
                for (const raw of json.items || []) {
                    const key = String(raw.oii);
                    if (byOii.has(key)) continue;
                    const oii = Number(raw.oii);
                    byOii.set(key, {
                        oii: raw.oii,
                        id: Number.isFinite(oii) ? oii : null,
                        isCash: forceCash || !!raw.isCash,
                        name: decodeEntities(raw.name),
                        count: Math.max(1, Number(raw.count) || 1),
                    });
                }
                totalPages = Math.max(1, Number(json.total_pages) || 1);
                if (page < totalPages) await sleep(randInt(scanCfg.minDelay, scanCfg.maxDelay));
                page++;
            }
        };

        await collect('np', false);
        if (!state.stopRequested) {
            try { await collect('nc', true); }
            catch (err) { console.warn('[SDB] NC inventory pass failed, depositing NP only:', err); }
        }

        const refCk = window.__quickstockConfig?.refCk || await getRefCk();
        return { items: [...byOii.values()], refCk };
    }

    async function depositBatch(batch, refCk) {
        const items = [], cashItems = [];
        for (const u of batch) (u.isCash ? cashItems : items).push({ oii: u.oii, action: 'deposit' });
        const res = await gmRequest({
            method: 'POST',
            url: CFG.quickstockMoveUrl,
            headers: neoHeaders(CFG.quickstockPage, true),
            data: JSON.stringify({ items, cashItems, _ref_ck: refCk }),
            timeout: 60000,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        let json;
        try { json = JSON.parse(res.responseText || '{}'); }
        catch { throw new Error('Bad process_quickstock response'); }
        if (!json.success) throw new Error(json.error || 'process_quickstock reported failure');
        return json;
    }

    async function depositWithSplit(batch, refCk, out) {
        try {
            await depositBatch(batch, refCk);
            out.push(...batch);
            return 0;
        } catch (err) {
            if (batch.length === 1) {
                console.warn(`[SDB] cannot deposit "${batch[0].name}":`, err.message);
                return 1;
            }
            console.warn(`[SDB] deposit batch of ${batch.length} failed, splitting:`, err.message);
        }
        if (state.stopRequested) return batch.length;
        const half = batch.length >> 1;
        await sleep(randInt(500, 1000));
        const lost = await depositWithSplit(batch.slice(0, half), refCk, out);
        if (state.stopRequested) return lost + (batch.length - half);
        await sleep(randInt(500, 1000));
        return lost + await depositWithSplit(batch.slice(half), refCk, out);
    }

    function rekeyItem(it, id) {
        const key = `id:${id}`;
        if (it.key === key) return it;
        const twin = state.byKey.get(key);
        state.byKey.delete(it.key);
        if (twin && twin !== it) {
            twin.qty += it.qty;
            const i = state.items.indexOf(it);
            if (i !== -1) state.items.splice(i, 1);
            const q = state.queue.get(it.key);
            if (q) {
                state.queue.delete(it.key);
                state.queue.set(twin.key, Math.min((state.queue.get(twin.key) || 0) + q, twin.qty));
                saveQueue();
            }
            return twin;
        }
        it.key = key;
        it.id = id;
        state.byKey.set(key, it);
        rebuildBlob(it);
        return it;
    }

    async function ingestDeposited(units) {
        const groups = new Map();
        for (const u of units) {
            const nameLC = u.name.toLowerCase().replace(/\s+/g, ' ').trim();
            const key = u.id != null ? `id:${u.id}` : `name:${nameLC}`;
            const g = groups.get(key);
            if (g) { g.count++; continue; }
            groups.set(key, { key, id: u.id, nameLC, name: u.name, isCash: u.isCash, count: 1 });
        }

        const byName = new Map();
        for (const it of state.items) if (!byName.has(it.nameLC)) byName.set(it.nameLC, it);

        const touched = [];
        let added = 0;
        for (const g of groups.values()) {
            const existing = state.byKey.get(g.key) ?? byName.get(g.nameLC);
            if (existing) {
                existing.qty += g.count;
                if (existing.value == null || !existing.image) touched.push(existing);
                continue;
            }
            const it = hydrate({
                id: g.id, name: g.name, qty: g.count, image: '',
                type: null, cat: null, rarity: g.isCash ? 500 : null, value: null, isNC: g.isCash,
            });
            state.items.push(it);
            state.byKey.set(it.key, it);
            touched.push(it);
            added++;
        }

        let priced = 0;
        if (touched.length) {
            if (Date.now() - Store.get('itemDataDate', 0) > itemdbCfg.cacheDays * 86400000) Store.del('itemDatabase');
            const cache = new Map(Object.entries(Store.get('itemDatabase', {})));

            const applyChecked = (it) => {
                const meta = it.id == null ? null : cache.get(String(it.id));
                if (!meta) return false;
                if (meta.name && looseName(meta.name) !== looseName(it.name)) {
                    console.warn(`[SDB] id ${it.id} is "${meta.name}" in ItemDB, not "${it.name}" — identifying by name instead`);
                    return false;
                }
                applyMeta(it, meta);
                return true;
            };

            const pending = [];
            for (const it of touched) {
                const meta = it.id == null ? null : cache.get(String(it.id));
                const usable = meta && !metaStale(meta) && !(!it.image && !meta.img);
                if (usable && applyChecked(it)) priced++;
                else pending.push(it);
            }

            const ids = [...new Set(pending.filter((it) => it.id != null).map((it) => it.id))];
            const chunkSize = Math.max(1, itemdbCfg.chunk);
            const chunks = Math.ceil(ids.length / chunkSize);
            for (let i = 0; i < ids.length && !state.stopRequested; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                emit('enrich:progress', { chunk: i / chunkSize + 1, chunks, size: chunk.length });
                await fetchItemdbChunk(chunk, cache, 'full');
                if (i + chunkSize < ids.length) await sleep(randInt(itemdbCfg.minDelay, itemdbCfg.maxDelay));
            }

            const needName = pending.filter((it) => !applyChecked(it));
            if (needName.length && !state.stopRequested) {
                emit('status', { text: `Identifying ${nf.format(needName.length)} items by name` });
                const names = [...new Set(needName.map((it) => it.name))];
                for (let i = 0; i < names.length && !state.stopRequested; i += chunkSize) {
                    const found = await fetchItemdbByName(names.slice(i, i + chunkSize), cache);
                    if (!found.size) break;
                    for (let j = 0; j < pending.length; j++) {
                        const id = found.get(looseName(pending[j].name));
                        if (id != null) pending[j] = rekeyItem(pending[j], id);
                    }
                    if (i + chunkSize < names.length) await sleep(randInt(itemdbCfg.minDelay, itemdbCfg.maxDelay));
                }
            }

            for (const it of new Set(pending)) if (applyChecked(it)) priced++;
            persistItemdbCache(cache, true);

            const stillBlank = pending.filter((it) => it.cat == null).length;
            if (stillBlank) {
                console.warn(`[SDB] ${stillBlank} deposited item(s) could not be identified in ItemDB`
                    + ' by name — they will fill in on the next full scan, which reads real item'
                    + ' ids off the SDB pages.');
            }
        }
        priced += await applyLebronFallback();

        markCatsDirty();
        if (Store.get('sdb_scan_meta', null)) clearScanMeta();
        rebuildView();
        saveSnapshot();
        scheduleUpdate();
        return { added, priced };
    }

    function groupDepositedForHistory(units) {
        const groups = new Map();
        for (const u of units) {
            const nameLC = u.name.toLowerCase().replace(/\s+/g, ' ').trim();
            const key = u.id != null ? `id:${u.id}` : `name:${nameLC}`;
            const g = groups.get(key);
            if (g) { g.qty++; continue; }
            groups.set(key, { key, id: u.id, nameLC, name: u.name, qty: 1 });
        }
        const byName = new Map();
        for (const it of state.items) if (!byName.has(it.nameLC)) byName.set(it.nameLC, it);
        return [...groups.values()].map((g) => {
            const it = state.byKey.get(g.key) ?? byName.get(g.nameLC);
            return { id: it ? it.id : g.id, name: it ? it.name : g.name, qty: g.qty, value: it ? it.value : null };
        });
    }

    async function depositAllInventory() {
        if (state.crawling || state.withdrawing || state.depositing) return;
        state.depositing = true;
        state.stopRequested = false;
        emit('deposit:start');

        const deposited = [];
        let total = 0, failed = 0, added = 0, priced = 0, ok = false;
        try {
            const { items, refCk } = await fetchQuickstockInventory();
            if (state.stopRequested) return;
            if (!items.length) { toast('Nothing to deposit: your inventory is empty'); return; }
            if (!refCk) throw new Error('Security token not found. Reload the page and try again.');

            const units = [];
            for (const it of items) {
                for (let i = 0; i < it.count; i++) {
                    units.push({ oii: it.oii, id: it.id, isCash: it.isCash, name: it.name });
                }
            }
            total = units.length;

            for (let i = 0; i < units.length; i += CFG.depositChunk) {
                if (state.stopRequested) break;
                const batch = units.slice(i, i + CFG.depositChunk);
                emit('deposit:progress', { done: deposited.length, total });
                failed += await depositWithSplit(batch, refCk, deposited);
                if (!state.stopRequested && i + CFG.depositChunk < units.length) await sleep(randInt(500, 1000));
            }

            if (deposited.length) {
                emit('status', { text: 'Updating snapshot…' });
                ({ added, priced } = await ingestDeposited(deposited));
            }
            ok = true;
        } catch (err) {
            console.error('[SDB] deposit failed:', err);
            emit('deposit:error', { message: err.message });
        } finally {
            state.depositing = false;
            const stopped = state.stopRequested;
            state.stopRequested = false;
            const attempted = ok && total > 0;
            const historyItems = attempted ? groupDepositedForHistory(deposited) : [];
            emit('deposit:done', { done: deposited.length, total, failed, added, priced, stopped, items: historyItems, attempted });
            emit('data:changed');
        }
    }

    const CARD_SORTS = [
        ['name', 'Name'], ['value', 'Value'], ['qty', 'Qty'], ['total', 'Total'],
        ['rarity', 'Rarity'], ['cat', 'Category'], ['id', 'ID'],
    ];

    const defaultSortDir = (col) => (col === 'name' || col === 'cat' ? 1 : -1);

    const SORT_GETTERS = {
        name:   (it) => it.nameLC,
        id:     (it) => it.id != null ? Number(it.id) : -1,
        qty:    (it) => it.qty,
        cat:    (it) => (it.cat || it.type || '').toLowerCase(),
        rarity: (it) => it.rarity ?? -1,
        value:  (it) => typeof it.value === 'number' ? it.value : -1,
        total:  (it) => typeof it.value === 'number' ? it.value * it.qty : -1,
    };

    function passesFilters(it, f) {
        if (f.catInc || f.catExc) {
            const c = f.catL(it) || 'Unknown';
            if (f.catExc && f.catExc.has(c)) return false;
            if (f.catInc && !f.catInc.has(c)) return false;
        }
        if (f.ncMode === 'np' && it.isNC) return false;
        if (f.ncMode === 'nc' && !it.isNC) return false;
        const tf = f.triFlags;
        if (tf.inflated && (tf.inflated === 1 ? !it.inflated : it.inflated)) return false;
        if (f.rMin != null || f.rMax != null) {
            if (typeof it.rarity !== 'number') return false;
            if (f.rMin != null && it.rarity < f.rMin) return false;
            if (f.rMax != null && it.rarity > f.rMax) return false;
        }
        if (f.vMin != null || f.vMax != null) {
            if (!(typeof it.value === 'number' && it.value > 0)) return false;
            if (f.vMin != null && it.value < f.vMin) return false;
            if (f.vMax != null && it.value > f.vMax) return false;
        }
        if (f.qMin != null && it.qty < f.qMin) return false;
        if (f.qMax != null && it.qty > f.qMax) return false;
        if (tf.canEat && (tf.canEat === 1 ? !it.canEat : it.canEat)) return false;
        if (tf.canRead && (tf.canRead === 1 ? !it.canRead : it.canRead)) return false;
        if (tf.canOpen && (tf.canOpen === 1 ? !it.canOpen : it.canOpen)) return false;
        if (f.query) {
            if (f.queryMatch) { if (!f.queryMatch(it.blob)) return false; }
            else if (!it.blob.includes(f.query)) return false;
        }
        return true;
    }

    function rebuildView() {
        const { query, queryMatch, ncMode, hiddenOnly, triFlags, catFilter, filters } = state;
        let catInc = null, catExc = null;
        for (const c in catFilter) {
            if (catFilter[c] === 1) (catInc || (catInc = new Set())).add(c);
            else if (catFilter[c] === 2) (catExc || (catExc = new Set())).add(c);
        }
        const f = {
            catInc, catExc, catL: catLabel, ncMode, triFlags,
            rMin: filters.rMin, rMax: filters.rMax, vMin: filters.vMin, vMax: filters.vMax,
            qMin: filters.qMin, qMax: filters.qMax, query, queryMatch,
        };
        const out = [];
        const stats = { unique: 0, qty: 0, value: 0, nc: 0 };
        for (const it of state.items) {
            if (hiddenOnly) { if (!hiddenKeys.has(it.key)) continue; }
            else if (!showHidden && hiddenKeys.has(it.key)) continue;
            if (!passesFilters(it, f)) continue;
            out.push(it);
            stats.unique += 1;
            stats.qty += it.qty;
            stats.nc += it.isNC ? 1 : 0;
            if (typeof it.value === 'number' && !it.isNC) stats.value += it.value * it.qty;
        }
        const get = SORT_GETTERS[state.sort.col] || SORT_GETTERS.value;
        const dir = state.sort.dir;
        out.sort((a, b) => {
            const va = get(a), vb = get(b);
            const cmp = typeof va === 'string' ? collator.compare(va, vb) : va - vb;
            return cmp !== 0 ? dir * cmp : collator.compare(a.nameLC, b.nameLC);
        });
        state.view = out;
        state.stats = stats;
    }

    const PAGE_SIZES = [30, 60, 90];
    const PAGE_SIZE_MIN = 10, PAGE_SIZE_MAX = 1000;
    const clampPageSize = (n) => Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, Math.round(n)));

    function pageCount() {
        return Math.max(1, Math.ceil(state.view.length / state.pager.pageSize));
    }

    function visibleRows() {
        if (state.pager.mode !== 'page') return state.view;
        const pc = pageCount();
        if (state.pager.page > pc) state.pager.page = pc;
        const start = (state.pager.page - 1) * state.pager.pageSize;
        return state.view.slice(start, start + state.pager.pageSize);
    }

    function saveFilters() {
        Store.set('sdb_filters', {
            query: state.query,
            catFilter: state.catFilter,
            ncMode: state.ncMode,
            hiddenOnly: state.hiddenOnly,
            triFlags: state.triFlags,
            rMin: state.filters.rMin, rMax: state.filters.rMax,
            vMin: state.filters.vMin, vMax: state.filters.vMax,
            qMin: state.filters.qMin, qMax: state.filters.qMax,
            sortCol: state.sort.col, sortDir: state.sort.dir,
            advOpen: ui.advRow ? !ui.advRow.classList.contains('closed') : false,
        });
    }

    function savePager() {
        Store.set('sdb_pager', { mode: state.pager.mode, pageSize: state.pager.pageSize });
    }

    function syncPageSizeNumVis() {
        ui.pageSizeNum.classList.toggle('gone', ui.pageSizeSel.value !== 'custom');
    }

    function syncPageSizeUI() {
        const size = state.pager.pageSize;
        ui.pageSizeSel.value = PAGE_SIZES.includes(size) ? String(size) : 'custom';
        setFieldIdle(ui.pageSizeNum, size);
        syncPageSizeNumVis();
    }

    function syncCardSortUI() {
        if (!ui.cardSortSel) return;
        ui.cardSortSel.value = state.sort.col;
        const asc = state.sort.dir === 1;
        ui.cardSortDir.textContent = asc ? '▲' : '▼';
        ui.cardSortDir.title = asc
            ? 'Ascending, click for descending'
            : 'Descending, click for ascending';
    }

    function updateViewModeUI() {
        const isPage = state.pager.mode === 'page';
        ui.pageBar.classList.toggle('closed', !isPage);
        ui.cardBar.classList.toggle('closed', !state.cardView);
        if (state.cardView) syncCardSortUI();
        ui.btnScroll.classList.toggle('on', !isPage && !state.cardView);
        ui.btnPaged.classList.toggle('on', isPage && !state.cardView);
        ui.btnScroll.disabled = state.cardView;
        ui.btnPaged.disabled = state.cardView;
        ui.btnRows.classList.toggle('on', !state.cardView);
        ui.btnCards.classList.toggle('on', state.cardView);
        if (isPage && state.pager.page > pageCount()) {
            state.pager.page = pageCount();
        }
    }

    function exportRows() {
        return state.view.map((it) => ({
            name: it.name, value: it.value, qty: it.qty,
            total: typeof it.value === 'number' ? it.value * it.qty : null,
            rarity: it.rarity,
            category: it.cat || it.type || '',
            id: it.id,
            isNC: it.isNC, inflated: !!it.inflated, image: it.image,
        }));
    }

    function toCSV(rows) {
        const cols = ['name', 'value', 'qty', 'total', 'rarity', 'category', 'id', 'isNC', 'inflated', 'image'];
        const esc = (v) => {
            if (v == null) return '';
            const s = String(v);
            return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
    }

    function toTSV(rows) {
        const cols = [
            ['Item', 'name'], ['Value', 'value'], ['Qty', 'qty'], ['Total', 'total'],
            ['Rarity', 'rarity'], ['Category', 'category'], ['ID', 'id'],
        ];
        const esc = (v) => v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' ');
        const header = cols.map(([label]) => label).join('\t');
        const body = rows.map((r) => cols.map(([, key]) => esc(r[key])).join('\t'));
        return [header, ...body].join('\r\n');
    }

    function toStandaloneHTML(items) {
        const escH = escHTML;
        const when = new Date().toLocaleString();
        const cols = COL_DEFS.filter((c) => c.key !== 'move');
        const template = cols.map((c) => {
            const w = colWidths.get(c.key) ?? c.def;
            const min = colMin(c);
            return w == null
                ? `minmax(calc(${min}px * var(--zoom)), 1fr)`
                : `calc(${Math.max(min, w)}px * var(--zoom))`;
        }).join(' ');
        const data = items.map((it) => ({
            name: it.name, id: it.id ?? null, qty: it.qty, image: it.image || '',
            cat: it.cat || null, type: it.type || null, catL: catLabel(it),
            rarity: it.rarity ?? null, value: it.value ?? null,
            total: typeof it.value === 'number' ? it.value * it.qty : null,
            isNC: it.isNC ? 1 : 0, inflated: it.inflated ? 1 : 0,
            canEat: it.canEat ? 1 : 0, canRead: it.canRead ? 1 : 0, canOpen: it.canOpen ? 1 : 0,
            nameLC: it.nameLC, blob: it.blob,
        }));
        const json = JSON.stringify(data).replace(/</g, '\\u003c');
        const cats = [...new Set(data.map((d) => d.catL || 'Unknown'))].sort();

        const themeClass = (state.theme && state.theme !== 'dark' && state.theme !== 'custom') ? ` t-${state.theme}` : '';
        const gridZoom = state.gridZoom || 1.5;
        let rootStyle = `--zoom: ${gridZoom};`;
        if (state.theme === 'custom') {
            const custom = loadCustomTheme();
            for (const [v] of THEME_VARS) if (custom[v]) rootStyle += ` ${v}: ${custom[v]};`;
            if (custom['--font']) rootStyle += ` --font: ${custom['--font']};`;
        }

        const fnObjSrc = (o) => '{' + Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${v.toString()}`).join(', ') + '}';
        const SHARED_JS = [
            `const NEG_RE = ${NEG_RE.toString()};`,
            `const escHTML = ${escHTML.toString()};`,
            `const termMatcher = ${termMatcher.toString()};`,
            `const compileQuery = ${compileQuery.toString()};`,
            `const rarityClass = ${rarityClass.toString()};`,
            `const rarityLabel = ${rarityLabel.toString()};`,
            `const isUnpriced = ${isUnpriced.toString()};`,
            `const VALUE_TEXT = ${JSON.stringify(VALUE_TEXT)};`,
            `const fmtValue = ${fmtValue.toString()};`,
            `const linkUrls = ${linkUrls.toString()};`,
            `const defaultSortDir = ${defaultSortDir.toString()};`,
            `const SORT_GETTERS = ${fnObjSrc(SORT_GETTERS)};`,
            `const passesFilters = ${passesFilters.toString()};`,
        ].join('\n');
        const flagRows = TRI_FLAGS.map(([, id, label, title]) => triRow(id, label, title)).join('');
        const hiddenRow = triRow('hiddenOnly', 'Hidden', 'Show only rows you have hidden');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SDBCrawler &#xB7; ${escH(when)}</title>
<style>
${CSS}
html, body { margin: 0; height: 100%; }
body { background: #0f1117; }
.root { display: block; height: 100vh; --cols-template: ${template}; }
.root.t-retro { background: #f2f6fb; }
.panel {
    position: static !important; transform: none !important; opacity: 1 !important;
    width: 100% !important; height: 100vh !important;
    min-width: 0 !important; max-width: none !important; max-height: none !important;
    border: none !important; border-radius: 0 !important; resize: none !important;
}
.row { display: grid !important; position: relative !important; transform: none !important; }
.vspacer { height: auto !important; }
.c-q, .th.move { display: none; }
.exp-meta { padding: 0 14px 10px; font-size: 12px; color: var(--dim); }
.exp-pager { display: flex; align-items: center; gap: 10px; padding: 8px 14px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); }
.exp-pager .btn:disabled { opacity: .4; cursor: default; }
</style>
</head>
<body>
<div class="root${linkImages ? ' link-icons' : ''}${themeClass}" id="root" style="${rootStyle}">
  <section class="panel" id="panel">
    <header class="head">
      <div class="brand"><span class="dot"></span><b>SDBCrawler</b></div>
      <div class="spacer"></div>
      <select class="mini" id="zoomSel" title="Grid zoom">
        <option value="1.125">75%</option><option value="1.5">100%</option><option value="1.875">125%</option>
      </select>
    </header>
    <div class="stats">
      <div class="stat"><span class="label">Unique items</span><span class="num" id="stUnique">0</span></div>
      <div class="stat"><span class="label">Total quantity</span><span class="num" id="stQty">0</span></div>
      <div class="stat"><span class="label">Est. value (NP)</span><span class="num accent" id="stValue">0</span></div>
      <div class="stat"><span class="label">NC items</span><span class="num" id="stNC">0</span></div>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
        </svg>
        <input id="search" type="text" placeholder="Filter&#8230; &#8226; * ? wildcards &#8226; &amp; = match all &#8226; ! = not" spellcheck="false" autocomplete="off">
      </div>
      <span class="dropdown" id="catDrop">
        <button class="btn" id="btnCat" type="button" aria-haspopup="true" aria-expanded="false"
                title="Filter by category (include / exclude)">Category <span aria-hidden="true" class="caret">&#x25BE;</span></button>
        <div class="popmenu closed" id="catMenu" role="group" aria-label="Category filters">
          <div class="tri-list" id="catTriList"></div>
          <button class="tri-reset" id="catReset" type="button">Reset categories</button>
        </div>
      </span>
      <span class="dropdown" id="flagsDrop">
        <button class="btn" id="btnFlags" type="button" aria-haspopup="true" aria-expanded="false"
                title="Inflated &amp; use-type filters">Flags <span aria-hidden="true" class="caret">&#x25BE;</span></button>
        <div class="popmenu closed" id="flagMenu" role="group" aria-label="Flag filters">
          <div class="tri-list">${flagRows}</div>
          <div class="tri-sep"></div>
          ${hiddenRow}
        </div>
      </span>
      <div class="segset" id="ncMode" role="group" aria-label="Currency filter"
           title="Currency &#xB7; with neither lit, everything is shown">
        <button class="seg" data-nc="nc" title="Show only Neocash items &#xB7; click again to show everything">NC</button>
        <button class="seg" data-nc="np" title="Show only NP items &#xB7; click again to show everything">NP</button>
      </div>
    </div>
    <div class="exp-meta">Snapshot of ${nf.format(items.length)} items &#xB7; exported ${escH(when)}</div>
    <div class="grid-area">
      <div class="gridhead cols" id="gridHead">
        <button class="th" data-sort="name">Item <span class="arr"></span></button>
        <button class="th num" data-sort="value">Value <span class="arr"></span></button>
        <button class="th num" data-sort="qty">Qty <span class="arr"></span></button>
        <button class="th num" data-sort="total">Total <span class="arr"></span></button>
        <button class="th num" data-sort="rarity">Rarity <span class="arr"></span></button>
        <button class="th ctr" data-sort="cat">Category <span class="arr"></span></button>
        <button class="th ctr" data-sort="id">ID <span class="arr"></span></button>
        <span class="th ctr">Action</span>
        <span class="th">Links</span>
      </div>
      <div class="viewport" id="viewport"><div class="vspacer paged" id="vspacer"></div></div>
    </div>
    <div class="exp-pager">
      <button class="btn" id="pgPrev" type="button">Prev</button>
      <span id="pgInfo"></span>
      <button class="btn" id="pgNext" type="button">Next</button>
      <span style="flex:1"></span>
      <label class="field">Per page
        <select class="mini" id="pgSize">
          <option value="50">50</option>
          <option value="100" selected>100</option>
          <option value="250">250</option>
          <option value="1000">1000</option>
          <option value="all">All</option>
        </select>
      </label>
    </div>
  </section>
</div>
<script>
const DATA = ${json};
const CATS = ${JSON.stringify(cats)};
const TRI_CELL = ${JSON.stringify(TRI_CELL)};
const TRI_KEY_BY_ID = ${JSON.stringify(TRI_KEY_BY_ID)};
const nf = new Intl.NumberFormat('en-US');
const collator = new Intl.Collator('en');
const $ = (id) => document.getElementById(id);

// ── Shared logic, identical to the live panel (see SHARED_JS / Function.prototype.toString) ──
${SHARED_JS}

const st = {
    q: '', qm: null, ncMode: 'all',
    catFilter: {}, triFlags: { inflated: 0, canEat: 0, canRead: 0, canOpen: 0 },
    hiddenOnly: 0, hidden: new Set(),
    sort: { col: 'value', dir: -1 },
    page: 1, pageSize: 100,
};
const triAria = (v) => v === 1 ? 'true' : v === 2 ? 'false' : 'mixed';
const flagsActive = () => st.hiddenOnly || st.triFlags.inflated || st.triFlags.canEat || st.triFlags.canRead || st.triFlags.canOpen;

// Builds the same filter spec rebuildView passes to passesFilters; range bounds stay null here.
function currentF() {
    let catInc = null, catExc = null;
    for (const c in st.catFilter) {
        if (st.catFilter[c] === 1) (catInc || (catInc = new Set())).add(c);
        else if (st.catFilter[c] === 2) (catExc || (catExc = new Set())).add(c);
    }
    return {
        catInc, catExc, catL: (it) => it.catL, ncMode: st.ncMode, triFlags: st.triFlags,
        rMin: null, rMax: null, vMin: null, vMax: null, qMin: null, qMax: null,
        query: st.q, queryMatch: st.qm,
    };
}

function view() {
    const f = currentF();
    const out = [];
    const stats = { unique: 0, qty: 0, value: 0, nc: 0 };
    for (let k = 0; k < DATA.length; k++) {
        const d = DATA[k];
        if (st.hiddenOnly) { if (!st.hidden.has(k)) continue; }
        else if (st.hidden.has(k)) continue;
        if (!passesFilters(d, f)) continue;
        out.push(k);
        stats.unique++; stats.qty += d.qty; stats.nc += d.isNC ? 1 : 0;
        // NC is a separate currency — excluded from the NP estimate.
        if (typeof d.value === 'number' && !d.isNC) stats.value += d.value * d.qty;
    }
    const get = SORT_GETTERS[st.sort.col] || SORT_GETTERS.value;
    const dir = st.sort.dir;
    out.sort((a, b) => {
        const va = get(DATA[a]), vb = get(DATA[b]);
        const cmp = typeof va === 'string' ? collator.compare(va, vb) : va - vb;
        return cmp !== 0 ? dir * cmp : collator.compare(DATA[a].nameLC, DATA[b].nameLC);
    });
    return { out, stats };
}

function rowHTML(k, i) {
    const d = DATA[k];
    const L = linkUrls(d.name || '');
    const noPrice = isUnpriced(d.value);
    const val = noPrice ? '???' : fmtValue(d.value);
    const tot = noPrice ? '???' : fmtValue(d.total);
    const inf = !noPrice && d.inflated;
    return '<div class="row cols' + (i % 2 ? ' alt' : '') + '" data-k="' + k + '">'
      + '<div class="c-item"><img loading="lazy" decoding="async" alt="" src="' + escHTML(d.image) + '">'
      + '<span class="name" title="' + escHTML(d.name) + '">' + escHTML(d.name) + '</span>'
      + '</div>'
      + '<div class="c-num val' + (inf ? ' inf' : '') + '"' + (inf ? ' title="itemdb flags this price as inflated"' : '') + '>' + val + '</div>'
      + '<div class="c-num qty">' + nf.format(d.qty) + '</div>'
      + '<div class="c-num tot">' + tot + '</div>'
      + '<div class="c-num"><span class="rar ' + rarityClass(d.rarity) + '">' + rarityLabel(d.rarity) + '</span></div>'
      + '<div class="c-cat"><span class="chip">' + escHTML(d.catL || '\\u2013') + '</span></div>'
      + '<div class="c-num id">' + (d.id == null ? '\\u2013' : d.id) + '</div>'
      + '<div class="c-act"><button class="act x" title="Hide From View">\\u{1F441}</button></div>'
      + '<div class="c-links">'
      + '<a class="lnk l-db" target="_blank" rel="noopener" href="' + L.db + '">DB</a>'
      + '<a class="lnk l-jn" target="_blank" rel="noopener" href="' + L.jn + '">JN</a>'
      + '<a class="lnk l-tp" target="_blank" rel="noopener" href="' + L.tp + '">TP</a>'
      + '<a class="lnk l-ah" target="_blank" rel="noopener" href="' + L.ah + '">AH</a>'
      + '</div>'
      + '</div>';
}

// Tri rows for the Category menu, rebuilt from the data (Flags rows are static markup).
function renderCatMenu() {
    const list = $('catTriList');
    list.innerHTML = '';
    for (const c of CATS) {
        const b = document.createElement('button');
        b.className = 'tri'; b.type = 'button'; b.dataset.cat = c;
        const v = st.catFilter[c] || 0;
        b.dataset.tri = String(v);
        b.setAttribute('role', 'checkbox');
        b.setAttribute('aria-checked', triAria(v));
        b.innerHTML = TRI_CELL;
        const lab = document.createElement('span');
        lab.className = 'tlabel'; lab.textContent = c;
        b.append(lab);
        list.append(b);
    }
}

function render() {
    const { out, stats } = view();
    const total = out.length;
    const size = st.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (st.page > totalPages) st.page = totalPages;
    if (st.page < 1) st.page = 1;
    // All data is embedded; pagination only limits how many rows are in the DOM at once.
    const start = size === Infinity ? 0 : (st.page - 1) * size;
    const pageRows = size === Infinity ? out : out.slice(start, start + size);
    $('vspacer').innerHTML = pageRows.map((k, i) => rowHTML(k, start + i)).join('');
    $('stUnique').textContent = nf.format(stats.unique);
    $('stQty').textContent = nf.format(stats.qty);
    $('stValue').textContent = nf.format(Math.round(stats.value));
    $('stNC').textContent = nf.format(stats.nc);
    $('btnCat').classList.toggle('on', Object.keys(st.catFilter).length > 0);
    $('btnFlags').classList.toggle('on', !!flagsActive());
    $('pgInfo').textContent = 'Page ' + st.page + ' / ' + totalPages + ' \\u00b7 ' + nf.format(total) + ' item' + (total === 1 ? '' : 's');
    $('pgPrev').disabled = st.page <= 1;
    $('pgNext').disabled = st.page >= totalPages;
    for (const th of document.querySelectorAll('.th[data-sort]')) {
        const on = th.dataset.sort === st.sort.col;
        th.classList.toggle('on', on);
        th.querySelector('.arr').textContent = on ? (st.sort.dir === 1 ? '\\u25B2' : '\\u25BC') : '';
    }
}

// Filter/sort/search change: back to page 1, top of list (mirrors the live viewChanged).
function viewChanged() { st.page = 1; $('viewport').scrollTop = 0; render(); }

// ── Anchored pop-menus (Category, Flags): fixed, positioned at the button, one open at a time ──
let openMenu = null;
function closeMenus() { if (openMenu) { openMenu.classList.add('closed'); openMenu = null; } }
function toggleMenu(btn, menu) {
    if (openMenu === menu) { closeMenus(); return; }
    closeMenus();
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.left = r.left + 'px';
    menu.classList.remove('closed');
    openMenu = menu;
}
$('btnCat').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('btnCat'), $('catMenu')); });
$('btnFlags').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('btnFlags'), $('flagMenu')); });
document.addEventListener('mousedown', (e) => {
    if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.dropdown')) closeMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

$('catTriList').addEventListener('click', (e) => {
    const t = e.target.closest('.tri'); if (!t) return;
    const c = t.dataset.cat;
    const v = ((st.catFilter[c] || 0) + 1) % 3;
    if (v) st.catFilter[c] = v; else delete st.catFilter[c];
    t.dataset.tri = String(v);
    t.setAttribute('aria-checked', triAria(v));
    viewChanged();
});
$('catReset').addEventListener('click', () => {
    st.catFilter = {};
    for (const t of $('catTriList').querySelectorAll('.tri')) { t.dataset.tri = '0'; t.setAttribute('aria-checked', 'mixed'); }
    viewChanged();
});
$('flagMenu').addEventListener('click', (e) => {
    const t = e.target.closest('.tri'); if (!t) return;
    if (t.id === 'hiddenOnly') {
        st.hiddenOnly = st.hiddenOnly ? 0 : 1;
        t.dataset.tri = st.hiddenOnly ? '1' : '0';
        t.setAttribute('aria-checked', st.hiddenOnly ? 'true' : 'false');
    } else {
        const key = TRI_KEY_BY_ID[t.id];
        const v = ((st.triFlags[key] || 0) + 1) % 3;
        st.triFlags[key] = v;
        t.dataset.tri = String(v);
        t.setAttribute('aria-checked', triAria(v));
    }
    viewChanged();
});

$('search').addEventListener('input', (e) => {
    st.q = e.target.value.trim().toLowerCase();
    st.qm = compileQuery(st.q);
    viewChanged();
});
// Same paired control the panel uses: NC only, NP only, or neither for everything.
$('ncMode').addEventListener('click', (e) => {
    const seg = e.target.closest('.seg');
    if (!seg) return;
    st.ncMode = seg.dataset.nc === st.ncMode ? 'all' : seg.dataset.nc;
    for (const b of $('ncMode').querySelectorAll('.seg')) b.classList.toggle('on', b.dataset.nc === st.ncMode);
    viewChanged();
});
$('gridHead').addEventListener('click', (e) => {
    const th = e.target.closest('.th[data-sort]');
    if (!th) return;
    const col = th.dataset.sort;
    if (st.sort.col === col) st.sort.dir *= -1;
    else st.sort = { col, dir: defaultSortDir(col) };
    viewChanged();
});
$('vspacer').addEventListener('click', (e) => {
    const btn = e.target.closest('.x');
    if (!btn) return;
    st.hidden.add(Number(btn.closest('.row').dataset.k));
    render();
});
$('pgPrev').addEventListener('click', () => { if (st.page > 1) { st.page--; $('viewport').scrollTop = 0; render(); } });
$('pgNext').addEventListener('click', () => { st.page++; $('viewport').scrollTop = 0; render(); });
$('pgSize').addEventListener('change', (e) => {
    st.pageSize = e.target.value === 'all' ? Infinity : Number(e.target.value);
    st.page = 1; $('viewport').scrollTop = 0; render();
});
// Theme + zoom are baked onto #root at export time; the zoom control can still adjust it live.
$('zoomSel').addEventListener('change', (e) => { $('root').style.setProperty('--zoom', e.target.value); });
$('zoomSel').value = String(${gridZoom});
renderCatMenu();
render();
</script>
</body>
</html>`;
    }

    function downloadFile(name, mime, content) {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    const LINK_ICONS = {
        db: 'data:image/png;base64,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',
        jn: 'data:image/png;base64,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',
        tp: 'data:image/png;base64,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',
        ah: 'data:image/png;base64,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',
    };

    const CSS = `
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        button, input, select { font: inherit; color: inherit; }

        .root {
            --bg-0: #0f1117;
            --bg-1: #161922;
            --bg-2: rgba(255, 255, 255, 0.05);
            --bg-3: rgba(255, 255, 255, 0.09);
            --line: rgba(255, 255, 255, 0.08);
            --line-strong: rgba(255, 255, 255, 0.14);
            --text: #e8eaf1;
            --muted: #8b93a7;
            --dim: #5b6274;
            --acc: #7c6cff;
            --acc-2: #22d3ee;
            --acc-grad-2: #5a8dff;
            --good: #34d399;
            --warn: #fbbf24;
            --bad: #f87171;
            --input-bg: rgba(0, 0, 0, 0.35);
            --img-bg: rgba(0, 0, 0, 0.4);
            --head-bg: rgba(255, 255, 255, 0.025);
            --row-line: rgba(255, 255, 255, 0.035);
            --row-alt: rgba(255, 255, 255, 0.015);
            --row-hover: rgba(124, 108, 255, 0.07);
            --option-bg: #14161e;
            --toast-bg: rgba(10, 12, 17, 0.95);
            --backdrop: rgba(4, 6, 10, 0.55);
            --scroll-thumb: rgba(255, 255, 255, 0.30);
            --scroll-thumb-hover: rgba(255, 255, 255, 0.5);
            --panel-blur: blur(12px) saturate(140%);
            --cur-col-resize: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><g fill='none' stroke='%23ffffff' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'><path d='M13 4.5v17'/><path d='M8 9l-4 4 4 4'/><path d='M18 9l4 4-4 4'/></g><g fill='none' stroke='%23000000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M13 4.5v17'/><path d='M8 9l-4 4 4 4'/><path d='M18 9l4 4-4 4'/></g></svg>") 13 13, col-resize;
            --cur-pointer: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M9.4 13.2V4.6a2.1 2.1 0 0 1 4.2 0v6.1m0-1a2.1 2.1 0 0 1 4.2 0v1.4m0-0.7a2.05 2.05 0 0 1 4.1 0v1.9m0-1a2.05 2.05 0 0 1 4.1 0v6.1c0 4.3-2.9 7.6-7.4 7.6h-2.1c-2.4 0-4-0.9-5.2-2.6l-4.4-6.3a2.1 2.1 0 0 1 3.2-2.7z' fill='%23000000' stroke='%23ffffff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>") 10 3, pointer;
            --cur-arrow: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><path d='M7 2.5 7 18.2 11.1 14.4 14 21.4 17.2 20 14.4 13.3 19.8 13.1 Z' fill='%23000000' stroke='%23ffffff' stroke-width='1.6' stroke-linejoin='round'/></svg>") 7 3, default;
            --font: 'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', system-ui, sans-serif;
            --mono: ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace;
            --row-h: ${CFG.rowH}px;
            --zoom: 1.5;
            font-family: var(--font);
            font-size: 13px;
            line-height: 1.45;
            color: var(--text);
            -webkit-font-smoothing: antialiased;
            cursor: var(--cur-arrow);
        }
        .root a, .root a:hover, .root button:not(:disabled), .root select,
        .root label.switch, .root input[type="checkbox"] { cursor: var(--cur-pointer); }

        .root.t-forest { --bg-0: #091812; --bg-1: #0e231a; --bg-2: rgba(167, 243, 208, 0.06); --bg-3: rgba(167, 243, 208, 0.11); --line: rgba(167, 243, 208, 0.12); --line-strong: rgba(167, 243, 208, 0.22); --text: #e6f5ec; --muted: #92b8a4; --dim: #63836f; --acc: #2f9e5e; --acc-2: #7dd3a0; --acc-grad-2: #15803d; --good: #4ade80; --warn: #fbbf24; --bad: #f87171; --input-bg: rgba(0, 0, 0, 0.32); --img-bg: rgba(0, 0, 0, 0.38); --head-bg: rgba(167, 243, 208, 0.04); --row-line: rgba(167, 243, 208, 0.07); --row-alt: rgba(167, 243, 208, 0.025); --row-hover: rgba(47, 158, 94, 0.16); --option-bg: #0d2419; --toast-bg: rgba(7, 20, 14, 0.96); --backdrop: rgba(5, 16, 11, 0.6); --scroll-thumb: rgba(167, 243, 208, 0.32); --scroll-thumb-hover: rgba(167, 243, 208, 0.5); --panel-blur: blur(14px) saturate(140%); }
        .root.t-midnight { --bg-0: #080c18; --bg-1: #0e1628; --bg-2: rgba(100, 120, 200, 0.04); --bg-3: rgba(100, 120, 200, 0.10); --line: rgba(100, 120, 200, 0.12); --line-strong: rgba(100, 120, 200, 0.25); --text: #e4e8f0; --muted: #7a8aa8; --dim: #4a5a70; --acc: #6a7ac0; --acc-2: #8a8ac0; --acc-grad-2: #8a4ac0; --good: #5a9a90; --warn: #c09050; --bad: #c85a7a; --input-bg: rgba(0, 0, 0, 0.40); --img-bg: rgba(60, 80, 140, 0.08); --head-bg: rgba(100, 120, 200, 0.04); --row-line: rgba(100, 120, 200, 0.08); --row-alt: rgba(100, 120, 200, 0.025); --row-hover: rgba(106, 122, 192, 0.10); --option-bg: #0e1628; --toast-bg: rgba(8, 12, 24, 0.96); --backdrop: rgba(4, 6, 16, 0.75); --scroll-thumb: rgba(100, 120, 200, 0.36); --scroll-thumb-hover: rgba(100, 120, 200, 0.55); --panel-blur: blur(16px) saturate(160%); }
        .root.t-retro { --bg-0: #eef6ff; --bg-1: #f6fbff; --bg-2: rgba(58, 110, 165, 0.08); --bg-3: rgba(58, 110, 165, 0.16); --line: rgba(58, 110, 165, 0.35); --line-strong: rgba(58, 110, 165, 0.55); --text: #1c3a5e; --muted: #3a6ea5; --dim: #7a92ad; --acc: #3a6ea5; --acc-2: #2a5d94; --acc-grad-2: #5c8bc4; --good: #2e7d32; --warn: #b45309; --bad: #c62828; --input-bg: #ffffff; --img-bg: rgba(58, 110, 165, 0.08); --head-bg: rgba(58, 110, 165, 0.10); --row-line: rgba(58, 110, 165, 0.14); --row-alt: rgba(58, 110, 165, 0.05); --row-hover: rgba(58, 110, 165, 0.13); --option-bg: #f6fbff; --toast-bg: #f6fbff; --backdrop: rgba(28, 58, 94, 0.35); --scroll-thumb: rgba(58, 110, 165, 0.35); --scroll-thumb-hover: rgba(58, 110, 165, 0.55); --panel-blur: none; --font: Verdana, Arial, Helvetica, sans-serif; }
        .root.t-vaporwave { --bg-0: rgba(38, 12, 61, 0.98); --bg-1: rgba(58, 20, 88, 0.98); --bg-2: rgba(255, 90, 200, 0.07); --bg-3: rgba(255, 90, 200, 0.15); --line: rgba(47, 224, 224, 0.22); --line-strong: rgba(47, 224, 224, 0.45); --text: #fbe9fb; --muted: #d59ce6; --dim: #9370c0; --acc: #ff3db8; --acc-2: #2fe0e0; --acc-grad-2: #ff9a52; --good: #2fe0e0; --warn: #ffb84d; --bad: #ff4d7d; --input-bg: rgba(0, 0, 0, 0.32); --img-bg: rgba(178, 77, 255, 0.13); --head-bg: rgba(47, 224, 224, 0.06); --row-line: rgba(255, 90, 200, 0.10); --row-alt: rgba(178, 77, 255, 0.05); --row-hover: rgba(255, 61, 184, 0.16); --option-bg: #260c3d; --toast-bg: rgba(38, 12, 61, 0.96); --backdrop: rgba(16, 4, 30, 0.72); --scroll-thumb: rgba(255, 90, 200, 0.30); --scroll-thumb-hover: rgba(47, 224, 224, 0.55); --panel-blur: blur(16px) saturate(175%); }

        .root {
            --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
            --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
            --ease-pop: cubic-bezier(0.34, 1.3, 0.4, 1);
        }

        .backdrop {
            position: fixed; inset: 0; background: var(--backdrop);
            opacity: 1; transition: opacity 240ms var(--ease-inout);
            z-index: 2147483646; pointer-events: auto;
        }
        .backdrop.closed { opacity: 0; pointer-events: none; }

        .panel {
            position: fixed;
            left: 50%;
            top: 50%;
            display: flex;
            flex-direction: column;
            width: 1906px;
            height: 1181px;
            min-width: 800px;
            min-height: 500px;
            max-width: 100vw;
            max-height: 100vh;
            background: linear-gradient(180deg, var(--bg-1), var(--bg-0) 120px);
            backdrop-filter: var(--panel-blur);
            -webkit-backdrop-filter: var(--panel-blur);
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow:
                0 32px 90px rgba(0, 0, 0, 0.55),
                0 4px 16px rgba(0, 0, 0, 0.35),
                inset 0 1px 0 rgba(255, 255, 255, 0.07);
            overflow: hidden;
            resize: both;
            z-index: 2147483647;
            transform-origin: 50% 50%;
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
            visibility: visible;
            transition:
                opacity 260ms var(--ease-out),
                transform 260ms var(--ease-pop),
                border-radius 200ms var(--ease-inout),
                visibility 0s linear 0s;
        }
        .panel.closed {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.96);
            visibility: hidden;
            pointer-events: none;
            transition:
                opacity 180ms var(--ease-inout),
                transform 180ms var(--ease-inout),
                visibility 0s linear 180ms;
        }
        .panel.maximized {
            width: 100vw;
            height: 100vh;
            max-width: 100vw;
            max-height: 100vh;
            border-radius: 0;
        }
        .panel.max-anim {
            transition: left 260ms var(--ease-inout), top 260ms var(--ease-inout),
                        width 260ms var(--ease-inout), height 260ms var(--ease-inout),
                        border-radius 200ms var(--ease-inout);
        }
        .panel.positioned { transform: scale(1); }
        .panel.positioned.closed { transform: scale(0.96); }
        .no-anim { transition: none !important; animation: none !important; }
        .head { touch-action: none; cursor: grab; }
        .head.dragging { cursor: grabbing; }

        .grid-area {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
        }
        .grid-area > .gridhead {
            flex: none;
        }
        .grid-area > .viewport {
            flex: 1;
            min-height: 0;
        }

        .progress {
            position: absolute; top: 0; left: 0; right: 0; height: 2px;
            opacity: 0; transition: opacity 200ms; pointer-events: none; z-index: 5;
        }
        .progress.on { opacity: 1; }
        .progress i {
            display: block; height: 100%; width: 0%;
            background: linear-gradient(90deg, var(--acc), var(--acc-2));
            box-shadow: 0 0 12px rgba(124, 108, 255, 0.7);
            transition: width 250ms ease;
        }

        .head {
            display: flex; align-items: center; gap: 10px;
            height: 46px; padding: 0 12px 0 14px; flex: none;
            border-bottom: 1px solid var(--line);
            user-select: none;
        }
        .brand { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
        .brand b, .launcher .wm b { font-weight: 700; background: linear-gradient(90deg, var(--acc), var(--acc-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .dot {
            width: 9px; height: 9px; border-radius: 50%;
            background: linear-gradient(135deg, var(--acc), var(--acc-2));
            box-shadow: 0 0 10px rgba(124, 108, 255, 0.8);
        }
        .brand-badge {
            width: 15px; height: 15px; flex: none;
            display: grid; place-items: center;
            color: var(--acc);
            filter: drop-shadow(0 0 4px currentColor);
        }
        .brand-badge svg { width: 100%; height: 100%; display: block; }
        .pill {
            font-size: 11px; font-weight: 500; color: var(--muted);
            background: var(--bg-2); border: 1px solid var(--line);
            border-radius: 99px; padding: 2px 10px; white-space: nowrap;
            max-width: 300px; overflow: hidden; text-overflow: ellipsis;
        }
        .pill.live { color: var(--acc-2); border-color: rgba(34, 211, 238, 0.35); }
        .pill.err { color: var(--bad); border-color: rgba(248, 113, 113, 0.35); }
        .spacer { flex: 1; }
        .icon {
            width: 26px; height: 26px; display: grid; place-items: center;
            background: transparent; border: none; border-radius: 7px;
            color: var(--muted); cursor: var(--cur-pointer); font-size: 14px; line-height: 1;
        }
        .icon:hover { background: var(--bg-3); color: var(--text); }
        .head-sep { width: 1px; height: 22px; flex: none; margin: 0 6px; background: var(--line-strong); }

        .controls, .toolbar {
            display: flex; align-items: center; gap: 8px; flex: none;
            padding: 10px 12px; border-bottom: 1px solid var(--line);
        }
        .btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 5px 12px; border-radius: 8px; cursor: var(--cur-pointer);
            background: linear-gradient(180deg, var(--bg-3), var(--bg-2));
            border: 1px solid var(--line-strong);
            color: var(--text); font-size: 12px; font-weight: 500;
            transition: filter 120ms, background 120ms, border-color 120ms, transform 60ms;
            white-space: nowrap;
        }
        .segjoin { display: inline-flex; }
        .segjoin .btn { border-radius: 0; }
        .segjoin .btn:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
        .segjoin .btn:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; margin-left: -1px; }
        .segjoin .btn.on { z-index: 1; background: var(--bg-3); }
        .btn:hover:not(:disabled) { filter: brightness(1.25); }
        .btn:active:not(:disabled) { transform: translateY(1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn.primary {
            background: linear-gradient(135deg, var(--acc), var(--acc-grad-2));
            border-color: rgba(124, 108, 255, 0.6); color: #fff;
            box-shadow: 0 2px 14px rgba(124, 108, 255, 0.35);
        }
        .btn.primary:hover:not(:disabled) { filter: brightness(1.1); background: linear-gradient(135deg, var(--acc), var(--acc-grad-2)); }
        .ic { width: 15px; height: 15px; flex: none; display: block; }
        .act .ic { width: 1.4em; height: 1.4em; }
        .btn.danger { color: var(--bad); border-color: rgba(248, 113, 113, 0.35); }
        .btn.danger:hover:not(:disabled) { background: rgba(248, 113, 113, 0.12); }
        .scanbtn { min-width: 122px; justify-content: center; }
        #btnDeposit .ic, #btnReprice .ic { color: var(--acc-2); }

        .field { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 12px; }
        .field input {
            width: 58px; padding: 4px 7px; border-radius: 7px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 12px;
            appearance: textfield; -moz-appearance: textfield;
        }
        .rv-row input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
        .field input::-webkit-outer-spin-button, .field input::-webkit-inner-spin-button,
        .rv-row input[type="number"]::-webkit-outer-spin-button,
        .rv-row input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .no-spin { appearance: textfield; -moz-appearance: textfield; }
        .no-spin::-webkit-outer-spin-button, .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .field input:focus, .search input:focus, select:focus {
            outline: none; border-color: var(--acc);
            box-shadow: 0 0 0 3px rgba(124, 108, 255, 0.25);
        }

        .advrow, .pagebar, .qbar, .cardbar {
            max-height: 120px; opacity: 1; overflow: hidden;
            transition:
                max-height 260ms var(--ease-inout),
                padding-top 260ms var(--ease-inout),
                padding-bottom 260ms var(--ease-inout),
                border-top-width 260ms var(--ease-inout),
                border-bottom-width 260ms var(--ease-inout),
                opacity 200ms var(--ease-inout);
        }
        .advrow.closed, .pagebar.closed, .qbar.closed, .cardbar.closed {
            max-height: 0; padding-top: 0; padding-bottom: 0;
            border-top-width: 0; border-bottom-width: 0; opacity: 0;
            pointer-events: none; visibility: hidden;
            transition:
                max-height 220ms var(--ease-inout),
                padding-top 220ms var(--ease-inout),
                padding-bottom 220ms var(--ease-inout),
                border-top-width 220ms var(--ease-inout),
                border-bottom-width 220ms var(--ease-inout),
                opacity 140ms var(--ease-inout),
                visibility 0s linear 220ms;
        }

        .advrow {
            display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; flex: none;
            padding: 8px 12px; border-bottom: 1px solid var(--line);
            background: var(--head-bg);
        }
        .advrow .field input { width: 84px; }
        .advrow .field input.narrow { width: 50px; }
        .ranges { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px 12px;
            padding: 4px 9px; border-radius: 8px; background: var(--bg-2); }
        .ranges .field { font-size: 11px; }
        .ranges .rsep { color: var(--dim); font-size: 10.5px; letter-spacing: 0.02em; }

        .cardbar {
            display: flex; align-items: center; gap: 8px; flex: none;
            padding: 6px 12px; border-bottom: 1px solid var(--line);
            background: var(--head-bg);
        }
        .cardbar select { padding: 4px 8px; font-size: 11.5px; }
        .dirtoggle {
            padding: 4px 0; width: 26px; justify-content: center;
            font-size: 10px; color: var(--acc-2);
        }
        .btn.on { border-color: var(--acc); color: var(--acc-2); }
        .btn.gone, .field input.gone { display: none; }
        .dropdown { position: relative; display: inline-flex; }
        .btn .caret { font-size: 10px; opacity: .6; }
        .popmenu {
            position: fixed; z-index: 2147483647;
            display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; min-width: 148px;
            background: var(--option-bg); border: 1px solid var(--line-strong); border-radius: 10px;
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
        }
        .popmenu.closed { display: none; }
        .popmenu .group-label { font-size: 11px; color: var(--muted); margin-bottom: -2px; }
        .popmenu .row-label { display: flex; align-items: center; justify-content: space-between; }
        .popmenu .mini { width: 100%; }
        .popmenu .menu-item {
            display: flex; align-items: center; gap: 8px; width: 100%; justify-content: flex-start;
        }
        .dice-btn { display: inline-flex; align-items: center; justify-content: center; padding: 0;
            width: 22px; height: 20px; background: transparent; border: none; cursor: pointer; }
        .dice-btn:hover { filter: brightness(1.15); }

        .tri-list { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }
        .tri {
            display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
            padding: 5px 6px; border: none; border-radius: 6px; background: transparent;
            color: var(--muted); font-size: 12px; cursor: var(--cur-pointer);
        }
        .tri:hover { background: var(--bg-2); color: var(--text); }
        .tribox {
            width: 16px; height: 16px; flex: none; box-sizing: border-box;
            border: 1.6px solid var(--dim); border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            transition: border-color 120ms, background 120ms;
        }
        .tribox .tglyph { width: 100%; height: 100%; display: none; }
        .tri[data-tri="1"] .tribox { border-color: var(--good); background: rgba(52, 211, 153, 0.16); color: var(--good); }
        .tri[data-tri="1"] .tri-c { display: block; }
        .tri[data-tri="2"] .tribox { border-color: var(--bad); background: rgba(248, 113, 113, 0.16); color: var(--bad); }
        .tri[data-tri="2"] .tri-x { display: block; }
        .tri[data-tri="2"] .tlabel { color: var(--bad); }
        .tlabel { flex: 1; }
        .tri-reset {
            margin-top: 4px; padding: 6px; width: 100%; text-align: left;
            border: none; border-top: 1px solid var(--line); border-radius: 0;
            background: transparent; color: var(--muted); font-size: 12px; cursor: var(--cur-pointer);
        }
        .tri-reset:hover { color: var(--text); }
        .tri-sep { height: 1px; background: var(--line); margin: 4px 2px; }

        .pagebar {
            display: flex; align-items: center; gap: 10px; flex: none;
            padding: 7px 12px; border-top: 1px solid var(--line);
            background: var(--head-bg);
        }
        .pageinfo-wrap { display: flex; flex-direction: column; align-items: center; min-width: 172px; }
        .pageinfo {
            font-family: var(--mono); font-size: 12px; color: var(--muted);
            font-variant-numeric: tabular-nums; text-align: center;
        }
        .pagerange {
            font-family: var(--mono); font-size: 10px; color: var(--dim);
            font-variant-numeric: tabular-nums; text-align: center; line-height: 1.4;
        }
        .pagebar select { padding: 4px 6px; }
        .pagebar input[type="number"] { -moz-appearance: textfield; }
        .pagebar input[type="number"]::-webkit-outer-spin-button,
        .pagebar input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        .switch { display: inline-flex; align-items: center; gap: 7px; cursor: var(--cur-pointer); color: var(--muted); font-size: 12px; user-select: none; }
        .switch input { position: absolute; opacity: 0; pointer-events: none; }
        .track {
            width: 30px; height: 17px; border-radius: 99px; position: relative; flex: none;
            background: var(--bg-3); border: 1px solid var(--line-strong);
            transition: background 150ms, border-color 150ms;
        }
        .track::after {
            content: ''; position: absolute; top: 2px; left: 2px;
            width: 11px; height: 11px; border-radius: 50%;
            background: var(--muted); transition: transform 150ms, background 150ms;
        }
        .switch input:checked + .track { background: rgba(124, 108, 255, 0.45); border-color: var(--acc); }
        .switch input:checked + .track::after { transform: translateX(13px); background: #fff; }

        .segset {
            display: inline-flex; align-items: stretch; gap: 0; flex: none;
            border: 1px solid var(--line-strong); border-radius: 7px;
            background: var(--bg-2); overflow: hidden;
        }
        .segset .seg {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 34px; padding: 4px 8px;
            border: none; border-left: 1px solid var(--line-strong); border-radius: 0;
            background: transparent; color: var(--dim);
            font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
            line-height: 1.2; white-space: nowrap; cursor: var(--cur-pointer);
            transition: background 140ms var(--ease-out), color 140ms var(--ease-out);
        }
        .segset .seg:first-child { border-left: none; }
        .segset .seg:hover { background: var(--bg-3); color: var(--text); }
        .segset .seg.on { background: var(--acc); color: #fff; }
        .segset .seg.on:hover { background: var(--acc); filter: brightness(1.08); }
        .segset .seg:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }

        .stats {
            display: grid; grid-template-columns: repeat(4, auto); gap: 8px;
            padding: 10px 12px; flex: none; border-bottom: 1px solid var(--line);
        }
        .stat {
            background: var(--bg-2); border: 1px solid var(--line);
            border-radius: 10px; padding: 7px 12px;
        }
        .stat .label {
            display: block; font-size: 9.5px; font-weight: 600; letter-spacing: 0.09em;
            text-transform: uppercase; color: var(--dim); margin-bottom: 1px;
        }
        .stat .num { font-family: var(--mono); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .stat .num.accent { color: var(--acc-2); display: inline-block; min-width: 14ch; }

        .search { position: relative; flex: 1; min-width: 160px; }
        .search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; stroke: var(--dim); pointer-events: none; }
        .search input {
            width: 100%; padding: 6px 26px 6px 28px; border-radius: 8px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-size: 12.5px;
        }
        .search input::placeholder { color: var(--dim); }
        .search .clear {
            position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
            width: 20px; height: 20px; border: none; border-radius: 6px;
            background: transparent; color: var(--dim); cursor: var(--cur-pointer); font-size: 12px;
            display: none; place-items: center;
        }
        .search .clear.show { display: grid; }
        .search .clear:hover { color: var(--text); background: var(--bg-3); }
        select {
            padding: 6px 8px; border-radius: 8px; max-width: 170px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-size: 12px; cursor: var(--cur-pointer);
        }
        select option { background: var(--option-bg); color: var(--text); }
        select {
            scrollbar-width: thin;
            scrollbar-color: var(--scroll-thumb) var(--option-bg);
        }
        select::-webkit-scrollbar { width: 10px; height: 10px; }
        select::-webkit-scrollbar-track { background: var(--option-bg); }
        select::-webkit-scrollbar-thumb {
            background: var(--scroll-thumb); border-radius: 99px;
            border: 3px solid transparent; background-clip: content-box;
        }
        select::-webkit-scrollbar-thumb:hover {
            background: var(--scroll-thumb-hover); border: 3px solid transparent; background-clip: content-box;
        }
        .head select.mini {
            padding: 3px 7px; font-size: 11px; max-width: 112px;
            background: var(--input-bg); border: 1px solid var(--line);
            color: var(--muted); border-radius: 7px;
        }
        .head select.mini:hover { color: var(--text); border-color: var(--line-strong); }

        .cols {
            display: grid;
            grid-template-columns: var(--cols-template,
                minmax(calc(90px * var(--zoom)), 1fr) calc(64px * var(--zoom)) calc(58px * var(--zoom))
                calc(110px * var(--zoom)) calc(52px * var(--zoom)) calc(90px * var(--zoom))
                calc(96px * var(--zoom)) calc(126px * var(--zoom)) calc(82px * var(--zoom)) calc(40px * var(--zoom)));
            align-items: center; column-gap: calc(8px * var(--zoom)); padding: 0 calc(12px * var(--zoom));
        }
        .gridhead, .vspacer .row { min-width: var(--cols-min, 100%); }
        .th { position: relative; }
        .colgrip {
            position: absolute; top: 0; bottom: 0; right: calc(-6px * var(--zoom));
            width: calc(13px * var(--zoom)); z-index: 4;
            background: none; border: none; padding: 0;
            display: grid; place-items: center;
            cursor: var(--cur-col-resize);
            border-radius: 6px;
            transition: background 160ms var(--ease-out);
        }
        .colgrip::after {
            content: ''; width: 2px; height: 46%;
            border-radius: 2px; background: var(--line-strong); opacity: 0.6;
            transition: height 160ms var(--ease-out), background 160ms var(--ease-out),
                        opacity 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
        }
        .colgrip:hover { background: var(--bg-2); }
        .colgrip:hover::after {
            height: 80%; opacity: 1; background: var(--acc);
            box-shadow: 0 0 7px var(--acc);
        }
        .colgrip.dragging { background: var(--bg-3); }
        .colgrip.dragging::after {
            height: 100%; opacity: 1; background: var(--acc-2);
            box-shadow: 0 0 10px var(--acc-2);
        }
        .gridhead.resizing, .gridhead.resizing * { cursor: var(--cur-col-resize) !important; }
        .gridhead {
            flex: none; height: calc(30px * var(--zoom)); border-bottom: 1px solid var(--line);
            background: var(--head-bg);
            padding-right: calc(12px * var(--zoom) + 10px);
        }
        .th {
            display: flex; align-items: center; gap: calc(3px * var(--zoom)); height: 100%;
            background: none; border: none; cursor: var(--cur-pointer); user-select: none;
            font-size: calc(10px * var(--zoom)); font-weight: 600; letter-spacing: 0.08em;
            text-transform: uppercase; color: var(--dim); text-align: left;
            border-radius: 5px;
            transition: color 180ms var(--ease-inout), background 180ms var(--ease-inout), text-shadow 180ms var(--ease-inout);
        }
        .th:hover { color: var(--muted); }
        .th.on { color: var(--acc-2); text-shadow: 0 0 14px rgba(34, 211, 238, 0.45); }
        .th.num { justify-content: flex-end; text-align: right; }
        .th.ctr { justify-content: center; text-align: center; }
        .row .c-cat { text-align: center; min-width: 0; }
        .th.ctr:not([data-sort]) { cursor: default; }
        .th .arr { font-size: calc(8px * var(--zoom)); opacity: 0; transform: translateY(-2px); transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out); }
        .th.on .arr { opacity: 1; transform: translateY(0); }

        .viewport { flex: 1; overflow: auto; position: relative; overscroll-behavior: contain; scrollbar-gutter: stable; }
        .viewport, .paste-ta, .qchips, .guide-body, .rv-scroll, .rv-missing, .tabpane, .tri-list { scrollbar-width: thin; scrollbar-color: var(--scroll-thumb) transparent; }
        .viewport::-webkit-scrollbar, .paste-ta::-webkit-scrollbar, .qchips::-webkit-scrollbar, .guide-body::-webkit-scrollbar,
        .rv-scroll::-webkit-scrollbar, .rv-missing::-webkit-scrollbar, .tabpane::-webkit-scrollbar, .tri-list::-webkit-scrollbar { width: 10px; height: 10px; }
        .viewport::-webkit-scrollbar-track, .paste-ta::-webkit-scrollbar-track, .qchips::-webkit-scrollbar-track, .guide-body::-webkit-scrollbar-track,
        .rv-scroll::-webkit-scrollbar-track, .rv-missing::-webkit-scrollbar-track, .tabpane::-webkit-scrollbar-track, .tri-list::-webkit-scrollbar-track { background: transparent; }
        .viewport::-webkit-scrollbar-thumb, .paste-ta::-webkit-scrollbar-thumb, .qchips::-webkit-scrollbar-thumb, .guide-body::-webkit-scrollbar-thumb,
        .rv-scroll::-webkit-scrollbar-thumb, .rv-missing::-webkit-scrollbar-thumb, .tabpane::-webkit-scrollbar-thumb, .tri-list::-webkit-scrollbar-thumb {
            background: var(--scroll-thumb); border-radius: 99px;
            border: 3px solid transparent; background-clip: content-box;
        }
        .viewport::-webkit-scrollbar-thumb:hover, .paste-ta::-webkit-scrollbar-thumb:hover, .qchips::-webkit-scrollbar-thumb:hover,
        .rv-scroll::-webkit-scrollbar-thumb:hover, .rv-missing::-webkit-scrollbar-thumb:hover,
        .tabpane::-webkit-scrollbar-thumb:hover, .tri-list::-webkit-scrollbar-thumb:hover {
            background: var(--scroll-thumb-hover); border: 3px solid transparent; background-clip: content-box;
        }

        .vspacer { position: relative; width: 100%; }
        .vspacer.paged { height: auto !important; }
        .vspacer.paged .row {
            position: relative !important;
            transform: none !important;
            will-change: auto;
        }
        .vspacer.swap { animation: fade-swap 220ms var(--ease-out); }
        @keyframes fade-swap {
            from { opacity: 0.3; }
            to   { opacity: 1; }
        }
        .row {
            position: absolute; left: 0; right: 0; height: var(--row-h);
            display: none; border-bottom: 1px solid var(--row-line);
            contain: layout style; will-change: transform;
            animation: row-in 180ms var(--ease-out);
            transition: background 140ms var(--ease-inout);
        }
        @keyframes row-in {
            from { opacity: 0; }
        }
        .row.alt { background: var(--row-alt); }
        .row:hover { background: var(--row-hover); }
        .row.ghost { opacity: 0.45; }
        .row.ghost:hover { opacity: 0.75; }
        .row .c-item { display: flex; align-items: center; gap: calc(9px * var(--zoom)); min-width: 0; }
        .row .c-item img {
            width: calc(28px * var(--zoom)); height: calc(28px * var(--zoom)); flex: none; border-radius: 6px;
            background: var(--img-bg); object-fit: contain;
        }
        .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(12.5px * var(--zoom)); }
        .row .c-num { font-family: var(--mono); font-size: calc(12px * var(--zoom)); font-variant-numeric: tabular-nums; text-align: right; }
        .row .c-num.id { text-align: center; }
        .row .tot { color: var(--muted); }
        .row .chip {
            display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-size: calc(10.5px * var(--zoom)); color: var(--muted); background: var(--bg-2);
            border: 1px solid var(--line); border-radius: 6px; padding: 1px 7px;
        }
        .rar {
            display: inline-block; min-width: calc(30px * var(--zoom)); text-align: center;
            font-family: var(--mono); font-size: calc(10.5px * var(--zoom)); font-weight: 600;
            border-radius: 6px; padding: 1px 5px;
        }
        .r-none       { color: var(--dim); --rar: #8b93a7; }
        .r-uncommon   { color: #22c55e; background: rgba(34, 197, 94, 0.12); --rar: #22c55e; }
        .r-special    { color: #aa4455; background: rgba(170, 68, 85, 0.14); --rar: #aa4455; }
        .r-megarare   { color: #ea580c; background: rgba(234, 88, 12, 0.14); --rar: #ea580c; }
        .r-brightred  { color: #ef4444; background: rgba(239, 68, 68, 0.14); --rar: #ef4444; }
        .r-retired    { color: #9ca3af; background: rgba(156, 163, 175, 0.14); --rar: #9ca3af; }
        .r-artifact   { color: #ef4444; background: rgba(239, 68, 68, 0.14); --rar: #ef4444; }
        .r-nc         { color: #d8b4fe; background: rgba(216, 180, 254, 0.14); --rar: #d8b4fe; }

        .c-act {
            display: inline-flex; align-items: stretch; gap: 0; justify-self: center;
            border: 1px solid var(--line-strong); border-radius: calc(5px * var(--zoom));
            background: var(--bg-2); overflow: hidden;
            opacity: 0; transition: opacity 160ms var(--ease-inout);
        }
        .act {
            display: grid; place-items: center; padding: 0;
            width: calc(20px * var(--zoom)); height: calc(20px * var(--zoom));
            border: none; border-left: 1px solid var(--line-strong); border-radius: 0;
            background: transparent; color: var(--dim); cursor: var(--cur-pointer);
            font-size: calc(11px * var(--zoom)); line-height: 1;
            transition: background 140ms var(--ease-out), color 140ms var(--ease-out),
                        filter 140ms var(--ease-out);
        }
        .act:first-child { border-left: none; }
        .act.x .eye-closed { display: none; }
        .act.x.unhide .eye-open { display: none; }
        .act.x.unhide .eye-closed { display: block; }
        .act.rm:hover { background: rgba(248, 113, 113, 0.16); color: var(--bad); }
        .act.x:hover { background: rgba(251, 191, 36, 0.16); color: var(--warn); }
        .row:hover .c-act, .row.focused .c-act { opacity: 1; }
        .c-act.has-unhide { opacity: 1; }
        .act.x.unhide { color: var(--acc-2); background: rgba(34, 211, 238, 0.14); }
        .act.x.unhide:hover { background: rgba(34, 211, 238, 0.24); }

        .val.inf { color: var(--warn); }

        .c-links {
            display: inline-flex; justify-content: flex-start; justify-self: start;
            gap: 0;
            border: 1px solid var(--line-strong); border-radius: calc(5px * var(--zoom));
            background: var(--bg-2); overflow: hidden;
        }
        .lnk {
            display: inline-flex; align-items: center; justify-content: center;
            width: calc(24px * var(--zoom)); height: calc(16px * var(--zoom)); padding: 0;
            border: none; border-left: 1px solid var(--line-strong);
            border-radius: 0; outline: none; box-shadow: none;
            font-size: calc(9px * var(--zoom)); font-weight: 700; line-height: 1;
            letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
            text-decoration: none; background: transparent; color: var(--muted);
            transition: background 140ms var(--ease-out), color 140ms var(--ease-out);
        }
        .lnk:first-child { border-left: none; }
        .lnk:hover { background: var(--bg-3); color: var(--acc-2); }
        .lnk:active { background: var(--line); }

        .link-icons .c-links {
            border: none; border-radius: 0; background: none; overflow: visible;
            gap: calc(4px * var(--zoom));
        }
        .link-icons .lnk {
            border-left: none; background: transparent; font-size: 0;
            width: calc(18px * var(--zoom)); height: calc(18px * var(--zoom));
            background-repeat: no-repeat; background-position: center; background-size: contain;
        }
        .link-icons .l-db { background-image: url("${LINK_ICONS.db}"); }
        .link-icons .l-jn { background-image: url("${LINK_ICONS.jn}"); }
        .link-icons .l-tp { background-image: url("${LINK_ICONS.tp}"); }
        .link-icons .l-ah { background-image: url("${LINK_ICONS.ah}"); }

        .c-q { display: flex; align-items: center; justify-content: flex-start; gap: calc(2px * var(--zoom)); }
        .qm, .qp {
            width: calc(16px * var(--zoom)); height: calc(16px * var(--zoom)); display: grid; place-items: center;
            border: 1px solid var(--line); border-radius: 5px;
            background: var(--bg-2); color: var(--dim);
            cursor: var(--cur-pointer); font-size: calc(11px * var(--zoom)); line-height: 1;
        }
        .qm:hover, .qp:hover { color: var(--text); background: var(--bg-3); }
        .qm .ic, .qp .ic { width: calc(11px * var(--zoom)); height: calc(11px * var(--zoom)); }
        .qm[hidden] { display: none; }
        .row .qm { opacity: 0; }
        .row:hover .qm, .row:focus-within .qm, .row.queued .qm { opacity: 1; }
        .qn {
            width: calc(32px * var(--zoom)); min-width: calc(20px * var(--zoom)); text-align: center;
            font-family: var(--mono); font-size: calc(11px * var(--zoom)); font-variant-numeric: tabular-nums;
            color: var(--acc-2);
            background: transparent; border: 1px solid transparent; border-radius: 5px;
            padding: 2px;
        }
        .qn:focus { border-color: var(--acc); background: var(--input-bg); outline: none; }
        .row.queued { background: rgba(34, 211, 238, 0.05); }
        .row.queued:hover { background: rgba(34, 211, 238, 0.09); }

        .cardgrid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(calc(190px * var(--zoom)), 1fr));
            gap: calc(10px * var(--zoom));
            padding: calc(12px * var(--zoom));
            align-content: start;
        }
        .card {
            position: relative;
            display: flex; flex-direction: column; gap: calc(7px * var(--zoom));
            padding: calc(10px * var(--zoom));
            background: var(--bg-2); border: 1px solid var(--line);
            border-radius: 12px; min-width: 0; overflow: hidden;
            transition: border-color 160ms var(--ease-inout), background 160ms var(--ease-inout), transform 120ms var(--ease-pop);
            animation: row-in 180ms var(--ease-out);
        }
        .card:hover { border-color: var(--line-strong); background: var(--bg-3); transform: translateY(-2px); }
        .card.queued { border-color: rgba(34, 211, 238, 0.45); background: rgba(34, 211, 238, 0.06); }
        .card.ghost { opacity: 0.5; }
        .card .c-top { display: flex; flex-direction: column; align-items: center; text-align: center; gap: calc(6px * var(--zoom)); min-width: 0; }
        .card .c-top img {
            width: calc(44px * var(--zoom)); height: calc(44px * var(--zoom)); flex: none; align-self: center;
            border-radius: 8px; background: var(--img-bg); object-fit: contain;
        }
        .card .c-top .name {
            font-size: calc(11px * var(--zoom)); font-weight: 600; min-width: 0; max-width: 100%;
            white-space: normal; overflow-wrap: anywhere; line-height: 1.3;
            display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
        }
        .card .thumbwrap { position: relative; display: block; flex: none; }
        .card .thumbwrap img { display: block; }
        .c-item img, .card .thumbwrap img { cursor: var(--cur-pointer); }
        .c-item img:hover, .card .thumbwrap img:hover { filter: brightness(1.15); }
        .card .rar {
            position: absolute; top: auto; left: auto;
            right: calc(-3px * var(--zoom)); bottom: calc(-3px * var(--zoom));
            z-index: 2; min-width: 0; border-radius: 999px;
            padding: 0 calc(5px * var(--zoom));
            background: rgba(6, 8, 12, 0.88); color: var(--rar);
            font-size: calc(8.5px * var(--zoom)); font-weight: 700;
        }
        .no-card-rarity .card .rar { display: none; }
        .card .desc {
            font-size: calc(10px * var(--zoom)); line-height: 1.4; color: var(--muted);
            text-align: center;
            padding: calc(4px * var(--zoom)) 0 calc(2px * var(--zoom));
            border-top: 1px solid var(--line);
            display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
            overflow: hidden; overflow-wrap: anywhere;
        }
        .card .desc:empty { display: none; }
        .card .c-nums {
            display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: auto auto;
            margin-top: auto;
            grid-auto-flow: column; gap: calc(2px * var(--zoom)) calc(8px * var(--zoom));
            font-family: var(--mono); font-size: calc(10.5px * var(--zoom)); font-variant-numeric: tabular-nums;
            text-align: center;
        }
        .card .c-nums .lbl { color: var(--dim); font-size: calc(9px * var(--zoom)); text-transform: uppercase; letter-spacing: 0.06em; }
        .card .c-nums .v { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card .c-nums .v.acc { color: var(--acc-2); }
        .card .c-nums .v.inf { color: var(--warn); }
        .card .c-foot { display: flex; align-items: center; gap: calc(6px * var(--zoom)); min-width: 0; }
        .card .c-foot .c-links { flex: 0 0 auto; justify-content: flex-start; flex-wrap: nowrap; }
        .card .c-foot .c-q { flex: 0 0 auto; margin-left: auto; }
        .link-icons .card .c-foot .c-links { flex-wrap: wrap; }
        .card .c-act {
            position: absolute; top: calc(6px * var(--zoom)); right: calc(6px * var(--zoom));
            justify-self: auto; z-index: 2; background: var(--bg-1);
        }
        .card:hover .c-act, .card.focused .c-act { opacity: 1; }

        .qchips {
            display: flex; flex-wrap: wrap; gap: 4px;
            max-height: 52px; overflow-y: auto; flex: 1; min-width: 0;
        }
        .qchip {
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 11px; color: var(--text);
            background: var(--bg-2); border: 1px solid var(--line);
            border-radius: 99px; padding: 1px 8px;
            cursor: var(--cur-pointer); white-space: nowrap;
        }
        .qchip:hover { border-color: rgba(248,113,113,0.5); color: var(--bad); }
        .qchip b { font-family: var(--mono); font-weight: 600; color: var(--acc-2); }

        .qbar {
            display: flex; align-items: center; gap: 8px; flex: none;
            padding: 8px 12px; border-bottom: 1px solid var(--line);
            background: rgba(34, 211, 238, 0.05);
        }
        .qbar .info { font-size: 12px; color: var(--acc-2); font-weight: 500; }
        .qbar-list {
            flex: none; display: inline-flex; align-items: center; justify-content: center;
            width: 26px; height: 26px; padding: 0; border-radius: 7px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--muted); cursor: var(--cur-pointer);
        }
        .qbar-list:hover { color: var(--acc-2); border-color: var(--acc); }
        .qbar-list .ic { width: 15px; height: 15px; }
        .qbar input {
            width: 64px; padding: 4px 8px; border-radius: 7px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 12px;
        }
        .qbar input:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(124, 108, 255, 0.25); }
        #pinInput::placeholder { color: var(--dim); opacity: 0.5; }

        .empty {
            position: sticky; top: 0; display: none; height: 100%;
            place-items: center; color: var(--dim); font-size: 12.5px; text-align: center;
            animation: fade-swap 220ms var(--ease-out);
        }
        .empty.show { display: grid; }
        .empty b { display: block; color: var(--muted); font-size: 14px; margin-bottom: 4px; }

        .foot {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            flex: none; padding: 6px 14px; border-top: 1px solid var(--line);
            font-size: 11px; color: var(--dim);
        }
        .foot .kbd {
            font-family: var(--mono); font-size: 10px; color: var(--muted);
            background: var(--bg-2); border: 1px solid var(--line);
            border-radius: 4px; padding: 0 5px;
        }

        .launcher-dock {
            position: fixed; left: 18px; bottom: 18px;
            display: flex; align-items: center;
            z-index: 2147483647; touch-action: none;
            border-radius: 99px;
            padding-right: 14px;
            background: var(--bg-0);
            backdrop-filter: blur(16px) saturate(150%);
            -webkit-backdrop-filter: blur(16px) saturate(150%);
            border: 1.5px solid rgba(0, 0, 0, 0.6);
            box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5), 0 0 18px rgba(124, 108, 255, 0.22);
            color: var(--text); font-family: var(--font); font-size: 12.5px; font-weight: 600;
            user-select: none;
            opacity: 1; visibility: visible;
            transform: translateY(0) scale(1);
            will-change: transform, opacity;
            transition:
                transform 240ms var(--ease-pop),
                opacity 200ms var(--ease-inout),
                box-shadow 160ms var(--ease-inout),
                visibility 0s linear 0s;
        }
        .launcher-dock::before {
            content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
        }
        .launcher-dock:hover { transform: translateY(-2px) scale(1); box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 18px rgba(124, 108, 255, 0.28); animation: launcher-pulse 1200ms var(--ease-inout) infinite; }
        @keyframes launcher-pulse {
            0%, 100% { box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 18px rgba(124,108,255,0.28); }
            50%      { box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 24px rgba(124,108,255,0.38); }
        }
        .launcher-dock.dragging { cursor: grabbing; }
        .launcher-dock.closed {
            opacity: 0; visibility: hidden; pointer-events: none;
            transform: translateY(16px) scale(0.9);
            transition:
                transform 180ms var(--ease-inout),
                opacity 160ms var(--ease-inout),
                visibility 0s linear 180ms;
        }
        .launcher {
            position: relative;
            display: flex; align-items: center; gap: 8px;
            padding: 9px 16px; cursor: var(--cur-pointer);
            background: transparent; border: none; -webkit-appearance: none; appearance: none;
            color: var(--text); font-family: var(--font); font-size: 12.5px; font-weight: 600;
            user-select: none;
        }
        .launcher .count { font-family: var(--mono); font-size: 11px; font-weight: 500; color: var(--muted); }
        #launcher .brand-badge { width: 20px; height: 20px; }
        .launcher-sep { width: 1px; align-self: stretch; flex: none; margin: 3px 12px 3px 3px; background: rgba(0, 0, 0, 0.55); box-shadow: 1px 0 0 rgba(255, 255, 255, 0.10); }
        .launcher-info {
            width: 28px; height: 28px; padding: 0;
            justify-content: center; border-radius: 50%;
            font-family: var(--mono); font-size: 15px; font-weight: 700; font-style: italic;
            color: var(--acc-2);
        }
        .launcher-info:hover { background: var(--bg-3); }
        #btnSettings .ic { width: 15.5px; height: 15.5px; }

        .toast {
            position: absolute; left: 50%; bottom: 44px; transform: translate(-50%, 8px);
            max-width: 80%; padding: 7px 16px; border-radius: 9px;
            background: var(--toast-bg); border: 1px solid var(--line-strong);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
            font-size: 12px; color: var(--text); white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis;
            opacity: 0; pointer-events: none; z-index: 10;
            transition: opacity 160ms, transform 160ms;
        }
        .toast.show { opacity: 1; transform: translate(-50%, 0); }
        .toast.err { border-color: rgba(248, 113, 113, 0.5); color: var(--bad); }

        .modal {
            position: fixed; inset: 0; z-index: 2147483648;
            display: grid; place-items: center;
            background: rgba(4, 6, 10, 0.5); backdrop-filter: blur(4px);
            opacity: 0; transition: opacity 200ms var(--ease-inout);
            font-family: var(--font); font-size: 13px; line-height: 1.45; color: var(--text);
        }
        .modal.modal-in { opacity: 1; }
        .modal-card {
            width: 360px; max-width: 92vw;
            background: linear-gradient(180deg, var(--bg-1), var(--bg-0) 120px);
            border: 1px solid var(--line-strong); border-radius: 14px;
            box-shadow: 0 24px 70px rgba(0,0,0,0.55);
            padding: 16px 18px; display: flex; flex-direction: column; gap: 12px;
            transform: scale(0.96); transition: transform 220ms var(--ease-pop);
        }
        .modal.modal-in .modal-card { transform: scale(1); }
        .modal-head { font-size: 13px; font-weight: 600; color: var(--text); }
        .modal-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
        .modal-row input {
            width: 80px; padding: 5px 8px; border-radius: 7px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 12px;
        }
        .modal-row input:focus, .modal-row select:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(124,108,255,0.25); }
        .modal-row select {
            flex: 1; min-width: 0; padding: 5px 8px; border-radius: 7px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: inherit; font-size: 12px;
        }
        .modal-hint { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
        .modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
        .ma-group { display: contents; }
        .ma-group.gone { display: none; }
        .modal-card.wide { width: 420px; max-width: 90vw; }
        .modal-card.settings { width: 520px; max-width: 92vw; }
        .modal-card.review { width: 580px; max-width: 94vw; }
        .modal-card.review.activity { width: 468px; }

        .rv-scroll { max-height: 255px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; }
        .rv-head, .rv-row {
            display: grid; grid-template-columns: 20px 1fr 74px 62px 46px 82px;
            align-items: center; gap: 8px; padding: 6px 10px;
        }
        .rv-head {
            position: sticky; top: 0; z-index: 1;
            background: linear-gradient(var(--bg-2), var(--bg-2)), var(--bg-1); border-bottom: 1px solid var(--line);
            font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
            text-transform: uppercase; color: var(--dim);
        }
        .rv-row { border-bottom: 1px solid var(--row-line); font-size: 12px; }
        .rv-row:last-child { border-bottom: 0; }
        .rv-row.off { opacity: 0.4; }
        .rv-item { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .rv-item img { width: 22px; height: 22px; object-fit: contain; flex: none; }
        .rv-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rv-num { font-family: var(--mono); font-size: 11.5px; color: var(--muted); text-align: right; }
        .rv-max {
            justify-self: center; padding: 3px 7px; border-radius: 6px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--acc-2); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;
            text-transform: uppercase; cursor: var(--cur-pointer);
        }
        .rv-max:hover { border-color: var(--acc); color: var(--text); }
        .rv-row input[type="number"] {
            width: 100%; padding: 3px 6px; border-radius: 6px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 11.5px;
        }
        .rv-row input[type="number"]:focus { outline: none; border-color: var(--acc); }
        .rv-stats { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11.5px; color: var(--muted); }
        .rv-stats b { color: var(--acc-2); font-family: var(--mono); font-weight: 600; }
        .rv-missing { font-size: 11px; color: var(--dim); line-height: 1.5; max-height: 56px; overflow-y: auto; }

        .tv-x {
            width: 24px; height: 24px; flex: none; line-height: 1;
            border: 1px solid var(--line-strong); border-radius: 6px;
            background: none; color: var(--muted);
            font-family: inherit; font-size: 12px; cursor: var(--cur-pointer);
        }
        .tv-x:hover { border-color: rgba(248, 113, 113, 0.5); color: var(--bad); }

        .ex-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .ex-grid .btn { width: 100%; justify-content: center; }

        .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
        .tab {
            padding: 7px 14px; border: 0; border-bottom: 2px solid transparent;
            background: none; color: var(--muted); cursor: var(--cur-pointer);
            font-family: inherit; font-size: 12px; font-weight: 600;
        }
        .tab:hover { color: var(--text); }
        .tab.on { color: var(--text); border-bottom-color: var(--acc); }
        .tabpane { display: none; flex-direction: column; gap: 10px; height: 39vh; overflow-y: auto; scrollbar-gutter: stable; }
        .tabpane.on { display: flex; }
        .kb-row, .tv-row {
            display: flex; align-items: center; gap: 10px;
            font-size: 12px; color: var(--muted);
        }
        .kb-row > span:first-child, .tv-row > span:first-child { flex: 1; min-width: 0; }
        .kb-key {
            width: 150px; padding: 5px 8px; border-radius: 7px;
            display: flex; align-items: center; justify-content: center; gap: 4px;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 11.5px;
            cursor: var(--cur-pointer);
        }
        .kb-key.listening { border-color: var(--acc); color: var(--acc-2); }
        .kcap {
            font-family: var(--mono); font-size: 10.5px; line-height: 1.5;
            padding: 0 6px; min-width: 9px; border-radius: 4px;
            background: var(--bg-2); border: 1px solid var(--line-strong); color: var(--text);
        }
        .kb-key.listening .kcap { border-color: var(--acc); }
        .kb-unbound { color: var(--muted); font-style: italic; }
        .kb-custom { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line);
                     display: flex; flex-direction: column; gap: 8px; }
        .kb-clist { display: flex; flex-direction: column; gap: 10px; }
        .kb-x-slot { width: 24px; flex: none; }
        .tv-row input[type="color"] {
            width: 42px; height: 26px; padding: 0; border-radius: 6px;
            background: none; border: 1px solid var(--line-strong); cursor: var(--cur-pointer);
        }
        .tv-row code { font-family: var(--mono); font-size: 10.5px; color: var(--dim); }
        .tv-row input.tv-hex {
            width: 80px; flex: none; padding: 4px 7px; border-radius: 6px; text-align: center;
            background: var(--input-bg); border: 1px solid var(--line-strong);
            color: var(--text); font-family: var(--mono); font-size: 11.5px;
        }
        .tv-row input.tv-hex:focus {
            outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(124, 108, 255, 0.25);
        }
        .tv-row input.tv-hex.bad { border-color: rgba(248, 113, 113, 0.6); color: var(--bad); }

        .tv-presets { display: flex; flex-direction: column; gap: 5px; }
        .tv-preset { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--muted); }
        .tv-preset > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tv-swatch {
            flex: none; width: 34px; height: 15px; border-radius: 4px;
            border: 1px solid var(--line-strong);
        }
        .tv-none { font-size: 11.5px; color: var(--dim); font-style: italic; }
        .modal-subhead {
            font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
            color: var(--dim); margin: 4px 0 2px;
        }
        .modal-subhead:not(:first-child) { margin-top: 12px; }
        .io-group { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .io-group .btn { width: 100%; justify-content: center; }
        .io-drop {
            display: flex; align-items: center; justify-content: center; text-align: center;
            gap: 4px; margin-top: 6px; padding: 12px; border-radius: 9px;
            border: 1px dashed var(--line-strong); background: var(--bg-2);
            color: var(--muted); font-size: 11.5px; cursor: default;
        }
        .io-drop b { color: var(--text); font-weight: 600; }
        .io-lz { margin-top: 8px; }
        .io-drop.drag { border-color: var(--acc); background: var(--row-hover); color: var(--text); }
        .modal-row-block {
            display: flex; flex-direction: column; gap: 8px;
            margin-top: 6px; padding: 12px; border-radius: 9px;
            border: 1px solid var(--line); background: var(--bg-2);
        }
        .danger-box {
            margin-top: 6px; padding: 12px; border-radius: 9px;
            border: 1px solid rgba(248, 113, 113, 0.35); background: rgba(248, 113, 113, 0.07);
        }
        .btn.danger-btn {
            border-color: rgba(248, 113, 113, 0.5); color: var(--bad); background: rgba(248, 113, 113, 0.1);
        }
        .btn.danger-btn:hover { background: rgba(248, 113, 113, 0.2); }

        .diff-sec { font-size: 12px; }
        .diff-h {
            display: inline-flex; align-items: center; gap: 6px; margin: 0 0 7px;
            padding: 2px 9px; border-radius: 999px;
            font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .diff-count { font-family: var(--mono); opacity: 0.75; letter-spacing: 0; }
        .diff-add-h { color: var(--good); background: rgba(52, 211, 153, 0.15); }
        .diff-del-h { color: var(--bad); background: rgba(248, 113, 113, 0.15); }
        .diff-chg-h { color: var(--warn); background: rgba(251, 191, 36, 0.14); }
        .diff-trend-h { color: var(--muted); background: var(--bg-2); }
        .diff-list { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; }
        .diff-none { color: var(--dim); font-style: italic; }

        #snapPickWrap.gone, #snapEmpty.gone { display: none; }
        .snap-detail { margin-top: -4px; font-size: 11px; color: var(--dim); font-family: var(--mono); }
        .snap-del {
            flex: none; display: grid; place-items: center; width: 20px; height: 20px; padding: 0;
            border: none; background: transparent; color: var(--dim); cursor: pointer; border-radius: 5px;
            transition: background 140ms var(--ease-out), color 140ms var(--ease-out);
        }
        .snap-del:hover { background: rgba(248, 113, 113, 0.16); color: var(--bad); }
        .snap-del .ic { width: 13px; height: 13px; }
        .diff-row { display: flex; align-items: center; gap: 10px; color: var(--text); }
        .diff-row .rv-item { flex: 1; min-width: 0; }
        .diff-qty, .diff-val { flex: none; font-family: var(--mono); font-size: 11.5px; white-space: nowrap; text-align: right; }
        .diff-qty { width: 46px; color: var(--muted); }
        .diff-val { width: 120px; }
        .diff-add .diff-val { color: var(--good); }
        .diff-del .diff-val { color: var(--bad); }
        .diff-chg .diff-val { color: var(--muted); }
        .trend-row { display: flex; align-items: center; gap: 10px; color: var(--text); }
        .trend-when { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .trend-val { flex: none; font-family: var(--mono); font-size: 11.5px; white-space: nowrap; text-align: right; color: var(--muted); }
        #snapBody { padding-bottom: 8px; }
        .modal-card.review .modal-actions { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 12px; }
        .hist-entry { border-bottom: 1px solid var(--row-line); }
        .hist-entry:last-child { border-bottom: 0; }
        .hist-summary {
            display: block; width: 100%; text-align: left; padding: 8px 10px; font-size: 12px;
            background: none; border: none; color: var(--text); cursor: pointer;
        }
        .hist-summary:hover { background: var(--bg-2); }
        .hist-arrow { display: inline-block; vertical-align: -2px; width: 13px; height: 13px; color: var(--muted); }
        .hist-detail { padding: 0 10px 8px; display: flex; flex-direction: column; gap: 4px; }
        .hist-detail.gone { display: none; }
        .hist-item { gap: 8px; font-size: 11.5px; }
        .hist-item .hist-name { flex: 1; min-width: 0; }
        .hist-item .hist-qty { flex: none; color: var(--muted); font-family: var(--mono); }
        .hist-item .hist-val { flex: none; width: 64px; text-align: right; font-family: var(--mono); }
        .hist-total { text-align: right; font-size: 11.5px; color: var(--muted); padding-top: 2px; }
        .modal-card.guide { width: 560px; max-width: 92vw; }
        .guide-body { max-height: 53vh; overflow-y: auto; padding-right: 6px; }
        .guide-body h4 {
            font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
            color: var(--acc-2); margin: 14px 0 5px;
        }
        .guide-body h4:first-child { margin-top: 0; }
        .guide-body p { font-size: 12.5px; line-height: 1.6; color: var(--muted); margin: 0; }
        .guide-body ul { font-size: 12.5px; line-height: 1.55; color: var(--muted); margin: 0; padding-left: 18px; }
        .guide-body li { margin: 2px 0; }
        .guide-body li ul { margin: 2px 0; }
        .guide-body b { color: var(--text); font-weight: 600; }
        .guide-body .ic { display: inline-block; width: 1.05em; height: 1.05em; vertical-align: -0.16em; }
        .guide-body code {
            font-family: var(--mono); font-size: 11.5px; color: var(--acc-2);
            background: var(--bg-2); border-radius: 4px; padding: 1px 5px;
        }
        .paste-ta {
            width: 100%; min-height: 136px; resize: vertical; box-sizing: border-box;
            font-family: var(--mono); font-size: 12px; line-height: 1.5;
            padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line-strong);
            background: var(--input-bg); color: var(--text);
        }
        .paste-ta::placeholder { color: var(--muted); opacity: 0.75; }
        .paste-ta:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(124,108,255,0.25); }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation: none !important; transition: none !important; }
        }
    `;

    const ICONS = {
        play: '<polygon points="8 5 19 12 8 19" fill="currentColor" stroke="none"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
        dice: '<g fill="url(#sdbAccGrad)" stroke="none" transform="scale(0.046875)"><path d="M454.608,111.204L280.557,6.804C272.992,2.268,264.504,0,256,0c-8.507,0-16.996,2.268-24.557,6.797L57.392,111.204c-5.346,3.203-9.916,7.37-13.555,12.192l207.902,124.707c2.622,1.575,5.896,1.575,8.518,0L468.16,123.396C464.521,118.574,459.955,114.407,454.608,111.204z M177.16,131.738c-12.056,8.371-31.302,8.16-42.984-0.49c-11.684-8.65-11.382-22.463,0.678-30.842c12.056-8.386,31.304-8.16,42.992,0.482C189.525,109.539,189.22,123.344,177.16,131.738z M376.303,134.126c-12.056,8.38-31.306,8.16-42.992-0.49c-11.68-8.65-11.378-22.462,0.685-30.841c12.053-8.38,31.302-8.168,42.985,0.482C388.664,111.928,388.359,125.732,376.303,134.126z"/><path d="M246.136,258.366L38.004,133.523c-2.457,5.802-3.794,12.116-3.794,18.62v208.084c0,16.773,8.801,32.311,23.182,40.946l174.051,104.392c5.828,3.496,12.203,5.629,18.714,6.435V265.464C250.156,262.556,248.631,259.858,246.136,258.366z M75.845,369.736c-12.052-6.571-21.829-21.671-21.829-33.728c0-12.056,9.777-16.502,21.829-9.931c12.056,6.57,21.826,21.671,21.826,33.728C97.671,371.861,87.902,376.306,75.845,369.736z M75.845,247.869c-12.052-6.578-21.829-21.678-21.829-33.728c0-12.056,9.777-16.501,21.829-9.931c12.056,6.571,21.826,21.671,21.826,33.728C97.671,249.986,87.902,254.44,75.845,247.869z M136.779,342.014c-12.056-6.571-21.826-21.671-21.826-33.728s9.769-16.502,21.826-9.931c12.056,6.571,21.829,21.671,21.829,33.728C158.608,344.131,148.835,348.585,136.779,342.014z M197.716,436.158c-12.056-6.571-21.83-21.671-21.83-33.727c0-12.049,9.773-16.495,21.83-9.924c12.056,6.57,21.826,21.67,21.826,33.72C219.541,438.284,209.772,442.729,197.716,436.158z M197.716,314.292c-12.056-6.57-21.83-21.671-21.83-33.727c0-12.056,9.773-16.502,21.83-9.931c12.056,6.571,21.826,21.671,21.826,33.727C219.541,316.417,209.772,320.863,197.716,314.292z"/><path d="M473.992,133.523L265.864,258.366c-2.494,1.492-4.02,4.19-4.02,7.098V512c6.506-0.806,12.889-2.939,18.714-6.435l174.051-104.392c14.381-8.635,23.182-24.172,23.182-40.946V152.143C477.79,145.64,476.453,139.326,473.992,133.523z M321.232,262.932c12.053-6.571,21.826-2.125,21.826,9.931c0,12.049-9.773,27.149-21.826,33.72c-12.06,6.571-21.83,2.125-21.83-9.924C299.402,284.604,309.172,269.503,321.232,262.932z M321.232,448.735c-12.06,6.57-21.83,2.125-21.83-9.931s9.77-27.15,21.83-33.728c12.053-6.571,21.826-2.118,21.826,9.931C343.058,427.064,333.285,442.164,321.232,448.735z M322.536,377.663c-12.056,6.571-21.83,2.117-21.83-9.939c0-12.048,9.773-27.149,21.83-33.72c12.056-6.57,21.826-2.125,21.826,9.931S334.592,371.085,322.536,377.663z M427.32,386.403c-12.056,6.571-21.826,2.125-21.826-9.931c0-12.056,9.769-27.156,21.826-33.72c12.056-6.578,21.829-2.133,21.829,9.924C449.149,364.732,439.376,379.833,427.32,386.403z M427.32,315.332c-12.056,6.563-21.826,2.125-21.826-9.931c0-12.056,9.769-27.157,21.826-33.728c12.056-6.571,21.829-2.125,21.829,9.931C449.149,293.653,439.376,308.761,427.32,315.332z M427.32,244.253c-12.056,6.57-21.826,2.125-21.826-9.924c0-12.056,9.769-27.157,21.826-33.728c12.056-6.571,21.829-2.125,21.829,9.931C449.149,222.582,439.376,237.682,427.32,244.253z"/></g>',
        palette: '<g fill="url(#sdbAccGrad)" fill-rule="evenodd" stroke="none" transform="scale(0.048736)"><path d="M492.19,255.101c-2.954-65.279-31.045-127.694-79.098-175.748c-25.675-25.675-55.349-45.636-88.195-59.328C293.024,6.739,259.809,0.003,226.174,0.003c-61.758,0-118.927,23.158-160.978,65.208c-30.067,30.066-50.775,68.312-59.888,110.6c-8.761,40.661-6.646,84.015,6.12,125.374l42.297,9.543c17.819-19.393,43.128-30.516,69.437-30.516c51.983,0,94.274,42.292,94.274,94.275c0,25.455-9.997,49.316-28.15,67.186l11.031,41.955c21.707,5.852,43.898,8.816,65.957,8.818c0.008,0,0.006,0,0.014,0c61.742,0,118.907-23.154,160.948-65.195C472.114,382.37,495.182,321.233,492.19,255.101z M323.777,77.013c20.856,0,37.765,16.907,37.765,37.764c0,20.857-16.907,37.764-37.765,37.764c-20.856,0-37.764-16.907-37.764-37.764C286.013,93.92,302.921,77.013,323.777,77.013z M101.7,203.304c-20.856,0-37.764-16.907-37.764-37.764s16.907-37.764,37.764-37.764s37.764,16.907,37.764,37.764S122.556,203.304,101.7,203.304z M201.028,127.777c-20.856,0-37.764-16.907-37.764-37.764s16.907-37.764,37.764-37.764c20.857,0,37.764,16.907,37.764,37.764S221.884,127.777,201.028,127.777z M326.112,409.29c-29.821,0-53.996-24.175-53.996-53.997c0-29.821,24.175-53.997,53.996-53.997c29.822,0,53.997,24.176,53.997,53.997C380.109,385.115,355.933,409.29,326.112,409.29z M396.607,266.935c-20.855,0-37.764-16.906-37.764-37.763c0-20.857,16.907-37.764,37.764-37.764c20.857,0,37.765,16.907,37.765,37.764C434.372,250.028,417.464,266.935,396.607,266.935z"/></g>',
        box: '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/>',
        refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
        gear: '<g fill="url(#sdbAccGrad)" stroke="none"><path transform="scale(0.046875)" d="M502.325,307.303l-39.006-30.805c-6.215-4.908-9.665-12.429-9.668-20.348c0-0.084,0-0.168,0-0.252c-0.014-7.936,3.44-15.478,9.667-20.396l39.007-30.806c8.933-7.055,12.093-19.185,7.737-29.701l-17.134-41.366c-4.356-10.516-15.167-16.86-26.472-15.532l-49.366,5.8c-7.881,0.926-15.656-1.966-21.258-7.586c-0.059-0.06-0.118-0.119-0.177-0.178c-5.597-5.602-8.476-13.36-7.552-21.225l5.799-49.363c1.328-11.305-5.015-22.116-15.531-26.472L337.004,1.939c-10.516-4.356-22.646-1.196-29.701,7.736l-30.805,39.005c-4.908,6.215-12.43,9.665-20.349,9.668c-0.084,0-0.168,0-0.252,0c-7.935,0.014-15.477-3.44-20.395-9.667L204.697,9.675c-7.055-8.933-19.185-12.092-29.702-7.736L133.63,19.072c-10.516,4.356-16.86,15.167-15.532,26.473l5.799,49.366c0.926,7.881-1.964,15.656-7.585,21.257c-0.059,0.059-0.118,0.118-0.178,0.178c-5.602,5.598-13.36,8.477-21.226,7.552l-49.363-5.799c-11.305-1.328-22.116,5.015-26.472,15.531L1.939,174.996c-4.356,10.516-1.196,22.646,7.736,29.701l39.006,30.805c6.215,4.908,9.665,12.429,9.668,20.348c0,0.084,0,0.167,0,0.251c0.014,7.935-3.44,15.477-9.667,20.395L9.675,307.303c-8.933,7.055-12.092,19.185-7.736,29.701l17.134,41.365c4.356,10.516,15.168,16.86,26.472,15.532l49.366-5.799c7.882-0.926,15.656,1.965,21.258,7.586c0.059,0.059,0.118,0.119,0.178,0.178c5.597,5.603,8.476,13.36,7.552,21.226l-5.799,49.364c-1.328,11.305,5.015,22.116,15.532,26.472l41.366,17.134c10.516,4.356,22.646,1.196,29.701-7.736l30.804-39.005c4.908-6.215,12.43-9.665,20.348-9.669c0.084,0,0.168,0,0.251,0c7.936-0.014,15.478,3.44,20.396,9.667l30.806,39.007c7.055,8.933,19.185,12.093,29.701,7.736l41.366-17.134c10.516-4.356,16.86-15.168,15.532-26.472l-5.8-49.366c-0.926-7.881,1.965-15.656,7.586-21.257c0.059-0.059,0.119-0.119,0.178-0.178c5.602-5.597,13.36-8.476,21.225-7.552l49.364,5.799c11.305,1.328,22.117-5.015,26.472-15.531l17.134-41.365C514.418,326.488,511.258,314.358,502.325,307.303z M281.292,329.698c-39.68,16.436-85.172-2.407-101.607-42.087c-16.436-39.68,2.407-85.171,42.087-101.608c39.68-16.436,85.172,2.407,101.608,42.088C339.815,267.771,320.972,313.262,281.292,329.698z"/></g>',
        filter: '<polygon points="3 5 21 5 14 13 14 19 10 21 10 13"/>',
        list: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
        grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
        sliders: '<g fill="currentColor" stroke="none" transform="scale(0.75)"><path d="M3,8h16.1c0.4,1.7,2,3,3.9,3s3.4-1.3,3.9-3H29c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2.1c-0.4-1.7-2-3-3.9-3s-3.4,1.3-3.9,3H3C2.4,6,2,6.4,2,7S2.4,8,3,8z"/><path d="M29,15H15.9c-0.4-1.7-2-3-3.9-3s-3.4,1.3-3.9,3H3c-0.6,0-1,0.4-1,1s0.4,1,1,1h5.1c0.4,1.7,2,3,3.9,3s3.4-1.3,3.9-3H29c0.6,0,1-0.4,1-1S29.6,15,29,15z"/><path d="M29,24h-2.1c-0.4-1.7-2-3-3.9-3s-3.4,1.3-3.9,3H3c-0.6,0-1,0.4-1,1s0.4,1,1,1h16.1c0.4,1.7,2,3,3.9,3s3.4-1.3,3.9-3H29c0.6,0,1-0.4,1-1S29.6,24,29,24z"/></g>',
        updown: '<polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/>',
        stack: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/>',
        snapshot: '<path d="M22 11.5V14.6C22 16.8402 22 17.9603 21.564 18.816C21.1805 19.5686 20.5686 20.1805 19.816 20.564C18.9603 21 17.8402 21 15.6 21H8.4C6.15979 21 5.03969 21 4.18404 20.564C3.43139 20.1805 2.81947 19.5686 2.43597 18.816C2 17.9603 2 16.8402 2 14.6V9.4C2 7.15979 2 6.03969 2.43597 5.18404C2.81947 4.43139 3.43139 3.81947 4.18404 3.43597C5.03969 3 6.15979 3 8.4 3H12.5M19 8V2M16 5H22M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"/>',
        clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><rect x="9" y="2.6" width="6" height="3.4" rx="1"/>',
        copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
        download: '<path d="M6 21H18M12 3V17M12 17L17 12M12 17L7 12"/>',
        upload: '<path d="M6 21H18M12 17V3M12 3L17 8M12 3L7 8"/>',
        maximize: '<g fill="currentColor" stroke="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 5C22 3.34315 20.6569 2 19 2H5C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22H19C20.6569 22 22 20.6569 22 19V5ZM20 5C20 4.44772 19.5523 4 19 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V5Z"/></g>',
        restore: '<g fill="currentColor" stroke="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M23 4C23 2.34315 21.6569 1 20 1H8C6.34315 1 5 2.34315 5 4V5H4C2.34315 5 1 6.34315 1 8V20C1 21.6569 2.34315 23 4 23H16C17.6569 23 19 21.6569 19 20V19H20C21.6569 19 23 17.6569 23 16V4ZM19 17H20C20.5523 17 21 16.5523 21 16V4C21 3.44772 20.5523 3 20 3H8C7.44772 3 7 3.44772 7 4V5H16C17.6569 5 19 6.34315 19 8V17ZM16 7C16.5523 7 17 7.44772 17 8V20C17 20.5523 16.5523 21 16 21H4C3.44772 21 3 20.5523 3 20V8C3 7.44772 3.44772 7 4 7H16Z"/></g>',
        info: '<g fill="url(#sdbAccGrad)" stroke="none"><circle cx="12" cy="3.5" r="3.2"/><rect x="9.1" y="8.6" width="5.8" height="13.5" rx="2.9"/></g>',
        activity: '<g fill="currentColor" stroke="none" transform="scale(0.047678)"><path d="M458.091,128.116v326.842c0,26.698-21.723,48.421-48.422,48.421h-220.92c-26.699,0-48.421-21.723-48.421-48.421V242.439 c6.907,1.149,13.953,1.894,21.184,1.894c5.128,0,10.161-0.381,15.132-0.969v211.594c0,6.673,5.429,12.104,12.105,12.104h220.92 c6.674,0,12.105-5.432,12.105-12.104V128.116c0-6.676-5.432-12.105-12.105-12.105H289.835c0-12.625-1.897-24.793-5.297-36.315 h125.131C436.368,79.695,458.091,101.417,458.091,128.116z M159.49,228.401c-62.973,0-114.202-51.229-114.202-114.199 C45.289,51.229,96.517,0,159.49,0c62.971,0,114.202,51.229,114.202,114.202C273.692,177.172,222.461,228.401,159.49,228.401z M159.49,204.19c49.618,0,89.989-40.364,89.989-89.988c0-49.627-40.365-89.991-89.989-89.991 c-49.626,0-89.991,40.364-89.991,89.991C69.499,163.826,109.87,204.19,159.49,204.19z M227.981,126.308 c6.682,0,12.105-5.423,12.105-12.105s-5.423-12.105-12.105-12.105h-56.386v-47.52c0-6.682-5.423-12.105-12.105-12.105 s-12.105,5.423-12.105,12.105v59.625c0,6.682,5.423,12.105,12.105,12.105H227.981z M367.697,224.456h-131.14 c-6.682,0-12.105,5.423-12.105,12.105c0,6.683,5.423,12.105,12.105,12.105h131.14c6.685,0,12.105-5.423,12.105-12.105 C379.803,229.879,374.382,224.456,367.697,224.456z M367.91,297.885h-131.14c-6.682,0-12.105,5.42-12.105,12.105 s5.423,12.105,12.105,12.105h131.14c6.685,0,12.104-5.42,12.104-12.105S374.601,297.885,367.91,297.885z M367.91,374.353h-131.14 c-6.682,0-12.105,5.426-12.105,12.105c0,6.685,5.423,12.104,12.105,12.104h131.14c6.685,0,12.104-5.42,12.104-12.104 C380.015,379.778,374.601,374.353,367.91,374.353z"/></g>',
        arrowLeft:  '<g fill="currentColor" stroke="none"><path transform="scale(1.6)" d="M6.14645 9.85355L6.5 10.2071L7.20711 9.5L6.85355 9.14645L6.14645 9.85355ZM4.5 7.5L4.14645 7.14645L3.79289 7.5L4.14645 7.85355L4.5 7.5ZM6.85355 5.85355L7.20711 5.5L6.5 4.79289L6.14645 5.14645L6.85355 5.85355ZM6.85355 9.14645L4.85355 7.14645L4.14645 7.85355L6.14645 9.85355L6.85355 9.14645ZM4.85355 7.85355L6.85355 5.85355L6.14645 5.14645L4.14645 7.14645L4.85355 7.85355ZM4.5 8H11V7H4.5V8Z"/></g>',
        arrowRight: '<g fill="currentColor" stroke="none"><path transform="scale(1.6)" d="M8.14645 9.14645L7.79289 9.5L8.5 10.2071L8.85355 9.85355L8.14645 9.14645ZM10.5 7.5L10.8536 7.85355L11.2071 7.5L10.8536 7.14645L10.5 7.5ZM8.85355 5.14645L8.5 4.79289L7.79289 5.5L8.14645 5.85355L8.85355 5.14645ZM8.85355 9.85355L10.8536 7.85355L10.1464 7.14645L8.14645 9.14645L8.85355 9.85355ZM10.8536 7.14645L8.85355 5.14645L8.14645 5.85355L10.1464 7.85355L10.8536 7.14645ZM10.5 7H4V8H10.5V7Z"/></g>',
        plus:  '<g fill="currentColor" stroke="none"><path transform="scale(1.2)" d="M17 7v3h-5v5H9v-5H4V7h5V2h3v5h5z"/></g>',
        minus: '<g fill="currentColor" stroke="none"><path transform="scale(1.2)" d="M4 7H17V10H4Z"/></g>',
        eyeOpen: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="2.7" fill="currentColor" stroke="none"/>',
        eyeClosed: '<path d="M4 9.5c3 3.8 13 3.8 16 0"/><path d="M4.5 12 3 15"/><path d="M8.4 13.4 7.6 16.6"/><path d="M12 14 12 17.3"/><path d="M15.6 13.4 16.4 16.6"/><path d="M19.5 12 21 15"/>',
        x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    };
    const icon = (name, extra) => `<svg class="ic${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

    const TRI_CELL = '<span class="tribox">'
        + '<svg class="tglyph tri-c" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12.5 9.5 18.5 20 6"/></svg>'
        + '<svg class="tglyph tri-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
        + '</span>';
    const triRow = (id, label, title) =>
        `<button class="tri" id="${id}" data-tri="0" type="button" role="checkbox" aria-checked="mixed"${title ? ` title="${title}"` : ''}>${TRI_CELL}<span class="tlabel">${label}</span></button>`;
    const TRI_FLAGS = [
        ['inflated', 'triInflated', 'Inflated', 'Items ItemDB flags as inflated'],
        ['canEat',   'triCanEat',   'Edible',   'Items ItemDB marks as edible (card or full intent)'],
        ['canRead',  'triCanRead',  'Readable', 'Items ItemDB marks as readable (card or full intent)'],
        ['canOpen',  'triCanOpen',  'Openable', 'Items ItemDB marks as openable (card or full intent)'],
    ];
    const TRI_KEY_BY_ID = Object.fromEntries(TRI_FLAGS.map(([key, id]) => [id, key]));
    const nextTri = (v) => (v + 1) % 3;
    const triAria = (v) => v === 1 ? 'true' : v === 2 ? 'false' : 'mixed';

    const CRAWLER_GLYPH = 'M199.98 102H.02a100.017 100.017 0 003.393 24h193.174a100.028 100.028 0 003.393-24zM195.422 130H4.578a99.448 99.448 0 008.8 20h173.244a99.45 99.45 0 008.8-20zM184.181 154H15.819a100.474 100.474 0 0012.767 16h142.828a100.431 100.431 0 0012.767-16zM167.262 174H32.738a100.267 100.267 0 0019.724 14h95.076a100.289 100.289 0 0019.724-14zM139.257 192H60.743c12.052 5.15 25.322 8 39.257 8 13.935 0 27.205-2.85 39.257-8zM199.98 98H.02a99.753 99.753 0 015.553-31h188.854a99.723 99.723 0 015.553 31zM192.932 63C178.223 26.087 142.158 0 100 0S21.777 26.087 7.068 63h185.864z';
    const crawlerBadge = (gid) => `<span class="brand-badge"><svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--acc)"/><stop offset="1" stop-color="var(--acc-2)"/></linearGradient></defs><path fill="url(#${gid})" d="${CRAWLER_GLYPH}"/></svg></span>`;

    const MARKUP = `
        <div class="root" id="root">
            <svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><linearGradient id="sdbAccGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--acc)"/><stop offset="1" stop-color="var(--acc-2)"/></linearGradient></defs></svg>
            <div class="backdrop closed" id="backdrop"></div>
            <div class="launcher-dock closed" id="launcherDock">
                <button class="launcher" id="launcher" title="Open SDBCrawler (drag to move)">
                    ${crawlerBadge('sdbcrawlerBadgeLaunch')} <span class="wm">SDB<b>Crawler</b></span> <span class="count" id="launcherCount"></span>
                </button>
                <span class="launcher-sep" aria-hidden="true"></span>
                <button class="launcher launcher-info" id="btnGuide" title="User guide">${icon('info')}</button>
                <button class="launcher launcher-info" id="btnSettings" title="Settings">${icon('gear')}</button>
            </div>
            <section class="panel closed" id="panel">
                <div class="progress" id="progress"><i id="progressBar"></i></div>
                <header class="head" id="dragHandle">
                    <div class="brand">${crawlerBadge('sdbcrawlerBadgeHead')}SDB<b>Crawler</b></div>
                    <span class="pill" id="statusPill">Idle</span>
                    <div class="spacer"></div>
                    <button class="icon" id="btnInfo" title="User guide">${icon('info')}</button>
                    <button class="icon" id="btnItemdbCfg" title="Settings">${icon('gear')}</button>
                    <span class="dropdown">
                        <button class="icon" id="btnTheme" type="button" aria-haspopup="true" aria-expanded="false" title="Theme">${icon('palette')}</button>
                        <div class="popmenu closed" id="themeMenu" role="group" aria-label="Theme">
                            <div class="group-label row-label">Theme
                                <button class="dice-btn" id="btnRollTheme" type="button" title="Roll a random theme">${icon('dice')}</button>
                            </div>
                            <select class="mini" id="themeSel" title="Theme">
                                <option value="dark">Dark</option>
                                <option value="forest">Forest</option>
                                <option value="retro">Retro</option>
                                <option value="vaporwave">Vapor</option>
                            </select>
                            <button class="btn menu-item" id="themeCustomize" type="button" title="Open the full theme customizer in Settings">${icon('palette')} Customize&#x2026;</button>
                        </div>
                    </span>
                    <span class="head-sep" aria-hidden="true"></span>
                    <button class="icon" id="btnMax" title="Maximize / Restore">${icon('maximize')}</button>
                    <button class="icon" id="btnMin" title="Minimize">${icon('minus')}</button>
                </header>
                <div class="controls">
                    <button class="btn primary scanbtn" id="btnStart" title="Scan your SDB (resumes if interrupted)">${icon('play')} Start scan</button>
                    <button class="btn danger scanbtn gone" id="btnStop" title="Stop current operation">${icon('stop')} Stop</button>
                    <button class="btn" id="btnReprice" title="Refresh prices (no re-scan)">${icon('refresh')} Reprice</button>
                    <button class="btn" id="btnDeposit" title="Deposit your inventory into the SDB">${icon('box')} Deposit</button>
                </div>
                <div class="stats">
                    <div class="stat" title="Counts the current view &#xB7; filters apply"><span class="label">Unique items</span><span class="num" id="stUnique">0</span></div>
                    <div class="stat" title="Counts the current view &#xB7; filters apply"><span class="label">Total quantity</span><span class="num" id="stQty">0</span></div>
                    <div class="stat" title="Sum of value &#xD7; quantity for priced items in the current view &#xB7; NC items excluded"><span class="label">Est. value (NP)</span><span class="num accent" id="stValue">0</span></div>
                    <div class="stat" title="Counts the current view &#xB7; filters apply"><span class="label">NC items</span><span class="num" id="stNC">0</span></div>
                </div>
                <div class="toolbar">
                    <div class="search">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round">
                            <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
                        </svg>
                        <input id="search" type="text" placeholder="/ to focus" spellcheck="false" autocomplete="off">
                        <button class="clear" id="searchClear" title="Clear filter">&#x2715;</button>
                    </div>
                    <button class="btn" id="btnAdv" title="Category, NP/NC, inflated, use type, rarity, value &amp; quantity filters">${icon('filter')} Filters</button>
                    <button class="btn gone" id="btnHidden" title="Toggle hidden rows &#xB7; Shift-click: unhide all"></button>
                    <span class="dropdown">
                        <button class="btn" id="btnView" type="button" aria-haspopup="true" aria-expanded="false" title="Layout, scroll, zoom &amp; appearance">${icon('sliders')} View <span aria-hidden="true" class="caret">&#x25BE;</span></button>
                        <div class="popmenu closed" id="viewMenu" role="group" aria-label="View options">
                            <div class="group-label">Layout</div>
                            <span class="segjoin" role="group" aria-label="View mode">
                                <button class="btn" id="btnRows">${icon('list')} Rows</button>
                                <button class="btn" id="btnCards">${icon('grid')} Cards</button>
                            </span>
                            <div class="group-label">Scroll</div>
                            <span class="segjoin" role="group" aria-label="Scroll mode">
                                <button class="btn" id="btnScroll" title="Continuous virtual scroll">${icon('updown')} Scroll</button>
                                <button class="btn" id="btnPaged" title="Page-by-page view">${icon('stack')} Paged</button>
                            </span>
                            <div class="group-label">Zoom</div>
                            <select class="mini" id="gridZoomSel" title="Grid zoom (scales the data grid, not the controls)">
                                <option value="0.75">50%</option>
                                <option value="1.125">75%</option>
                                <option value="1.35">90%</option>
                                <option value="1.5">100%</option>
                                <option value="1.65">110%</option>
                                <option value="1.875">125%</option>
                                <option value="2.25">150%</option>
                            </select>
                            <div class="group-label">Appearance</div>
                            <label class="switch" title="Tint card backgrounds with the item&#x2019;s dominant colour from ItemDB &#xB7; card view only &#xB7; raises the ItemDB detail level to Full, which is where the colour comes from">
                                <input type="checkbox" id="cardColorize"${cardColorize ? ' checked' : ''}><span class="track"></span>Colored Cards
                            </label>
                            <label class="switch" title="Show the item&#x2019;s rarity on its thumbnail in card view &#xB7; the row grid keeps its Rarity column either way">
                                <input type="checkbox" id="cardRarity"${cardRarity ? ' checked' : ''}><span class="track"></span>Card Rarity
                            </label>
                            <label class="switch" title="Round large numbers in the row grid and the totals bar &#xB7; 1,234,567 becomes 1.2M, with the exact figure on hover &#xB7; cards always round">
                                <input type="checkbox" id="shortValues"${shortValues ? ' checked' : ''}><span class="track"></span>Simplify Numbers
                            </label>
                            <label class="switch" title="Show the four lookup links as the original icons instead of the DB / JN / TP / AH block">
                                <input type="checkbox" id="linkImages"${linkImages ? ' checked' : ''}><span class="track"></span>Link Images
                            </label>
                        </div>
                    </span>
                    <span class="dropdown">
                        <button class="btn" id="btnTools" type="button" aria-haspopup="true" aria-expanded="false" title="Copy, paste-to-queue &amp; snapshot tools">${icon('copy')} Tools <span aria-hidden="true" class="caret">&#x25BE;</span></button>
                        <div class="popmenu closed" id="toolsMenu" role="group" aria-label="Tools">
                            <button class="btn menu-item" id="btnCopyNames" title="Copy the current view's item names">${icon('copy')} Copy names</button>
                            <button class="btn menu-item" id="btnPaste" title="Queue multiple items from a list">${icon('clipboard')} Paste list</button>
                            <button class="btn menu-item" id="tsvCopy" title="Copy the current view as TSV (paste into a spreadsheet)">${icon('copy')} Copy as TSV</button>
                            <button class="btn menu-item" id="btnDiff" title="Historical snapshots &amp; diff against a saved snapshot">${icon('snapshot')} Snapshots</button>
                            <button class="btn menu-item" id="btnActivity" title="View past moves &amp; deposits">${icon('activity')} Activity</button>
                        </div>
                    </span>
                    <button class="btn" id="btnDownload" title="Download data">${icon('download')}</button>
                </div>
                <div class="advrow closed" id="advRow">
                    <span class="dropdown" id="catDrop">
                        <button class="btn" id="btnCat" type="button" aria-haspopup="true" aria-expanded="false"
                                title="Filter by category (include / exclude)">Category <span aria-hidden="true" class="caret">&#x25BE;</span></button>
                        <div class="popmenu closed" id="catMenu" role="group" aria-label="Category filters">
                            <div class="tri-list" id="catTriList"></div>
                            <button class="tri-reset" id="catReset" type="button">Reset categories</button>
                        </div>
                    </span>
                    <span class="dropdown" id="flagsDrop">
                        <button class="btn" id="btnFlags" type="button" aria-haspopup="true" aria-expanded="false"
                                title="Hidden, inflated &amp; use-type filters">Flags <span aria-hidden="true" class="caret">&#x25BE;</span></button>
                        <div class="popmenu closed" id="flagMenu" role="group" aria-label="Flag filters">
                            <div class="tri-list">${TRI_FLAGS.map(([, id, label, title]) => triRow(id, label, title)).join('')}</div>
                            <div class="tri-sep"></div>
                            ${triRow('hiddenOnly', 'Hidden', 'Show only rows you have hidden')}
                        </div>
                    </span>
                    <div class="ranges">
                        <label class="field">Rarity
                            <input id="rMin" class="narrow" type="number" min="0" placeholder="min" title="Minimum rarity"><span class="rsep">to</span><input id="rMax" class="narrow" type="number" min="0" placeholder="max" title="Maximum rarity">
                        </label>
                        <label class="field">Value
                            <input id="vMin" type="number" min="0" placeholder="min" title="Minimum value (NP)"><span class="rsep">to</span><input id="vMax" type="number" min="0" placeholder="max" title="Maximum value (NP)">
                        </label>
                        <label class="field">Qty
                            <input id="qMin" class="narrow" type="number" min="0" placeholder="min" title="Minimum quantity"><span class="rsep">to</span><input id="qMax" class="narrow" type="number" min="0" placeholder="max" title="Maximum quantity">
                        </label>
                    </div>
                    <div class="segset" id="ncMode" role="group" aria-label="Currency filter"
                         title="Currency &#xB7; with neither lit, everything is shown">
                        <button class="seg" data-nc="nc" title="Show only Neocash items &#xB7; click again to show everything">NC</button>
                        <button class="seg" data-nc="np" title="Show only NP items &#xB7; click again to show everything">NP</button>
                    </div>
                    <button class="btn" id="btnFilterClear" title="Clear every filter, range and toggle in this row">Reset filters</button>
                    <div class="spacer"></div>
                </div>
                <div class="qbar closed" id="qbar">
                    <span class="info" id="qbarInfo"></span>
                    <button class="qbar-list" id="btnQueueList" title="View &amp; edit the full queue">${icon('list')}</button>
                    <div class="qchips" id="qChips"></div>
                    <div class="spacer"></div>
                    <input id="pinInput" type="password" inputmode="numeric" placeholder="&#x2022;&#x2022;&#x2022;&#x2022;" maxlength="4"
                           autocomplete="one-time-code" data-lpignore="true" data-1p-ignore
                           title="PIN (if your account requires one)">
                    <button class="btn" id="btnQClear" title="Empty the queue &#xB7; nothing is moved out of your SDB">Clear queue</button>
                    <label class="field">Send to
                        <select id="moveTarget" title="Where queued items are sent when you press Move">
                            <option value="inventory">Inventory</option>
                            <option value="shop">Shop</option>
                            <option value="gallery">Gallery</option>
                        </select>
                    </label>
                    <button class="btn primary" id="btnWithdraw" title="Move every queued item out of your SDB to the selected destination">Move to inventory</button>
                </div>
                <div class="cardbar closed" id="cardBar">
                    <label class="field" for="cardSortSel">Sort by</label>
                    <select id="cardSortSel" title="Which column the cards are sorted by &#xB7; the same columns the row view&#x2019;s headings offer"></select>
                    <button class="btn dirtoggle" id="cardSortDir"></button>
                </div>
                <div class="grid-area" id="gridArea">
                    <div class="gridhead cols" id="gridHead">
                        <button class="th" data-sort="name">Item <span class="arr"></span><span class="colgrip" data-col="item" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th num" data-sort="value">Value <span class="arr"></span><span class="colgrip" data-col="value" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th num" data-sort="qty">Qty <span class="arr"></span><span class="colgrip" data-col="qty" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th num" data-sort="total">Total <span class="arr"></span><span class="colgrip" data-col="total" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th num" data-sort="rarity">Rarity <span class="arr"></span><span class="colgrip" data-col="rarity" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th ctr" data-sort="cat">Category <span class="arr"></span><span class="colgrip" data-col="cat" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <button class="th ctr" data-sort="id">ID <span class="arr"></span><span class="colgrip" data-col="id" title="Drag to resize &#xB7; double-click to reset"></span></button>
                        <span class="th">Move<span class="colgrip" data-col="move" title="Drag to resize &#xB7; double-click to reset"></span></span>
                        <span class="th ctr">Action<span class="colgrip" data-col="hide" title="Drag to resize &#xB7; double-click to reset"></span></span>
                        <span class="th">Links</span>
                    </div>
                    <div class="viewport" id="viewport">
                        <div class="vspacer" id="vspacer"></div>
                        <div class="empty" id="empty"><div><b id="emptyTitle"></b><span id="emptyBody"></span></div></div>
                    </div>
                </div>
                <div class="pagebar closed" id="pageBar">
                    <button class="btn" id="btnPrev">${icon('arrowLeft')} Prev</button>
                    <div class="pageinfo-wrap">
                        <span class="pageinfo" id="pageInfo">Page 1 / 1</span>
                        <span class="pagerange" id="pageRange" title="Which slice of the filtered list this page covers"></span>
                    </div>
                    <button class="btn" id="btnNext">Next ${icon('arrowRight')}</button>
                    <label class="field">Page
                        <input id="pageJump" type="number" min="1" style="width:42px" title="Jump to a page &#xB7; Enter to go">
                    </label>
                    <button class="btn" id="btnJump">Go</button>
                    <div class="spacer"></div>
                    <label class="field">Per page
                        <select id="pageSizeSel">
                            <option value="30">30</option>
                            <option value="60">60</option>
                            <option value="90">90</option>
                            <option value="custom">Custom</option>
                        </select>
                        <input id="pageSizeNum" type="number" min="10" max="1000" step="10" style="width:40px"
                               title="Items per page (10&#x2013;1000)">
                    </label>
                </div>
                <footer class="foot">
                    <span id="footInfo">No data yet</span>
                    <span>Shortcuts: <span class="kbd">Settings &#x25B8; Keybinds</span></span>
                </footer>
                <div class="toast" id="toast"></div>
            </section>
        </div>
    `;

    const ui = {};
    let shadowRoot = null;
    const setFieldIdle = (el, value) => {
        const s = String(value);
        if (shadowRoot.activeElement !== el && el.value !== s) el.value = s;
    };

    const BUILTIN_THEMES = [
        ['dark', 'Dark'], ['forest', 'Forest'], ['midnight', 'Midnight'],
        ['retro', 'Retro'], ['vaporwave', 'Vapor'],
    ];
    const THEME_CLASSES = BUILTIN_THEMES.filter(([v]) => v !== 'dark').map(([v]) => v);
    const THEMES = [...BUILTIN_THEMES.map(([v]) => v), 'custom'];
    const FIRST_RUN_THEME = 'dark';
    const GRID_ZOOMS = [0.75, 1.125, 1.35, 1.5, 1.65, 1.875, 2.25];

    const KEYBINDS = [
        ['togglePanel',     'Toggle main panel',      { key: '+', ctrl: false, shift: true,  alt: false }],
        ['focusSearch',     'Focus the filter box',   { key: '/', ctrl: false, shift: false, alt: false }],
        ['queueFilteredNow','Queue Filtered',         { key: '', ctrl: false, shift: false, alt: false }],
        ['moveQueue',       'Move the queue',         { key: '', ctrl: false, shift: false, alt: false }],
        ['reprice',         'Reprice',                { key: '', ctrl: false, shift: false, alt: false }],
        ['closePanel',      'Close Current Panel',    { key: '', ctrl: false, shift: false, alt: false }],
    ];
    const defaultKeybinds = () => Object.fromEntries(KEYBINDS.map(([a, , d]) => [a, { ...d }]));

    function loadKeybinds() {
        const saved = Store.get('sdb_keybinds', null);
        const binds = defaultKeybinds();
        if (saved) {
            for (const [action, b] of Object.entries(saved)) {
                if (binds[action] && b && typeof b.key === 'string') {
                    binds[action] = { key: b.key, ctrl: !!b.ctrl, shift: !!b.shift, alt: !!b.alt };
                }
            }
        }
        return binds;
    }
    let keybinds = loadKeybinds();

    const KEY_CAPS = { ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    const capText = (k) => KEY_CAPS[k] || (k.length === 1 ? k.toUpperCase() : k);
    const keyHTML = (b) => !b || !b.key ? '<span class="kb-unbound">Unbound</span>'
        : [b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', capText(b.key)]
            .filter(Boolean).map((p) => `<span class="kcap">${escHTML(p)}</span>`).join('');

    const keyMatches = (b, e) => !!b && !!b.key
        && e.key.toLowerCase() === b.key.toLowerCase()
        && e.ctrlKey === !!b.ctrl && e.shiftKey === !!b.shift && e.altKey === !!b.alt;

    const sameCombo = (a, b) => !!a.key && !!b.key
        && a.key.toLowerCase() === b.key.toLowerCase()
        && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;

    const THEME_VARS = [
        ['--bg-0', 'Panel background', '#0f1117'],
        ['--bg-1', 'Panel gradient', '#161922'],
        ['--bg-2', 'Surface', '#1b1e28'],
        ['--bg-3', 'Surface (hover)', '#232732'],
        ['--text', 'Text', '#e8eaf1'],
        ['--muted', 'Muted text', '#8b93a7'],
        ['--dim', 'Dim text', '#5b6274'],
        ['--acc', 'Accent', '#7c6cff'],
        ['--acc-2', 'Accent (secondary)', '#22d3ee'],
        ['--acc-grad-2', 'Accent gradient', '#5a8dff'],
        ['--line', 'Border', '#22252e'],
        ['--line-strong', 'Border (strong)', '#2e323d'],
        ['--input-bg', 'Input background', '#0a0c10'],
    ];
    const DEFAULT_FONT = "'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', system-ui, sans-serif";

    const FONT_CHOICES = [
        ['Modern (default)', DEFAULT_FONT],
        ['System', "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"],
        ['Verdana', 'Verdana, Arial, Helvetica, sans-serif'],
        ['Trebuchet MS', "'Trebuchet MS', 'Segoe UI', Tahoma, Verdana, sans-serif"],
        ['Serif', "Georgia, 'Times New Roman', Times, serif"],
        ['Monospace', "'JetBrains Mono', Consolas, 'SF Mono', Menlo, monospace"],
    ];

    function setFontChoice(sel, stack) {
        const spare = sel.querySelector('option[data-custom]');
        if (spare && spare.value !== stack) spare.remove();
        if (!Array.from(sel.options).some((o) => o.value === stack)) {
            const o = document.createElement('option');
            o.value = stack;
            o.textContent = 'Custom';
            o.dataset.custom = '1';
            o.style.fontFamily = stack;
            sel.append(o);
        }
        sel.value = stack;
    }
    const loadCustomTheme = () => Store.get('sdb_custom_theme', {}) || {};

    const loadThemePresets = () => {
        const list = Store.get('sdb_theme_presets', []);
        return Array.isArray(list)
            ? list.filter((p) => p && typeof p.name === 'string' && p.vars && typeof p.vars === 'object')
            : [];
    };
    const saveThemePresets = (list) => Store.set('sdb_theme_presets', list);

    const themeVarsEqual = (a, b) => {
        for (const [v, , def] of THEME_VARS) {
            if ((normHex(a[v]) || def) !== (normHex(b[v]) || def)) return false;
        }
        return (a['--font'] || DEFAULT_FONT) === (b['--font'] || DEFAULT_FONT);
    };

    const activePresetName = () => {
        if (state.theme !== 'custom') return null;
        const cur = loadCustomTheme();
        const hit = loadThemePresets().find((p) => themeVarsEqual(p.vars, cur));
        return hit ? hit.name : null;
    };

    function rebuildThemeDropdown() {
        if (!ui.themeSel) return;
        const esc = escHTML;
        const presets = loadThemePresets();
        const active = activePresetName();
        let html = BUILTIN_THEMES.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
        html += presets.map((p) => `<option value="preset:${esc(p.name)}">${esc(p.name)}</option>`).join('');
        if (state.theme === 'custom' && !active) html += '<option value="custom">Random</option>';
        ui.themeSel.innerHTML = html;
        ui.themeSel.value = state.theme !== 'custom' ? state.theme
            : (active ? `preset:${active}` : 'custom');
    }

    function writeThemePickers(vars, name) {
        const pane = shadowRoot && shadowRoot.querySelector('#paneTheme');
        if (!pane) return;
        for (const [v, , def] of THEME_VARS) {
            const hex = normHex(vars[v]) || def;
            const c = pane.querySelector(`input[data-var="${v}"]`);
            const h = pane.querySelector(`input[data-hex="${v}"]`);
            if (c) c.value = hex;
            if (h) { h.value = hex; h.classList.remove('bad'); }
        }
        const font = pane.querySelector('#tvFont');
        if (font) setFontChoice(font, vars['--font'] || DEFAULT_FONT);
        const nameEl = pane.querySelector('#tvName');
        if (nameEl && name) nameEl.value = name;
    }

    function applyThemePreset(name) {
        const p = loadThemePresets().find((x) => x.name === name);
        if (!p) { rebuildThemeDropdown(); return false; }
        Store.set('sdb_custom_theme', p.vars);
        applyTheme('custom');
        writeThemePickers(p.vars, p.name);
        rebuildThemeDropdown();
        return true;
    }

    const hslHex = (h, s, l) => {
        h = ((h % 360) + 360) % 360;
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const ch = (n) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255);
        const hx = (n) => ch(n).toString(16).padStart(2, '0');
        return `#${hx(0)}${hx(8)}${hx(4)}`;
    };

    const relLum = (hex) => {
        const ch = (i) => {
            const v = parseInt(hex.slice(i, i + 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
    };
    const contrast = (a, b) => {
        const [hi, lo] = [relLum(a), relLum(b)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
    };

    const legible = (h, s, l, bg, min) => {
        let hex = hslHex(h, s, l);
        while (l < 92 && contrast(hex, bg) < min) hex = hslHex(h, s, (l += 2));
        return hex;
    };

    function randomThemeVars() {
        const rnd = (a, b) => a + Math.random() * (b - a);
        const bgH = Math.random() * 360;
        const bgS = rnd(10, 26);
        const accH = bgH + rnd(120, 240);
        const acc2H = accH + rnd(25, 70);
        const bg0 = hslHex(bgH, bgS, rnd(6, 8));
        const bg2 = hslHex(bgH + rnd(-3, 3), bgS - 1, rnd(13, 15));
        return {
            '--bg-0':       bg0,
            '--bg-1':       hslHex(bgH + rnd(-3, 3), bgS, rnd(10, 12)),
            '--bg-2':       bg2,
            '--bg-3':       hslHex(bgH + rnd(-3, 3), bgS - 3, rnd(17, 19)),
            '--text':       hslHex(bgH, rnd(25, 36), rnd(92, 94)),
            '--muted':      legible(bgH, rnd(12, 18), rnd(60, 64), bg2, 4.5),
            '--dim':        hslHex(bgH, rnd(10, 15), rnd(39, 43)),
            '--acc':        legible(accH, rnd(75, 100), rnd(63, 72), bg0, 4.5),
            '--acc-2':      legible(acc2H, rnd(70, 92), rnd(58, 68), bg2, 4.5),
            '--acc-grad-2': hslHex(accH + rnd(-20, 20), rnd(85, 100), rnd(64, 70)),
            '--line':       hslHex(bgH, bgS - 5, rnd(14, 16)),
            '--line-strong': hslHex(bgH, bgS - 6, rnd(20, 22)),
            '--input-bg':   hslHex(bgH, bgS + 2, rnd(4, 6)),
        };
    }

    function applyCustomTheme() {
        const custom = state.theme === 'custom' ? loadCustomTheme() : {};
        for (const [v] of THEME_VARS) {
            if (custom[v]) ui.root.style.setProperty(v, custom[v]);
            else ui.root.style.removeProperty(v);
        }
        if (custom['--font']) ui.root.style.setProperty('--font', custom['--font']);
        else ui.root.style.removeProperty('--font');
    }

    function applyTheme(name) {
        if (!THEMES.includes(name)) name = 'dark';
        state.theme = name;
        for (const t of THEME_CLASSES) ui.root.classList.toggle(`t-${t}`, name === t);
        applyCustomTheme();
        Store.set('sdb_theme', name);
    }

    function rollRandomTheme() {
        const vars = randomThemeVars();
        const font = loadCustomTheme()['--font'];
        if (font) vars['--font'] = font;
        Store.set('sdb_custom_theme', vars);
        applyTheme('custom');
        rebuildThemeDropdown();
        toast('Random theme applied. Customize or save it in Settings ▸ Theme');
    }

    function applyGridZoom(z) {
        if (!GRID_ZOOMS.includes(z)) z = 1.5;
        const changed = state.gridZoom !== z;
        state.gridZoom = z;
        ui.root.style.setProperty('--zoom', z);
        Store.set('sdb_grid_zoom', z);
        if (changed && ui.vspacer) fadeSwapViewport();
        scheduleUpdate();
    }

    function mountUI() {
        const host = document.createElement('div');
        host.id = 'sdb-crawler-host';
        host.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647;';
        shadowRoot = host.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        style.textContent = CSS;
        shadowRoot.append(style);
        const tpl = document.createElement('template');
        tpl.innerHTML = MARKUP;
        shadowRoot.append(tpl.content);
        (document.body || document.documentElement).append(host);

        for (const el of shadowRoot.querySelectorAll('[id]')) ui[el.id] = el;

        applyColTemplate();

        const storedTheme = Store.get('sdb_theme', null);
        applyTheme(storedTheme === null ? FIRST_RUN_THEME : String(storedTheme));
        rebuildThemeDropdown();

        ui.root.classList.toggle('link-icons', linkImages);
        ui.root.classList.toggle('no-card-rarity', !cardRarity);

        const storedZoom = Store.get('sdb_grid_zoom', null);
        const physW = (window.screen?.width || 0) * (window.devicePixelRatio || 1);
        const defaultZoom = physW && physW < 2560 ? 1.875 : 1.5;
        applyGridZoom(parseFloat(storedZoom == null ? defaultZoom : storedZoom));
        ui.gridZoomSel.value = String(state.gridZoom);

        const num = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x : null;
        const savedF = Store.get('sdb_filters', null);
        if (savedF) {
            state.query = typeof savedF.query === 'string' ? savedF.query : '';
            state.queryMatch = compileQuery(state.query);
            state.ncMode = normNcMode(savedF.ncMode);
            state.hiddenOnly = !!savedF.hiddenOnly;
            const triVal = (v) => (v === 1 || v === 2) ? v : 0;
            state.catFilter = {};
            if (savedF.catFilter && typeof savedF.catFilter === 'object') {
                for (const c in savedF.catFilter) { const v = triVal(savedF.catFilter[c]); if (v) state.catFilter[c] = v; }
            } else if (typeof savedF.category === 'string' && savedF.category !== '__all') {
                state.catFilter[savedF.category] = 1;
            }
            const tf = savedF.triFlags;
            state.triFlags = (tf && typeof tf === 'object')
                ? { inflated: triVal(tf.inflated), canEat: triVal(tf.canEat), canRead: triVal(tf.canRead), canOpen: triVal(tf.canOpen) }
                : { inflated: savedF.inflatedOnly ? 1 : 0, canEat: savedF.canEat ? 1 : 0, canRead: savedF.canRead ? 1 : 0, canOpen: savedF.canOpen ? 1 : 0 };
            state.filters = {
                rMin: num(savedF.rMin), rMax: num(savedF.rMax), vMin: num(savedF.vMin), vMax: num(savedF.vMax),
                qMin: num(savedF.qMin), qMax: num(savedF.qMax),
            };
            if (savedF.sortCol && SORT_GETTERS[savedF.sortCol]) {
                state.sort = { col: savedF.sortCol, dir: savedF.sortDir === 1 ? 1 : -1 };
            }
            if (savedF.advOpen || state.hiddenOnly || state.ncMode !== 'all'
                || Object.keys(state.catFilter).length
                || Object.values(state.triFlags).some((v) => v)
                || Object.values(state.filters).some((v) => v != null)) {
                ui.advRow.classList.remove('closed');
            }
        } else {
            state.ncMode = normNcMode(Store.get('sdb_nc_mode', 'all'));
        }
        ui.search.value = state.query;
        ui.searchClear.classList.toggle('show', !!state.query);
        syncNcMode();
        syncTriUI();
        ui.rMin.value = state.filters.rMin ?? '';
        ui.rMax.value = state.filters.rMax ?? '';
        ui.vMin.value = state.filters.vMin ?? '';
        ui.vMax.value = state.filters.vMax ?? '';
        ui.qMin.value = state.filters.qMin ?? '';
        ui.qMax.value = state.filters.qMax ?? '';
        ui.btnAdv.classList.toggle('on', !ui.advRow.classList.contains('closed'));
        syncFlagsBtn();

        ui.cardSortSel.replaceChildren(...CARD_SORTS.map(([col, label]) => {
            const o = document.createElement('option');
            o.value = col;
            o.textContent = label;
            return o;
        }));
        refreshSortHeaders();

        const savedP = Store.get('sdb_pager', null);
        if (savedP) {
            if (savedP.mode === 'page') state.pager.mode = 'page';
            const n = Number(savedP.pageSize);
            if (Number.isFinite(n) && n >= PAGE_SIZE_MIN && n <= PAGE_SIZE_MAX) state.pager.pageSize = clampPageSize(n);
        }
        state.cardView = !!Store.get('sdb_card_view', false);
        if (state.cardView) state.pager.mode = 'page';
        syncPageSizeUI();
        updateViewModeUI();

        const size = Store.get('sdb_ui_size', null);
        if (size && size.w >= 800 && size.h >= 500) {
            ui.panel.style.width = `${size.w}px`;
            ui.panel.style.height = `${size.h}px`;
        }
        restorePanelPosition();
        setOpen(Store.get('sdb_ui_open', false), false);

        wireChrome();
        wireGrid();
        wireQueueSync();
        window.addEventListener('pagehide', () => { persistQueue(); persistColWidths(); });
    }

    function setPanelPosition(left, top) {
        ui.panel.style.left = `${Math.round(left)}px`;
        ui.panel.style.top = `${Math.round(top)}px`;
        ui.panel.classList.add('positioned');
    }

    function restorePanelPosition() {
        const pos = Store.get('sdb_ui_position', null);
        if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
        const w = ui.panel.offsetWidth || 800, h = ui.panel.offsetHeight || 500;
        setPanelPosition(
            Math.max(0, Math.min(pos.left, window.innerWidth - Math.min(w, 120))),
            Math.max(0, Math.min(pos.top, window.innerHeight - 40)),
        );
    }

    function wireDrag() {
        let dragging = false, offX = 0, offY = 0;
        ui.dragHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || maximized || maxAnimating) return;
            if (e.target.closest('button, input, select, textarea, label, a')) return;
            const r = ui.panel.getBoundingClientRect();
            setPanelPosition(r.left, r.top);
            offX = e.clientX - r.left;
            offY = e.clientY - r.top;
            dragging = true;
            ui.dragHandle.classList.add('dragging');
            ui.dragHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        ui.dragHandle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const maxL = window.innerWidth - 120;
            const maxT = window.innerHeight - 40;
            setPanelPosition(
                Math.max(0, Math.min(e.clientX - offX, maxL)),
                Math.max(0, Math.min(e.clientY - offY, maxT)),
            );
        });
        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            ui.dragHandle.classList.remove('dragging');
            Store.set('sdb_ui_position', {
                left: parseFloat(ui.panel.style.left) || 0,
                top: parseFloat(ui.panel.style.top) || 0,
            });
        };
        ui.dragHandle.addEventListener('pointerup', endDrag);
        ui.dragHandle.addEventListener('pointercancel', endDrag);
    }

    const LAUNCHER_MARGIN = 18;
    function applyLauncherCorner(corner) {
        const d = ui.launcherDock;
        if (!d) return;
        const CORNERS = new Set(['tl','tr','bl','br','tc','bc','lc','rc']);
        if (!CORNERS.has(corner)) corner = 'tc';
        d.style.left = d.style.right = d.style.top = d.style.bottom = 'auto';
        d.style.marginLeft = d.style.marginTop = '0';
        const m = `${LAUNCHER_MARGIN}px`;
        if (corner === 'tl' || corner === 'bl' || corner === 'lc') d.style.left = m;
        else if (corner === 'tr' || corner === 'br' || corner === 'rc') d.style.right = m;
        else { d.style.left = '50%'; d.style.marginLeft = `${-d.offsetWidth / 2}px`; }
        if (corner === 'tl' || corner === 'tr' || corner === 'tc') d.style.top = m;
        else if (corner === 'bl' || corner === 'br' || corner === 'bc') d.style.bottom = m;
        else { d.style.top = '50%'; d.style.marginTop = `${-d.offsetHeight / 2}px`; }
    }

    function wireLauncherDrag() {
        const dock = ui.launcherDock;
        let down = null, dragging = false;
        const onMove = (e) => {
            if (!down) return;
            if (!dragging) {
                if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
                dragging = true;
                dock.classList.add('dragging');
            }
            const w = dock.offsetWidth, h = dock.offsetHeight;
            const left = Math.max(0, Math.min(e.clientX - down.offX, window.innerWidth - w));
            const top = Math.max(0, Math.min(e.clientY - down.offY, window.innerHeight - h));
            dock.style.right = dock.style.bottom = 'auto';
            dock.style.marginLeft = dock.style.marginTop = '0';
            dock.style.left = `${left}px`;
            dock.style.top = `${top}px`;
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
            if (!down) return;
            const wasDragging = dragging;
            down = null; dragging = false;
            dock.classList.remove('dragging');
            if (!wasDragging) return;
            const r = dock.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const W = window.innerWidth, H = window.innerHeight;
            const hz = cx < W / 3 ? 'l' : cx > W * 2 / 3 ? 'r' : 'c';
            const vz = cy < H / 3 ? 't' : cy > H * 2 / 3 ? 'b' : 'c';
            let corner;
            if (hz !== 'c' && vz !== 'c') corner = vz + hz;
            else if (vz === 'c' && hz !== 'c') corner = hz + 'c';
            else if (hz === 'c' && vz !== 'c') corner = vz + 'c';
            else {
                const dl = cx, dr = W - cx, dt = cy, db = H - cy;
                const min = Math.min(dl, dr, dt, db);
                corner = min === dt ? 'tc' : min === db ? 'bc' : min === dl ? 'lc' : 'rc';
            }
            applyLauncherCorner(corner);
            Store.set('sdb_launcher_corner', corner);
            dock._suppressClick = true;
            setTimeout(() => { dock._suppressClick = false; }, 0);
        };
        dock.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const r = dock.getBoundingClientRect();
            down = { x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top };
            dragging = false;
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
        });
        dock.addEventListener('click', (e) => {
            if (dock._suppressClick) { e.stopPropagation(); e.preventDefault(); }
        }, true);
    }

    function setOpen(open, animate = true) {
        const chrome = [ui.panel, ui.launcherDock, ui.backdrop];
        if (!animate) {
            chrome.forEach((el) => el.classList.add('no-anim'));
        } else if (open && ui.panel.classList.contains('closed')) {
            void ui.panel.offsetWidth;
        }
        ui.panel.classList.toggle('closed', !open);
        ui.launcherDock.classList.toggle('closed', open);
        ui.backdrop.classList.toggle('closed', !open);
        Store.set('sdb_ui_open', open);
        if (!animate) {
            void ui.panel.offsetWidth;
            requestAnimationFrame(() => chrome.forEach((el) => el.classList.remove('no-anim')));
        }
        if (open) scheduleUpdate();
    }

    let maximized = false;
    let preMaxStyle = null;
    let maxAnimating = false;
    function toggleMaximize() {
        if (maxAnimating) return;
        const panel = ui.panel;
        const r = panel.getBoundingClientRect();
        maximized = !maximized;
        maxAnimating = true;

        const pin = (left, top, w, h) => {
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
            panel.style.width = `${w}px`;
            panel.style.height = `${h}px`;
        };

        const instant = (fn) => {
            panel.style.transition = 'none';
            fn();
            void panel.offsetWidth;
            panel.style.transition = '';
        };

        let finish;
        if (maximized) {
            preMaxStyle = {
                w: panel.style.width, h: panel.style.height,
                left: panel.style.left, top: panel.style.top,
                positioned: panel.classList.contains('positioned'),
                pxW: r.width, pxH: r.height,
            };
            instant(() => {
                panel.classList.add('positioned');
                pin(r.left, r.top, r.width, r.height);
            });
            panel.classList.add('max-anim');
            pin(0, 0, window.innerWidth, window.innerHeight);
            panel.style.borderRadius = '0px';
            ui.btnMax.innerHTML = icon('restore');
            ui.btnMax.title = 'Restore';
            finish = () => {
                panel.classList.remove('max-anim', 'positioned');
                panel.classList.add('maximized');
                panel.style.left = panel.style.top = '';
                panel.style.width = panel.style.height = '';
                panel.style.borderRadius = '';
            };
        } else {
            instant(() => {
                panel.classList.add('positioned');
                pin(0, 0, window.innerWidth, window.innerHeight);
                panel.style.borderRadius = '0px';
                panel.classList.remove('maximized');
            });
            panel.classList.add('max-anim');
            const w = parseFloat(preMaxStyle?.w) || preMaxStyle?.pxW || r.width;
            const h = parseFloat(preMaxStyle?.h) || preMaxStyle?.pxH || r.height;
            pin(
                preMaxStyle?.positioned ? (parseFloat(preMaxStyle.left) || 0) : (window.innerWidth - w) / 2,
                preMaxStyle?.positioned ? (parseFloat(preMaxStyle.top) || 0) : (window.innerHeight - h) / 2,
                w, h,
            );
            panel.style.borderRadius = '';
            ui.btnMax.innerHTML = icon('maximize');
            ui.btnMax.title = 'Maximize / Restore';
            finish = () => {
                panel.classList.remove('max-anim');
                if (preMaxStyle) {
                    panel.style.width = preMaxStyle.w;
                    panel.style.height = preMaxStyle.h;
                    panel.style.left = preMaxStyle.left;
                    panel.style.top = preMaxStyle.top;
                    panel.classList.toggle('positioned', preMaxStyle.positioned);
                }
            };
        }

        let done = false, timer = 0;
        const onEnd = (e) => { if (e.target === panel && e.propertyName === 'width') finalize(); };
        const finalize = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            panel.removeEventListener('transitionend', onEnd);
            instant(finish);
            maxAnimating = false;
            scheduleUpdate();
        };
        panel.addEventListener('transitionend', onEnd);
        timer = setTimeout(finalize, 320);
    }

    const KEYBIND_ACTIONS = {
        togglePanel: () => { setOpen(ui.panel.classList.contains('closed')); return true; },
        closePanel:  () => {
            const modal = [...ui.root.querySelectorAll('.modal')].pop();
            if (modal) { modal._close?.(); return true; }
            if (ui.panel.classList.contains('closed')) return false;
            setOpen(false);
            return true;
        },
        focusSearch: () => {
            if (ui.panel.classList.contains('closed')) setOpen(true);
            ui.search.focus();
            ui.search.select();
            return true;
        },
        moveQueue:   () => {
            if (!state.queue.size) return false;
            runWithdraw(ui.pinInput.value.trim(), MOVE_TARGETS[ui.moveTarget.value] || 'inventory');
            return true;
        },
        reprice:     () => { runReprice(); return true; },
        queueFilteredNow: () => { queueAllFilteredNow(); return true; },
    };
    const PANEL_ONLY_ACTIONS = new Set(['moveQueue', 'reprice', 'queueFilteredNow']);

    const toggleModalAction = (id, open) => {
        if (activeModal && activeModal.id === id && activeModal.overlay.isConnected) {
            activeModal.overlay._close?.();
            return;
        }
        open();
    };
    function copyViewAsTSV() {
        const rows = exportRows();
        if (!rows.length) { toast('Nothing to copy: the current view is empty', true); return; }
        GM_setClipboard(toTSV(rows), 'text');
        toast(`Copied ${nf.format(rows.length)} items as TSV`);
    }

    let openPopMenu = null;
    function positionMenu(btn, menu) {
        const r = btn.getBoundingClientRect();
        const width = menu.offsetWidth || 148;
        menu.style.top = `${r.bottom + 6}px`;
        const left = menu._alignRight ? r.right - width : r.left;
        menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    }
    function closePopMenu(menu) {
        if (!menu || menu.classList.contains('closed')) return;
        menu.classList.add('closed');
        menu._btn?.setAttribute('aria-expanded', 'false');
        if (openPopMenu === menu) openPopMenu = null;
    }
    function openPop(menu) {
        if (openPopMenu && openPopMenu !== menu) closePopMenu(openPopMenu);
        menu.classList.remove('closed');
        positionMenu(menu._btn, menu);
        menu._btn.setAttribute('aria-expanded', 'true');
        openPopMenu = menu;
    }
    function anchorMenu(btn, menu, alignRight) {
        menu._btn = btn;
        menu._alignRight = !!alignRight;
        ui.root.appendChild(menu);
        btn.addEventListener('click', () => menu.classList.contains('closed') ? openPop(menu) : closePopMenu(menu));
    }

    function flagsActive() {
        const tf = state.triFlags;
        return !!(state.hiddenOnly || tf.inflated || tf.canEat || tf.canRead || tf.canOpen);
    }
    function syncFlagsBtn() { if (ui.btnFlags) ui.btnFlags.classList.toggle('on', flagsActive()); }
    function syncCatBtn() { if (ui.btnCat) ui.btnCat.classList.toggle('on', Object.keys(state.catFilter).length > 0); }

    function syncTriUI() {
        for (const [key, id] of TRI_FLAGS) {
            const el = ui[id]; if (!el) continue;
            const v = state.triFlags[key] || 0;
            el.dataset.tri = String(v);
            el.setAttribute('aria-checked', triAria(v));
        }
        if (ui.hiddenOnly) {
            ui.hiddenOnly.dataset.tri = state.hiddenOnly ? '1' : '0';
            ui.hiddenOnly.setAttribute('aria-checked', state.hiddenOnly ? 'true' : 'false');
        }
    }

    function renderCatMenu() {
        if (!ui.catTriList) return;
        const frag = document.createDocumentFragment();
        for (const c of catsCache) {
            const b = document.createElement('button');
            b.className = 'tri';
            b.type = 'button';
            b.dataset.cat = c;
            const v = state.catFilter[c] || 0;
            b.dataset.tri = String(v);
            b.setAttribute('role', 'checkbox');
            b.setAttribute('aria-checked', triAria(v));
            b.innerHTML = TRI_CELL;
            const lab = document.createElement('span');
            lab.className = 'tlabel';
            lab.textContent = c;
            b.append(lab);
            frag.append(b);
        }
        ui.catTriList.replaceChildren(frag);
        syncCatBtn();
    }
    const CUSTOM_KEYBIND_ACTIONS = {
        startScan:     { label: 'Start scan',          run: () => ui.btnStart?.click() },
        deposit:       { label: 'Deposit inventory',   run: () => ui.btnDeposit?.click() },
        stop:          { label: 'Stop',                run: () => { if (ui.btnStop && !ui.btnStop.classList.contains('gone')) ui.btnStop.click(); } },
        toggleFilters: { label: 'Open filters',        run: () => ui.btnAdv?.click() },
        diff:          { label: 'Snapshots',           run: () => toggleModalAction('diff', () => ui.btnDiff?.click()) },
        activity:      { label: 'Activity log',        run: () => toggleModalAction('activity', () => ui.btnActivity?.click()) },
        copyView:      { label: 'Copy current view',   run: () => ui.btnCopyNames?.click() },
        pasteList:     { label: 'Paste list',          run: () => toggleModalAction('paste', () => ui.btnPaste?.click()) },
        download:      { label: 'Download menu',       run: () => toggleModalAction('download', () => ui.btnDownload?.click()) },
        rowsView:      { label: 'Rows view',           run: () => ui.btnRows?.click() },
        cardsView:     { label: 'Cards view',          run: () => ui.btnCards?.click() },
        maximize:      { label: 'Maximize / restore',  run: () => toggleMaximize() },
        settings:      { label: 'Open settings',       run: () => toggleModalAction('settings', () => ui.btnItemdbCfg?.click()) },
        queueFiltered: { label: 'Queue filtered + Review', run: () => queueAllFilteredToReview() },
        copyTsv:       { label: 'Copy view as TSV',    run: () => copyViewAsTSV() },
    };
    function loadCustomBinds() {
        const saved = Store.get('sdb_custom_keybinds', []);
        if (!Array.isArray(saved)) return [];
        return saved
            .filter((b) => b && CUSTOM_KEYBIND_ACTIONS[b.action] && typeof b.key === 'string')
            .map((b) => ({ action: b.action, key: b.key, ctrl: !!b.ctrl, shift: !!b.shift, alt: !!b.alt }));
    }
    let customBinds = loadCustomBinds();
    const saveCustomBinds = () => Store.set('sdb_custom_keybinds', customBinds);

    let kbCapturing = false;

    function isTypingTarget(e) {
        const el = e.composedPath?.()[0] || e.target;
        return !!el && (el.isContentEditable
            || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
    }

    function wireKeybinds() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (kbCapturing) return;
            const typing = isTypingTarget(e);
            const candidates = [
                ...Object.entries(keybinds).map(([action, bind]) => ({ action, bind, custom: false })),
                ...customBinds.map((bind) => ({ action: bind.action, bind, custom: true })),
            ];
            for (const { action, bind, custom } of candidates) {
                if (!keyMatches(bind, e)) continue;
                if (typing && !bind.ctrl && !bind.alt && bind.key.length === 1) return;
                if ((custom || PANEL_ONLY_ACTIONS.has(action)) && ui.panel.classList.contains('closed')) return;
                const run = custom ? CUSTOM_KEYBIND_ACTIONS[action]?.run : KEYBIND_ACTIONS[action];
                if (run?.() === false) return;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }, true);
    }

    function wireChrome() {
        const persistSize = debounce(() => {
            if (maximized) return;
            Store.set('sdb_ui_size', { w: ui.panel.offsetWidth, h: ui.panel.offsetHeight });
        }, 300);
        new ResizeObserver(() => { persistSize(); scheduleUpdate(); }).observe(ui.panel);

        ui.btnMax.addEventListener('click', toggleMaximize);
        ui.btnMin.addEventListener('click', () => setOpen(false));
        ui.launcher.addEventListener('click', () => setOpen(true));
        ui.backdrop.addEventListener('click', () => setOpen(false));
        wireDrag();
        applyLauncherCorner(Store.get('sdb_launcher_corner', 'tc'));
        wireLauncherDrag();
        wireKeybinds();

        ui.themeSel.addEventListener('change', () => {
            const v = ui.themeSel.value;
            if (v.startsWith('preset:')) {
                const name = v.slice(7);
                if (applyThemePreset(name)) toast(`Theme "${name}" applied`);
                return;
            }
            applyTheme(v);
            rebuildThemeDropdown();
        });
        ui.gridZoomSel.addEventListener('change', () => applyGridZoom(parseFloat(ui.gridZoomSel.value)));
        ui.btnRollTheme.addEventListener('click', rollRandomTheme);
        ui.themeCustomize.addEventListener('click', () => { closePopMenu(ui.themeMenu); openSettings('paneTheme'); });

        ui.cardColorize.addEventListener('change', (e) => {
            cardColorize = e.target.checked;
            Store.set('sdb_card_colorize', cardColorize);
            if (cardColorize && itemdbCfg.intent !== 'full') {
                itemdbCfg.intent = 'full';
                saveItemdbCfg();
                const sel = shadowRoot.querySelector('#idbIntent');
                if (sel) sel.value = 'full';
                toast('Colored Cards on, scan to fetch colours');
            }
            scheduleUpdate();
        });
        ui.cardRarity.addEventListener('change', (e) => {
            cardRarity = e.target.checked;
            Store.set('sdb_card_rarity', cardRarity);
            ui.root.classList.toggle('no-card-rarity', !cardRarity);
        });
        ui.shortValues.addEventListener('change', (e) => {
            shortValues = e.target.checked;
            Store.set('sdb_short_values', shortValues);
            refreshColMins();
            scheduleUpdate();
        });
        ui.linkImages.addEventListener('change', (e) => {
            linkImages = e.target.checked;
            Store.set('sdb_link_images', linkImages);
            ui.root.classList.toggle('link-icons', linkImages);
        });

        ui.btnItemdbCfg.addEventListener('click', () => openSettings());
        ui.btnPaste.addEventListener('click', openPasteList);
        ui.btnGuide.addEventListener('click', openGuide);
        ui.btnInfo.addEventListener('click', openGuide);
        ui.btnSettings.addEventListener('click', () => openSettings());

        ui.btnCopyNames.addEventListener('click', () => {
            if (!state.view.length) { toast('Nothing to copy: the current view is empty', true); return; }
            GM_setClipboard(state.view.map((it) => it.name).join('\n'), 'text');
            toast(`Copy Currently Filtered: ${nf.format(state.view.length)}`);
        });
        ui.btnDiff.addEventListener('click', openSnapshots);
        ui.btnActivity.addEventListener('click', openHistory);

        const jumpToPage = () => {
            const n = parseInt(ui.pageJump.value, 10);
            if (!Number.isFinite(n)) { ui.pageJump.value = String(state.pager.page); return; }
            state.pager.page = Math.max(1, Math.min(n, pageCount()));
            ui.viewport.scrollTop = 0;
            scheduleUpdate();
        };
        ui.btnJump.addEventListener('click', jumpToPage);
        ui.pageJump.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); jumpToPage(); }
        });

        ui.btnStart.addEventListener('click', () => {
            runCrawl({ minDelay: scanCfg.minDelay, maxDelay: scanCfg.maxDelay, useItemdb: fetchItemdb });
        });
        ui.btnReprice.addEventListener('click', runReprice);
        ui.btnStop.addEventListener('click', () => {
            if (state.crawling || state.withdrawing || state.depositing) { state.stopRequested = true; setStatus('Stopping…'); }
        });

        ui.btnDeposit.addEventListener('click', () => depositAllInventory());

        ui.btnQClear.addEventListener('click', () => {
            state.queue.clear();
            saveQueue();
            scheduleLight();
        });
        const syncMoveTarget = () => {
            const t = MOVE_TARGETS[ui.moveTarget.value] || 'inventory';
            ui.btnWithdraw.textContent = `Move to ${targetLabel(t)}`;
            return t;
        };
        ui.moveTarget.value = Store.get('sdb_move_target', 'inventory');
        syncMoveTarget();
        ui.moveTarget.addEventListener('change', () => {
            Store.set('sdb_move_target', syncMoveTarget());
        });
        ui.pinInput.addEventListener('input', () => {
            const digits = ui.pinInput.value.replace(/\D/g, '');
            if (digits !== ui.pinInput.value) ui.pinInput.value = digits;
        });
        ui.btnWithdraw.addEventListener('click',
            () => runWithdraw(ui.pinInput.value.trim(), syncMoveTarget()));
        ui.btnQueueList.addEventListener('click', openQueueReview);

        ui.btnAdv.addEventListener('click', () => {
            ui.advRow.classList.toggle('closed');
            ui.btnAdv.classList.toggle('on');
            saveFilters();
        });

        anchorMenu(ui.btnCat, ui.catMenu);
        anchorMenu(ui.btnFlags, ui.flagMenu);
        anchorMenu(ui.btnView, ui.viewMenu);
        anchorMenu(ui.btnTools, ui.toolsMenu);
        anchorMenu(ui.btnTheme, ui.themeMenu, true);
        ui.tsvCopy.addEventListener('click', copyViewAsTSV);
        ui.toolsMenu.addEventListener('click', (e) => { if (e.target.closest('button')) closePopMenu(ui.toolsMenu); });
        shadowRoot.addEventListener('mousedown', (e) => {
            if (!openPopMenu) return;
            const path = e.composedPath ? e.composedPath() : [e.target];
            if (!path.includes(openPopMenu) && !path.includes(openPopMenu._btn)) closePopMenu(openPopMenu);
        });
        shadowRoot.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPopMenu) closePopMenu(openPopMenu); });
        window.addEventListener('resize', () => closePopMenu(openPopMenu));

        const applyFilterRange = debounce(() => {
            const rMin = ui.rMin.value !== '' ? Number(ui.rMin.value) : null;
            const rMax = ui.rMax.value !== '' ? Number(ui.rMax.value) : null;
            const vMin = ui.vMin.value !== '' ? Number(ui.vMin.value) : null;
            const vMax = ui.vMax.value !== '' ? Number(ui.vMax.value) : null;
            const qMin = ui.qMin.value !== '' ? Number(ui.qMin.value) : null;
            const qMax = ui.qMax.value !== '' ? Number(ui.qMax.value) : null;
            Object.assign(state.filters, { rMin, rMax, vMin, vMax, qMin, qMax });
            viewChanged();
        }, 300);
        [ui.rMin, ui.rMax, ui.vMin, ui.vMax, ui.qMin, ui.qMax].forEach(input => {
            input.addEventListener('input', applyFilterRange);
        });

        ui.flagMenu.addEventListener('click', (e) => {
            const t = e.target.closest('.tri'); if (!t) return;
            if (t.id === 'hiddenOnly') {
                state.hiddenOnly = !state.hiddenOnly;
                t.dataset.tri = state.hiddenOnly ? '1' : '0';
                t.setAttribute('aria-checked', state.hiddenOnly ? 'true' : 'false');
                syncFlagsBtn();
                viewChanged({ swap: false });
                return;
            }
            const key = TRI_KEY_BY_ID[t.id]; if (!key) return;
            const v = nextTri(state.triFlags[key] || 0);
            state.triFlags[key] = v;
            t.dataset.tri = String(v);
            t.setAttribute('aria-checked', triAria(v));
            syncFlagsBtn();
            viewChanged({ swap: false });
        });

        ui.catTriList.addEventListener('click', (e) => {
            const t = e.target.closest('.tri'); if (!t) return;
            const c = t.dataset.cat;
            const v = nextTri(state.catFilter[c] || 0);
            if (v) state.catFilter[c] = v; else delete state.catFilter[c];
            t.dataset.tri = String(v);
            t.setAttribute('aria-checked', triAria(v));
            syncCatBtn();
            viewChanged({ swap: false });
        });
        ui.catReset.addEventListener('click', () => {
            state.catFilter = {};
            for (const t of ui.catTriList.querySelectorAll('.tri')) { t.dataset.tri = '0'; t.setAttribute('aria-checked', 'mixed'); }
            syncCatBtn();
            viewChanged({ swap: false });
        });

        ui.btnFilterClear.addEventListener('click', () => {
            ui.rMin.value = ''; ui.rMax.value = ''; ui.vMin.value = ''; ui.vMax.value = '';
            ui.qMin.value = ''; ui.qMax.value = '';
            state.filters = { rMin: null, rMax: null, vMin: null, vMax: null, qMin: null, qMax: null };
            state.triFlags = { inflated: 0, canEat: 0, canRead: 0, canOpen: 0 };
            state.hiddenOnly = false;
            syncTriUI();
            syncFlagsBtn();
            state.ncMode = 'all';
            Store.set('sdb_nc_mode', 'all');
            syncNcMode();
            state.catFilter = {};
            for (const t of ui.catTriList.querySelectorAll('.tri')) { t.dataset.tri = '0'; t.setAttribute('aria-checked', 'mixed'); }
            syncCatBtn();
            if (ui.search.value) {
                ui.search.value = '';
                state.query = '';
                state.queryMatch = null;
                ui.searchClear.classList.remove('show');
            }
            viewChanged({ swap: false });
        });

        const setPagerMode = (mode) => {
            if (state.cardView || state.pager.mode === mode) return;
            state.pager.mode = mode;
            state.pager.page = 1;
            savePager();
            updateViewModeUI();
            fadeSwapViewport();
            ui.viewport.scrollTop = 0;
            scheduleUpdate();
        };
        ui.btnScroll.addEventListener('click', () => setPagerMode('virtual'));
        ui.btnPaged.addEventListener('click', () => setPagerMode('page'));

        const setCardView = (on) => {
            if (state.cardView === on) return;
            state.cardView = on;
            Store.set('sdb_card_view', state.cardView);
            if (!on && ui.cardGrid) { ui.cardGrid.replaceChildren(); cardByKey.clear(); }
            if (state.cardView) state.pager.mode = 'page';
            state.pager.page = 1;
            savePager();
            updateViewModeUI();
            fadeSwapViewport();
            ui.viewport.scrollTop = 0;
            scheduleUpdate();
        };
        ui.btnRows.addEventListener('click', () => setCardView(false));
        ui.btnCards.addEventListener('click', () => setCardView(true));

        ui.btnHidden.addEventListener('click', (e) => {
            if (e.shiftKey) {
                const n = hiddenKeys.size;
                hiddenKeys.clear();
                showHidden = false;
                saveHidden();
                if (n) toast(`Unhid ${nf.format(n)} row${n === 1 ? '' : 's'}`);
            } else {
                showHidden = !showHidden;
            }
            fadeSwapViewport();
            scheduleUpdate();
        });

        ui.btnPrev.addEventListener('click', () => {
            if (state.pager.page > 1) {
                state.pager.page--;
                fadeSwapViewport();
                smoothScrollTop();
                scheduleUpdate();
            }
        });
        ui.btnNext.addEventListener('click', () => {
            const pc = pageCount();
            if (state.pager.page < pc) {
                state.pager.page++;
                fadeSwapViewport();
                smoothScrollTop();
                scheduleUpdate();
            }
        });
        const applyPageSize = (n) => {
            state.pager.pageSize = clampPageSize(n);
            state.pager.page = 1;
            syncPageSizeUI();
            savePager();
            fadeSwapViewport();
            ui.viewport.scrollTop = 0;
            scheduleUpdate();
        };
        ui.pageSizeSel.addEventListener('change', () => {
            syncPageSizeNumVis();
            if (ui.pageSizeSel.value === 'custom') { ui.pageSizeNum.focus(); ui.pageSizeNum.select(); return; }
            applyPageSize(Number(ui.pageSizeSel.value));
        });
        const commitPageSizeNum = () => {
            const n = parseInt(ui.pageSizeNum.value, 10);
            if (Number.isFinite(n)) applyPageSize(n);
            else syncPageSizeUI();
        };
        ui.pageSizeNum.addEventListener('change', commitPageSizeNum);
        ui.pageSizeNum.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitPageSizeNum(); }
        });

        ui.btnDownload.addEventListener('click', openDownload);
    }

    function setStatus(text, kind = '') {
        ui.statusPill.textContent = text;
        ui.statusPill.className = `pill${kind ? ` ${kind}` : ''}`;
    }

    function setProgress(frac) {
        if (frac == null) { ui.progress.classList.remove('on'); return; }
        ui.progress.classList.add('on');
        ui.progressBar.style.width = `${Math.min(100, Math.max(0, frac * 100)).toFixed(1)}%`;
    }

    let toastTimer = 0;
    function toast(text, isErr = false) {
        ui.toast.textContent = text;
        ui.toast.className = `toast show${isErr ? ' err' : ''}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
    }

    let activeModal = null;
    function openModal(html, cardClass = '', { closeOnBackdrop = true, id = '' } = {}) {
        if (activeModal && activeModal.overlay.isConnected) activeModal.overlay._close?.();
        const overlay = document.createElement('div');
        overlay.className = 'modal';
        overlay.innerHTML = `<div class="modal-card ${cardClass}">${html}</div>`;
        (ui.root || shadowRoot).append(overlay);
        requestAnimationFrame(() => overlay.classList.add('modal-in'));
        const close = () => {
            if (activeModal && activeModal.overlay === overlay) activeModal = null;
            overlay.classList.remove('modal-in');
            setTimeout(() => overlay.remove(), 200);
        };
        overlay._close = close;
        if (closeOnBackdrop) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        activeModal = { overlay, id };
        return { overlay, close };
    }

    function openSettings(startPane = 'paneGeneral') {
        const custom = loadCustomTheme();
        const esc = escHTML;
        const { overlay, close } = openModal(`
            <div class="modal-head">Settings</div>
            <div class="tabs">
                <button class="tab" data-pane="paneGeneral">General</button>
                <button class="tab" data-pane="paneKeys">Keybinds</button>
                <button class="tab" data-pane="paneTheme">Theme</button>
                <button class="tab" data-pane="paneItemdb">ItemDB</button>
            </div>
            <div class="tabpane" id="paneItemdb">
                <label class="switch" title="Price items from ItemDB in batches as the scan runs">
                    <input type="checkbox" id="idbEnabled"${fetchItemdb ? ' checked' : ''}><span class="track"></span>ItemDB prices
                </label>
                <label class="modal-row">Detail level
                    <select id="idbIntent">${INTENT_LABELS.map(([v, label]) =>
                        `<option value="${v}"${v === itemdbCfg.intent ? ' selected' : ''}>${label}</option>`
                    ).join('')}</select>
                </label>
                <label class="modal-row">Cache Expiry
                    <input id="idbCacheDays" class="no-spin" type="number" min="1" max="30" step="1" value="${itemdbCfg.cacheDays}"
                           title="How long a scan reuses cached prices before dropping the cache and refetching &#xB7; 1&#x2013;30 days &#xB7; Reprice always fetches fresh">&nbsp;days
                </label>
                <label class="modal-row">Chunk size
                    <input id="idbChunk" class="no-spin" type="number" min="50" step="50" value="${itemdbCfg.chunk}">
                </label>
                <label class="modal-row">ItemDB delay (ms)
                    <input id="idbMin" class="no-spin" type="number" min="0" step="50" value="${itemdbCfg.minDelay}">&#x2013;
                    <input id="idbMax" class="no-spin" type="number" min="0" step="50" value="${itemdbCfg.maxDelay}">
                </label>
                <label class="modal-row">Scan delay (ms)
                    <input id="scanMin" class="no-spin" type="number" min="0" step="50" value="${scanCfg.minDelay}">&#x2013;
                    <input id="scanMax" class="no-spin" type="number" min="0" step="50" value="${scanCfg.maxDelay}">
                </label>
                <div class="modal-hint">
                    <b>Full</b>: prices + colours + descriptions + use types (default)<br>
                    <b>Pricer</b>: prices + inflation flags<br>
                    <b>Minimal</b>: smallest responses<br>
                    Raising detail = re-fetches; lowering = keeps existing data<br>
                    <b>&#x21BB; Reprice</b> always uses Pricer<br>
                    <b>Cache Expiry</b>: how long to reuse cached prices
                </div>
                <div class="modal-hint"><b>Scan delay</b> is the pause between SDB pages, <b>ItemDB delay</b> the pause between pricing batches. Bigger chunks and shorter delays are faster but risk rate-limiting.</div>
            </div>
            <div class="tabpane" id="paneKeys">
                <div class="modal-hint">Click a shortcut, then press the keys you want. Escape cancels.</div>
                ${KEYBINDS.map(([action, label]) => `
                    <div class="kb-row">
                        <span>${label}</span>
                        <button class="kb-key" data-action="${action}">${keyHTML(keybinds[action])}</button>
                        <span class="kb-x-slot"></span>
                    </div>`).join('')}
                <div class="kb-clist" id="ckList"></div>
                <div class="kb-custom">
                    <div class="modal-hint">Add your own shortcut for another toolbar action. Pick one and press <b>Add</b>, then click its key box to set the keys. Custom shortcuts only fire while the panel is open.</div>
                    <div class="kb-row">
                        <select id="ckAction" style="flex:1; width:auto" title="Action to bind a shortcut to"></select>
                        <button class="btn" id="ckAdd" title="Add a custom shortcut for the selected action">Add</button>
                    </div>
                </div>
            </div>
            <div class="tabpane" id="paneTheme">
                <label class="modal-row">Saved themes
                    <select id="tvPresetSel" title="Load one of your saved themes"></select>
                </label>
                <div class="tv-presets" id="tvList"></div>
                <div class="modal-row">Theme name
                    <input id="tvName" type="text" style="flex:1; width:auto" placeholder="My theme"
                           title="Name to save the palette below under &#xB7; reusing a name overwrites that preset">
                    <button class="btn" id="tvSave" title="Save the palette below under this name">Save</button>
                </div>
                ${THEME_VARS.map(([v, label, def]) => `
                    <label class="tv-row">
                        <span>${label}</span>
                        <input type="text" class="tv-hex" data-hex="${v}" maxlength="7" spellcheck="false"
                               autocomplete="off" value="${esc(custom[v] || def)}" title="Hex for ${v}">
                        <input type="color" data-var="${v}" value="${esc(custom[v] || def)}" title="${v}">
                    </label>`).join('')}
                <label class="modal-row">Font
                    <select id="tvFont" style="flex:1; width:auto"
                            title="Typeface for the whole panel &#xB7; each option is shown in its own font">
                        ${FONT_CHOICES.map(([label, stack]) =>
                            `<option value="${esc(stack)}" style="font-family: ${esc(stack)}">${esc(label)}</option>`
                        ).join('')}
                    </select>
                </label>
            </div>
            <div class="tabpane" id="paneGeneral">
                <div class="modal-subhead">Manage Data</div>
                <div class="modal-hint">Save a full backup of your box, prices and settings, or restore one. Import replaces matching data and reloads the page. Your Neopets SDB itself is never touched.</div>
                <div class="io-group">
                    <button class="btn" id="dataExport" title="Download a full copy of everything SDBCrawler has stored: box, prices and every setting">${icon('download')} Export a Backup</button>
                    <button class="btn" id="dataImport" title="Load a backup .json straight into storage. Pick a file or drop one below">${icon('upload')} Import Backup</button>
                </div>
                <div class="io-drop" id="dataDrop">Drop a backup <b>.json</b> here, or use <b>Import Backup</b>
                    <input type="file" id="dataFile" accept="application/json,.json" hidden>
                </div>
                <label class="switch io-lz" title="ON: exports are compact LZ-compressed blobs. OFF: exports are plain, human-readable JSON. Imports auto-detect either way.">
                    <input type="checkbox" id="backupUseLz"${backupUseLz ? ' checked' : ''}><span class="track"></span>Use LZ-String Compression (saves space for large boxes)
                </label>

                <div class="modal-row-block">
                    <div class="modal-hint">Clears prices only, keeps other data. <b>&#x21BB; Reprice</b> fills them back in.</div>
                    <div class="modal-actions"><button class="btn" id="btnClearPrices">Clear price data</button></div>
                </div>
                <div class="danger-box">
                    <div class="modal-head">WARNING</div>
                    <div class="modal-hint">This will permanently delete ALL stored data for SDBCrawler:
                        snapshots, queues, filters, settings, hidden rows, column widths, and every
                        custom or saved theme.
                        </div>
                    <div class="modal-actions"><button class="btn danger-btn" id="btnResetAll">Reset All Data</button></div>
                </div>
            </div>
            <div class="modal-actions">
                <span class="ma-group gone" id="idbActions">
                    <button class="btn" id="idbSave" title="Save the detail level, chunk size and both delays">Save</button>
                </span>
                <span class="ma-group gone" id="keysActions">
                    <button class="btn" id="kbReset" title="Put every shortcut back to the default keys">Restore defaults</button>
                </span>
                <span class="ma-group gone" id="themeActions">
                    <button class="btn" id="tvRandom" title="Roll a random palette · applies straight away, click again to reroll">${icon('dice')}</button>
                    <button class="btn" id="tvReset" title="Discard the custom palette and go back to the Dark preset">Reset to default</button>
                    <button class="btn primary" id="tvApply" title="Put the palette above on screen &#xB7; save it under a name to keep it in the theme selector">Apply</button>
                </span>
                <button class="btn primary" id="setClose">Close</button>
            </div>`, 'settings', { id: 'settings' });

        overlay.querySelector('#setClose').addEventListener('click', close);

        const paneActions = [['#idbActions', 'paneItemdb'], ['#keysActions', 'paneKeys'],
                             ['#themeActions', 'paneTheme']]
            .map(([sel, pane]) => [overlay.querySelector(sel), pane]);
        const showPane = (id) => {
            for (const t of overlay.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.pane === id);
            for (const p of overlay.querySelectorAll('.tabpane')) p.classList.toggle('on', p.id === id);
            for (const [group, pane] of paneActions) group.classList.toggle('gone', id !== pane);
        };
        overlay.querySelector('.tabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.tab');
            if (tab) showPane(tab.dataset.pane);
        });
        showPane(startPane);

        overlay.querySelector('#idbEnabled').addEventListener('change', (e) => {
            fetchItemdb = e.target.checked;
            Store.set('sdb_fetch_itemdb', fetchItemdb);
        });

        const num = (id, min, fallback) => {
            const n = parseInt(overlay.querySelector(id).value, 10);
            return Math.max(min, Number.isFinite(n) ? n : fallback);
        };
        overlay.querySelector('#idbSave').addEventListener('click', () => {
            itemdbCfg.chunk = num('#idbChunk', 50, CFG.itemdbChunk);
            itemdbCfg.minDelay = num('#idbMin', 0, 0);
            itemdbCfg.maxDelay = Math.max(itemdbCfg.minDelay, num('#idbMax', 0, 0));
            const intent = overlay.querySelector('#idbIntent').value;
            if (ITEMDB_INTENTS.includes(intent)) itemdbCfg.intent = intent;
            itemdbCfg.cacheDays = Math.max(1, Math.min(30, num('#idbCacheDays', 1, CFG.cacheDays)));
            overlay.querySelector('#idbCacheDays').value = itemdbCfg.cacheDays;
            saveItemdbCfg();
            scanCfg.minDelay = num('#scanMin', 0, CFG.pageDelay[0]);
            scanCfg.maxDelay = Math.max(scanCfg.minDelay, num('#scanMax', 0, CFG.pageDelay[1]));
            saveScanCfg();
            toast(`ItemDB: ${itemdbCfg.intent} · ${itemdbCfg.chunk}/chunk · cache ${itemdbCfg.cacheDays}d · `
                + `${itemdbCfg.minDelay}–${itemdbCfg.maxDelay}ms · scan ${scanCfg.minDelay}–${scanCfg.maxDelay}ms`);
        });

        let capturing = null;
        const stopCapture = () => {
            capturing?.classList.remove('listening');
            capturing = null;
            kbCapturing = false;
        };
        overlay.addEventListener('click', (e) => {
            const btn = e.target.closest('.kb-key');
            if (!btn) return;
            stopCapture();
            capturing = btn;
            kbCapturing = true;
            btn.classList.add('listening');
            btn.textContent = 'Press keys…';
        });
        overlay.addEventListener('keydown', (e) => {
            if (!capturing) return;
            e.preventDefault();
            e.stopPropagation();
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
            const action = capturing.dataset.action;
            const custom = capturing.dataset.custom === '1';
            const cur = custom ? customBinds.find((b) => b.action === action) : keybinds[action];
            if (!cur) { stopCapture(); return; }
            if (e.key !== 'Escape' || cur.key === 'Escape') {
                cur.key = e.key; cur.ctrl = e.ctrlKey; cur.shift = e.shiftKey; cur.alt = e.altKey;
                for (const b of [...Object.values(keybinds), ...customBinds]) {
                    if (b !== cur && sameCombo(b, cur)) b.key = '';
                }
                Store.set('sdb_keybinds', keybinds);
                saveCustomBinds();
                for (const btn of overlay.querySelectorAll('.kb-key')) {
                    if (!btn.dataset.custom) btn.innerHTML = keyHTML(keybinds[btn.dataset.action]);
                }
                renderCkList();
                stopCapture();
                return;
            }
            capturing.innerHTML = keyHTML(cur);
            stopCapture();
        }, true);
        overlay.querySelector('#kbReset').addEventListener('click', () => {
            keybinds = defaultKeybinds();
            Store.set('sdb_keybinds', keybinds);
            for (const btn of overlay.querySelectorAll('.kb-key')) {
                if (btn.dataset.custom) continue;
                btn.innerHTML = keyHTML(keybinds[btn.dataset.action]);
            }
            toast('Keybinds restored to defaults');
        });

        const ckAction = overlay.querySelector('#ckAction');
        const ckList = overlay.querySelector('#ckList');
        const renderCkOptions = () => {
            const avail = Object.entries(CUSTOM_KEYBIND_ACTIONS)
                .filter(([a]) => !customBinds.some((b) => b.action === a));
            ckAction.innerHTML = avail.length
                ? avail.map(([a, m]) => `<option value="${a}">${esc(m.label)}</option>`).join('')
                : '<option value="">Every action added</option>';
            ckAction.disabled = !avail.length;
            overlay.querySelector('#ckAdd').disabled = !avail.length;
        };
        const renderCkList = () => {
            ckList.innerHTML = customBinds.length
                ? customBinds.map((b) => `
                    <div class="kb-row">
                        <span>${esc(CUSTOM_KEYBIND_ACTIONS[b.action]?.label || b.action)}</span>
                        <button class="kb-key" data-action="${b.action}" data-custom="1">${keyHTML(b)}</button>
                        <button class="tv-x" data-ckdel="${b.action}" title="Remove this shortcut">&#x2715;</button>
                    </div>`).join('')
                : '<div class="tv-none">No custom shortcuts yet.</div>';
        };
        renderCkOptions();
        renderCkList();
        overlay.querySelector('#ckAdd').addEventListener('click', () => {
            const a = ckAction.value;
            if (!a || !CUSTOM_KEYBIND_ACTIONS[a] || customBinds.some((b) => b.action === a)) return;
            customBinds.push({ action: a, key: '', ctrl: false, shift: false, alt: false });
            saveCustomBinds();
            renderCkOptions();
            renderCkList();
        });
        ckList.addEventListener('click', (e) => {
            const del = e.target.closest('[data-ckdel]');
            if (!del) return;
            if (capturing) stopCapture();
            const i = customBinds.findIndex((b) => b.action === del.dataset.ckdel);
            if (i < 0) return;
            customBinds.splice(i, 1);
            saveCustomBinds();
            renderCkOptions();
            renderCkList();
        });

        overlay.querySelector('#backupUseLz').addEventListener('change', (e) => {
            backupUseLz = e.target.checked;
            Store.set(BACKUP_USE_LZ, backupUseLz);
            toast(backupUseLz ? 'Compression ON: exports will be compact.' : 'Compression OFF: exports will be human-readable.');
        });

        const themePane = overlay.querySelector('#paneTheme');
        setFontChoice(themePane.querySelector('#tvFont'), custom['--font'] || DEFAULT_FONT);
        const colorInput = (v) => themePane.querySelector(`input[data-var="${v}"]`);
        const hexInput = (v) => themePane.querySelector(`input[data-hex="${v}"]`);

        const readPickers = () => {
            const vars = {};
            for (const input of themePane.querySelectorAll('input[data-var]')) vars[input.dataset.var] = input.value;
            const font = themePane.querySelector('#tvFont').value.trim();
            if (font) vars['--font'] = font;
            return vars;
        };
        const writePickers = (vars) => writeThemePickers(vars);
        const previewCustom = (vars) => {
            Store.set('sdb_custom_theme', vars);
            applyTheme('custom');
            rebuildThemeDropdown();
        };

        themePane.addEventListener('input', (e) => {
            const el = e.target;
            if (el.dataset.var) {
                const h = hexInput(el.dataset.var);
                if (h) { h.value = el.value; h.classList.remove('bad'); }
            } else if (el.dataset.hex) {
                const norm = normHex(el.value);
                el.classList.toggle('bad', !norm);
                if (norm) colorInput(el.dataset.hex).value = norm;
            }
        });
        themePane.addEventListener('change', (e) => {
            const el = e.target;
            if (!el.dataset.hex) return;
            el.value = normHex(el.value) || colorInput(el.dataset.hex).value;
            el.classList.remove('bad');
        });

        const presetSel = themePane.querySelector('#tvPresetSel');
        const presetList = themePane.querySelector('#tvList');
        const renderPresets = () => {
            const presets = loadThemePresets();
            presetSel.innerHTML = '<option value="">Choose a preset&#8230;</option>'
                + presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
            presetSel.value = '';
            presetList.innerHTML = presets.length
                ? presets.map((p, i) => {
                    const bg = normHex(p.vars['--bg-0']) || '#0f1117';
                    const acc = normHex(p.vars['--acc']) || '#7c6cff';
                    return `<div class="tv-preset">
                        <i class="tv-swatch" style="background: linear-gradient(90deg, ${bg} 50%, ${acc} 50%)"></i>
                        <span title="${esc(p.name)}">${esc(p.name)}</span>
                        <button class="tv-x" data-del="${i}" title="Delete this preset">&#x2715;</button>
                    </div>`;
                }).join('')
                : '<div class="tv-none">No saved themes yet. Set your colours, name them, then press Save.</div>';
        };
        renderPresets();

        themePane.querySelector('#tvSave').addEventListener('click', () => {
            const nameEl = themePane.querySelector('#tvName');
            const name = nameEl.value.trim();
            if (!name) { toast('Give the theme a name first', true); nameEl.focus(); return; }
            const presets = loadThemePresets();
            const at = presets.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
            if (at >= 0) presets[at] = { name, vars: readPickers() };
            else presets.push({ name, vars: readPickers() });
            saveThemePresets(presets);
            renderPresets();
            rebuildThemeDropdown();
            toast(`Theme "${name}" ${at >= 0 ? 'updated' : 'saved'}`);
        });

        presetSel.addEventListener('change', () => {
            if (!presetSel.value) return;
            const p = loadThemePresets()[Number(presetSel.value)];
            if (!p) return;
            themePane.querySelector('#tvName').value = p.name;
            writePickers(p.vars);
            previewCustom(readPickers());
            toast(`Theme "${p.name}" applied`);
        });

        presetList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-del]');
            if (!btn) return;
            const presets = loadThemePresets();
            const [gone] = presets.splice(Number(btn.dataset.del), 1);
            if (!gone) return;
            saveThemePresets(presets);
            renderPresets();
            rebuildThemeDropdown();
            toast(`Theme "${gone.name}" deleted`);
        });

        overlay.querySelector('#tvApply').addEventListener('click', () => {
            previewCustom(readPickers());
            toast('Theme applied');
        });
        overlay.querySelector('#tvRandom').addEventListener('click', () => {
            const next = randomThemeVars();
            const font = themePane.querySelector('#tvFont').value.trim();
            if (font) next['--font'] = font;
            writePickers(next);
            previewCustom(next);
        });
        overlay.querySelector('#tvReset').addEventListener('click', () => {
            Store.del('sdb_custom_theme');
            applyTheme('dark');
            writePickers({});
            rebuildThemeDropdown();
            toast('Theme reset to Dark');
        });

        overlay.querySelector('#btnClearPrices').addEventListener('click', () => {
            if (state.crawling || state.withdrawing) { toast('Wait for the current run to finish', true); return; }
            const ok = window.confirm(
                'Clear every stored price and inflation flag?\n\n'
                + 'Your items, quantities, rarities, categories and descriptions are kept. '
                + 'Press ↻ Reprice afterwards to fetch prices again.\n\n'
                + 'Your Neopets SDB itself is unaffected.');
            if (!ok) return;
            let cleared = 0;
            for (const it of state.items) {
                if (it.value != null || it.inflated) cleared++;
                it.value = null;
                it.inflated = false;
            }
            const cache = Store.get('itemDatabase', {}) || {};
            for (const rec of Object.values(cache)) {
                if (rec && typeof rec === 'object') { delete rec.value; delete rec.inf; }
            }
            Store.set('itemDatabase', cache);
            saveSnapshot();
            toast(`Cleared prices for ${nf.format(cleared)} item${cleared === 1 ? '' : 's'}. ↻ Reprice fetches them again`);
            emit('data:changed');
        });

        overlay.querySelector('#btnResetAll').addEventListener('click', () => {
            const ok = window.confirm(
                'This will permanently delete ALL stored data for SDBCrawler: snapshots, '
                + 'queues, filters, settings, hidden rows, column widths, and every custom or saved theme.\n\n'
                + 'Your Neopets SDB itself is unaffected.\n\nContinue?');
            if (!ok) return;
            for (const key of ALL_STORE_KEYS) Store.del(key);
            try { localStorage.removeItem('sdb_removed_items'); } catch {  }
            location.reload();
        });

        overlay.querySelector('#dataExport').addEventListener('click', () => {
            const data = buildStorageExport();
            downloadFile(`sdb-backup-${stamp()}.json`, 'application/json', JSON.stringify(data, null, 2));
            toast(`Export a Backup · ${nf.format(Object.keys(data).length)} keys`);
        });

        const importBackup = (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => toast('Could not read that file', true);
            reader.onload = () => {
                let obj;
                try { obj = JSON.parse(String(reader.result)); }
                catch { toast('That file is not valid JSON', true); return; }
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { toast('Not an SDBCrawler backup', true); return; }
                const keys = Object.keys(obj).filter((k) => ALL_STORE_KEYS.includes(k) && typeof obj[k] === 'string');
                if (!keys.length) { toast('Not an SDBCrawler backup', true); return; }
                if (!window.confirm(
                    `Restore this backup?\n\n${keys.length} stored keys will replace your current data, `
                    + 'and the page will reload.\n\nYour Neopets SDB itself is unaffected.')) return;
                for (const k of keys) GM_setValue(k, obj[k]);
                toast(`Import Backup · ${nf.format(keys.length)} keys`);
                setTimeout(() => location.reload(), 700);
            };
            reader.readAsText(file);
        };

        const fileInput = overlay.querySelector('#dataFile');
        overlay.querySelector('#dataImport').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => { importBackup(fileInput.files[0]); fileInput.value = ''; });

        const drop = overlay.querySelector('#dataDrop');
        for (const ev of ['dragenter', 'dragover']) {
            drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add('drag'); });
        }
        for (const ev of ['dragleave', 'dragend']) {
            drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag'); });
        }
        drop.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag');
            importBackup(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
        });
    }

    const fmtDelta = (n) => (n == null ? '???' : `${n > 0 ? '+' : ''}${nf.format(n)}`);

    function buildSnapshotDiff(entry, cache) {
        const baseMap = new Map();
        for (const row of entry.rows) {
            const [id, qty, value] = row;
            if (id != null) baseMap.set(id, { qty, value });
        }
        const added = [], changed = [];
        for (const it of state.items) {
            if (it.id == null) continue;
            const curVal = typeof it.value === 'number' ? it.value : null;
            const prev = baseMap.get(it.id);
            if (!prev) {
                added.push({ id: it.id, name: it.name, image: it.image, qty: it.qty, value: curVal });
                continue;
            }
            const dq = it.qty - prev.qty;
            const prevVal = typeof prev.value === 'number' ? prev.value : null;
            if (dq !== 0 || curVal !== prevVal) {
                const dv = (curVal != null && prevVal != null) ? curVal - prevVal : null;
                changed.push({ id: it.id, name: it.name, image: it.image, qty: it.qty, dq, dv });
            }
            baseMap.delete(it.id);
        }
        const removed = [];
        for (const [id, prev] of baseMap) {
            const meta = resolveSnapMeta(cache, id);
            removed.push({ id, name: meta ? meta.name : `#${id}`, image: meta ? meta.image : '', qty: prev.qty, value: prev.value });
        }
        return { added, removed, changed };
    }

    function moverScore(kind, r) {
        if (kind === 'changed') return r.dv != null ? Math.abs(r.dv) * r.qty : Math.abs(r.dq);
        return (typeof r.value === 'number' ? Math.abs(r.value) : 0) * r.qty;
    }
    function sortDiffRows(kind, rows, mode) {
        const arr = rows.slice();
        if (mode === 'name') arr.sort((a, b) => collator.compare(a.name, b.name));
        else arr.sort((a, b) => moverScore(kind, b) - moverScore(kind, a));
        return arr;
    }

    function renderSnapshotDiff(entry, cache, sortMode) {
        const esc = escHTML;
        const { added, removed, changed } = buildSnapshotDiff(entry, cache);
        const row = (name, image, qty, val) => `
            <div class="diff-row">
                <div class="rv-item"><img loading="lazy" decoding="async" alt="" src="${esc(image || BLANK_GIF)}"><span>${esc(name)}</span></div>
                <span class="diff-qty">${qty}</span>
                <span class="diff-val">${val}</span>
            </div>`;
        const section = (title, rows, cls, fmt) => {
            const sorted = sortDiffRows(cls === 'diff-chg' ? 'changed' : 'total', rows, sortMode);
            return `
            <div class="diff-sec ${cls}">
                <h5 class="diff-h ${cls}-h">${title}<span class="diff-count">${nf.format(rows.length)}</span></h5>
                ${rows.length
                    ? `<div class="diff-list ${cls}">${sorted.slice(0, 200).map((r) => { const [q, v] = fmt(r); return row(r.name, r.image, q, v); }).join('')}
                       ${rows.length > 200 ? `<div class="diff-none">…and ${nf.format(rows.length - 200)} more</div>` : ''}</div>`
                    : '<div class="diff-none">None</div>'}
            </div>`;
        };
        const priced = (r) => (isUnpriced(r.value) ? '???' : fmtValue(r.value));
        return section('Added', added, 'diff-add', (r) => [`+${nf.format(r.qty)}`, priced(r)])
            + section('Removed', removed, 'diff-del', (r) => [`-${nf.format(r.qty)}`, priced(r)])
            + section('Changed', changed, 'diff-chg', (r) => [`${r.dq > 0 ? '+' : ''}${nf.format(r.dq)}`, fmtDelta(r.dv)]);
    }

    function renderSnapshotTrend(trend) {
        if (!trend.length) return '<div class="diff-sec"><h5 class="diff-h diff-trend-h">Trend</h5><div class="diff-none">No trend data yet.</div></div>';
        const recent = trend.slice(-10);
        const rows = recent.map((p, i) => {
            const prevVal = i > 0 ? recent[i - 1].value : null;
            const d = new Date(p.ts);
            const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const delta = prevVal == null ? '' : ` (${fmtDelta(p.value - prevVal)})`;
            return `<div class="trend-row">
                    <span class="trend-when">${escHTML(when)}</span>
                    <span class="trend-val">${nf.format(p.value)} NP${delta}</span>
                    <button class="snap-del" type="button" data-ts="${p.ts}" title="Delete this snapshot" aria-label="Delete snapshot">${icon('x')}</button>
                </div>`;
        }).reverse().join('');
        return `<div class="diff-sec"><h5 class="diff-h diff-trend-h">Trend<span class="diff-count">${nf.format(trend.length)}</span></h5>
            <div class="diff-list trend-list">${rows}</div></div>`;
    }

    function openSnapshots() {
        let ring = loadSnapshots();
        if (!state.items.length && !ring.length) { toast('Nothing to compare: scan or load a snapshot first', true); return; }

        const cache = new Map(Object.entries(Store.get('itemDatabase', {})));
        let trend = loadTrend();
        let selTs = ring.length ? ring[ring.length - 1].ts : null;

        const { overlay, close } = openModal(`
            <div class="modal-head">Snapshots</div>
            <div class="modal-hint">Compare the current box against a saved snapshot, or watch total value over time.</div>
            <div id="snapPickWrap"${ring.length ? '' : ' class="gone"'}>
                <label class="modal-row">Compare against
                    <select id="snapPick"></select>
                </label>
                <div class="modal-hint snap-detail" id="snapDetail"></div>
                <label class="modal-row">Sort by
                    <select id="snapSort"><option value="name">Name</option><option value="mover" selected>Value</option></select>
                </label>
            </div>
            <div class="modal-hint${ring.length ? ' gone' : ''}" id="snapEmpty">No snapshots saved yet. Click "Snapshot now" to save your first one.</div>
            <div class="tabpane on" id="snapBody"></div>
            <div class="modal-actions">
                <button class="btn" id="snapNow">Snapshot now</button>
                <button class="btn primary" id="snapClose">Close</button>
            </div>`, 'review', { id: 'diff' });

        const body = overlay.querySelector('#snapBody');
        const pick = overlay.querySelector('#snapPick');
        const pickWrap = overlay.querySelector('#snapPickWrap');
        const emptyMsg = overlay.querySelector('#snapEmpty');
        const detail = overlay.querySelector('#snapDetail');
        const sortSel = overlay.querySelector('#snapSort');
        const selEntry = () => ring.find((e) => e.ts === selTs) || null;

        const renderPicker = () => {
            const has = ring.length > 0;
            pickWrap.classList.toggle('gone', !has);
            emptyMsg.classList.toggle('gone', has);
            if (!has) return;
            if (!ring.some((e) => e.ts === selTs)) selTs = ring[ring.length - 1].ts;
            pick.replaceChildren();
            for (let i = ring.length - 1; i >= 0; i--) {
                const e = ring[i];
                const opt = document.createElement('option');
                opt.value = String(e.ts);
                opt.textContent = `${e.label || timeAgo(e.ts)} · ${nf.format(e.rows.length)} items`;
                if (e.ts === selTs) opt.selected = true;
                pick.append(opt);
            }
            const e = selEntry();
            detail.textContent = e ? new Date(e.ts).toLocaleString() : '';
        };
        const renderBody = () => {
            const e = selEntry();
            const diffHTML = e ? renderSnapshotDiff(e, cache, sortSel.value) : '';
            body.innerHTML = diffHTML + renderSnapshotTrend(trend);
        };
        renderPicker();
        renderBody();

        pick.addEventListener('change', () => { selTs = Number(pick.value); renderPicker(); renderBody(); });
        sortSel.addEventListener('change', renderBody);

        body.addEventListener('click', (ev) => {
            const del = ev.target.closest('.snap-del');
            if (!del) return;
            ({ trend, ring } = deleteTrendAt(Number(del.dataset.ts)));
            renderPicker();
            renderBody();
            toast('Snapshot removed');
        });

        overlay.querySelector('#snapClose').addEventListener('click', close);
        overlay.querySelector('#snapNow').addEventListener('click', () => {
            if (!state.items.length) { toast('Nothing to snapshot: scan or load a snapshot first', true); return; }
            captureSnapshot();
            toast(`Snapshot saved · ${nf.format(state.items.length)} items`);
            close();
            openSnapshots();
        });
    }

    const ACTION_LABEL = { inventory: 'Inventory', shop: 'Shop', gallery: 'Gallery', deposit: 'Deposit' };
    function historyEnds(action) {
        return action === 'deposit' ? ['Inventory', 'SDB'] : ['SDB', ACTION_LABEL[action] || action];
    }

    function openHistory() {
        const hist = Store.get('sdb_history', []);
        const entries = Array.isArray(hist) ? hist : [];
        const cache = new Map(Object.entries(Store.get('itemDatabase', {})));

        const resolveImg = (id) => {
            if (id == null) return BLANK_GIF;
            const live = state.byKey.get(`id:${id}`);
            if (live?.image) return live.image;
            const meta = cache.get(String(id));
            return meta?.img ? imageUrl(meta.img) : BLANK_GIF;
        };

        const { overlay, close } = openModal(`
            <div class="modal-head">Activity</div>
            <div class="modal-hint">Past moves and deposits, newest first. Click an entry to see the items.</div>
            <div class="rv-scroll" id="histList"></div>
            <div class="modal-actions">
                <button class="btn" id="histClear">Clear history</button>
                <button class="btn primary" id="histClose">Close</button>
            </div>`, 'review activity', { id: 'activity' });

        const listEl = overlay.querySelector('#histList');

        const buildItemRow = (row) => {
            const line = document.createElement('div');
            line.className = 'rv-item hist-item';
            const img = document.createElement('img');
            img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
            img.src = resolveImg(row.id);
            const name = document.createElement('span');
            name.className = 'hist-name';
            name.textContent = row.name;
            const qty = document.createElement('span');
            qty.className = 'hist-qty';
            qty.textContent = `×${nf.format(row.qty)}`;
            const val = document.createElement('span');
            val.className = 'hist-val';
            if (isUnpriced(row.value)) {
                val.textContent = '???';
            } else {
                val.textContent = gridNum(row.value);
                val.title = exactTitle(row.value);
            }
            line.append(img, name, qty, val);
            return line;
        };

        const render = () => {
            listEl.replaceChildren();
            if (!entries.length) {
                const empty = document.createElement('div');
                empty.className = 'diff-none';
                empty.textContent = 'No moves logged yet.';
                listEl.append(empty);
                return;
            }
            for (const entry of entries) {
                const row = document.createElement('div');
                row.className = 'hist-entry';

                const summary = document.createElement('button');
                summary.type = 'button';
                summary.className = 'hist-summary';
                const failTxt = entry.failed ? ` · ${nf.format(entry.failed)} failed` : '';
                const [from, to] = historyEnds(entry.action);
                summary.innerHTML = `${escHTML(from)} ${icon('arrowRight', 'hist-arrow')} ${escHTML(to)}`
                    + escHTML(` · ${nf.format(entry.items.length)} item${entry.items.length === 1 ? '' : 's'}`
                        + ` · ${nf.format(entry.moved)} unit${entry.moved === 1 ? '' : 's'}${failTxt} · ${timeAgo(entry.ts)}`);

                const detail = document.createElement('div');
                detail.className = 'hist-detail gone';
                let built = false;
                const build = () => {
                    if (built) return;
                    built = true;
                    let total = 0, priced = 0;
                    for (const r of entry.items) {
                        detail.append(buildItemRow(r));
                        if (!isUnpriced(r.value)) { total += r.value * r.qty; priced++; }
                    }
                    if (priced) {
                        const totalLine = document.createElement('div');
                        totalLine.className = 'hist-total';
                        totalLine.textContent = `Total: ${nf.format(total)} NP`;
                        detail.append(totalLine);
                    }
                };
                summary.addEventListener('click', () => { build(); detail.classList.toggle('gone'); });

                row.append(summary, detail);
                listEl.append(row);
            }
        };
        render();

        overlay.querySelector('#histClose').addEventListener('click', close);
        overlay.querySelector('#histClear').addEventListener('click', () => {
            if (!entries.length) { toast('Nothing to clear'); return; }
            if (!window.confirm('Clear the activity log? This cannot be undone.')) return;
            entries.length = 0;
            Store.set('sdb_history', []);
            render();
            toast('Activity log cleared');
        });
    }

    function openGuide() {
        const { overlay, close } = openModal(`
                <div class="modal-head">User Guide</div>
                <div class="guide-body">
                    <h4>Tips</h4>
                    <ul>
                        <li>Press <b>Shift</b> and <b>+</b> to toggle the panel; <b>/</b> focuses the filter. Other shortcuts are unbound by default. Set them in Settings ▸ Keybinds</li>
                        <li>Drag the header to move the panel.</li>
                        <li>Hovering most buttons will expand a brief description</li>
                        <li>Click an item image to copy its name.</li>
                        <li>Filters, themes, column widths and panel position are remembered.</li>
                        <li>The Activity log keeps your last ${HISTORY_CAP} moves; older ones drop off as new moves are logged.</li>
                    </ul>

                    <h4>Scanning</h4>
                    <ul>
                        <li><b>${icon('play')} Start scan</b> crawls your SDB.</li>
                        <li><b>ItemDB prices</b> (<b>${icon('gear')} Settings &#x203A; ItemDB</b>) fetches prices during the scan.</li>
                        <li><b>${icon('refresh')} Reprice</b> refreshes prices for loaded items (no re-scan).</li>
                        <li><b>Scan delay</b> (<b>${icon('gear')} Settings</b>) is the pause between pages; raise if rate-limited.</li>
                        <li>Last scan is saved automatically.</li>
                    </ul>
                    <h4>Moving items</h4>
                    <ul>
                        <li><b>+</b> = queue 1; <b>Shift</b>+<b>+</b> = queue whole stack.</li>
                        <li><b>Shift</b>+<b>&#x2212;</b> = remove whole stack.</li>
                        <li><b>${icon('clipboard')} Paste list</b>: paste names (<code>Name, Qty</code>), review matches, then <b>Queue selected</b>.</li>
                        <li>Choose <b>Send to</b> (Inventory/Shop/Gallery), enter PIN, press <b>Move</b>.</li>
                        <li>Items on the same SDB page move in a single request.</li>
                    </ul>
                    <h4>Depositing</h4>
                    <ul>
                        <li><b>${icon('box')}</b> (toolbar) sends your whole inventory to the SDB, 70 units per request.</li>
                        <li>What it deposits is folded straight into the grid; new items are priced with your current ItemDB settings. Hit <b>Start scan</b> any time to re-read the box from scratch.</li>
                        <li><b>Stop</b> ends it between batches</li>
                    </ul>
                    <h4>Queue bar</h4>
                    <ul>
                        <li>Click a queued chip to unqueue it.</li>
                        <li>The <b>list</b> button opens the full queue to adjust quantities or remove entries.</li>
                        <li><b>Clear queue</b> empties it.</li>
                        <li>Queue syncs across tabs.</li>
                    </ul>

                    <h4>Layout</h4>
                    <ul>
                        <li>Resize columns: drag divider; double-click to reset.</li>
                        <li>View modes: <b>Rows</b>/<b>Cards</b>, <b>Scroll</b>/<b>Paged</b>.</li>
                        <li>Actions (row/card corner): <b>${icon('eyeOpen')}</b> hides (toggle via <b>Hidden</b> button), <b>${icon('x')}</b> removes from this list (rescan restores). Neither touches your SDB.</li>
                        <li>Cards show a description (3 lines) and shortened Qty/Value/Total (hover for exact); use the <b>Sort by</b> dropdown.</li>
                        <li>Links: <b>DB</b>, <b>JN</b>, <b>TP</b>, <b>AH</b> open external sites.</li>
                        <li>Inflated prices are amber.</li>
                    </ul>
                    <h4>Finding items</h4>
                    <ul>
                        <li>Search matches name, category, ID.</li>
                        <li>Wildcards: <code>*</code> (any), <code>?</code> (single), <code>&amp;</code> (compound search), <code>!</code> (negation).</li>
                        <li><b>${icon('filter')} Filters</b>: Category and the Flags (Inflated, Edible, Readable, Openable) are three-state (click to include, click again to exclude, third click clears). Also Hidden, currency (NC/NP), and rarity/value/qty ranges.</li>
                        <li><b>NC/NP</b> toggle: click a lit button to clear the filter.</li>
                        <li><b>Reset filters</b> clears all.</li>
                        <li>Sort: click any column heading.</li>
                    </ul>

                    <h4>ItemDB detail level</h4>
                    <ul>
                        <li><b>Full</b> (default): prices, colours, descriptions, use types.</li>
                        <li><b>Pricer</b>: prices + inflation flags.</li>
                        <li><b>Minimal</b>: smallest responses.</li>
                        <li>Raising = re-fetches; lowering = keeps existing data.</li>
                        <li><b>${icon('refresh')} Reprice</b> always uses Pricer (NC values from Lebron&#x2019;s list).</li>
                        <li><b>Cache Expiry</b> (1&#x2013;30d, default 2): how long to reuse cached prices.</li>
                    </ul>
                    <h4>Themes</h4>
                    <ul>
                        <li>Header selector: Built in themes or create your own in settings.</li>
                        <li>An unsaved palette shows as <b>Custom (unsaved)</b>.</li>
                    </ul>

                    <h4>Exporting</h4>
                    <ul>
                        <li><b>Copy as TSV</b> (bind a key in Settings &#xB7; Keybinds) copies the current view for pasting into a spreadsheet.</li>
                        <li><b>${icon('download')} Download</b>: the current view as <b>Excel</b>, <b>HTML</b>,
                            <b>CSV</b> or <b>JSON</b> (hover for columns).</li>
                        <li><b>Backup / restore</b>: under <b>${icon('gear')} Settings &#xB7; General &#xB7; Manage Data</b>
                            <b>Export a Backup</b> saves a full JSON of settings + data; <b>Import Backup</b> (pick a file
                            or drop one) loads it straight back into storage and reloads.</li>
                    </ul>

                    <h4>Settings</h4>
                    <ul>
                        <li><b>ItemDB</b>: enrichment options, delays.</li>
                        <li><b>Keybinds</b>: click to rebind shortcuts.</li>
                        <li><b>Theme</b>: build palettes (hex boxes, <b>Apply</b>, <b>${icon('dice')}</b>, <b>Reset</b>, <b>Save</b>).</li>
                        <li><b>General</b>:
                            <ul>
                                <li><b>Colored Cards</b>: tints; raises detail to Full if needed.</li>
                                <li><b>Card Rarity</b>, <b>Simplify Numbers</b>, <b>Link Images</b> (icons).</li>
                                <li><b>Clear price data</b>: clears prices, keeps other data.</li>
                                <li><b>Reset All Data</b>: deletes all stored settings (reloads page).</li>
                            </ul>
                        </li>
                    </ul>
                    <h4>Comparing over time</h4>
                    <ul>
                        <li><b>${icon('snapshot')} Snapshots</b>: diff the current box against any saved snapshot, capture a new one, or check the trend of total value over time.</li>
                        <li><b>${icon('activity')} Activity</b>: a log of past moves and deposits, expandable per entry.</li>
                        <li><b>${icon('copy')} Copy</b>: copies visible names (one per line) for <b>Paste list</b>.</li>
                    </ul>
                </div>
                <div class="modal-actions">
                    <button class="btn primary" id="guideClose">Close</button>
                </div>`, 'guide');
        overlay.querySelector('#guideClose').addEventListener('click', close);
        overlay.querySelector('#guideClose').focus();
    }

    function parsePasteList(raw) {
        const wanted = new Map();
        let index = 0;
        for (const line of String(raw ?? '').split(/[\r\n;]+/)) {
            let text = line.trim();
            if (!text) continue;
            let qty = 1;
            const m = text.match(/^(.*?)[,\t]\s*(\d+)\s*$/);
            if (m) { text = m[1].trim(); qty = Math.max(1, parseInt(m[2], 10) || 1); }
            const name = text.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!name) continue;
            const prev = wanted.get(name);
            if (prev) prev.qty += qty;
            else wanted.set(name, { originalName: text, qty, index: index++ });
        }
        return wanted;
    }

    function openPasteList() {
        if (state.withdrawing) { toast('Finish the current move first'); return; }
        if (!state.items.length) { toast('Scan your SDB first'); return; }
        const { overlay, close } = openModal(`
                <div class="modal-head">Paste a list of item names</div>
                <div class="modal-hint">One item per line, case-insensitive. Add <b>, N</b> after a name to set
                    the quantity (defaults to&nbsp;1), e.g. <b>Green Apple, 5</b>. Amounts are capped at what you
                    own, and a tab works too, so a TSV copy pastes straight back in.
                    You can review and adjust every match before anything is queued.</div>
                <textarea id="pasteTa" class="paste-ta" spellcheck="false" autocomplete="off"
                          placeholder="Blue Draik Morphing Potion&#10;Faerie Paint Brush, 2&#10;Green Apple, 5"></textarea>
                <div class="modal-actions">
                    <button class="btn" id="pasteCancel">Cancel</button>
                    <button class="btn primary" id="pasteApply">Find matches</button>
                </div>`, 'wide', { id: 'paste' });
        overlay.querySelector('#pasteCancel').addEventListener('click', close);

        const findMatches = () => {
            const wanted = parsePasteList(overlay.querySelector('#pasteTa').value);
            if (!wanted.size) { toast('Nothing to queue'); return; }
            const byName = new Map();
            for (const it of state.items) if (!byName.has(it.nameLC)) byName.set(it.nameLC, it);

            const matches = [], notFound = [], unmovable = [];
            for (const [name, req] of wanted) {
                const it = byName.get(name);
                if (!it) { notFound.push(req.originalName); continue; }
                if (it.id == null) { unmovable.push(it.name); continue; }
                const qty = Math.min(req.qty, it.qty);
                if (qty <= 0) continue;
                matches.push({ it, want: req.qty, qty });
            }
            if (notFound.length) console.warn('[SDB] paste-list: not found —', notFound);
            if (!matches.length) {
                toast(`No matches in your SDB${notFound.length ? ` · ${nf.format(notFound.length)} name(s) unknown` : ''}`, true);
                return;
            }
            close();
            showPasteReview(matches, notFound, unmovable);
        };
        overlay.querySelector('#pasteApply').addEventListener('click', findMatches);
        overlay.querySelector('#pasteTa').focus();
    }

    function queueAllFilteredToReview() {
        if (state.withdrawing) { toast('Finish the current move first'); return; }
        if (!state.view.length) { toast('Nothing in the current view'); return; }
        const matches = [], unmovable = [];
        for (const it of state.view) {
            if (it.id == null) { unmovable.push(it.name); continue; }
            if (it.qty > 0) matches.push({ it, want: it.qty, qty: it.qty });
        }
        if (!matches.length) { toast('Nothing movable in the current view', true); return; }
        showPasteReview(matches, [], unmovable);
    }

    function queueAllFilteredNow() {
        if (state.withdrawing) { toast('Finish the current move first'); return; }
        if (!state.view.length) { toast('Nothing in the current view'); return; }
        let queued = 0, units = 0;
        for (const it of state.view) {
            if (it.id == null || it.qty <= 0) continue;
            state.queue.set(it.key, it.qty);
            queued++;
            units += it.qty;
        }
        if (!queued) { toast('Nothing movable in the current view', true); return; }
        saveQueue();
        scheduleLight();
        toast(`Queued ${nf.format(queued)} item(s), ${nf.format(units)} unit(s)`);
    }

    function showPasteReview(matches, notFound, unmovable, opts = {}) {
        const { title = 'Review matches', confirmLabel = 'Queue selected', replace = false } = opts;
        const { overlay, close } = openModal(`
                <div class="modal-head">${escHTML(title)}</div>
                <div class="modal-hint">Untick anything you don't want and adjust quantities;
                    each is capped at what you own. Only ticked rows are queued.</div>
                <div class="rv-scroll">
                    <div class="rv-head">
                        <input type="checkbox" id="rvAll" checked title="Select / deselect all">
                        <span>Item</span>
                        <span style="text-align:right">Value</span>
                        <span style="text-align:center">Qty</span>
                        <button type="button" class="rv-max" id="rvMax" title="Set every quantity to the maximum you own">Max</button>
                        <span style="text-align:right">Total</span>
                    </div>
                    <div id="rvRows"></div>
                </div>
                <div class="rv-stats" id="rvStats"></div>
                <div class="rv-missing" id="rvMissing"></div>
                <div class="modal-actions">
                    <button class="btn" id="rvCancel">Cancel</button>
                    <button class="btn primary" id="rvQueue">${escHTML(confirmLabel)}</button>
                </div>`, 'review');

        const rowsEl = overlay.querySelector('#rvRows');
        const statsEl = overlay.querySelector('#rvStats');
        const allCb = overlay.querySelector('#rvAll');
        const btnQueue = overlay.querySelector('#rvQueue');
        const rows = [];

        for (const m of matches) {
            const row = document.createElement('div');
            row.className = 'rv-row';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.title = `Include ${m.it.name}`;

            const item = document.createElement('div');
            item.className = 'rv-item';
            const img = document.createElement('img');
            img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
            img.src = m.it.image || BLANK_GIF;
            const nameEl = document.createElement('span');
            nameEl.textContent = m.it.name;
            nameEl.title = m.want > m.qty
                ? `${m.it.name}, asked for ${nf.format(m.want)}, capped to the ${nf.format(m.it.qty)} you own`
                : m.it.name;
            item.append(img, nameEl);

            const price = document.createElement('div');
            price.className = 'rv-num';
            price.textContent = fmtValue(m.it.value);

            const qtyWrap = document.createElement('div');
            const qty = document.createElement('input');
            qty.type = 'number';
            qty.min = '1';
            qty.max = String(m.it.qty);
            qty.value = String(m.qty);
            qty.title = `You own ${nf.format(m.it.qty)}`;
            qtyWrap.append(qty);

            const pad = document.createElement('div');

            const stack = document.createElement('div');
            stack.className = 'rv-num';

            row.append(cb, item, price, qtyWrap, pad, stack);
            rowsEl.append(row);
            rows.push({ it: m.it, row, cb, qty, stack });
        }

        const syncRow = (r) => {
            const n = parseInt(r.qty.value, 10);
            const v = Number.isFinite(n) ? Math.max(1, Math.min(n, r.it.qty)) : 1;
            setFieldIdle(r.qty, v);
            r.stack.textContent = typeof r.it.value === 'number' ? nf.format(r.it.value * v) : '–';
            r.row.classList.toggle('off', !r.cb.checked);
            r.qty.disabled = !r.cb.checked;
            return v;
        };

        const stat = (label, value) => {
            const s = document.createElement('span');
            const b = document.createElement('b');
            b.textContent = value;
            s.append(`${label} `, b);
            return s;
        };

        const refresh = () => {
            let items = 0, units = 0, value = 0;
            for (const r of rows) {
                const v = syncRow(r);
                if (!r.cb.checked) continue;
                items++;
                units += v;
                if (typeof r.it.value === 'number') value += r.it.value * v;
            }
            statsEl.replaceChildren(
                stat('Selected', nf.format(items)),
                stat('Units', nf.format(units)),
                stat('Est. value', `${nf.format(value)} NP`),
            );
            allCb.checked = items === rows.length;
            allCb.indeterminate = items > 0 && items < rows.length;
            btnQueue.disabled = items === 0;
        };

        rowsEl.addEventListener('input', refresh);
        rowsEl.addEventListener('change', refresh);
        allCb.addEventListener('change', () => {
            for (const r of rows) r.cb.checked = allCb.checked;
            refresh();
        });
        overlay.querySelector('#rvMax').addEventListener('click', () => {
            for (const r of rows) r.qty.value = String(r.it.qty);
            refresh();
            toast('Increase All Quantities to Max');
        });

        const missing = overlay.querySelector('#rvMissing');
        const parts = [];
        if (notFound.length) parts.push(`Not in your SDB (${nf.format(notFound.length)}): ${notFound.join(', ')}`);
        if (unmovable.length) parts.push(`Can't be moved (${nf.format(unmovable.length)}): ${unmovable.join(', ')}`);
        if (parts.length) missing.textContent = parts.join(' · ');
        else missing.remove();

        overlay.querySelector('#rvCancel').addEventListener('click', close);
        btnQueue.addEventListener('click', () => {
            if (state.withdrawing) { toast('Finish the current move first'); return; }
            let queued = 0, units = 0;
            for (const r of rows) {
                if (r.cb.checked) {
                    const v = syncRow(r);
                    state.queue.set(r.it.key, v);
                    queued++;
                    units += v;
                } else if (replace) {
                    state.queue.delete(r.it.key);
                }
            }
            saveQueue();
            scheduleLight();
            toast(`${replace ? 'Queue updated' : 'Queued'} · ${nf.format(queued)} item(s), ${nf.format(units)} unit(s)`);
            close();
        });
        refresh();
    }

    const RAW_ABSENT = Symbol('absent');
    function buildStorageExport() {
        saveSnapshot();
        const useLz = Store.get(BACKUP_USE_LZ, true) !== false;
        const out = {};
        for (const key of ALL_STORE_KEYS) {
            const raw = GM_getValue(key, RAW_ABSENT);
            if (raw === RAW_ABSENT || raw === null || raw === undefined) continue;
            let val = typeof raw === 'string' ? raw : JSON.stringify(raw);
            if (!useLz && LZ_KEYS.has(key)) {
                try {
                    const parsed = JSON.parse(val);
                    if (parsed && typeof parsed === 'object' && parsed._lz != null) {
                        const json = LZString.decompressFromUTF16(parsed.d);
                        if (json != null) val = json;
                    }
                } catch {  }
            }
            out[key] = val;
        }
        return out;
    }

    function openDownload() {
        const haveView = state.view.length > 0;
        const { overlay, close } = openModal(`
                <div class="modal-head">Downloads</div>
                <div class="modal-hint">Save the <b>current view</b> (${nf.format(state.view.length)} items &#xB7; filters and sort apply) in one of these formats. Hover each for what it contains. For a full backup of everything, use <b>Manage Data</b> under <b>Settings &#xB7; General</b>.</div>
                <div class="ex-grid">
                    <button class="btn" id="exXls"${haveView ? '' : ' disabled'}
                            title="Save as Excel (Item, Value, Qty, Total, Rarity, Category, ID)">${icon('download')}Excel</button>
                    <button class="btn" id="exHtml"${haveView ? '' : ' disabled'}
                            title="Simplified HTML view, opens in your browser">${icon('download')}HTML</button>
                    <button class="btn" id="exCsv"${haveView ? '' : ' disabled'}
                            title="Item, Value, Qty, Total, Rarity, Category, ID, NC, Inflation Notice, Image URL">${icon('download')}CSV</button>
                    <button class="btn" id="exJson"${haveView ? '' : ' disabled'}
                            title="Full records for tools &amp; scripts, the same fields as CSV, as JSON">${icon('download')}JSON</button>
                </div>
                <div class="modal-actions">
                    <button class="btn" id="exClose">Close</button>
                </div>`, 'wide', { id: 'download' });

        overlay.querySelector('#exXls').addEventListener('click', () => {
            const rows = exportRows();
            downloadFile(`sdb-export-${stamp()}.xls`, 'application/vnd.ms-excel', '\uFEFF' + toTSV(rows));
            toast(`Downloaded ${nf.format(rows.length)} items for Excel`);
            close();
        });
        overlay.querySelector('#exHtml').addEventListener('click', () => {
            const html = toStandaloneHTML(state.view);
            downloadFile(`sdb-export-${stamp()}.html`, 'text/html', html);
            toast(`Downloaded ${nf.format(state.view.length)} items as HTML`);
            close();
        });
        overlay.querySelector('#exCsv').addEventListener('click', () => {
            const rows = exportRows();
            downloadFile(`sdb-export-${stamp()}.csv`, 'text/csv', toCSV(rows));
            toast(`Downloaded ${nf.format(rows.length)} items as CSV`);
            close();
        });
        overlay.querySelector('#exJson').addEventListener('click', () => {
            const rows = exportRows();
            downloadFile(`sdb-export-${stamp()}.json`, 'application/json', JSON.stringify(rows, null, 2));
            toast(`Downloaded ${nf.format(rows.length)} items as JSON`);
            close();
        });
        overlay.querySelector('#exClose').addEventListener('click', close);
        (state.view.length ? overlay.querySelector('#exXls') : overlay.querySelector('#exClose')).focus();
    }

    function openQueueReview() {
        if (state.withdrawing) { toast('Finish the current move first'); return; }
        const entries = [...state.queue].filter(([key]) => state.byKey.has(key));
        if (!entries.length) { toast('Nothing queued'); return; }
        const matches = entries.map(([key, q]) => {
            const it = state.byKey.get(key);
            return { it, want: q, qty: Math.min(q, it.qty) };
        });
        showPasteReview(matches, [], [], { title: 'Queued items', confirmLabel: 'Update queue', replace: true });
    }

    const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const pool = [];
    let lastRowH = 0;

    function makeRow() {
        const el = document.createElement('div');
        el.className = 'row cols';
        el.innerHTML = `
            <div class="c-item"><img loading="lazy" decoding="async" alt="" title="Click to copy item name"><span class="name"></span></div>
            <div class="c-num val"></div>
            <div class="c-num qty"></div>
            <div class="c-num tot"></div>
            <div class="c-num"><span class="rar"></span></div>
            <div class="c-cat"><span class="chip"></span></div>
            <div class="c-num id"></div>
            <div class="c-q">
                <button class="qm" title="Unqueue 1 &#xB7; Shift-click: all of it">${icon('minus')}</button>
                <input class="qn" type="text" inputmode="numeric" autocomplete="off">
                <button class="qp" title="Queue Item &#xB7; Shift+Click to Queue Stack">${icon('plus')}</button>
            </div>
            <div class="c-act">
                <button class="act x" title="Hide From View">${icon('eyeOpen', 'eye-open')}${icon('eyeClosed', 'eye-closed')}</button>
                <button class="act rm" title="Remove from Log">${icon('x')}</button>
            </div>
            <div class="c-links">
                <a class="lnk l-db" target="_blank" rel="noopener">DB</a>
                <a class="lnk l-jn" target="_blank" rel="noopener">JN</a>
                <a class="lnk l-tp" target="_blank" rel="noopener">TP</a>
                <a class="lnk l-ah" target="_blank" rel="noopener">AH</a>
            </div>`;
        el._r = {
            img: el.querySelector('img'), name: el.querySelector('.name'),
            id: el.querySelector('.id'),
            qty: el.querySelector('.qty'),
            chip: el.querySelector('.chip'), rar: el.querySelector('.rar'),
            val: el.querySelector('.val'), tot: el.querySelector('.tot'),
            ldb: el.querySelector('.l-db'), ljn: el.querySelector('.l-jn'),
            ltp: el.querySelector('.l-tp'), lah: el.querySelector('.l-ah'),
            qm: el.querySelector('.qm'), qn: el.querySelector('.qn'), qp: el.querySelector('.qp'),
            act: el.querySelector('.c-act'), x: el.querySelector('.x'),
        };
        return el;
    }

    function ensurePool(n) {
        if (pool.length >= n) return;
        const frag = document.createDocumentFragment();
        while (pool.length < n) { const el = makeRow(); pool.push(el); frag.append(el); }
        ui.vspacer.append(frag);
    }

    const rarityClass = (r) => {
        if (r == null) return 'r-none';
        if (r === 500) return 'r-nc';
        if (r === 180) return 'r-retired';
        if (r === 200 || r === 250) return 'r-artifact';
        if (r >= 111 && r <= 179) return 'r-brightred';
        if (r >= 105 && r <= 110) return 'r-megarare';
        if (r >= 101 && r <= 104) return 'r-special';
        if (r >= 75 && r <= 100) return 'r-uncommon';
        if (r >= 1 && r <= 74) return 'r-none';
        return 'r-brightred';
    };

    const rarityLabel = (r) => (r == null ? '–' : r === 500 ? 'NC' : String(r));

    const VALUE_TEXT = { 'permanent buyable': 'Buyable' };
    const fmtValue = (v) => v == null ? '–'
        : (typeof v === 'number' ? nf.format(v) : (VALUE_TEXT[String(v).trim().toLowerCase()] || String(v)));
    const isUnpriced = (v) => v == null || (typeof v === 'number' && !(v > 0));

    const COMPACT_UNITS = ['', 'K', 'M', 'B', 'T'];
    const compactNumber = (v) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) return fmtValue(v);
        if (Math.abs(v) < 10000) return nf.format(v);
        const sign = v < 0 ? '-' : '';
        let n = Math.abs(v), i = 0;
        while (n >= 1000 && i < COMPACT_UNITS.length - 1) { n /= 1000; i++; }
        const decimals = (x) => (x >= 100 ? 0 : x >= 10 ? 1 : 2);
        let s = n.toFixed(decimals(n));
        if (parseFloat(s) >= 1000 && i < COMPACT_UNITS.length - 1) {
            n = parseFloat(s) / 1000; i++;
            s = n.toFixed(decimals(n));
        }
        if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
        return sign + s + COMPACT_UNITS[i];
    };

    const gridNum = (v) => (shortValues ? compactNumber(v) : fmtValue(v));
    const exactTitle = (v) => {
        if (!shortValues) return '';
        const exact = fmtValue(v);
        return compactNumber(v) === exact ? '' : exact;
    };

    const linkUrls = (name) => {
        const plus = encodeURIComponent(name).replace(/%20/g, '+');
        return {
            db: `https://itemdb.com.br/search?s=${encodeURIComponent(name)}`,
            jn: `https://items.jellyneo.net/search/?name=${plus}&name_type=3`,
            tp: `https://www.neopets.com/island/tradingpost.phtml?type=browse&criteria=item_exact&sort_by=newest&search_string=${plus}`,
            ah: `https://www.neopets.com/genie.phtml?type=process_genie&criteria=exact&auctiongenie=${plus}`,
        };
    };

    function assignRow(el, it, index) {
        const r = el._r;
        el._key = it.key;
        const scaledRowH = CFG.rowH * state.gridZoom;
        const paged = state.pager.mode === 'page';
        if (paged) {
            el.style.position = 'relative';
            el.style.transform = 'none';
        } else {
            el.style.position = 'absolute';
            el.style.transform = `translateY(${index * scaledRowH}px)`;
        }
        el.classList.toggle('alt', index % 2 === 1);
        if (r.img.dataset.src !== it.image) {
            r.img.dataset.src = it.image;
            r.img.src = it.image || BLANK_GIF;
        }
        r.name.textContent = it.name;
        r.id.textContent = it.id != null ? String(it.id) : '–';
        r.qty.textContent = gridNum(it.qty);
        r.qty.title = exactTitle(it.qty);
        r.chip.textContent = catLabel(it) || '–';
        r.rar.textContent = rarityLabel(it.rarity);
        r.rar.title = it.rarity === 500 ? 'Neocash · rarity 500' : '';
        r.rar.className = `rar ${rarityClass(it.rarity)}`;
        const noPrice = isUnpriced(it.value);
        r.val.textContent = noPrice ? '???' : gridNum(it.value);
        r.val.classList.toggle('inf', !noPrice && !!it.inflated);
        r.val.title = noPrice ? 'No price from itemdb'
            : [exactTitle(it.value), it.inflated ? 'itemdb flags this price as inflated' : ''].filter(Boolean).join(' · ');
        const total = (typeof it.value === 'number' && it.value > 0) ? it.value * it.qty : null;
        r.tot.textContent = noPrice ? '???' : gridNum(total);
        r.tot.title = noPrice ? '' : exactTitle(total);

        const L = linkUrls(it.name);
        r.ldb.href = L.db;
        r.ljn.href = L.jn;
        r.ltp.href = L.tp;
        r.lah.href = L.ah;

        const queued = state.queue.get(it.key) || 0;
        const canMove = it.id != null;
        setFieldIdle(r.qn, queued || '');
        r.qm.hidden = queued === 0;
        r.qp.style.visibility = canMove ? '' : 'hidden';
        el.classList.toggle('queued', queued > 0);

        const isHidden = hiddenKeys.has(it.key);
        el.classList.toggle('ghost', isHidden);
        r.x.classList.toggle('unhide', isHidden);
        r.act.classList.toggle('has-unhide', isHidden);
        r.x.title = isHidden ? 'Unhide this row' : 'Hide From View';
        if (el.style.display !== 'grid') el.style.display = 'grid';
    }

    function renderGrid() {
        if (state.cardView) { renderCards(); return; }
        if (ui.cardGrid) ui.cardGrid.style.display = 'none';
        ui.gridHead.style.display = '';
        const rows = visibleRows();
        const total = rows.length;
        const scaledRowH = CFG.rowH * state.gridZoom;
        if (lastRowH !== scaledRowH) {
            lastRowH = scaledRowH;
            ui.root.style.setProperty('--row-h', `${scaledRowH}px`);
        }
        ui.empty.classList.toggle('show', total === 0);
        if (total === 0) {
            const filtered = state.items.length > 0;
            ui.emptyTitle.textContent = filtered ? 'No matches' : 'No data yet';
            ui.emptyBody.textContent = filtered
                ? 'Try a different search or category.'
                : 'Hit “Start scan” to crawl your Safety Deposit Box.';
        }
        if (state.pager.mode === 'page') {
            ui.vspacer.classList.add('paged');
            ui.vspacer.style.height = '';
            ensurePool(total);
            for (let k = 0; k < pool.length; k++) {
                if (k < total) assignRow(pool[k], rows[k], k);
                else if (pool[k].style.display !== 'none') pool[k].style.display = 'none';
            }
            return;
        }
        ui.vspacer.classList.remove('paged');
        ui.vspacer.style.height = `${Math.max(total * scaledRowH, 1)}px`;
        const { scrollTop, clientHeight } = ui.viewport;
        const first = Math.max(0, Math.floor(scrollTop / scaledRowH) - CFG.overscan);
        const last = Math.min(total, Math.ceil((scrollTop + clientHeight) / scaledRowH) + CFG.overscan);
        const needed = Math.max(0, last - first);
        ensurePool(needed);
        if (pool.length > needed + 200) { for (let k = pool.length - 1; k >= needed; k--) pool[k].remove(); pool.length = needed; }
        for (let k = 0; k < pool.length; k++) {
            if (k < needed) assignRow(pool[k], rows[first + k], first + k);
            else if (pool[k].style.display !== 'none') pool[k].style.display = 'none';
        }
    }

    function makeCard() {
        const el = document.createElement('div');
        el.className = 'card';
        el.innerHTML = `
            <div class="c-top">
                <span class="thumbwrap">
                    <img loading="lazy" decoding="async" alt="" title="Click to copy item name">
                    <span class="rar"></span>
                </span>
                <span class="name"></span>
            </div>
            <div class="desc"></div>
            <div class="c-nums">
                <span class="lbl">Qty</span><span class="v"></span>
                <span class="lbl">Value</span><span class="v acc"></span>
                <span class="lbl">Total</span><span class="v"></span>
            </div>
            <div class="c-foot">
                <div class="c-links">
                    <a class="lnk l-db" target="_blank" rel="noopener">DB</a>
                    <a class="lnk l-jn" target="_blank" rel="noopener">JN</a>
                    <a class="lnk l-tp" target="_blank" rel="noopener">TP</a>
                    <a class="lnk l-ah" target="_blank" rel="noopener">AH</a>
                </div>
                <div class="c-q">
                    <button class="qm" title="Unqueue 1 &#xB7; Shift-click: all of it">${icon('minus')}</button>
                    <input class="qn" type="text" inputmode="numeric" autocomplete="off">
                    <button class="qp" title="Queue Item &#xB7; Shift+Click to Queue Stack">${icon('plus')}</button>
                </div>
            </div>
            <div class="c-act">
                <button class="act x" title="Hide From View">${icon('eyeOpen', 'eye-open')}${icon('eyeClosed', 'eye-closed')}</button>
                <button class="act rm" title="Remove from Log">${icon('x')}</button>
            </div>`;
        el._c = {
            img: el.querySelector('img'), name: el.querySelector('.name'),
            rar: el.querySelector('.rar'),
            desc: el.querySelector('.desc'), nums: el.querySelectorAll('.c-nums .v'),
            ldb: el.querySelector('.l-db'), ljn: el.querySelector('.l-jn'),
            ltp: el.querySelector('.l-tp'), lah: el.querySelector('.l-ah'),
            qm: el.querySelector('.qm'), qn: el.querySelector('.qn'), qp: el.querySelector('.qp'),
            act: el.querySelector('.c-act'), x: el.querySelector('.x'),
        };
        return el;
    }

    function assignCard(el, it) {
        const r = el._c;
        el._key = it.key;
        const queued = state.queue.get(it.key) || 0;
        const isHidden = hiddenKeys.has(it.key);
        el.classList.toggle('queued', queued > 0);
        el.classList.toggle('ghost', isHidden);
        const tint = cardColorize && it.colorHex && queued === 0;
        el.style.background = tint ? `${it.colorHex}22` : '';
        el.style.borderColor = tint ? `${it.colorHex}66` : '';
        if (r.img.dataset.src !== it.image) {
            r.img.dataset.src = it.image;
            r.img.src = it.image || BLANK_GIF;
        }
        r.name.textContent = it.name;
        r.rar.textContent = rarityLabel(it.rarity);
        r.rar.title = catLabel(it) || 'no category';
        r.rar.className = `rar ${rarityClass(it.rarity)}`;
        r.desc.textContent = it.description || '';
        r.desc.title = it.description || '';
        const noPrice = isUnpriced(it.value);
        const total = (typeof it.value === 'number' && it.value > 0) ? it.value * it.qty : null;
        const exact = (v) => (compactNumber(v) === fmtValue(v) ? '' : fmtValue(v));
        r.nums[0].textContent = compactNumber(it.qty);
        r.nums[0].title = exact(it.qty);
        r.nums[1].textContent = noPrice ? '???' : compactNumber(it.value);
        r.nums[1].classList.toggle('inf', !noPrice && !!it.inflated);
        r.nums[1].title = noPrice ? 'No price from itemdb'
            : [exact(it.value), it.inflated ? 'itemdb flags this price as inflated' : ''].filter(Boolean).join(' · ');
        r.nums[2].textContent = noPrice ? '???' : compactNumber(total);
        r.nums[2].title = noPrice ? '' : exact(total);
        const L = linkUrls(it.name);
        r.ldb.href = L.db;
        r.ljn.href = L.jn;
        r.ltp.href = L.tp;
        r.lah.href = L.ah;
        const canMove = it.id != null;
        setFieldIdle(r.qn, queued || '');
        r.qm.hidden = queued === 0;
        r.qp.style.visibility = canMove ? '' : 'hidden';
        r.x.classList.toggle('unhide', isHidden);
        r.act.classList.toggle('has-unhide', isHidden);
        r.x.title = isHidden ? 'Unhide this row' : 'Hide From View';
    }

    const cardByKey = new Map();

    function renderCards() {
        ui.gridHead.style.display = 'none';
        ui.vspacer.classList.remove('paged');
        if (!ui.cardGrid) {
            ui.cardGrid = document.createElement('div');
            ui.cardGrid.className = 'cardgrid';
            ui.viewport.prepend(ui.cardGrid);
        }
        ui.cardGrid.style.display = '';
        ui.vspacer.style.height = '0px';
        for (let k = 0; k < pool.length; k++) {
            pool[k].style.display = 'none';
        }
        const rows = visibleRows();
        ui.empty.classList.toggle('show', rows.length === 0);
        const grid = ui.cardGrid;
        let node = grid.firstChild;
        for (const it of rows) {
            let el = cardByKey.get(it.key);
            if (!el) { el = makeCard(); cardByKey.set(it.key, el); }
            assignCard(el, it);
            if (node === el) node = node.nextSibling;
            else grid.insertBefore(el, node);
        }
        while (node) {
            const next = node.nextSibling;
            cardByKey.delete(node._key);
            node.remove();
            node = next;
        }
    }

    let catSignature = '';
    function renderMeta() {
        const { unique, qty, value, nc } = state.stats;
        ui.stUnique.textContent = nf.format(unique);
        ui.stQty.textContent = gridNum(qty);
        ui.stQty.title = exactTitle(qty);
        ui.stValue.textContent = gridNum(Math.round(value));
        ui.stValue.title = exactTitle(Math.round(value));
        ui.stNC.textContent = nf.format(nc);
        ui.launcherCount.textContent = state.items.length ? nf.format(state.items.length) : '';
        ui.footInfo.textContent = state.items.length
            ? `${nf.format(state.view.length)} of ${nf.format(state.items.length)} items shown · scanned ${timeAgo(state.scannedAt)}`
            : 'No data yet';

        if (state.pager.mode === 'page') {
            const pc = pageCount();
            const start = (state.pager.page - 1) * state.pager.pageSize + 1;
            const end = Math.min(state.pager.page * state.pager.pageSize, state.view.length);
            ui.pageInfo.textContent = `Page ${state.pager.page} / ${pc}`;
            ui.pageRange.textContent = state.view.length
                ? `Items ${nf.format(start)}-${nf.format(end)} of ${nf.format(state.view.length)}`
                : 'No items';
            ui.btnPrev.disabled = state.pager.page <= 1;
            ui.btnNext.disabled = state.pager.page >= pc;
            ui.pageJump.max = String(pc);
            setFieldIdle(ui.pageJump, state.pager.page);
        } else {
            ui.pageInfo.textContent = '';
            ui.pageRange.textContent = '';
        }

        const hiddenCount = hiddenKeys.size;
        ui.btnHidden.classList.toggle('gone', hiddenCount === 0 && !showHidden);
        ui.btnHidden.classList.toggle('on', showHidden);
        ui.btnHidden.textContent = showHidden
            ? `Showing hidden (${nf.format(hiddenCount)})`
            : `Hidden (${nf.format(hiddenCount)})`;

        if (catsDirty) {
            catsCache = [...new Set(state.items.map(catLabel).filter(Boolean))].sort();
            catsDirty = false;
        }
        const cats = catsCache;
        const sig = cats.join('|');
        if (sig !== catSignature) {
            catSignature = sig;
            for (const c in state.catFilter) if (!cats.includes(c)) delete state.catFilter[c];
            renderCatMenu();
        }
        renderQueueBar();
    }

    function renderQueueBar() {
        const units = [...state.queue.values()].reduce((s, q) => s + q, 0);
        ui.qbar.classList.toggle('closed', units === 0 && !state.withdrawing);
        ui.btnWithdraw.disabled = state.withdrawing || state.crawling || state.depositing || units === 0;
        ui.btnQClear.disabled = state.withdrawing;

        if (state.withdrawing) {
            ui.qbarInfo.textContent = `Moving items to your ${targetLabel(activeMoveTarget)}…`;
            ui.qChips.replaceChildren();
            return;
        }
        const entries = [...state.queue].filter(([key]) => state.byKey.has(key));
        ui.qbarInfo.textContent = `${nf.format(entries.length)} item${entries.length === 1 ? '' : 's'} · `
            + `${nf.format(units)} unit${units === 1 ? '' : 's'} queued`;

        const frag = document.createDocumentFragment();
        let shown = 0;
        for (const [key, q] of entries) {
            const it = state.byKey.get(key);
            shown++;
            if (shown > 8) continue;
            const chip = document.createElement('span');
            chip.className = 'qchip';
            chip.dataset.key = key;
            chip.title = 'Click to unqueue';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = it.name;
            const qtySpan = document.createElement('b');
            qtySpan.textContent = `×${q}`;
            chip.append(nameSpan, document.createTextNode(' '), qtySpan);
            frag.append(chip);
        }
        ui.qChips.replaceChildren(frag);
    }

    function fadeSwapViewport() {
        ui.vspacer.classList.remove('swap');
        void ui.vspacer.offsetWidth;
        ui.vspacer.classList.add('swap');
    }

    function viewChanged({ save = true, swap = true } = {}) {
        state.pager.page = 1;
        if (save) saveFilters();
        if (swap) fadeSwapViewport();
        ui.viewport.scrollTop = 0;
        scheduleUpdate();
    }

    function smoothScrollTop() {
        try { ui.viewport.scrollTo({ top: 0, behavior: 'smooth' }); }
        catch { ui.viewport.scrollTop = 0; }
    }

    let framePending = false, viewDirty = false, metaDirty = false;
    function frame(cb) {
        if (document.visibilityState === 'hidden') setTimeout(cb, 50);
        else requestAnimationFrame(cb);
    }
    function requestFrame() {
        if (framePending) return;
        framePending = true;
        frame(() => {
            framePending = false;
            if (viewDirty) { viewDirty = false; rebuildView(); }
            renderGrid();
            if (metaDirty) { metaDirty = false; renderMeta(); }
        });
    }
    function scheduleUpdate() { viewDirty = true; metaDirty = true; requestFrame(); }
    function scheduleLight() { metaDirty = true; requestFrame(); }

    function wireGrid() {
        let lastScrollLeft = -1;
        ui.viewport.addEventListener('scroll', () => {
            const sl = ui.viewport.scrollLeft;
            if (sl !== lastScrollLeft) { lastScrollLeft = sl; ui.gridHead.style.transform = `translateX(${-sl}px)`; }
            if (state.cardView || state.pager.mode === 'page') return;
            requestFrame();
        }, { passive: true });

        let colDrag = null;
        let sortClickBlocked = false;

        ui.gridHead.addEventListener('pointerdown', (e) => {
            const grip = e.target.closest('.colgrip');
            if (!grip) return;
            e.preventDefault();
            e.stopPropagation();
            const key = grip.dataset.col;
            const def = COL_DEFS.find((c) => c.key === key);
            if (!def) return;
            const th = grip.closest('.th');
            colDrag = {
                key, min: colMin(def), grip,
                startX: e.clientX,
                startW: th.getBoundingClientRect().width,
            };
            grip.classList.add('dragging');
            ui.gridHead.classList.add('resizing');
            grip.setPointerCapture(e.pointerId);
        });

        ui.gridHead.addEventListener('pointermove', (e) => {
            if (!colDrag) return;
            const dx = e.clientX - colDrag.startX;
            const next = Math.max(colDrag.min, Math.round((colDrag.startW + dx) / state.gridZoom));
            if (colWidths.get(colDrag.key) === next) return;
            colWidths.set(colDrag.key, next);
            applyColTemplate();
        });

        const endColDrag = (e) => {
            if (!colDrag) return;
            colDrag.grip.classList.remove('dragging');
            ui.gridHead.classList.remove('resizing');
            try { colDrag.grip.releasePointerCapture(e.pointerId); } catch {  }
            colDrag = null;
            saveColWidths();
            sortClickBlocked = true;
            setTimeout(() => { sortClickBlocked = false; }, 0);
        };
        ui.gridHead.addEventListener('pointerup', endColDrag);
        ui.gridHead.addEventListener('pointercancel', endColDrag);

        ui.gridHead.addEventListener('dblclick', (e) => {
            const grip = e.target.closest('.colgrip');
            if (!grip) return;
            e.preventDefault();
            e.stopPropagation();
            colWidths.delete(grip.dataset.col);
            applyColTemplate();
            saveColWidths();
        });

        ui.gridHead.addEventListener('click', (e) => {
            if (sortClickBlocked || e.target.closest('.colgrip')) return;
            const th = e.target.closest('.th[data-sort]');
            if (!th) return;
            const col = th.dataset.sort;
            if (state.sort.col === col) state.sort.dir *= -1;
            else state.sort = { col, dir: defaultSortDir(col) };
            refreshSortHeaders();
            viewChanged();
        });

        ui.cardSortSel.addEventListener('change', () => {
            const col = ui.cardSortSel.value;
            if (!SORT_GETTERS[col] || col === state.sort.col) return;
            state.sort = { col, dir: defaultSortDir(col) };
            refreshSortHeaders();
            viewChanged();
        });
        ui.cardSortDir.addEventListener('click', () => {
            state.sort.dir *= -1;
            refreshSortHeaders();
            viewChanged();
        });

        const applyQuery = debounce(() => {
            const q = ui.search.value.trim().toLowerCase();
            if (q === state.query) return;
            state.query = q;
            state.queryMatch = compileQuery(q);
            ui.searchClear.classList.toggle('show', !!state.query);
            viewChanged({ save: false });
        }, 200);
        ui.search.addEventListener('input', applyQuery);
        ui.searchClear.addEventListener('click', () => {
            ui.search.value = '';
            state.query = '';
            state.queryMatch = null;
            ui.searchClear.classList.remove('show');
            viewChanged({ save: false, swap: false });
            ui.search.focus();
        });

        ui.ncMode.addEventListener('click', (e) => {
            const seg = e.target.closest('.seg');
            if (!seg) return;
            state.ncMode = normNcMode(seg.dataset.nc === state.ncMode ? 'all' : seg.dataset.nc);
            Store.set('sdb_nc_mode', state.ncMode);
            syncNcMode();
            viewChanged();
        });

        ui.qChips.addEventListener('click', (e) => {
            if (state.withdrawing) return;
            const chip = e.target.closest('.qchip[data-key]');
            if (!chip) return;
            state.queue.delete(chip.dataset.key);
            saveQueue();
            scheduleLight();
        });

        function commitQn(input) {
            const key = input.closest('.row, .card')?._key;
            const it = key && state.byKey.get(key);
            if (!it) return;
            const v = parseInt(input.value, 10);
            const next = Number.isFinite(v) ? Math.max(0, Math.min(v, it.qty)) : (state.queue.get(key) || 0);
            if (next > 0) state.queue.set(key, next);
            else state.queue.delete(key);
            saveQueue();
            scheduleLight();
        }
        ui.viewport.addEventListener('focusout', (e) => {
            if (!e.target.classList?.contains('qn')) return;
            commitQn(e.target);
        });
        ui.viewport.addEventListener('focusin', (e) => {
            e.target.closest?.('.row, .card')?.classList.add('focused');
        });
        ui.viewport.addEventListener('focusout', (e) => {
            const el = e.target.closest?.('.row, .card');
            if (el && !el.contains(e.relatedTarget)) el.classList.remove('focused');
        });
        window.addEventListener('blur', () => {
            for (const el of ui.viewport.querySelectorAll('.row.focused, .card.focused')) el.classList.remove('focused');
        });
        ui.viewport.addEventListener('keydown', (e) => {
            if (!e.target.classList?.contains('qn')) return;
            if (e.key === 'Enter') { commitQn(e.target); e.target.blur(); }
        });

        ui.viewport.addEventListener('click', (e) => {
            if (e.detail !== 0) {
                const ctrl = e.target.closest('a, button');
                if (ctrl && ctrl.closest('.row, .card')) ctrl.blur();
            }
            const imgEl = e.target.closest('img');
            if (imgEl && imgEl.closest('.c-item, .thumbwrap')) {
                const key = imgEl.closest('.row, .card')?._key;
                const it = key && state.byKey.get(key);
                if (it) { GM_setClipboard(it.name, 'text'); toast('Item name copied'); }
                return;
            }
            const step = e.target.closest('.qp, .qm');
            if (step) {
                const key = step.closest('.row, .card')?._key;
                const it = key && state.byKey.get(key);
                if (!it || it.id == null) return;
                const cur = state.queue.get(key) || 0;
                const next = stepQueue(cur, it.qty, step.classList.contains('qp'), e.shiftKey);
                if (next > 0) state.queue.set(key, next);
                else state.queue.delete(key);
                saveQueue();
                scheduleLight();
                return;
            }
            const rm = e.target.closest('.act.rm');
            if (rm) {
                if (state.withdrawing) return;
                const key = rm.closest('.row, .card')?._key;
                const it = key && state.byKey.get(key);
                if (!it) return;
                dropFromState(it);
                hiddenKeys.delete(key);
                saveHidden();
                saveSnapshot();
                toast(`Removed ${it.name} (rescan restores)`);
                emit('data:changed');
                return;
            }
            const x = e.target.closest('.x');
            if (!x) return;
            const key = x.closest('.row, .card')?._key;
            if (!key) return;
            const it = state.byKey.get(key);
            if (hiddenKeys.has(key)) {
                hiddenKeys.delete(key);
                if (it) toast(`Unhid ${it.name}`);
            } else {
                hiddenKeys.add(key);
                if (it) toast(`Hid ${it.name} · Hidden (${nf.format(hiddenKeys.size)})`);
            }
            saveHidden();
            scheduleUpdate();
        });
    }

    function syncNcMode() {
        for (const b of ui.ncMode.querySelectorAll('.seg')) {
            b.classList.toggle('on', b.dataset.nc === state.ncMode);
            b.setAttribute('aria-pressed', String(b.dataset.nc === state.ncMode));
        }
    }

    function refreshSortHeaders() {
        for (const b of ui.gridHead.querySelectorAll('.th[data-sort]')) {
            const active = b.dataset.sort === state.sort.col;
            b.classList.toggle('on', active);
            b.querySelector('.arr').textContent = active ? (state.sort.dir === 1 ? '▲' : '▼') : '';
        }
        syncCardSortUI();
    }

    const setBusy = (busy) => {
        ui.btnStart.classList.toggle('gone', busy);
        ui.btnStop.classList.toggle('gone', !busy);
        ui.btnReprice.disabled = busy;
        ui.btnDeposit.disabled = busy;
    };
    on('crawl:start', ({ resuming, fromPage } = {}) => {
        setBusy(true);
        setStatus(resuming ? `Resuming from page ${nf.format(fromPage)}…` : 'Starting…', 'live');
        setProgress(0);
    });
    on('enrich:progress', ({ chunk, chunks, size }) => {
        setStatus(`Pricing chunk ${chunk}/${chunks} (${nf.format(size)} items)`, 'live');
        setProgress(chunk / Math.max(1, chunks));
    });
    on('reprice:start', () => {
        setBusy(true);
        setStatus('Repricing…', 'live');
        setProgress(0);
    });
    on('reprice:done', ({ stopped, count, unpriced }) => {
        setBusy(false);
        setProgress(null);
        setStatus(`${stopped ? 'Stopped' : 'Repriced'} · ${nf.format(count)} items`);
        toast((stopped
            ? `Reprice stopped, ${nf.format(count)} items updated`
            : `Reprice complete, ${nf.format(count)} items updated`)
            + (unpriced ? ` · ${nf.format(unpriced)} unpriced (ItemDB errors)` : ''));
    });
    on('reprice:error', ({ message }) => {
        setBusy(false);
        setProgress(null);
        setStatus('Error', 'err');
        toast(message, true);
    });
    on('crawl:progress', ({ page, totalPages }) => {
        setStatus(`Scanning page ${page}/${totalPages}`, 'live');
        setProgress((page - 1) / Math.max(1, totalPages));
    });
    on('status', ({ text }) => setStatus(text, 'live'));
    on('crawl:done', ({ stopped, count, unpriced }) => {
        setBusy(false);
        setProgress(null);
        setStatus(`${stopped ? 'Stopped' : 'Done'} · ${nf.format(count)} items`);
        toast((stopped ? `Scan stopped, ${nf.format(count)} items kept` : `Scan complete, ${nf.format(count)} items`)
            + (unpriced ? ` · ${nf.format(unpriced)} unpriced (ItemDB errors)` : ''));
    });
    on('crawl:error', ({ message }) => {
        setBusy(false);
        setProgress(null);
        setStatus('Error', 'err');
        toast(message, true);
    });
    on('withdraw:start', ({ total, action }) => {
        setBusy(true);
        setStatus(`Moving 0/${nf.format(total)} to ${targetLabel(action)}`, 'live');
        setProgress(0);
    });
    on('withdraw:progress', ({ done, total, name }) => {
        setStatus(`Moving ${nf.format(done + 1)}/${nf.format(total)} · ${name}`, 'live');
        setProgress(done / Math.max(1, total));
    });
    on('withdraw:error', ({ message }) => {
        setBusy(false);
        setProgress(null);
        setStatus('Error', 'err');
        toast(message, true);
    });
    on('withdraw:done', ({ done, failed, stopped, action, refused = [], notInBox = 0, items = [] }) => {
        setBusy(false);
        setProgress(null);
        writeHistoryEntry(action, true, done, failed + notInBox, items);
        const failTxt = failed ? ` · ${nf.format(failed)} failed` : '';
        const where = targetLabel(action);
        setStatus(`${stopped ? 'Stopped' : 'Moved'} ${nf.format(done)} to ${where}${failTxt}`, failed ? 'err' : '');
        const names = refused.slice(0, 5).join(', ') + (refused.length > 5 ? `, +${refused.length - 5} more` : '');
        const refTxt = refused.length ? ` · refused: ${names}` : '';
        const skipTxt = notInBox ? ` · skipped ${nf.format(notInBox)} no longer in your box, rescan to refresh` : '';
        toast(`Moved ${nf.format(done)} unit${done === 1 ? '' : 's'} to your ${where}${failTxt}${refTxt}${skipTxt}`, failed > 0 || notInBox > 0);
    });
    on('deposit:start', () => {
        setBusy(true);
        setStatus('Reading inventory…', 'live');
        setProgress(0);
    });
    on('deposit:progress', ({ done, total }) => {
        setStatus(`Depositing ${nf.format(done)}/${nf.format(total)}`, 'live');
        setProgress(done / Math.max(1, total));
    });
    on('deposit:error', ({ message }) => {
        setStatus('Error', 'err');
        toast(message, true);
    });
    on('deposit:done', ({ done, failed, added, priced, stopped, items = [], attempted = false }) => {
        setBusy(false);
        setProgress(null);
        if (attempted) writeHistoryEntry('deposit', true, done, failed, items);
        if (!done && !failed) { setStatus('Idle'); return; }
        const failTxt = failed ? ` · ${nf.format(failed)} failed` : '';
        setStatus(`${stopped ? 'Stopped' : 'Deposited'} ${nf.format(done)}${failTxt}`, failed ? 'err' : '');
        toast(`${stopped ? 'Deposit stopped, ' : 'Deposited '}${nf.format(done)} unit${done === 1 ? '' : 's'}${failTxt}`
            + (added ? ` · ${nf.format(added)} new item${added === 1 ? '' : 's'}` : '')
            + (priced ? ` · ${nf.format(priced)} priced` : ''), failed > 0);
    });
    let colMinsTimer = 0;
    const refreshColMins = () => {
        clearTimeout(colMinsTimer);
        colMinsTimer = setTimeout(() => { computeAutoMins(); applyColTemplate(); }, state.crawling ? 1000 : 250);
    };
    on('data:changed', () => { refreshColMins(); scheduleUpdate(); });

    mountUI();
    if (loadSnapshot()) setStatus(`Snapshot · ${nf.format(state.items.length)} items · ${timeAgo(state.scannedAt)}`);
    loadQueue();
    computeHeadMins();
    computeAutoMins();
    applyColTemplate();
    scheduleUpdate();

    if (Store.get('sdb_debug', false)) {
        window._sdbAggregator = Object.freeze({
            items: () => state.items.slice(),
            view: () => state.view.slice(),
            stats: () => ({ ...state.stats }),
            snapshot: () => Store.get('sdb_v2_snapshot', null),
            itemDBLookup: () => Store.get('itemDatabase', {}),
            queue: () => Object.fromEntries(state.queue),
            rescan: () => ui.btnStart.click(),
        });
    }
})();
