// ==UserScript==
// @name         📊 턴수 & 크래커 표시기
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.1.10
// @description  🧪 BETA · 입력창 내부 상단에 턴수, 사용/잔여/최근 차감 크래커를 표시합니다.
// @match        *://crack.wrtn.ai/*
// @grant        none
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @require      https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.2.1/crack/libraries/crack-shared-core.js
// @require      https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Count_Cracker_HUD.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Count_Cracker_HUD.user.js
// ==/UserScript==

(function () {
    'use strict';

    const DETAIL_PARTS_STORAGE_KEY = 'info_display_detail_parts';
    const VISIBLE_PARTS_STORAGE_KEY = 'info_display_visible_parts';
    const OUTPUT_COST_STORAGE_KEY = 'info_display_output_costs';
    const TIMESTAMPS_CACHE_KEY = 'info_display_chat_timestamps';

    const SELECTOR = {
        input: 'textarea[placeholder*="메시지"], div.__chat_input_textarea, div[contenteditable="true"].tiptap',
        messageGroup: 'div[data-message-group-id]',
        modelIcon: 'img[src*="model-icon"]'
    };

    const MODEL_INFO = {
        "하이퍼챗 1.5": { cost: 85 }, "하이퍼챗 1.0": { cost: 75 },
        "슈퍼챗 2.5": { cost: 50 }, "슈퍼챗 2.0": { cost: 50 }, "슈퍼챗 1.5": { cost: 50 },
        "프로챗 2.5": { cost: 58 }, "프로챗 1.0": { cost: 50 }, "파워챗": { cost: 20 }
    };

    const MODEL_ICON_MAP = {
        'hyperchat1_5.webp': '하이퍼챗 1.5', 'hyperchat.webp': '하이퍼챗 1.0',
        'superchat2_5.webp': '슈퍼챗 2.5', 'superchat2_0.webp': '슈퍼챗 2.0', 'superchat1_5.webp': '슈퍼챗 1.5',
        'prochat2_5.webp': '프로챗 2.5', 'prochat1_0.webp': '프로챗 1.0', 'powerchat.webp': '파워챗'
    };

    const DEFAULT_DETAIL_PARTS = { turn: false, cumulative: false, cracker: false };
    const DEFAULT_VISIBLE_PARTS = { turn: true, cumulative: true, cracker: true };

    const CRACKER_PATH = "M21.17 12.01c.52-.59.83-1.36.83-2.21s-.31-1.62-.83-2.21l.17-.21q0-.01.02-.02l.14-.21q0-.02.03-.05.06-.1.1-.2l.05-.08.09-.2q.01-.05.04-.11l.06-.18q0-.08.04-.14.01-.07.04-.16l.03-.19q0-.06.02-.13v-.33a3.37 3.37 0 0 0-3.36-3.37l-.33.01q-.06 0-.12.02-.1 0-.2.03-.07 0-.15.04l-.14.04-.18.06-.11.04-.2.09-.07.04-.2.11q-.03 0-.05.03l-.21.14-.02.02-.21.17a3.4 3.4 0 0 0-4.42 0 3.3 3.3 0 0 0-2.21-.83c-.85 0-1.62.31-2.21.83l-.21-.17-.02-.02-.21-.14q-.02 0-.05-.03l-.2-.11-.08-.04-.2-.09-.11-.04-.18-.06-.14-.04-.16-.04-.2-.03-.12-.02-.33-.01a3.37 3.37 0 0 0-3.34 3.82q0 .1.03.19 0 .07.04.16 0 .08.04.14l.06.18q0 .05.04.11.03.1.09.19l.04.08.1.2q.01.02.04.05l.16.23q.07.1.17.21a3.3 3.3 0 0 0-.83 2.21c0 .85.3 1.62.83 2.21a3.3 3.3 0 0 0-.83 2.21c0 .85.3 1.62.83 2.21l-.17.21-.02.02-.14.21q0 .02-.03.05l-.11.2-.04.08-.1.2-.03.11-.06.18-.04.14-.04.16-.03.19-.02.13-.01.33A3.4 3.4 0 0 0 3.02 21c.6.61 1.45.99 2.38.99l.33-.01q.06 0 .12-.02.1 0 .19-.03.07 0 .16-.04l.14-.04.18-.06.1-.04.2-.09.08-.04.2-.11q.03 0 .05-.03l.2-.14.03-.02.2-.17a3.4 3.4 0 0 0 4.43 0 3.32 3.32 0 0 0 4.42 0 3 3 0 0 0 .44.33q.03 0 .05.03l.2.11.08.04.2.09.10.04.19.06.14.04.16.04.19.03.13.02.33.01c.92 0 1.75-.37 2.36-.97l.02-.02c.6-.61.99-1.45.99-2.38l-.01-.33q0-.06-.02-.12 0-.10-.03-.19 0-.07-.04-.16l-.04-.14-.06-.18-.04-.11-.1-.19-.03-.08-.11-.2q0-.02-.03-.05l-.14-.21-.02-.02-.17-.21c.52-.59.83-1.36.83-2.21s-.31-1.62-.83-2.21M7.5 13.5 6 12l1.5-1.5L9 12zM12 6l1.5 1.5L12 9l-1.5-1.5zm0 12-1.5-1.5L12 15l1.5 1.5zm4.5-4.5L15 12l1.5-1.5L18 12z";

    const ICON = {
        settings: `<svg width="6" height="18" viewBox="0 0 6 18" fill="currentColor" class="my-counter-settings-icon"><circle cx="3" cy="3.5" r="1.8"/><circle cx="3" cy="9" r="1.8"/><circle cx="3" cy="14.5" r="1.8"/></svg>`,
        clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-counter-small-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        cracker: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="my-counter-cracker-icon"><path fill="currentColor" d="${CRACKER_PATH}"></path></svg>`,
        bittenCracker: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="my-counter-cracker-icon"><defs><mask id="bite-mask-cracker"><rect width="24" height="24" fill="white" /><circle cx="24" cy="0" r="12" fill="black" /></mask></defs><path fill="currentColor" mask="url(#bite-mask-cracker)" d="${CRACKER_PATH}"></path></svg>`
    };

    let counterBadge = null;
    let textSpan = null;
    let settingsBtn = null;
    let settingsMenu = null;
    let currentInput = null;
    let currentContainer = null;

    let detailParts = loadDetailParts();
    let visibleParts = loadVisibleParts();

    let updateTimer = null;
    let observer = null;
    let lastRenderedText = '';

    let cachedTurns = null;
    let cachedTotalMessages = null;
    let isCalculatingTurns = false;
    let lastCalculatedTime = 0;
    let lastChatId = null;

    let cachedCumulative = null;
    let isCalculatingCumulative = false;
    let lastProcessedTurns = -1;
    let cumulativeRetryDoneForChat = null;

    let cachedLastConsumed = null;
    let isCheckingLastConsumed = false;
    let lastConsumedCheckTime = 0;
    let cachedApiCrackerCount = null;
    let isCheckingApiCrackerCount = false;
    let lastApiCrackerCheckTime = 0;
    let lastApiCrackerSuccessTime = 0;

    let lastDialogCheckTime = 0;

    injectBaseStyle();
    bindGlobalEvents();
    startObserver();
    scheduleUpdate();

    function injectBaseStyle() {
        if (document.getElementById('info-display-base-style')) return;

        const style = document.createElement('style');
        style.id = 'info-display-base-style';
        style.textContent = `
            #my-custom-info-display {
                --info-display-z: 999;
                position: absolute;
                top: 2px;
                left: 0;
                right: 0;
                padding-top: 5px;
                padding-bottom: 5px;
                box-sizing: border-box;
                font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 13px;
                font-weight: 500;
                pointer-events: none;
                z-index: var(--info-display-z);
                display: flex;
                align-items: center;
                border-radius: 8px 8px 0 0;
            }

            #my-custom-info-display.is-under-side-layer {
                --info-display-z: 1;
            }

            #my-custom-info-display #my-counter-settings-button {
                all: unset;
                position: relative;
                pointer-events: auto;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-left: 0;
                margin-right: 8px;
                transition: opacity 0.15s;
                touch-action: manipulation;
                color: inherit;
            }

            #my-custom-info-display #my-counter-settings-button::after {
                content: '';
                position: absolute;
                top: -10px;
                bottom: -10px;
                left: -8px;
                right: -10px;
            }

            #my-custom-info-display #my-counter-settings-button:hover {
                opacity: 0.7;
            }

            .my-counter-settings-icon {
                display: block;
                flex-shrink: 0;
            }

            #my-custom-info-display #my-counter-text {
                display: flex;
                align-items: center;
                gap: 0;
            }

            .my-counter-part {
                all: unset;
                display: inline-flex;
                align-items: center;
                pointer-events: auto;
                border-radius: 4px;
                padding: 1px 2px;
                touch-action: manipulation;
                user-select: none;
                transition: background 0.15s;
                cursor: pointer;
            }

            .my-counter-separator {
                opacity: 0.45;
                margin: 0 3px;
                pointer-events: none;
                user-select: none;
            }

            #info-display-settings-menu {
                display: none;
                position: fixed;
                border-radius: 8px;
                padding: 4px;
                flex-direction: column;
                align-items: flex-start;
                gap: 1px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                z-index: 9999999;
                width: max-content;
                min-width: unset;
                box-sizing: border-box;
                font-size: 13px;
                border-style: solid;
                border-width: 1px;
                font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            .my-counter-settings-title {
                font-size: 12px;
                font-weight: 700;
                opacity: 0.7;
                padding: 0 4px 2px;
                width: max-content;
                box-sizing: border-box;
                white-space: nowrap;
            }

            .my-counter-settings-row {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 2px 6px;
                border-radius: 5px;
                cursor: pointer;
                user-select: none;
                touch-action: manipulation;
                width: max-content;
                box-sizing: border-box;
                white-space: nowrap;
            }

            .my-counter-settings-row:hover {
                background: rgba(128,128,128,0.16);
            }

            .my-counter-settings-row input {
                margin: 0;
                cursor: pointer;
            }

            .my-counter-small-icon {
                margin-right: 5px;
                flex-shrink: 0;
            }

            .my-counter-cracker-icon {
                margin: 0 4px 0 0;
                flex-shrink: 0;
            }

            @keyframes info-pulse {
                0% { opacity: 0.5; filter: drop-shadow(0 0 1px currentColor); }
                50% { opacity: 1; filter: drop-shadow(0 0 5px currentColor); }
                100% { opacity: 0.5; filter: drop-shadow(0 0 1px currentColor); }
            }

            .pulse-anim {
                animation: info-pulse 1s infinite ease-in-out;
            }

            @media (max-width: 520px) {
                #my-custom-info-display {
                    font-size: 12px;
                }

                .my-counter-separator {
                    margin: 0 2px;
                }

                .my-counter-part {
                    padding: 1px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function bindGlobalEvents() {
        document.addEventListener('click', (e) => {
            const clickedInsideSettingsMenu = settingsBtn?.contains(e.target) || settingsMenu?.contains(e.target);
            if (!clickedInsideSettingsMenu && settingsMenu?.style.display === 'flex') hideSettingsMenu();
        });

        window.addEventListener('scroll', hideSettingsMenu, true);
        window.addEventListener('resize', hideSettingsMenu);
    }

    function startObserver() {
        if (observer) return;

        observer = new MutationObserver((mutations) => {
            const onlyMine = mutations.every((m) => {
                const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                return el?.closest?.('#my-custom-info-display, #info-display-settings-menu');
            });

            if (onlyMine) return;
            scheduleUpdate();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['aria-valuenow', 'data-state', 'class', 'style']
        });
    }

    function scheduleUpdate() {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(updateTurnCount, 80);
    }

    function loadDetailParts() {
        try {
            return { ...DEFAULT_DETAIL_PARTS, ...JSON.parse(localStorage.getItem(DETAIL_PARTS_STORAGE_KEY) || '{}') };
        } catch {
            return { ...DEFAULT_DETAIL_PARTS };
        }
    }

    function saveDetailParts() {
        localStorage.setItem(DETAIL_PARTS_STORAGE_KEY, JSON.stringify(detailParts));
    }

    function loadVisibleParts() {
        try {
            return { ...DEFAULT_VISIBLE_PARTS, ...JSON.parse(localStorage.getItem(VISIBLE_PARTS_STORAGE_KEY) || '{}') };
        } catch {
            return { ...DEFAULT_VISIBLE_PARTS };
        }
    }

    function saveVisibleParts() {
        localStorage.setItem(VISIBLE_PARTS_STORAGE_KEY, JSON.stringify(visibleParts));
    }

    function toggleDetailPart(partKey) {
        if (!Object.prototype.hasOwnProperty.call(detailParts, partKey)) return;
        if (visibleParts[partKey] === false) return;
        if (partKey === 'cumulative') return;

        detailParts[partKey] = !detailParts[partKey];
        saveDetailParts();

        lastRenderedText = '';
        scheduleUpdate();
    }

    function getCachedTimestamps(chatId) {
        if (!chatId) return [];
        try {
            const data = JSON.parse(localStorage.getItem(TIMESTAMPS_CACHE_KEY) || '{}');
            return Array.isArray(data[chatId]) ? data[chatId] : [];
        } catch {
            return [];
        }
    }

    function addTimestampsToCache(chatId, newTimestamps) {
        if (!chatId || !newTimestamps || !newTimestamps.length) return;
        try {
            const data = JSON.parse(localStorage.getItem(TIMESTAMPS_CACHE_KEY) || '{}');
            const existing = new Set(Array.isArray(data[chatId]) ? data[chatId] : []);
            let changed = false;

            for (const ts of newTimestamps) {
                if (typeof ts === 'number' && ts > 0 && !existing.has(ts)) {
                    existing.add(ts);
                    changed = true;
                }
            }

            if (changed) {
                data[chatId] = Array.from(existing);
                localStorage.setItem(TIMESTAMPS_CACHE_KEY, JSON.stringify(data));
            }
        } catch {}
    }

    function getThemeColors(refEl) {
        let bg = '#212121';
        let current = refEl;

        while (current && current !== document.body) {
            const cBg = getComputedStyle(current).backgroundColor;
            if (cBg && cBg !== 'rgba(0, 0, 0, 0)' && cBg !== 'transparent') {
                bg = cBg;
                break;
            }
            current = current.parentElement;
        }

        const match = bg.match(/\d+/g);
        let isDark = true;

        if (match && match.length >= 3) {
            const [r, g, b] = match.map(Number);
            isDark = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
        }

        return {
            bg,
            text: isDark ? '#888' : '#777',
            menuBg: isDark ? '#282828' : '#fff',
            menuBorder: isDark ? '#444' : '#e5e5e5',
            itemText: isDark ? '#ccc' : '#444'
        };
    }

    function findInputContainer(inputEl) {
        const newUiContainer = inputEl.closest('div.flex.flex-col.rounded-lg.border, div.rounded-lg.border.bg-background');
        if (newUiContainer) return newUiContainer;
        return inputEl.parentElement;
    }

    function initUI(inputEl) {
        document.getElementById('my-custom-info-display')?.remove();
        document.getElementById('info-display-settings-menu')?.remove();

        lastRenderedText = '';
        currentInput = inputEl;

        const container = findInputContainer(inputEl);
        if (!container) return;

        currentContainer = container;

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        counterBadge = document.createElement('div');
        counterBadge.id = 'my-custom-info-display';

        settingsBtn = document.createElement('button');
        settingsBtn.id = 'my-counter-settings-button';
        settingsBtn.type = 'button';
        settingsBtn.innerHTML = ICON.settings;
        settingsBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSettingsMenu();
        };

        textSpan = document.createElement('span');
        textSpan.id = 'my-counter-text';
        textSpan.onclick = (e) => {
            const part = e.target.closest('.my-counter-part');
            if (!part) return;

            e.preventDefault();
            e.stopPropagation();
            toggleDetailPart(part.dataset.part);
        };

        counterBadge.append(settingsBtn, textSpan);
        container.appendChild(counterBadge);

        settingsMenu = buildSettingsMenu();
        document.body.appendChild(settingsMenu);

        const colors = getThemeColors(inputEl);
        counterBadge.style.backgroundColor = colors.bg;
        counterBadge.style.color = colors.text;
        settingsMenu.style.background = colors.menuBg;
        settingsMenu.style.borderColor = colors.menuBorder;
        settingsMenu.style.color = colors.itemText;

        updateLayout(inputEl);
    }

    function buildSettingsMenu() {
        const menu = document.createElement('div');
        menu.id = 'info-display-settings-menu';

        const title = document.createElement('div');
        title.className = 'my-counter-settings-title';
        title.textContent = '정보 표시';
        menu.appendChild(title);

        const items = [
            { key: 'turn', label: '턴수' },
            { key: 'cumulative', label: '사용 크래커' },
            { key: 'cracker', label: '잔여 크래커' }
        ];

        for (const item of items) {
            const row = document.createElement('label');
            row.className = 'my-counter-settings-row';
            row.innerHTML = `<input type="checkbox" data-part="${item.key}"><span>${item.label}</span>`;

            const input = row.querySelector('input');
            input.onchange = (e) => {
                e.stopPropagation();
                visibleParts[item.key] = input.checked;
                saveVisibleParts();

                lastRenderedText = '__FORCE__';
                scheduleUpdate();
                syncSettingsMenu();
            };

            menu.appendChild(row);
        }

        return menu;
    }

    function toggleSettingsMenu() {
        if (!settingsMenu || !settingsBtn) return;

        if (settingsMenu.style.display === 'flex') {
            hideSettingsMenu();
            return;
        }

        settingsMenu.style.display = 'flex';
        syncSettingsMenu();
        positionSettingsMenu();
    }

    function hideSettingsMenu() {
        if (settingsMenu) settingsMenu.style.display = 'none';
    }

    function positionSettingsMenu() {
        if (!settingsMenu || !settingsBtn) return;

        const rect = settingsBtn.getBoundingClientRect();
        settingsMenu.style.left = '0px';
        settingsMenu.style.top = '0px';

        const width = settingsMenu.offsetWidth;
        const height = settingsMenu.offsetHeight;
        const gap = 8;

        let left = rect.left;
        left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));

        let top = rect.top - height - gap;
        if (top < gap) top = rect.bottom + gap;

        settingsMenu.style.left = `${left}px`;
        settingsMenu.style.top = `${top}px`;
    }

    function syncSettingsMenu() {
        if (!settingsMenu) return;

        settingsMenu.querySelectorAll('input[data-part]').forEach(input => {
            input.checked = visibleParts[input.dataset.part] !== false;
        });
    }

    function parseCrackerCountFromCashResponse(data) {
        const directPaths = [
            ['data', 'cash'],
            ['data', 'cracker'],
            ['data', 'crackers'],
            ['data', 'balance'],
            ['data', 'total'],
            ['data', 'amount'],
            ['cash'],
            ['cracker'],
            ['crackers'],
            ['balance'],
            ['total'],
            ['amount']
        ];

        const readPath = (obj, path) => path.reduce((acc, key) => acc?.[key], obj);
        const normalizeNumber = (value) => {
            const parsed = typeof value === 'number'
                ? value
                : parseInt(String(value ?? '').replace(/,/g, ''), 10);

            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        };

        for (const path of directPaths) {
            const parsed = normalizeNumber(readPath(data, path));
            if (parsed !== null) return parsed;
        }

        const candidates = [];

        const visit = (value, path = []) => {
            if (value === null || value === undefined || path.length > 6) return;

            if (typeof value === 'number' || typeof value === 'string') {
                const parsed = normalizeNumber(value);
                if (parsed === null) return;

                const joined = path.join('.').toLowerCase();
                const lastKey = String(path[path.length - 1] || '').toLowerCase();

                if (/id|date|time|count|price|cost/.test(lastKey)) return;

                let score = 0;
                if (/cash|cracker/.test(joined)) score += 20;
                if (/balance/.test(joined)) score += 12;
                if (/remain|available|current/.test(joined)) score += 8;
                if (/total|amount/.test(lastKey)) score += 4;

                if (score > 0) candidates.push({ value: parsed, score });
                return;
            }

            if (Array.isArray(value)) {
                value.slice(0, 5).forEach((item, index) => visit(item, path.concat(index)));
                return;
            }

            if (typeof value === 'object') {
                Object.entries(value).forEach(([key, item]) => visit(item, path.concat(key)));
            }
        };

        visit(data);
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.value ?? null;
    }

    async function fetchCurrentCrackerCount() {
        const token = extractAccessToken();
        if (!token) return null;

        const res = await fetch('https://crack-api.wrtn.ai/crack-cash/cash', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                platform: 'web',
                'wrtn-locale': 'ko-KR'
            }
        });

        if (!res.ok) return null;

        const json = await res.json();
        return parseCrackerCountFromCashResponse(json);
    }

    function getCrackerCount() {
        if (cachedApiCrackerCount !== null && Date.now() - lastApiCrackerSuccessTime < 10000) {
            return cachedApiCrackerCount;
        }

        const label = Array.from(document.querySelectorAll('span')).find(span => span.textContent.trim() === '나의 크래커');
        const container = label?.nextElementSibling;
        const match = container?.textContent.match(/[\d,]+/);

        if (match) return parseInt(match[0].replace(/,/g, ''), 10);

        const topBar = document.getElementById('chasm-cracker-text');
        if (topBar) {
            const text = topBar.getAttribute('chasm-tmi-current') || topBar.textContent;
            const parsed = parseInt(String(text).replace(/,/g, ''), 10);
            if (!Number.isNaN(parsed)) return parsed;
        }

        return null;
    }

    function getCurrentModelName() {
        const icons = Array.from(document.querySelectorAll(SELECTOR.modelIcon));

        for (const icon of icons) {
            if (icon.closest('[role="menuitem"]') || icon.closest('[role="dialog"]')) continue;

            const fromSrc = Object.entries(MODEL_ICON_MAP).find(([file]) => (icon.src || '').includes(file));
            if (fromSrc) return fromSrc[1];

            const found = Object.keys(MODEL_INFO).find(model => (icon.alt || '').includes(model));
            if (found) return found;
        }

        return null;
    }

    function getOutputDialog() {
        return Array.from(document.querySelectorAll('[role="dialog"]')).find(el => el.textContent.includes('최대 출력량 조절')) || null;
    }

    function getModelBlockFromIcon(icon) {
        let current = icon;

        for (let i = 0; i < 8 && current; i++) {
            const text = current.innerText || '';
            if (!!current.querySelector?.('span[role="slider"]') && /최대\s*\d+\s*개/.test(text)) return current;
            current = current.parentElement;
        }

        return null;
    }

    function readOutputCostsFromOpenDialog() {
        const dialog = getOutputDialog();
        if (!dialog) return null;

        const result = {};
        const icons = Array.from(dialog.querySelectorAll('img[src*="/model-icon/"]'));

        for (const icon of icons) {
            const modelName = Object.entries(MODEL_ICON_MAP).find(([file]) => (icon.src || '').includes(file))?.[1];
            if (!modelName) continue;

            const block = getModelBlockFromIcon(icon);
            if (!block) continue;

            const maxMatch = (block.innerText || '').match(/최대\s*(\d+)\s*개/);
            if (maxMatch) {
                result[modelName] = {
                    maxCost: parseInt(maxMatch[1], 10),
                    updatedAt: Date.now()
                };
            }
        }

        if (Object.keys(result).length > 0) {
            localStorage.setItem(OUTPUT_COST_STORAGE_KEY, JSON.stringify(result));
            return result;
        }

        return null;
    }

    function getOutputAdjustedCost(modelName) {
        if (!modelName) return null;

        const cachedCosts = (() => {
            try {
                return JSON.parse(localStorage.getItem(OUTPUT_COST_STORAGE_KEY) || '{}');
            } catch {
                return {};
            }
        })();

        return cachedCosts?.[modelName]?.maxCost || MODEL_INFO[modelName]?.cost || null;
    }

    function isVisibleSideLayer(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el.closest('#my-custom-info-display, #info-display-settings-menu, #my-custom-btn-menu, #btn-custom-dropdown-menu, #btn-menu-settings-menu')) return false;
        if (counterBadge && (el.contains(counterBadge) || counterBadge.contains(el))) return false;

        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return false;
        if (rect.width < 220 || rect.height < window.innerHeight * 0.55) return false;

        const touchesSide = rect.left <= 8 || rect.right >= window.innerWidth - 8;
        const looksLayered = style.position === 'fixed' || style.position === 'absolute' || style.position === 'sticky';
        const text = el.textContent || '';
        const isSmallPopupRole = el.matches('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]');

        return touchesSide && looksLayered && !isSmallPopupRole && text.length > 0;
    }

    function isOpenMobileSidebar(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el.closest('#my-custom-info-display, #info-display-settings-menu, #my-custom-btn-menu, #btn-custom-dropdown-menu, #btn-menu-settings-menu')) return false;

        const root = el.closest('[width="260px"], [class*="css-17jcfrp"], [class*="bg-sidebar"]') || el;
        const rect = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        const text = root.textContent || '';

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width >= 220 &&
            rect.width <= 340 &&
            rect.height >= window.innerHeight * 0.65 &&
            rect.left <= 8 &&
            (root.querySelector?.('.bg-sidebar, [class*="bg-sidebar"]') || root.className?.toString().includes('bg-sidebar')) &&
            /MY|이미지|크래커|알림|캐릭터|채팅|보관|episode|party/i.test(text)
        );
    }

    function syncSideLayerStack() {
        if (!counterBadge) return;

        const mobileSidebarOpen = Array.from(document.body.querySelectorAll('.bg-sidebar, [class*="bg-sidebar"], [width="260px"], [class*="css-17jcfrp"]'))
            .some(isOpenMobileSidebar);
        const sideLayerOpen = mobileSidebarOpen || Array.from(document.body.querySelectorAll('[data-state="open"], [aria-expanded="true"], aside, section, div[class*="side"], div[class*="Side"], div[class*="drawer"], div[class*="Drawer"], div[class*="sheet"], div[class*="Sheet"]'))
            .some(isVisibleSideLayer);

        counterBadge.classList.toggle('is-under-side-layer', sideLayerOpen);
        if (sideLayerOpen) hideSettingsMenu();
    }

    function updateLayout(inputEl) {
        if (!counterBadge || !counterBadge.parentElement) return;

        const otherTopMenu = document.getElementById('my-custom-btn-menu');
        const otherIsInsideContainer =
            otherTopMenu && counterBadge.parentElement.contains(otherTopMenu);

        counterBadge.style.top = otherIsInsideContainer ? '32px' : '2px';
        counterBadge.style.left = '0';
        counterBadge.style.right = '0';

        counterBadge.style.paddingLeft = '12px';
        counterBadge.style.paddingRight = '12px';

        const requiredPaddingTop = otherIsInsideContainer ? 81 : 46;

        inputEl.style.setProperty('padding-top', `${requiredPaddingTop}px`, 'important');
        inputEl.style.setProperty('min-height', `${requiredPaddingTop + 40}px`, 'important');

        syncSideLayerStack();
    }

    function renderParts(parts) {
        if (!textSpan) return;

        const visibleRenderParts = parts.filter(part => visibleParts[part.key] !== false);

        if (visibleRenderParts.length === 0) {
            textSpan.replaceChildren();
            lastRenderedText = '__EMPTY__';
            return;
        }

        const html = visibleRenderParts.map((part, index) => {
            const sep = index > 0 ? `<span class="my-counter-separator">|</span>` : '';
            const isDetail = detailParts[part.key];
            const contentHtml = isDetail ? part.detailHtml : part.summaryHtml;

            return `${sep}<button class="my-counter-part" data-part="${part.key}" ${part.key === 'cumulative' ? 'style="cursor:default;"' : ''}>${contentHtml}</button>`;
        }).join('');

        if (html === lastRenderedText) return;

        textSpan.innerHTML = html;
        lastRenderedText = html;
    }

    function extractAccessToken() {
        const cookies = document.cookie.split(';');

        for (let cookie of cookies) {
            if (cookie.trim().startsWith('access_token=')) {
                return cookie.trim().split('=')[1];
            }
        }

        return null;
    }

    function getTimeFromObjectId(objectId) {
        if (!objectId || objectId.length < 8) return 0;

        try {
            return parseInt(objectId.substring(0, 8), 16) * 1000;
        } catch {
            return 0;
        }
    }

    async function fetchRoomData() {
        if (typeof CrackUtil === 'undefined') {
            return { chatCounts: -1, totalMessages: -1, timestamps: [] };
        }

        try {
            const pathInfo = CrackUtil.path();
            if (!pathInfo.isChattingPath()) {
                return { chatCounts: -1, totalMessages: -1, timestamps: [] };
            }

            const chatId = pathInfo.chatRoom();
            if (!chatId) {
                return { chatCounts: -1, totalMessages: -1, timestamps: [] };
            }

            let chatCounts = 0;
            let totalMessages = 0;
            const liveTimestamps = [];

            const iterator = CrackUtil.chatRoom().iterateLogs(chatId);

            for await (let log of iterator) {
                totalMessages++;

                if (log.isUser()) {
                    chatCounts++;
                    continue;
                }

                liveTimestamps.push(getTimeFromObjectId(log.id));
            }

            const validLive = liveTimestamps.filter(t => t > 0);
            addTimestampsToCache(chatId, validLive);

            const cachedAll = getCachedTimestamps(chatId);

            return {
                chatCounts,
                totalMessages,
                timestamps: cachedAll.length > 0 ? cachedAll : validLive
            };
        } catch {
            return { chatCounts: -1, totalMessages: -1, timestamps: [] };
        }
    }

    async function fetchCumulativeCrackers(timestamps) {
        const token = extractAccessToken();
        if (!token || timestamps.length === 0) return 0;

        let totalCalculated = 0;
        let page = 1;
        let lastSafePage = 1;
        let keepGoing = true;
        let isWarping = true;
        let fallbackCount = 0;

        const oldestMsgTime = Math.min(...timestamps);
        const latestMsgTime = Math.max(...timestamps);

        while (keepGoing && page <= 500 && fallbackCount < 500) {
            fallbackCount++;

            const url = `https://crack-api.wrtn.ai/crack-cash/crackers/history?limit=10&type=all&page=${page}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) break;

            const json = await res.json();
            if (!json?.data?.length) break;

            const pageLatestTime = new Date(json.data[0].date).getTime();

            if (isWarping && pageLatestTime < latestMsgTime) {
                page = lastSafePage + 1;
                isWarping = false;
                continue;
            }

            if (isWarping && pageLatestTime > latestMsgTime + 600000) {
                lastSafePage = page;
                page += 15;
                continue;
            }

            isWarping = false;

            for (let item of json.data) {
                const itemTime = new Date(item.date).getTime();

                if (itemTime < oldestMsgTime - 120000) {
                    keepGoing = false;
                    break;
                }

                if (String(item.isConsumed) === 'true' && timestamps.some(ts => Math.abs(ts - itemTime) <= 60000)) {
                    totalCalculated += (item.product === 'superchat' ? item.balance.total * 35 : item.balance.total);
                }
            }

            page++;
            await new Promise(r => setTimeout(r, 40));
        }

        return totalCalculated;
    }

    async function fetchLastConsumedCracker() {
        const token = extractAccessToken();
        if (!token) return null;

        const url = `https://crack-api.wrtn.ai/crack-cash/crackers/history?limit=10&type=all&page=1`;

        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) return null;

        const json = await res.json();
        if (!json?.data?.length) return null;

        const consumed = json.data.find(item => String(item.isConsumed) === 'true');
        if (!consumed) return null;

        const amount = consumed.product === 'superchat'
            ? consumed.balance.total * 35
            : consumed.balance.total;

        return {
            amount,
            date: consumed.date,
            product: consumed.product
        };
    }

    function updateTurnCount() {
        const now = Date.now();

        if (now - lastDialogCheckTime > 1500) {
            readOutputCostsFromOpenDialog();
            lastDialogCheckTime = now;
        }

        const inputEl = Array.from(document.querySelectorAll(SELECTOR.input)).find(el => {
            if (el.dataset.loreRefinerMessageId) return false;
            if (el.closest('.bg-surface_tertiary')) return false;

            const wrapText = (el.closest('div.flex.flex-col')?.innerText || '');
            if (wrapText.includes('수정 완료') || wrapText.includes('취소')) return false;

            return true;
        });

        if (!inputEl) {
            counterBadge?.remove();
            counterBadge = null;
            currentInput = null;
            currentContainer = null;
            hideSettingsMenu();
            return;
        }

        const expectedContainer = findInputContainer(inputEl);

        if (!counterBadge ||
            currentInput !== inputEl ||
            currentContainer !== expectedContainer ||
            counterBadge.parentElement !== expectedContainer) {
            initUI(inputEl);
        }

        if (!counterBadge || !textSpan) return;

        const currentChatId = typeof CrackUtil !== 'undefined' ? CrackUtil.path().chatRoom() : null;

        let forceCalculate = false;

        if (currentChatId && currentChatId !== lastChatId) {
            lastChatId = currentChatId;
            forceCalculate = true;
            cachedTurns = null;
            cachedTotalMessages = null;
            cachedCumulative = null;
            cachedLastConsumed = null;
            lastProcessedTurns = -1;
            cumulativeRetryDoneForChat = null;
        }

        const currentModelName = getCurrentModelName();

        if (!isCalculatingTurns && (forceCalculate || now - lastCalculatedTime > 1500)) {
            isCalculatingTurns = true;

            fetchRoomData().then(data => {
                const domTotalMessages = document.querySelectorAll(SELECTOR.messageGroup).length;

                if (data.chatCounts !== -1) {
                    if (data.chatCounts === 0 && data.totalMessages <= 0 && domTotalMessages > 0) {
                        cachedTurns = Math.floor(domTotalMessages / 2);
                        cachedTotalMessages = domTotalMessages;
                    } else {
                        cachedTurns = data.chatCounts;
                        cachedTotalMessages = data.totalMessages !== -1 ? data.totalMessages : null;
                    }

                    if (cachedTurns !== lastProcessedTurns && !isCalculatingCumulative && data.timestamps.length > 0) {
                        lastProcessedTurns = cachedTurns;
                        isCalculatingCumulative = true;
                        renderUpdate(inputEl, currentModelName);

                        fetchCumulativeCrackers(data.timestamps).then(async cum => {
                            if (cum === 0 && cachedTurns >= 2 && currentChatId && cumulativeRetryDoneForChat !== currentChatId) {
                                cumulativeRetryDoneForChat = currentChatId;
                                await new Promise(r => setTimeout(r, 1000));
                                cum = await fetchCumulativeCrackers(data.timestamps);
                            }

                            cachedCumulative = cum;
                            isCalculatingCumulative = false;
                            renderUpdate(inputEl, currentModelName);
                        }).catch(() => {
                            isCalculatingCumulative = false;
                            renderUpdate(inputEl, currentModelName);
                        });
                    }
                } else {
                    cachedTotalMessages = domTotalMessages;
                    cachedTurns = Math.floor(domTotalMessages / 2);
                }

                lastCalculatedTime = Date.now();
                isCalculatingTurns = false;
                renderUpdate(inputEl, currentModelName);
            }).catch(() => {
                isCalculatingTurns = false;
                renderUpdate(inputEl, currentModelName);
            });
        } else {
            renderUpdate(inputEl, currentModelName);
        }
    }

    function renderUpdate(inputEl, currentModelName) {
        if (!textSpan) return;

        const now = Date.now();

        if (!isCheckingApiCrackerCount && now - lastApiCrackerCheckTime > 3000) {
            isCheckingApiCrackerCount = true;
            lastApiCrackerCheckTime = now;

            fetchCurrentCrackerCount().then(count => {
                if (count !== null) {
                    cachedApiCrackerCount = count;
                    lastApiCrackerSuccessTime = Date.now();
                    lastRenderedText = '';
                    renderUpdate(inputEl, currentModelName);
                }

                isCheckingApiCrackerCount = false;
            }).catch(() => {
                isCheckingApiCrackerCount = false;
            });
        }

        if (!isCheckingLastConsumed && now - lastConsumedCheckTime > 3000) {
            isCheckingLastConsumed = true;
            lastConsumedCheckTime = now;

            fetchLastConsumedCracker().then(data => {
                cachedLastConsumed = data;
                isCheckingLastConsumed = false;
                lastRenderedText = '';
                renderUpdate(inputEl, currentModelName);
            }).catch(() => {
                isCheckingLastConsumed = false;
            });
        }

        const parts = [];

        let displayTurns = cachedTurns;
        if (displayTurns === null) {
            displayTurns = Math.floor(document.querySelectorAll(SELECTOR.messageGroup).length / 2);
        }

        if (displayTurns > 0) {
            const summary = `${ICON.clock}<span style="font-weight:700;">${displayTurns}</span>턴`;
            let detail = summary;

            const totalMessages = cachedTotalMessages ?? document.querySelectorAll(SELECTOR.messageGroup).length;

            if (totalMessages > 0) {
                detail += `&nbsp;<span style="opacity:.75;">(총 메시지 수 ${totalMessages.toLocaleString()}개)</span>`;
            }

            parts.push({
                key: 'turn',
                summaryHtml: summary,
                detailHtml: detail
            });
        } else {
            const html = `${ICON.clock}채팅 없음`;

            parts.push({
                key: 'turn',
                summaryHtml: html,
                detailHtml: html
            });
        }

        if (visibleParts.cumulative !== false) {
            let cumText = '대기 중';
            let suffix = '';
            let animClass = '';

            if (isCalculatingCumulative) {
                cumText = '...';
                animClass = 'pulse-anim';
            } else if (cachedCumulative !== null) {
                cumText = cachedCumulative.toLocaleString();
                suffix = '개';
            } else if (displayTurns <= 0) {
                cumText = '0';
                suffix = '개';
            }

            const bitenIcon = ICON.bittenCracker.replace(
                'class="my-counter-cracker-icon"',
                `class="my-counter-cracker-icon ${animClass}"`
            );

            const summary = `${bitenIcon}<span style="font-weight:700;">${cumText}</span>${suffix}`;

            parts.push({
                key: 'cumulative',
                summaryHtml: summary,
                detailHtml: summary
            });
        }

        const crackerCount = getCrackerCount();
        const modelCost = currentModelName ? getOutputAdjustedCost(currentModelName) : null;

        if (crackerCount !== null) {
            let summary = `${ICON.cracker}<span style="font-weight:700;">${crackerCount.toLocaleString()}</span>개`;

            if (cachedLastConsumed?.amount) {
                summary += `&nbsp;<span style="opacity:.65;">(-${cachedLastConsumed.amount.toLocaleString()})</span>`;
            }

            let detail = summary;

            if (modelCost) {
                const possibleTurns = Math.floor(crackerCount / modelCost);
                detail += `&nbsp;<span style="opacity:.75;">(${possibleTurns.toLocaleString()}턴 가능, 1회 ${modelCost.toLocaleString()}개)</span>`;
            }

            if (cachedLastConsumed?.date) {
                const consumedTime = new Date(cachedLastConsumed.date);
                if (!Number.isNaN(consumedTime.getTime())) {
                    detail += `&nbsp;<span style="opacity:.65;">최근 차감 ${consumedTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>`;
                }
            }

            parts.push({
                key: 'cracker',
                summaryHtml: summary,
                detailHtml: detail
            });
        }

        renderParts(parts);
        updateLayout(inputEl);

        if (settingsMenu?.style.display === 'flex') {
            positionSettingsMenu();
        }
    }
})();
