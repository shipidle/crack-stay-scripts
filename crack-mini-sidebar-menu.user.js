// ==UserScript==
// @name         📱미니 사이드바 메뉴
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.3.6
// @description  입력창 내부 상단에 사이드바 메뉴를 표시합니다. 내 추천 모델 표시 추가.
// @match        *://crack.wrtn.ai/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=crack.wrtn.ai
// @author       shipidle
// @require      https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.2.1/crack/libraries/crack-shared-core.js
// @require      https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/crack-mini-sidebar-menu.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/crack-mini-sidebar-menu.user.js
// ==/UserScript==

(function () {
    'use strict';

    const VISIBLE_PARTS_STORAGE_KEY = 'btn_menu_visible_parts';
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // [변경] textarea + 새 contenteditable div 모두 지원
    const SELECTOR = {
        input: 'textarea[placeholder*="메시지"], div.__chat_input_textarea, div[contenteditable="true"].tiptap',
        modelIcon: 'img[src*="model-icon"]',
        modelButton: 'button[aria-haspopup="menu"]',
        menuItem: 'div[role="menuitem"]'
    };

    const MODEL_INFO = {
        "페이블챗 1.0": { cost: 195, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/fablechat1_0.webp" },
        "하이퍼챗 2.0": { cost: 85, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/hyperchat2_0.webp" },
        "하이퍼챗 1.5": { cost: 85, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/hyperchat1_5.webp" },
        "하이퍼챗 1.0": { cost: 75, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/hyperchat.webp" },
        "슈퍼챗 2.5":   { cost: 50, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/superchat2_5.webp" },
        "슈퍼챗 2.0":   { cost: 50, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/superchat2_0.webp" },
        "슈퍼챗 1.5":   { cost: 50, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/superchat1_5.webp" },
        "프로챗 2.5":   { cost: 58, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/prochat2_5.webp" },
        "프로챗 1.0":   { cost: 50, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/prochat1_0.webp" },
        "파워챗":       { cost: 20, image: "https://cdn-image.wrtn.ai/crack/graphics/model-icon/powerchat.webp" }
    };

    const MODEL_ICON_MAP = {
        'fablechat1_0.webp': '페이블챗 1.0',
        'hyperchat2_0.webp': '하이퍼챗 2.0',
        'hyperchat1_5.webp': '하이퍼챗 1.5',
        'hyperchat.webp': '하이퍼챗 1.0',
        'superchat2_5.webp': '슈퍼챗 2.5',
        'superchat2_0.webp': '슈퍼챗 2.0',
        'superchat1_5.webp': '슈퍼챗 1.5',
        'prochat2_5.webp': '프로챗 2.5',
        'prochat1_0.webp': '프로챗 1.0',
        'powerchat.webp': '파워챗'
    };

    const DEFAULT_VISIBLE_PARTS = {
        modelButton: true,
        guideButton: true,
        profileButton: true,
        noteButton: true,
        outputButton: true,
        summaryButton: true,
        imageButton: true,
        archiveButton: true,
        externalArchiveButton: true,
        startButton: true
    };

    const ICON = {
        settings: `<svg width="6" height="18" viewBox="0 0 6 18" fill="currentColor" class="my-counter-settings-icon"><circle cx="3" cy="3.5" r="1.8"/><circle cx="3" cy="9" r="1.8"/><circle cx="3" cy="14.5" r="1.8"/></svg>`,
        model: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="my-counter-button-icon"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"></path><path d="M12 12l8-4.5"></path><path d="M12 12v9"></path><path d="M12 12L4 7.5"></path></svg>`,
        guide: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" class="my-counter-button-icon"><path fill-rule="evenodd" d="M15.43 6.9c.5-.25 1.07-.14 1.44.23s.48.93.23 1.44l-2.61 5.33q-.2.4-.6.6l-5.33 2.6c-.5.26-1.08.15-1.44-.22a1.25 1.25 0 0 1-.23-1.44L9.5 10.1q.2-.4.6-.6zm-6.65 8.32 3.72-1.82-1.9-1.9z" clip-rule="evenodd"></path><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 1.6a8.41 8.41 0 0 0 0 16.8 8.41 8.41 0 0 0 0-16.8" clip-rule="evenodd"></path></svg>`,
        profile: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" class="my-counter-button-icon"><path d="M7.97 4.3v-.77h11.82V16.6h-.78v1.6h1.08c.7 0 1.3-.57 1.3-1.3V3.23c0-.7-.57-1.3-1.3-1.3H7.67c-.7 0-1.3.57-1.3 1.3V4.3z"></path><path d="M10.11 8.9a2.66 2.66 0 1 0 0 5.32 2.66 2.66 0 0 0 0-5.32m0 6.13c-1 0-1.94.23-2.7.64a3.2 3.2 0 0 0-1.58 1.8c-.2.7.35 1.3.99 1.3h6.58c.64 0 1.2-.62 1-1.3a3.2 3.2 0 0 0-1.6-1.8 6 6 0 0 0-2.69-.64"></path><path fill-rule="evenodd" d="M3.9 5.7c-.72 0-1.3.58-1.3 1.3v13.68c0 .72.58 1.3 1.3 1.3h12.43c.72 0 1.3-.58 1.3-1.3V7c0-.72-.58-1.3-1.3-1.3zm.3 14.68V7.3h11.83v13.08z" clip-rule="evenodd"></path></svg>`,
        note: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="my-counter-button-icon"><path d="M8 8.35h8v-1.6H8zm8 4H8v-1.6h8zm-8 4h4v-1.6H8z"></path><path fill-rule="evenodd" d="M3.75 3.29c0-.72.58-1.3 1.3-1.3h13.9c.72 0 1.3.58 1.3 1.3v12.6c0 .32-.12.65-.37.9l-4.55 4.8q-.38.4-.95.41H5.05a1.3 1.3 0 0 1-1.3-1.3zm1.6.3V20.4h8.44v-3.8c0-.72.58-1.3 1.3-1.3h3.56V3.6zM17.57 16.9l-2.18 2.3v-2.3z" clip-rule="evenodd"></path></svg>`,
        output: `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" width="15" height="15" class="my-counter-button-icon"><path d="M21 3.2H3v1.6h18zm0 5.75H3v1.6h18zM10 14.7H3v1.6h7zm10.62 2.29.01-.31-.01-.31.77-.75a.64.64 0 0 0 .11-.77l-.77-1.33a.7.7 0 0 0-.83-.33l-.96.27a4 4 0 0 0-.54-.31l-.26-1.04a.64.64 0 0 0-.62-.48h-1.61c-.3 0-.55.2-.62.48l-.26 1.04a4 4 0 0 0-.54.31l-1.03-.29a.65.65 0 0 0-.73.29l-.8 1.39c-.15.25-.1.57.11.78l.77.74-.01.31.01.31-.77.75a.64.64 0 0 0-.11.77l.8 1.39c.14.25.44.38.73.3l1.03-.29q.26.18.54.31l.26 1.04c.07.29.32.49.62.49h1.61c.29 0 .54-.2.62-.48l.26-1.04q.29-.13.54-.31l1.04.3c.28.08.58-.05.72-.3l.81-1.4a.64.64 0 0 0-.11-.77zm-3.91 1.06a1.38 1.38 0 0 1 0-2.76 1.38 1.38 0 0 1 0 2.76"></path></svg>`,
        summary: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" class="my-counter-button-icon"><path d="M16.25 10.8a5.39 5.39 0 1 0 .02 10.78 5.39 5.39 0 0 0-.02-10.78m0 9.16a3.78 3.78 0 1 1 0-7.57 3.78 3.78 0 0 1 0 7.57"></path><path d="M17.02 13.43h-1.5v3.12l2.02 1.55.91-1.2-1.43-1.09z"></path><path d="M6.8 19.54v-3.29h-3V4.15h14.9V9.5h1.6V3.85c0-.72-.58-1.3-1.3-1.3H3.5c-.72 0-1.3.58-1.3 1.3v12.7c0 .72.58 1.3 1.3 1.3h1.7v3.2a.9.9 0 0 0 .89.89q.3 0 .58-.21l3.35-2.81-1.03-1.22z"></path><path d="M16.5 6.72H6v1.6h10.5zM11 10.03H6v1.6h5z"></path></svg>`,
        image: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="my-counter-button-icon"><path d="m11.7 6.08 6.36 3.67-6.36 3.67z"></path><path fill-rule="evenodd" d="M6.71 3.91c0-.94.76-1.7 1.7-1.7H20.1c.94 0 1.7.76 1.7 1.7V15.6c0 .94-.76 1.7-1.7 1.7h-2.81v2.8c0 .94-.76 1.7-1.7 1.7H3.9a1.7 1.7 0 0 1-1.7-1.7V8.41c0-.94.76-1.7 1.7-1.7h2.81zm1.7-.1a.1.1 0 0 0-.1.1V15.6q0 .1.1.1H20.1a.1.1 0 0 0 .1-.1V3.91a.1.1 0 0 0-.1-.1zm0 13.49h7.28v2.8a.1.1 0 0 1-.1.1H3.9a.1.1 0 0 1-.1-.1V8.41q0-.1.1-.1h2.81v7.29c0 .94.76 1.7 1.7 1.7" clip-rule="evenodd"></path></svg>`,
        archive: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="my-counter-button-icon"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
        externalArchive: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="my-counter-button-icon"><path d="M14 3h7v7h-1.6V5.73l-6.65 6.65-1.13-1.13 6.65-6.65H14z"></path><path d="M5 5h6v1.6H5.6v11.8h11.8V13H19v6c0 .55-.45 1-1 1H5c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1z"></path><path d="M7.2 15.5l2.1-2.7 1.6 1.9 2.2-2.8 3 4H7.2z"></path></svg>`,
        start: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" class="my-counter-button-icon"><path d="M4.2 4.8c0-.72.58-1.3 1.3-1.3h13c.72 0 1.3.58 1.3 1.3v10.4c0 .72-.58 1.3-1.3 1.3h-4.55l-3.6 3.15a.75.75 0 0 1-1.24-.56V16.5H5.5c-.72 0-1.3-.58-1.3-1.3zm1.6.3v9.8h4.91v2.7l2.64-2.7h4.85V5.1z"></path><path d="M11.2 7.5h1.6v2.1h2.1v1.6h-2.1v2.1h-1.6v-2.1H9.1V9.6h2.1z"></path></svg>`
    };

    function extractFirstPathD(svgString) {
        const match = svgString.match(/<path\b[^>]*?\bd="([^"]+)"/);
        return match ? match[1] : null;
    }

    const ICON_PATHS = {
        guide: extractFirstPathD(ICON.guide),
        profile: extractFirstPathD(ICON.profile),
        note: extractFirstPathD(ICON.note),
        summary: extractFirstPathD(ICON.summary)
    };

    let menuBadge = null;
    let settingsBtn = null;
    let settingsMenu = null;
    let quickBtn, guideBtn, profileBtn, noteBtn, outputBtn, summaryBtn, imageBtn, archiveBtn, externalArchiveBtn, startBtn;
    let customMenu = null;
    let contentWrapper = null;
    let currentInput = null;       // [변경] textarea → input (textarea OR contenteditable)
    let currentContainer = null;   // [신규] 외곽 컨테이너 참조

    let visibleParts = loadVisibleParts();
    let updateTimer = null;
    let observer = null;

    let lastHeavyCheckTime = 0;
    let cachedModelName = null;
    let syncedModelInfo = {};
    let syncingOfficialModelInfo = false;
    let lastModelInfoSyncTime = 0;
    let cachedImageSwitchAvailable = false;
    let cachedImageSwitchState = false;
    let cachedNativeArchiveAvailable = false;
    let cachedExternalArchiveAvailable = false;

    let initialAutoSyncDone = false;
    let initialAutoSyncScheduled = false;

    injectBaseStyle();
    bindGlobalEvents();
    startObserver();
    scheduleUpdate();

    function injectBaseStyle() {
        if (document.getElementById('btn-menu-base-style')) return;

        const style = document.createElement('style');
        style.id = 'btn-menu-base-style';
        style.textContent = `
            #my-custom-btn-menu {
                --btn-bg: rgba(0,0,0,0.06); --btn-hover-bg: rgba(0,0,0,0.12);
                --active-btn-bg: rgba(0,0,0,0.15); --active-btn-hover-bg: rgba(0,0,0,0.25);
                --active-text: #000;
                position: absolute; top: 2px; left: 0; right: 0; padding-top: 8px; padding-bottom: 2px; box-sizing: border-box;
                font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: 500;
                pointer-events: none; z-index: 1; display: flex; align-items: center; border-radius: 8px 8px 0 0;
            }
            #my-custom-btn-menu #my-counter-settings-button { all: unset; position: relative; pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; margin-left: 0; margin-right: 8px; transition: opacity 0.15s; touch-action: manipulation; color: inherit; }
            #my-custom-btn-menu #my-counter-settings-button::after { content: ''; position: absolute; top: -10px; bottom: -10px; left: -8px; right: -10px; }
            #my-custom-btn-menu #my-counter-settings-button:hover { opacity: 0.7; }
            .my-counter-settings-icon { display: block; flex-shrink: 0; }
            #my-custom-btn-menu #my-counter-content { display: flex; align-items: center; overflow: hidden; white-space: nowrap; max-width: calc(100vw - 120px); }

            .btn-menu-action-btn { all: unset; position: relative; pointer-events: auto; cursor: pointer; margin-left: 8px; display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 6px; font-weight: 700; transition: background 0.15s, color 0.15s, opacity 0.15s; touch-action: manipulation; background: var(--btn-bg); color: inherit; }
            #my-custom-btn-menu #my-counter-model-button { margin-left: 0; }
            .btn-menu-action-btn:hover { background: var(--btn-hover-bg); opacity: 0.9; }
            .btn-menu-action-btn.is-active { background: var(--active-btn-bg); color: var(--active-text); }
            .btn-menu-action-btn.is-active:hover { background: var(--active-btn-hover-bg); }

            #btn-custom-dropdown-menu, #btn-menu-settings-menu {
    --item-hover-bg: #f3f4f6; --item-hover-text: #000; --cost-text: #999;
    display: none; position: fixed; border-radius: 8px; padding: 6px; flex-direction: column; gap: 2px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 9999999; max-width: calc(100vw - 16px); border-style: solid; border-width: 1px; font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
}

#btn-custom-dropdown-menu {
    width: 170px;
    box-sizing: border-box;
}

#btn-menu-settings-menu { padding: 4px; gap: 1px; min-width: 132px; font-size: 13px; }

.my-counter-settings-title { font-size: 12px; font-weight: 700; opacity: 0.7; padding: 0 4px 2px; }
.my-counter-settings-row { display: flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 5px; cursor: pointer; user-select: none; touch-action: manipulation; }
.my-counter-settings-row:hover { background: rgba(128,128,128,0.16); }
.my-counter-settings-row input { margin: 0; cursor: pointer; }

.my-counter-menu-item {
    background: transparent;
    padding: 8px 5px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
    touch-action: manipulation;
    box-sizing: border-box;
    width: 100%;
}
.my-counter-menu-item:hover, .my-counter-menu-item.is-selected { background: var(--item-hover-bg); color: var(--item-hover-text); }
.my-counter-menu-item .cost-span { color: var(--cost-text); font-size: 12px; }

.my-counter-menu-inner {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    line-height: 1;
    width: 100%;
}
.my-counter-model-icon { display: block; margin-right: 6px; flex-shrink: 0; width: 16px; height: 16px; object-fit: contain; }
.my-counter-button-icon { flex-shrink: 0; }

.my-counter-rec-badge {
    margin-left: auto;
    padding-left: 4px;
    font-size: 12px;
    line-height: 1;
    flex-shrink: 0;
    opacity: 0.95;
}

@media (max-width: 520px) {
    .btn-menu-action-btn { padding: 3px 7px; margin-left: 5px; }
    #btn-custom-dropdown-menu { width: 160px; }
    .my-counter-menu-item { padding: 9px 10px; font-size: 13px; }
}
        `;

        document.head.appendChild(style);
    }

    function bindGlobalEvents() {
        document.addEventListener('click', (e) => {
            const clickedInsideModelMenu =
                quickBtn?.contains(e.target) ||
                guideBtn?.contains(e.target) ||
                profileBtn?.contains(e.target) ||
                noteBtn?.contains(e.target) ||
                outputBtn?.contains(e.target) ||
                summaryBtn?.contains(e.target) ||
                imageBtn?.contains(e.target) ||
                archiveBtn?.contains(e.target) ||
                externalArchiveBtn?.contains(e.target) ||
                startBtn?.contains(e.target) ||
                customMenu?.contains(e.target);

            const clickedInsideSettingsMenu =
                settingsBtn?.contains(e.target) ||
                settingsMenu?.contains(e.target);

            if (!clickedInsideModelMenu && customMenu?.style.display === 'flex') hideMenu();
            if (!clickedInsideSettingsMenu && settingsMenu?.style.display === 'flex') hideSettingsMenu();

            const dialogs = document.querySelectorAll('[role="dialog"]');

            if (dialogs.length === 1) {
                const dialog = dialogs[0];

                if (dialog.textContent.includes('유저 노트')) {
                    if (!dialog.contains(e.target)) {
                        const closeBtn = dialog.querySelector('button[aria-label="닫기"], button[aria-label*="Close"]');

                        if (closeBtn) {
                            e.preventDefault();
                            e.stopPropagation();

                            setTimeout(() => {
                                closeBtn.click();
                            }, 50);
                        }
                    }
                }
            }
        });

        window.addEventListener('scroll', hideAllMenus, true);
        window.addEventListener('resize', hideAllMenus);
    }

    function startObserver() {
        if (observer) return;

        observer = new MutationObserver((mutations) => {
            const onlyMine = mutations.every((m) => {
                const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
                return el?.closest?.('#my-custom-btn-menu, #btn-custom-dropdown-menu, #btn-menu-settings-menu');
            });

            if (onlyMine) return;

            scheduleUpdate();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-valuenow', 'data-state', 'aria-checked']
        });
    }

    function scheduleUpdate() {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(updateState, 80);
    }

    function loadVisibleParts() {
        try {
            return {
                ...DEFAULT_VISIBLE_PARTS,
                ...JSON.parse(localStorage.getItem(VISIBLE_PARTS_STORAGE_KEY) || '{}')
            };
        } catch {
            return {
                ...DEFAULT_VISIBLE_PARTS
            };
        }
    }

    function saveVisibleParts() {
        localStorage.setItem(VISIBLE_PARTS_STORAGE_KEY, JSON.stringify(visibleParts));
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
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            isDark = luma < 128;
        }

        return {
            bg,
            text: isDark ? '#888' : '#777',
            menuBg: isDark ? '#282828' : '#fff',
            menuBorder: isDark ? '#444' : '#e5e5e5',
            itemText: isDark ? '#ccc' : '#444',
            itemHoverBg: isDark ? '#444' : '#f3f4f6',
            itemHoverText: isDark ? '#fff' : '#000',
            btnBg: isDark ? 'rgba(136,136,136,0.15)' : 'rgba(0,0,0,0.06)',
            btnHoverBg: isDark ? 'rgba(136,136,136,0.3)' : 'rgba(0,0,0,0.12)',
            costText: isDark ? '#777' : '#999',
            activeBtnBg: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
            activeBtnHoverBg: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
            activeBtnText: isDark ? '#fff' : '#000'
        };
    }

    // [신규] 입력 외곽 컨테이너 탐지 (HUD 스크립트와 동일 로직)
    function findInputContainer(inputEl) {
        const newUiContainer = inputEl.closest('div.flex.flex-col.rounded-lg.border, div.rounded-lg.border.bg-background');
        if (newUiContainer) return newUiContainer;
        return inputEl.parentElement;
    }

    function getContextImageSwitch() {
        const spans = document.querySelectorAll('span');

        for (const span of spans) {
            if (span.textContent.trim() === '상황 이미지 보기') {
                const btn = span.closest('[role="button"]')?.querySelector('button[role="switch"]');

                if (btn) return btn;
            }
        }

        return null;
    }

    function getImageSwitchState(toggle = getContextImageSwitch()) {
        if (!toggle) return null;
        return toggle.getAttribute('aria-checked') === 'true' || toggle.getAttribute('data-state') === 'checked';
    }

    function toggleContextImage() {
        const toggle = getContextImageSwitch();

        if (toggle) {
            fireClickSequence(toggle);
            lastHeavyCheckTime = 0;
            scheduleUpdate();
        }
    }

    function isOwnMenuElement(el) {
        return !!el?.closest?.('#my-custom-btn-menu, #btn-menu-settings-menu, #btn-custom-dropdown-menu');
    }

    function isVisibleClickable(el) {
        if (!el) return false;
        if (isOwnMenuElement(el)) return false;
        if (el.closest('[role="dialog"]')) return false;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;

        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function openDialogByIconPath(pathData, fallbackText) {
        if (pathData) {
            const paths = document.querySelectorAll('path');

            for (const p of paths) {
                if (p.getAttribute('d') !== pathData) continue;

                const btn = p.closest('button') || p.closest('[role="button"]');
                if (!btn) continue;
                if (isOwnMenuElement(btn)) continue;
                if (btn.closest('[role="dialog"]')) continue;
                if (!isVisibleClickable(btn)) continue;

                fireClickSequence(btn);
                return true;
            }
        }

        return openDialogBySpanText(fallbackText);
    }

    function openDialogBySpanText(textStart) {
        const spans = Array.from(document.querySelectorAll('span'));

        for (const span of spans) {
            const text = span.textContent.trim();
            if (!text.startsWith(textStart)) continue;
            if (isOwnMenuElement(span)) continue;
            if (span.closest('[role="dialog"]')) continue;

            const btn = span.closest('button') || span.closest('[role="button"]');
            if (!btn) continue;
            if (!isVisibleClickable(btn)) continue;

            fireClickSequence(btn);
            return true;
        }

        const fallbackButtons = Array.from(document.querySelectorAll('button, [role="button"]'));

        for (const btn of fallbackButtons) {
            if (isOwnMenuElement(btn)) continue;
            if (btn.closest('[role="dialog"]')) continue;

            const text = (btn.innerText || btn.textContent || '').trim();

            if (!text.includes(textStart)) continue;
            if (!isVisibleClickable(btn)) continue;

            fireClickSequence(btn);
            return true;
        }

        console.warn(`[미니 사이드바 메뉴] "${textStart}" 버튼을 찾지 못함`);
        return false;
    }

    function getNativeImageArchiveTrigger() {
        const labels = Array.from(document.querySelectorAll('span')).filter(span => {
            const text = span.textContent.trim();

            if (!text.startsWith('이미지 보관함')) return false;
            if (text.startsWith('외부 이미지 보관함')) return false;

            if (span.closest('#my-custom-btn-menu')) return false;
            if (span.closest('#btn-menu-settings-menu')) return false;
            if (span.closest('#btn-custom-dropdown-menu')) return false;
            if (span.closest('#eic-modal-content')) return false;
            if (span.closest('[role="dialog"]')) return false;

            return true;
        });

        for (const label of labels) {
            const btn = label.closest('button') || label.closest('[role="button"]');

            if (btn) return btn;
        }

        return null;
    }

    function isNativeImageArchiveAvailable() {
        return !!getNativeImageArchiveTrigger();
    }

    function openNativeImageArchive() {
        const trigger = getNativeImageArchiveTrigger();

        if (trigger) fireClickSequence(trigger);
    }

    function getExternalImageArchiveTrigger() {
        const wrapper = document.getElementById('eic-sidebar-btn-wrapper');
        const directBtn = wrapper?.querySelector('button');

        if (directBtn) return directBtn;

        const label = document.getElementById('eic-sidebar-label');
        const labelBtn = label?.closest('button') || label?.closest('[role="button"]');

        if (labelBtn) return labelBtn;

        const fallbackLabel = Array.from(document.querySelectorAll('span')).find(span => {
            const text = span.textContent.trim();

            if (!text.startsWith('외부 이미지 보관함')) return false;
            if (span.closest('#my-custom-btn-menu, #btn-menu-settings-menu, #btn-custom-dropdown-menu, #eic-modal-content')) return false;

            return true;
        });

        return fallbackLabel?.closest('button') || fallbackLabel?.closest('[role="button"]') || null;
    }

    function isExternalImageArchiveAvailable() {
        return !!getExternalImageArchiveTrigger();
    }

    function openExternalImageArchive() {
        const trigger = getExternalImageArchiveTrigger();

        if (trigger) fireClickSequence(trigger);
    }

    function getStartSettingTrigger() {
        const sectionTitle = Array.from(document.querySelectorAll('p, span')).find(el => {
            if (isOwnMenuElement(el)) return false;
            if (el.closest('[role="dialog"]')) return false;

            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            return text === '시작설정';
        });

        if (sectionTitle) {
            let next = sectionTitle.nextElementSibling;

            for (let i = 0; next && i < 6; i++, next = next.nextElementSibling) {
                if (!(next instanceof HTMLElement)) continue;

                const text = (next.textContent || '').replace(/\s+/g, ' ').trim();

                if (text.includes('채팅방 설정') || text.includes('전체 설정') || text.includes('나의 크래커')) break;

                const btn =
                    next.matches('button, [role="button"]')
                        ? next
                        : next.querySelector('button, [role="button"]');

                if (btn && isVisibleClickable(btn)) {
                    return btn;
                }
            }
        }

        const fallback = Array.from(document.querySelectorAll('button, [role="button"]')).find(btn => {
            if (isOwnMenuElement(btn)) return false;
            if (btn.closest('[role="dialog"]')) return false;
            if (!isVisibleClickable(btn)) return false;

            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();

            return text === '이미지+세계관 질의응답';
        });

        return fallback || null;
    }

    function openStartSetting() {
        const trigger = getStartSettingTrigger();

        if (trigger) {
            fireClickSequence(trigger);
            lastHeavyCheckTime = 0;
            scheduleUpdate();
        } else {
            console.warn('[미니 사이드바 메뉴] 시작 설정 버튼을 찾지 못함');
        }
    }

    function refreshHeavyState() {
        const imageSwitch = getContextImageSwitch();

        cachedModelName = getCurrentModelName();
        cachedNativeArchiveAvailable = isNativeImageArchiveAvailable();
        cachedExternalArchiveAvailable = isExternalImageArchiveAvailable();

        cachedImageSwitchAvailable = !!imageSwitch && cachedNativeArchiveAvailable;
        cachedImageSwitchState = getImageSwitchState(imageSwitch);

        lastHeavyCheckTime = Date.now();
    }

    function makeNoKeyboardFocusButton(btn, onclick) {
        btn.type = 'button';
        btn.tabIndex = -1;

        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
        });

        btn.addEventListener('keydown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        btn.onclick = (e) => {
            if (e.detail === 0) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            onclick();
        };

        return btn;
    }

    function initUI(inputEl) {
        document.getElementById('my-custom-btn-menu')?.remove();
        document.getElementById('btn-custom-dropdown-menu')?.remove();
        document.getElementById('btn-menu-settings-menu')?.remove();

        currentInput = inputEl;

        const container = findInputContainer(inputEl);
        if (!container) return;

        currentContainer = container;

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        menuBadge = document.createElement('div');
        menuBadge.id = 'my-custom-btn-menu';

        settingsBtn = document.createElement('button');
        settingsBtn.id = 'my-counter-settings-button';
        settingsBtn.innerHTML = ICON.settings;
        makeNoKeyboardFocusButton(settingsBtn, toggleSettingsMenu);

        contentWrapper = document.createElement('div');
        contentWrapper.id = 'my-counter-content';

        const createBtn = (id, icon, onclick) => {
            const b = document.createElement('button');
            b.id = id;
            b.className = 'btn-menu-action-btn';
            b.innerHTML = icon;
            return makeNoKeyboardFocusButton(b, onclick);
        };

        quickBtn = createBtn('my-counter-model-button', ICON.model, toggleMenu);
        guideBtn = createBtn('my-counter-guide-button', ICON.guide, () => openDialogByIconPath(ICON_PATHS.guide, '플레이 가이드'));
        profileBtn = createBtn('my-counter-profile-button', ICON.profile, () => openDialogByIconPath(ICON_PATHS.profile, '대화 프로필'));
        noteBtn = createBtn('my-counter-note-button', ICON.note, () => openDialogByIconPath(ICON_PATHS.note, '유저 노트'));
        outputBtn = createBtn('my-counter-output-button', ICON.output, openOutputDialog);
        summaryBtn = createBtn('my-counter-summary-button', ICON.summary, () => openDialogByIconPath(ICON_PATHS.summary, '요약 메모리'));
        imageBtn = createBtn('my-counter-image-button', ICON.image, toggleContextImage);
        archiveBtn = createBtn('my-counter-archive-button', ICON.archive, openNativeImageArchive);
        externalArchiveBtn = createBtn('my-counter-external-archive-button', ICON.externalArchive, openExternalImageArchive);
        startBtn = createBtn('my-counter-start-button', ICON.start, openStartSetting);

        contentWrapper.append(
            quickBtn,
            guideBtn,
            profileBtn,
            noteBtn,
            outputBtn,
            summaryBtn,
            imageBtn,
            archiveBtn,
            externalArchiveBtn,
            startBtn
        );

        menuBadge.append(settingsBtn, contentWrapper);
        container.appendChild(menuBadge);

        customMenu = buildMenu();
        document.body.appendChild(customMenu);

        settingsMenu = buildSettingsMenu();
        document.body.appendChild(settingsMenu);

        const colors = getThemeColors(inputEl);
        applyTheme(colors, null, null);

        applyVisibleButtons();
        updateLayout(inputEl);

        scheduleInitialAutoSync();
    }

    function scheduleInitialAutoSync() {
        if (initialAutoSyncDone || initialAutoSyncScheduled) return;
        initialAutoSyncScheduled = true;

        setTimeout(() => {
            tryInitialAutoSync(0);
        }, 1200);
    }

    function tryInitialAutoSync(retry) {
        if (initialAutoSyncDone) return;

        const officialBtn = getOfficialModelButton();
        if (!officialBtn) {
            if (retry < 5) {
                setTimeout(() => tryInitialAutoSync(retry + 1), 800);
            } else {
                initialAutoSyncScheduled = false;
            }
            return;
        }

        syncOfficialModelInfoFromOfficialMenu(true).then(() => {
            initialAutoSyncDone = true;
        }).catch(() => {
            initialAutoSyncScheduled = false;
        });
    }

    function buildMenu() {
        const menu = document.createElement('div');
        menu.id = 'btn-custom-dropdown-menu';

        for (const model of Object.keys(MODEL_INFO)) {
            const info = getDisplayModelInfo(model);
            const item = document.createElement('div');
            item.className = 'my-counter-menu-item';
            item.dataset.modelName = model;

            const imgIcon = `<img src="${info.image}" alt="${model}" class="my-counter-model-icon" width="16" height="16">`;
            const recBadge = info.recommended
                ? `<span class="my-counter-rec-badge" title="내 추천">👍</span>`
                : '';
            item.innerHTML = `<div class="my-counter-menu-inner">${imgIcon}<span style="margin-right: 2px;">${model}</span><span class="cost-span">(${info.cost}개)</span>${recBadge}</div>`;

            item.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                hideMenu();
                selectModelInvisibly(model);
            };

            menu.appendChild(item);
        }

        return menu;
    }

    function buildSettingsMenu() {
        const menu = document.createElement('div');
        menu.id = 'btn-menu-settings-menu';

        const title = document.createElement('div');
        title.className = 'my-counter-settings-title';
        title.textContent = '버튼 표시';
        menu.appendChild(title);

        const items = [
            { key: 'modelButton', label: '모델 변경' },
            { key: 'guideButton', label: '플레이 가이드' },
            { key: 'profileButton', label: '대화 프로필' },
            { key: 'noteButton', label: '유저 노트' },
            { key: 'outputButton', label: '출력량 조절' },
            { key: 'summaryButton', label: '요약 메모리' },
            { key: 'imageButton', label: '이미지 ON/OFF' },
            { key: 'archiveButton', label: '이미지 보관함' },
            { key: 'externalArchiveButton', label: '외부 이미지 보관함' },
            { key: 'startButton', label: '시작 설정' }
        ];

        for (const item of items) {
            const row = document.createElement('label');
            row.className = 'my-counter-settings-row';
            row.dataset.part = item.key;
            row.innerHTML = `<input type="checkbox" data-part="${item.key}"><span>${item.label}</span>`;

            const input = row.querySelector('input');

            input.onchange = (e) => {
                e.stopPropagation();
                visibleParts[item.key] = input.checked;
                saveVisibleParts();
                applyVisibleButtons();
                syncSettingsMenu();
            };

            menu.appendChild(row);
        }

        return menu;
    }

    function toggleMenu() {
        if (!customMenu || !quickBtn) return;

        if (customMenu.style.display === 'flex') {
            hideMenu();
            return;
        }

        hideSettingsMenu();
        customMenu.style.display = 'flex';
        positionMenu(customMenu, quickBtn);

        syncOfficialModelInfoFromOfficialMenu(true).then(() => {
            if (customMenu?.style.display === 'flex') positionMenu(customMenu, quickBtn);
        });
    }

    function hideMenu() {
        if (customMenu) customMenu.style.display = 'none';
    }

    function toggleSettingsMenu() {
        if (!settingsMenu || !settingsBtn) return;

        if (settingsMenu.style.display === 'flex') {
            hideSettingsMenu();
            return;
        }

        hideMenu();
        settingsMenu.style.display = 'flex';
        syncSettingsMenu();
        positionMenu(settingsMenu, settingsBtn);
    }

    function hideSettingsMenu() {
        if (settingsMenu) settingsMenu.style.display = 'none';
    }

    function hideAllMenus() {
        hideMenu();
        hideSettingsMenu();
    }

    function positionMenu(menuEl, btnEl) {
        if (!menuEl || !btnEl) return;

        const rect = btnEl.getBoundingClientRect();

        menuEl.style.left = '0px';
        menuEl.style.top = '0px';

        const width = menuEl.offsetWidth;
        const height = menuEl.offsetHeight;
        const gap = 8;

        let left = rect.left;
        left = Math.max(gap, Math.min(left, window.innerWidth - width - gap));

        let top = rect.top - height - gap;
        if (top < gap) top = rect.bottom + gap;

        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;
    }

    function applyVisibleButtons() {
        if (quickBtn) quickBtn.style.display = visibleParts.modelButton === false ? 'none' : 'inline-flex';
        if (guideBtn) guideBtn.style.display = visibleParts.guideButton === false ? 'none' : 'inline-flex';
        if (profileBtn) profileBtn.style.display = visibleParts.profileButton === false ? 'none' : 'inline-flex';
        if (noteBtn) noteBtn.style.display = visibleParts.noteButton === false ? 'none' : 'inline-flex';
        if (outputBtn) outputBtn.style.display = visibleParts.outputButton === false ? 'none' : 'inline-flex';
        if (summaryBtn) summaryBtn.style.display = visibleParts.summaryButton === false ? 'none' : 'inline-flex';

        if (imageBtn) imageBtn.style.display = cachedImageSwitchAvailable && visibleParts.imageButton !== false ? 'inline-flex' : 'none';
        if (archiveBtn) archiveBtn.style.display = cachedNativeArchiveAvailable && visibleParts.archiveButton !== false ? 'inline-flex' : 'none';
        if (externalArchiveBtn) externalArchiveBtn.style.display = cachedExternalArchiveAvailable && visibleParts.externalArchiveButton !== false ? 'inline-flex' : 'none';

        if (startBtn) startBtn.style.display = visibleParts.startButton !== false ? 'inline-flex' : 'none';

        const imageRow = settingsMenu?.querySelector('[data-part="imageButton"]');
        if (imageRow) imageRow.style.display = cachedImageSwitchAvailable ? 'flex' : 'none';

        const archiveRow = settingsMenu?.querySelector('[data-part="archiveButton"]');
        if (archiveRow) archiveRow.style.display = cachedNativeArchiveAvailable ? 'flex' : 'none';

        const externalRow = settingsMenu?.querySelector('[data-part="externalArchiveButton"]');
        if (externalRow) externalRow.style.display = cachedExternalArchiveAvailable ? 'flex' : 'none';

        const startRow = settingsMenu?.querySelector('[data-part="startButton"]');
        if (startRow) startRow.style.display = 'flex';
    }

    function syncSettingsMenu() {
        if (!settingsMenu) return;

        settingsMenu.querySelectorAll('input[data-part]').forEach(input => {
            input.checked = visibleParts[input.dataset.part] !== false;
        });
    }

    function fireClickSequence(el) {
        if (!el) return;

        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.click();
    }

    function openOutputDialog() {
        const alreadyOpen = Array.from(document.querySelectorAll('[role="dialog"]')).some(el => (el.textContent || '').includes('최대 출력량 조절'));

        if (alreadyOpen) return;

        const trigger = document.getElementById('max-output-modal-menu-button');

        if (trigger) fireClickSequence(trigger);
    }

    function getDisplayModelInfo(model) {
        return {
            ...MODEL_INFO[model],
            ...(syncedModelInfo[model] || {})
        };
    }

    function getOfficialModelButton() {
        return Array.from(document.querySelectorAll(SELECTOR.modelButton)).find(btn => {
            if (btn.querySelector(SELECTOR.modelIcon)) return true;
            return Object.keys(MODEL_INFO).some(model => (btn.textContent || '').includes(model));
        });
    }

    function getOfficialModelMenu() {
        return Array.from(document.querySelectorAll('[role="menu"]')).find(menu =>
            Object.keys(MODEL_INFO).some(model => (menu.textContent || '').includes(model))
        );
    }

    function extractCostFromModelItem(item) {
        if (!item) return null;

        const priceArea =
            item.querySelector('.ml-2') ||
            item.querySelector('[class*="gap-2"]') ||
            item;

        const text = priceArea.textContent || '';
        const matches = [...text.matchAll(/(\d+)\s*개/g)];

        if (!matches.length) return null;

        return Number(matches[matches.length - 1][1]);
    }

    function extractRecommendedFromModelItem(item) {
        if (!item) return false;
        const candidates = item.querySelectorAll('div, span');
        for (const el of candidates) {
            const text = (el.textContent || '').trim();
            if (text === '내 추천') return true;
        }
        return false;
    }

    function readOfficialModelInfoFromMenu(menu) {
        const result = {};

        if (!menu) return result;

        const items = Array.from(menu.querySelectorAll(SELECTOR.menuItem));

        for (const item of items) {
            const img = item.querySelector('img[alt]');
            const imgAlt = img?.alt?.trim();
            const text = item.textContent || '';

            const modelName = MODEL_INFO[imgAlt]
                ? imgAlt
                : Object.keys(MODEL_INFO).find(model => text.includes(model));

            if (!modelName || !MODEL_INFO[modelName]) continue;

            const cost = extractCostFromModelItem(item);
            const image = img?.src || MODEL_INFO[modelName].image;
            const recommended = extractRecommendedFromModelItem(item);

            result[modelName] = {
                image,
                cost: cost ?? MODEL_INFO[modelName].cost,
                recommended
            };
        }

        const recCount = Object.values(result).filter(v => v.recommended).length;
        if (recCount > 1) {
            let kept = false;
            for (const key of Object.keys(result)) {
                if (result[key].recommended) {
                    if (kept) result[key].recommended = false;
                    else kept = true;
                }
            }
        }

        return result;
    }

    function updateCustomMenuModelItems() {
        if (!customMenu) return;

        customMenu.querySelectorAll('.my-counter-menu-item[data-model-name]').forEach(item => {
            const model = item.dataset.modelName;

            if (!MODEL_INFO[model]) return;

            const info = getDisplayModelInfo(model);
            const img = item.querySelector('.my-counter-model-icon');
            const costSpan = item.querySelector('.cost-span');
            const inner = item.querySelector('.my-counter-menu-inner');

            if (img && info.image) img.src = info.image;
            if (costSpan && info.cost != null) costSpan.textContent = `(${info.cost}개)`;

            if (inner) {
                const existing = inner.querySelector('.my-counter-rec-badge');
                if (info.recommended && !existing) {
                    const badge = document.createElement('span');
                    badge.className = 'my-counter-rec-badge';
                    badge.title = '내 추천';
                    badge.textContent = '👍';
                    inner.appendChild(badge);
                } else if (!info.recommended && existing) {
                    existing.remove();
                }
            }
        });
    }

    async function syncOfficialModelInfoFromOfficialMenu(force = false) {
        if (syncingOfficialModelInfo) return;

        const now = Date.now();

        if (!force && now - lastModelInfoSyncTime < 30000) return;

        const officialBtn = getOfficialModelButton();
        if (!officialBtn) return;

        syncingOfficialModelInfo = true;

        const wasExpanded = officialBtn.getAttribute('aria-expanded') === 'true';
        const stopViewportGuard = createModelMenuViewportGuard();
        const stopHidingModelMenu = createModelMenuAutoHider();

        try {
            if (!wasExpanded) fireClickSequence(officialBtn);

            await sleep(90);

            const modelMenu = getOfficialModelMenu();
            const nextInfo = readOfficialModelInfoFromMenu(modelMenu);

            if (Object.keys(nextInfo).length > 0) {
                syncedModelInfo = {
                    ...syncedModelInfo,
                    ...nextInfo
                };

                updateCustomMenuModelItems();
            }
        } finally {
            lastModelInfoSyncTime = Date.now();

            if (!wasExpanded && officialBtn.getAttribute('aria-expanded') === 'true') {
                fireClickSequence(officialBtn);
            }

            setTimeout(() => {
                stopHidingModelMenu();
                stopViewportGuard();
                syncingOfficialModelInfo = false;

                if (currentInput && document.contains(currentInput)) {
                    try {
                        currentInput.focus({ preventScroll: true });
                    } catch {
                        try { currentInput.focus(); } catch {}
                    }
                }
            }, 260);
        }
    }

    function createModelMenuViewportGuard() {
        const root = document.documentElement;
        const body = document.body;
        const startX = window.scrollX || window.pageXOffset || 0;
        const previous = {
            rootOverflowX: root.style.overflowX,
            rootMaxWidth: root.style.maxWidth,
            rootOverscrollBehaviorX: root.style.overscrollBehaviorX,
            bodyOverflowX: body?.style.overflowX || '',
            bodyMaxWidth: body?.style.maxWidth || '',
            bodyOverscrollBehaviorX: body?.style.overscrollBehaviorX || ''
        };
        let stopped = false;
        let frameId = 0;

        root.style.overflowX = 'hidden';
        root.style.maxWidth = '100vw';
        root.style.overscrollBehaviorX = 'none';

        if (body) {
            body.style.overflowX = 'hidden';
            body.style.maxWidth = '100vw';
            body.style.overscrollBehaviorX = 'none';
        }

        const keepX = () => {
            if (stopped) return;

            if ((window.scrollX || window.pageXOffset || 0) !== startX) {
                window.scrollTo(startX, window.scrollY || window.pageYOffset || 0);
            }

            frameId = requestAnimationFrame(keepX);
        };

        keepX();

        return () => {
            if (stopped) return;

            stopped = true;
            cancelAnimationFrame(frameId);

            root.style.overflowX = previous.rootOverflowX;
            root.style.maxWidth = previous.rootMaxWidth;
            root.style.overscrollBehaviorX = previous.rootOverscrollBehaviorX;

            if (body) {
                body.style.overflowX = previous.bodyOverflowX;
                body.style.maxWidth = previous.bodyMaxWidth;
                body.style.overscrollBehaviorX = previous.bodyOverscrollBehaviorX;
            }

            [0, 80, 180].forEach(delay => {
                setTimeout(() => {
                    if ((window.scrollX || window.pageXOffset || 0) !== startX) {
                        window.scrollTo(startX, window.scrollY || window.pageYOffset || 0);
                    }
                }, delay);
            });
        };
    }

    function createModelMenuAutoHider() {
        const hiddenWrappers = new Map();

        const hideWrapper = (wrapper) => {
            const menu = wrapper.querySelector('[role="menu"]');

            if (!menu || !Object.keys(MODEL_INFO).some(model => (wrapper.textContent || '').includes(model))) return;

            if (!hiddenWrappers.has(wrapper)) {
                hiddenWrappers.set(wrapper, {
                    visibility: wrapper.style.visibility,
                    opacity: wrapper.style.opacity,
                    pointerEvents: wrapper.style.pointerEvents
                });
            }

            wrapper.style.visibility = 'hidden';
            wrapper.style.opacity = '0';
            wrapper.style.pointerEvents = 'none';
        };

        document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach(hideWrapper);

        const menuObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;

                    if (node.matches?.('[data-radix-popper-content-wrapper]')) hideWrapper(node);

                    node.querySelectorAll?.('[data-radix-popper-content-wrapper]').forEach(hideWrapper);
                }
            }
        });

        menuObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        return () => {
            menuObserver.disconnect();

            for (const [wrapper, oldStyle] of hiddenWrappers.entries()) {
                wrapper.style.visibility = oldStyle.visibility;
                wrapper.style.opacity = oldStyle.opacity;
                wrapper.style.pointerEvents = oldStyle.pointerEvents;
            }
        };
    }

    async function selectModelInvisibly(targetModelName) {
        while (syncingOfficialModelInfo) await sleep(30);

        const officialBtn = getOfficialModelButton();

        if (!officialBtn) return;

        const stopViewportGuard = createModelMenuViewportGuard();
        const stopHidingModelMenu = createModelMenuAutoHider();

        if (officialBtn.getAttribute('aria-expanded') !== 'true') {
            fireClickSequence(officialBtn);
        }

        setTimeout(() => {
            const modelMenu = getOfficialModelMenu();

            if (!modelMenu) {
                stopHidingModelMenu();
                stopViewportGuard();
                return;
            }

            const targetItem = Array.from(modelMenu.querySelectorAll(SELECTOR.menuItem)).find(item =>
                item.textContent.includes(targetModelName)
            );

            if (targetItem) {
                const nextInfo = readOfficialModelInfoFromMenu(modelMenu);

                if (Object.keys(nextInfo).length > 0) {
                    syncedModelInfo = {
                        ...syncedModelInfo,
                        ...nextInfo
                    };

                    updateCustomMenuModelItems();
                    lastModelInfoSyncTime = Date.now();
                }

                fireClickSequence(targetItem);
                lastHeavyCheckTime = 0;
            }

            setTimeout(() => {
                stopHidingModelMenu();
                stopViewportGuard();
            }, 320);
        }, 60);
    }

    function getCurrentModelName() {
        const icons = Array.from(document.querySelectorAll(SELECTOR.modelIcon));

        for (const icon of icons) {
            if (icon.closest(SELECTOR.menuItem) || icon.closest('[role="dialog"]')) continue;

            const fromSrc = Object.entries(MODEL_ICON_MAP).find(([file]) => (icon.src || '').includes(file));

            if (fromSrc) return fromSrc[1];

            const found = Object.keys(MODEL_INFO).find(model => (icon.alt || '').includes(model));

            if (found) return found;
        }

        const spans = Array.from(document.querySelectorAll('span'));

        for (const span of spans) {
            if (span.closest(SELECTOR.menuItem) || span.closest('[role="dialog"]')) continue;

            const text = span.textContent.trim();

            if (MODEL_INFO[text]) return text;
        }

        return null;
    }

    function applyTheme(colors, currentModelName, isImageOn) {
        if (!menuBadge || !customMenu || !settingsMenu) return;

        menuBadge.style.backgroundColor = colors.bg;
        menuBadge.style.color = colors.text;
        menuBadge.style.setProperty('--btn-bg', colors.btnBg);
        menuBadge.style.setProperty('--btn-hover-bg', colors.btnHoverBg);
        menuBadge.style.setProperty('--active-btn-bg', colors.activeBtnBg);
        menuBadge.style.setProperty('--active-btn-hover-bg', colors.activeBtnHoverBg);
        menuBadge.style.setProperty('--active-text', colors.activeBtnText);

        if (imageBtn) {
            if (isImageOn) imageBtn.classList.add('is-active');
            else imageBtn.classList.remove('is-active');
        }

        customMenu.style.background = colors.menuBg;
        customMenu.style.borderColor = colors.menuBorder;
        customMenu.style.color = colors.itemText;
        customMenu.style.setProperty('--item-hover-bg', colors.itemHoverBg);
        customMenu.style.setProperty('--item-hover-text', colors.itemHoverText);
        customMenu.style.setProperty('--cost-text', colors.costText);

        settingsMenu.style.background = colors.menuBg;
        settingsMenu.style.borderColor = colors.menuBorder;
        settingsMenu.style.color = colors.itemText;

        Array.from(customMenu.children).forEach(item => {
            if (item.dataset.modelName === currentModelName) {
                item.classList.add('is-selected');
            } else {
                item.classList.remove('is-selected');
            }
        });
    }

    // [변경] textarea/contenteditable 모두 지원 + HUD 스크립트와 좌표 호환 (동적 측정)
    function updateLayout(inputEl) {
        if (!menuBadge || !menuBadge.parentElement) return;

        const isContentEditable = inputEl.tagName !== 'TEXTAREA';
        const compStyle = getComputedStyle(inputEl);
        const paddingLeft = parseFloat(compStyle.paddingLeft) || 0;
        const borderLeft = parseFloat(compStyle.borderLeftWidth) || 0;

        const inputRect = inputEl.getBoundingClientRect();
        const parentRect = menuBadge.parentElement.getBoundingClientRect();
        const leftOffset = inputRect.left - parentRect.left + paddingLeft + borderLeft;

        menuBadge.style.paddingLeft = `${Math.max(0, leftOffset)}px`;
        menuBadge.style.paddingRight = `12px`;

        // 메뉴는 항상 컨테이너 최상단에 위치
        menuBadge.style.top = '2px';

        // 고정값. 동적 측정하지 말 것. hover/focus 때 움찔거림 방지.
menuBadge.style.top = '2px';

const infoDisplay = document.getElementById('my-custom-info-display');
const infoIsSibling = infoDisplay && menuBadge.parentElement.contains(infoDisplay);

const requiredPaddingTop = infoIsSibling ? 81 : 46;

inputEl.style.setProperty('padding-top', `${requiredPaddingTop}px`, 'important');
inputEl.style.setProperty('min-height', `${requiredPaddingTop + 40}px`, 'important');
    }

    function updateState() {
        const inputEl = Array.from(document.querySelectorAll(SELECTOR.input)).find(el => {
    if (el.dataset.loreRefinerMessageId) return false;
    if (el.closest('.bg-surface_tertiary')) return false;

    const wrapText = (el.closest('div.flex.flex-col')?.innerText || '');
    if (wrapText.includes('수정 완료') || wrapText.includes('취소')) return false;

    return true;
});

        if (!inputEl) {
            menuBadge?.remove();
            menuBadge = null;
            currentInput = null;
            currentContainer = null;
            hideAllMenus();
            return;
        }

        const expectedContainer = findInputContainer(inputEl);

        if (!menuBadge ||
            currentInput !== inputEl ||
            currentContainer !== expectedContainer ||
            menuBadge.parentElement !== expectedContainer) {
            initUI(inputEl);
        }

        if (!menuBadge) return;

        const colors = getThemeColors(inputEl);
        const now = Date.now();

        if (now - lastHeavyCheckTime > 1500) {
            refreshHeavyState();
        }

        applyTheme(colors, cachedModelName, cachedImageSwitchState);
        applyVisibleButtons();
        updateLayout(inputEl);


        if (customMenu?.style.display === 'flex') positionMenu(customMenu, quickBtn);
        if (settingsMenu?.style.display === 'flex') positionMenu(settingsMenu, settingsBtn);
    }
})();
