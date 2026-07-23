// ==UserScript==
// @name         🌌 크랙 채팅 배경
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.1.5
// @description  채팅방별 배경 6장을 로컬에 저장하고 구도·가독성 막을 조절하며 Lore Sync 계정으로 선택 동기화합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Chat_Background.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Chat_Background.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* global GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest, unsafeWindow */

(() => {
  'use strict';

  const VERSION = '0.1.5';
  const STORAGE_PREFIX = 'crackChatBackground:v1:';
  const IMAGE_PREFIX = `${STORAGE_PREFIX}image:`;
  const SHARED_CLOUD_API_KEY = '__SHIPIDLE_CHAT_BACKGROUND_SYNC__';
  const SLOT_COUNT = 6;
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_CLOUD_BYTES = 700 * 1024;
  const MAX_IMAGE_EDGE = 1920;
  const BRIDGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const CHAT_ROUTES = [
    /^\/stories\/[^/]+\/episodes\/[^/]+/,
    /^\/characters\/[^/]+\/chats\/[^/]+/,
    /^\/u\/[^/]+\/c\/[^/]+/,
  ];

  const ICONS = {
    background: '<span class="cbg-header-emoji" aria-hidden="true">🌌</span>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.75m0 0-4 4m4-4 4 4M5 14.5v4.25c0 .7.55 1.25 1.25 1.25h11.5c.7 0 1.25-.55 1.25-1.25V14.5"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v12A1.5 1.5 0 0 0 8.5 17H20.5M3.5 7H15.5A1.5 1.5 0 0 1 17 8.5V20.5"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 18.5h10.2a4.05 4.05 0 0 0 .55-8.06A6.2 6.2 0 0 0 6.2 8.65a4.95 4.95 0 0 0 1.05 9.85Z"/></svg>',
  };

  const defaultState = () => ({
    visible: true,
    activeSlot: 0,
    veilOpacity: 0.22,
    cloudRevision: 0,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
  });

  let state = defaultState();
  let currentPath = '';
  let scanTimer = 0;
  let positionFrame = 0;
  const imageCache = new Map();

  GM_addStyle(`
    :root { --cbg-blue:#3182f6; --cbg-text:#191f28; --cbg-sub:#6b7684; --cbg-line:#e5e8eb; --cbg-soft:#f2f4f6; }
    #cbg-header-button { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; border:1px solid #e5e8eb; border-radius:10px; background:#fff; color:#4e5968; padding:0; box-shadow:0 1px 2px rgba(0,0,0,.04); cursor:pointer; -webkit-tap-highlight-color:transparent; }
    #cbg-header-button[data-active="true"] { border-color:#c9cdef; background:#eaecfa; color:#fff; }
    #cbg-header-button .cbg-header-emoji { display:block; font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",emoji; font-size:18px; font-weight:400; line-height:1; }
    #cbg-header-button svg, .cbg-icon svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .cbg-main-host { isolation:isolate; }
    .cbg-main-host > :not(#cbg-stage) { position:relative; z-index:1; }
    #cbg-stage { position:fixed; z-index:0; overflow:hidden; pointer-events:none; background:#fff; }
    #cbg-stage img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; user-select:none; -webkit-user-drag:none; }
    #cbg-stage::after { content:""; position:absolute; inset:0; background:rgba(255,255,255,var(--cbg-veil,.22)); pointer-events:none; }
    .cbg-overlay { position:fixed; inset:0; z-index:2147483100; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(15,23,42,.38); color:var(--cbg-text); font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo",sans-serif; -webkit-font-smoothing:antialiased; }
    .cbg-panel { width:min(460px,100%); max-height:min(780px,calc(100dvh - 36px)); overflow:auto; overscroll-behavior:contain; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.22); }
    .cbg-panel-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; min-height:66px; padding:0 20px; border-bottom:1px solid #f2f4f6; background:rgba(255,255,255,.96); backdrop-filter:blur(12px); }
    .cbg-title { margin:0; font-size:20px; font-weight:750; letter-spacing:-.35px; }
    .cbg-close { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:10px; background:#f2f4f6; color:#4e5968; padding:0; cursor:pointer; }
    .cbg-close svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
    .cbg-panel-body { padding:18px 20px 24px; }
    .cbg-card { margin-bottom:14px; padding:16px; border:1px solid #edf0f2; border-radius:16px; background:#fff; }
    .cbg-card-soft { background:#f7f8fa; border-color:#f7f8fa; }
    .cbg-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:18px; }
    .cbg-label { font-size:15px; font-weight:750; }
    .cbg-desc, .cbg-help { margin:4px 0 0; color:var(--cbg-sub); font-size:12px; line-height:1.55; word-break:keep-all; }
    .cbg-switch { position:relative; width:48px; height:28px; flex:0 0 auto; border:0; border-radius:999px; background:#d1d6db; padding:0; cursor:pointer; transition:background .16s ease; }
    .cbg-switch::after { content:""; position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .16s ease; }
    .cbg-switch[aria-checked="true"] { background:var(--cbg-blue); }
    .cbg-switch[aria-checked="true"]::after { transform:translateX(20px); }
    .cbg-slot-tabs { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:10px 0 14px; }
    .cbg-slot-tab { height:38px; border:1px solid var(--cbg-line); border-radius:11px; background:#fff; color:#4e5968; font:700 13px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; }
    .cbg-slot-tab[data-active="true"] { border-color:var(--cbg-blue); background:var(--cbg-blue); color:#fff; }
    .cbg-slot-tab[data-filled="true"]::after { content:""; display:inline-block; width:5px; height:5px; margin-left:4px; border-radius:50%; background:currentColor; vertical-align:2px; opacity:.75; }
    .cbg-slot-main { display:grid; grid-template-columns:116px minmax(0,1fr); gap:14px; align-items:start; }
    .cbg-thumb { width:116px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid var(--cbg-line); border-radius:14px; background:var(--cbg-soft); color:#8b95a1; }
    .cbg-thumb img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; }
    .cbg-thumb svg { width:28px; height:28px; fill:none; stroke:currentColor; stroke-width:1.6; }
    .cbg-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .cbg-btn { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--cbg-line); border-radius:11px; background:#fff; color:#333d4b; padding:0 11px; font:650 13px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; }
    .cbg-btn:hover { background:#f7f8fa; }
    .cbg-btn:disabled { opacity:.4; cursor:default; }
    .cbg-btn-primary { border-color:var(--cbg-blue); background:var(--cbg-blue); color:#fff; }
    .cbg-btn-primary:hover { background:#1b64da; }
    .cbg-btn-danger { color:#e42939; }
    .cbg-icon { width:17px; height:17px; display:inline-flex; }
    .cbg-url-row { display:flex; gap:8px; margin-top:9px; }
    .cbg-input { width:100%; min-width:0; height:40px; border:1px solid var(--cbg-line); border-radius:11px; background:#fff; color:var(--cbg-text); padding:0 12px; outline:none; font:13px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; }
    .cbg-input:focus { border-color:var(--cbg-blue); box-shadow:0 0 0 3px rgba(49,130,246,.12); }
    .cbg-range-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 8px; color:var(--cbg-sub); font-size:12px; }
    .cbg-range { width:100%; accent-color:var(--cbg-blue); }
    .cbg-status { min-height:18px; margin:10px 0 0; color:var(--cbg-sub); font-size:12px; line-height:1.45; }
    .cbg-status[data-tone="error"] { color:#e42939; }
    .cbg-cloud-head { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:750; }
    .cbg-cloud-head .cbg-icon { color:var(--cbg-blue); }
    .cbg-cloud-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .cbg-crop-panel { width:min(400px,100%); overflow:hidden; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.24); }
    .cbg-crop-body { padding:18px 20px 20px; }
    .cbg-crop-frame { position:relative; overflow:hidden; margin:0 auto 18px; border-radius:16px; background:#e5e8eb; touch-action:none; cursor:grab; }
    .cbg-crop-frame:active { cursor:grabbing; }
    .cbg-crop-frame img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; pointer-events:none; user-select:none; -webkit-user-drag:none; }
    .cbg-crop-grid { position:absolute; inset:0; pointer-events:none; background:linear-gradient(to right,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%),linear-gradient(to bottom,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%); box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }
    .cbg-crop-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:18px; }
    @media (max-width:480px) {
      .cbg-overlay { padding:10px; align-items:flex-end; background:#fff; }
      .cbg-panel { max-height:calc(100dvh - 20px); border-radius:22px 22px 16px 16px; }
      .cbg-panel-head { padding:0 16px; }
      .cbg-panel-body { padding:16px 16px 22px; }
      .cbg-slot-tabs { gap:5px; }
      .cbg-slot-main { grid-template-columns:96px minmax(0,1fr); gap:12px; }
      .cbg-thumb { width:96px; }
      .cbg-crop-panel { border-radius:22px 22px 16px 16px; }
    }
  `);

  function isChatRoute() {
    return CHAT_ROUTES.some(pattern => pattern.test(location.pathname));
  }

  function roomStorageKey() {
    return `${STORAGE_PREFIX}room:${encodeURIComponent(location.pathname)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeCrop(crop) {
    return {
      x: clamp(Number(crop?.x) || 50, 0, 100),
      y: clamp(Number(crop?.y) || 50, 0, 100),
      zoom: clamp(Number(crop?.zoom) || 1, 1, 3),
    };
  }

  function normalizeSlot(slot) {
    if (!slot || !/^[a-f0-9]{64}$/i.test(String(slot.hash || ''))) return null;
    const mime = /^image\/(webp|jpeg|png)$/.test(String(slot.mime || '')) ? slot.mime : 'image/webp';
    return { hash: String(slot.hash).toLowerCase(), mime, crop: normalizeCrop(slot.crop) };
  }

  function normalizeState(saved) {
    const fallback = defaultState();
    if (!saved || typeof saved !== 'object') return fallback;
    const slots = Array.from({ length: SLOT_COUNT }, (_, index) => normalizeSlot(saved.slots?.[index]));
    return {
      visible: saved.visible !== false,
      activeSlot: clamp(Math.trunc(Number(saved.activeSlot) || 0), 0, SLOT_COUNT - 1),
      veilOpacity: clamp(Number.isFinite(Number(saved.veilOpacity)) ? Number(saved.veilOpacity) : 0.22, 0, 1),
      cloudRevision: Math.max(0, Number(saved.cloudRevision) || 0),
      slots,
    };
  }

  function parseSaved(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
  }

  async function loadState() {
    return normalizeState(parseSaved(await GM_getValue(roomStorageKey(), null)));
  }

  async function saveState() {
    await GM_setValue(roomStorageKey(), JSON.stringify(state));
  }

  async function getImageData(hash) {
    if (!hash) return null;
    if (imageCache.has(hash)) return imageCache.get(hash);
    const dataUrl = await GM_getValue(`${IMAGE_PREFIX}${hash}`, null);
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      imageCache.set(hash, dataUrl);
      return dataUrl;
    }
    return null;
  }

  function applyCrop(image, crop) {
    const value = normalizeCrop(crop);
    image.style.objectPosition = `${value.x}% ${value.y}%`;
    image.style.transform = `scale(${value.zoom})`;
  }

  function findMessageColumn() {
    const markdown = document.querySelector('main .wrtn-markdown');
    let element = markdown;
    while (element && element.parentElement && element.tagName !== 'MAIN') {
      const rect = element.getBoundingClientRect();
      const className = typeof element.className === 'string' ? element.className : '';
      if ((className.includes('max-w-[768px]') || className.includes('max-w-')) && rect.width >= 280 && rect.width <= 820) return element;
      element = element.parentElement;
    }
    return null;
  }

  function findEditor() {
    return document.querySelector('.tiptap.ProseMirror[contenteditable="true"], .__chat_input_textarea[contenteditable="true"], [role="textbox"][contenteditable="true"], textarea');
  }

  function findComposerRect() {
    const editor = findEditor();
    if (!editor) return null;
    let node = editor;
    let candidate = null;
    for (let depth = 0; depth < 9 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      const rect = node.getBoundingClientRect();
      if (rect.width >= Math.min(280, innerWidth * .65)
        && rect.width <= Math.min(820, innerWidth)
        && rect.height >= 70 && rect.height <= 360
        && rect.bottom > innerHeight * .52 && rect.bottom <= innerHeight + 12) {
        if (!candidate || rect.top < candidate.top) candidate = rect;
      }
    }
    return candidate || editor.getBoundingClientRect();
  }

  function stageGeometry() {
    const main = document.querySelector('main');
    if (!main) return null;
    const mainRect = main.getBoundingClientRect();
    const columnRect = findMessageColumn()?.getBoundingClientRect();
    const composerRect = findComposerRect();
    const desktopColumn = innerWidth >= 900 && columnRect?.width >= 280;
    const left = desktopColumn ? columnRect.left : mainRect.left;
    const width = desktopColumn ? columnRect.width : mainRect.width;
    const usableComposerTop = composerRect?.top > mainRect.top + 120 && composerRect.top < mainRect.bottom
      ? composerRect.top
      : mainRect.bottom;
    const height = Math.max(1, usableComposerTop - mainRect.top);
    return { left, top: mainRect.top, width, height, bottom: mainRect.top + height };
  }

  function applyPreviewGeometry(element, cropMode = false) {
    const geometry = stageGeometry();
    if (!geometry) return;
    if (!cropMode) {
      element.style.aspectRatio = `${geometry.width} / ${geometry.height}`;
      return;
    }
    const maxWidth = Math.min(360, innerWidth - 64);
    const maxHeight = Math.min(460, innerHeight * .52);
    const scale = Math.min(maxWidth / geometry.width, maxHeight / geometry.height);
    element.style.width = `${Math.max(1, Math.round(geometry.width * scale))}px`;
    element.style.height = `${Math.max(1, Math.round(geometry.height * scale))}px`;
  }

  function positionStage() {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      const stage = document.getElementById('cbg-stage');
      const geometry = stageGeometry();
      if (!stage || !geometry) return;
      Object.assign(stage.style, {
        left: `${Math.round(geometry.left)}px`,
        top: `${Math.round(geometry.top)}px`,
        width: `${Math.round(geometry.width)}px`,
        height: `${Math.round(geometry.height)}px`,
      });
    });
  }

  async function renderStage() {
    document.getElementById('cbg-stage')?.remove();
    document.querySelectorAll('.cbg-main-host').forEach(element => element.classList.remove('cbg-main-host'));
    if (!isChatRoute() || !state.visible) return;
    const slot = state.slots[state.activeSlot];
    if (!slot) return;
    const dataUrl = await getImageData(slot.hash);
    if (!dataUrl) return;
    const main = document.querySelector('main');
    if (!main) return;
    main.classList.add('cbg-main-host');
    const stage = document.createElement('div');
    stage.id = 'cbg-stage';
    stage.style.setProperty('--cbg-veil', String(state.veilOpacity));
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    stage.appendChild(image);
    main.appendChild(stage);
    positionStage();
  }

  function findHeaderHost() {
    const aiSummaryButton = document.querySelector('button[data-ce-ai-summary="true"]');
    if (aiSummaryButton?.parentElement) return aiSummaryButton.parentElement;
    const profileButton = document.getElementById('cph-header-button');
    if (profileButton?.parentElement) return profileButton.parentElement;
    return null;
  }

  function updateHeaderButton() {
    const button = document.getElementById('cbg-header-button');
    if (!button) return;
    button.dataset.active = String(state.visible && Boolean(state.slots[state.activeSlot]));
    button.title = '채팅 배경 설정';
  }

  function mountHeaderButton() {
    const existing = document.getElementById('cbg-header-button');
    if (!isChatRoute()) { existing?.remove(); return; }
    const host = findHeaderHost();
    if (!host) return;
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = 'cbg-header-button';
      button.type = 'button';
      button.innerHTML = ICONS.background;
      button.setAttribute('aria-label', '채팅 배경 설정');
      button.addEventListener('click', () => void openSettings());
    }
    if (button.parentElement !== host) host.insertBefore(button, host.firstChild);
    updateHeaderButton();
  }

  function closeOverlay(id) {
    document.getElementById(id)?.remove();
  }

  function makeButton(text, className = 'cbg-btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
  }

  function makeIconButton(icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cbg-close';
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    return button;
  }

  function createSwitch(checked, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cbg-switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-checked', String(checked));
    button.addEventListener('click', () => void handler(button.getAttribute('aria-checked') !== 'true'));
    return button;
  }

  function setStatus(message, tone = '') {
    const status = document.getElementById('cbg-settings-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  async function renderThumb(container, slot) {
    container.replaceChildren();
    const dataUrl = slot ? await getImageData(slot.hash) : null;
    if (!slot || !dataUrl) { container.innerHTML = ICONS.background; return; }
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    container.appendChild(image);
  }

  function sharedCloudApi() {
    const api = BRIDGE?.[SHARED_CLOUD_API_KEY];
    return api?.version >= 1 ? api : null;
  }

  function sharedCloudStatus() {
    const api = sharedCloudApi();
    if (!api) return { ready: false, reason: 'Lore Sync 최신판에서 Supabase 로그인을 완료해주셈.' };
    try { return api.getStatus?.() || { ready: false, reason: 'Lore Sync 상태 확인 실패' }; }
    catch (error) { return { ready: false, reason: error.message || 'Lore Sync 상태 확인 실패' }; }
  }

  async function openSettings(replace = false) {
    if (replace) closeOverlay('cbg-settings-overlay');
    if (document.getElementById('cbg-settings-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cbg-settings-overlay';
    overlay.className = 'cbg-overlay';
    const panel = document.createElement('div');
    panel.className = 'cbg-panel';
    const head = document.createElement('div');
    head.className = 'cbg-panel-head';
    const title = document.createElement('h2');
    title.className = 'cbg-title';
    title.textContent = '채팅 배경';
    const close = makeIconButton(ICONS.close, '닫기');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'cbg-panel-body';

    const displayCard = document.createElement('div');
    displayCard.className = 'cbg-card cbg-card-soft';
    const displayRow = document.createElement('div');
    displayRow.className = 'cbg-toggle-row';
    displayRow.innerHTML = '<div><div class="cbg-label">채팅 화면에 표시</div><div class="cbg-desc">끄면 배경 요소를 완전히 제거함</div></div>';
    displayRow.appendChild(createSwitch(state.visible, '채팅 배경 표시', async value => {
      state.visible = value;
      await saveState();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
    }));
    displayCard.appendChild(displayRow);
    body.appendChild(displayCard);

    const galleryCard = document.createElement('div');
    galleryCard.className = 'cbg-card';
    galleryCard.innerHTML = '<div class="cbg-label">배경 선택</div><p class="cbg-help">채팅방마다 최대 6장 저장 · 선택한 한 장만 표시</p>';
    const tabs = document.createElement('div');
    tabs.className = 'cbg-slot-tabs';
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const tab = makeButton(String(index + 1), 'cbg-slot-tab');
      tab.dataset.active = String(index === state.activeSlot);
      tab.dataset.filled = String(Boolean(state.slots[index]));
      tab.addEventListener('click', async () => {
        state.activeSlot = index;
        await saveState();
        await renderStage();
        updateHeaderButton();
        await openSettings(true);
      });
      tabs.appendChild(tab);
    }
    galleryCard.appendChild(tabs);

    const slot = state.slots[state.activeSlot];
    const slotMain = document.createElement('div');
    slotMain.className = 'cbg-slot-main';
    const thumb = document.createElement('div');
    thumb.className = 'cbg-thumb';
    applyPreviewGeometry(thumb);
    await renderThumb(thumb, slot);
    const controls = document.createElement('div');
    const actions = document.createElement('div');
    actions.className = 'cbg-actions';
    const fileButton = makeButton('파일 선택', 'cbg-btn cbg-btn-primary');
    fileButton.innerHTML = `<span class="cbg-icon">${ICONS.upload}</span>파일 선택`;
    const cropButton = makeButton('구도 조정');
    cropButton.innerHTML = `<span class="cbg-icon">${ICONS.crop}</span>구도 조정`;
    cropButton.disabled = !slot;
    cropButton.addEventListener('click', () => void openCropper(state.activeSlot));
    actions.append(fileButton, cropButton);
    controls.appendChild(actions);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    fileInput.hidden = true;
    fileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) await importBlob(state.activeSlot, file, fileButton);
      fileInput.value = '';
    });
    controls.appendChild(fileInput);
    const urlRow = document.createElement('div');
    urlRow.className = 'cbg-url-row';
    const urlInput = document.createElement('input');
    urlInput.className = 'cbg-input';
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.placeholder = '이미지 URL 붙여넣기';
    urlInput.setAttribute('aria-label', '배경 이미지 URL');
    const urlButton = makeButton('가져오기');
    urlButton.addEventListener('click', async () => {
      if (!urlInput.value.trim()) { setStatus('이미지 URL을 입력해주셈.', 'error'); return; }
      await importUrl(state.activeSlot, urlInput.value.trim(), urlButton);
    });
    urlRow.append(urlInput, urlButton);
    controls.appendChild(urlRow);
    if (slot) {
      const deleteButton = makeButton('이 배경 삭제', 'cbg-btn cbg-btn-danger');
      deleteButton.style.cssText = 'width:100%;margin-top:9px';
      deleteButton.addEventListener('click', async () => {
        if (!confirm(`${state.activeSlot + 1}번 배경을 이 채팅방에서 삭제할까요?`)) return;
        state.slots[state.activeSlot] = null;
        await saveState();
        await renderStage();
        updateHeaderButton();
        await openSettings(true);
      });
      controls.appendChild(deleteButton);
    }
    slotMain.append(thumb, controls);
    galleryCard.appendChild(slotMain);
    body.appendChild(galleryCard);

    const veilCard = document.createElement('div');
    veilCard.className = 'cbg-card';
    const veilPercent = Math.round(state.veilOpacity * 100);
    veilCard.innerHTML = `<div class="cbg-range-head"><span class="cbg-label">글자 가독성</span><span id="cbg-veil-value">흰색 ${veilPercent}%</span></div><p class="cbg-help">배경 위에만 옅은 흰색 막을 올림. 기본값은 22%.</p>`;
    const veilRange = document.createElement('input');
    veilRange.className = 'cbg-range';
    veilRange.type = 'range';
    veilRange.min = '0';
    veilRange.max = '1';
    veilRange.step = '0.01';
    veilRange.value = String(state.veilOpacity);
    veilRange.addEventListener('input', () => {
      state.veilOpacity = Number(veilRange.value);
      document.getElementById('cbg-veil-value').textContent = `흰색 ${Math.round(state.veilOpacity * 100)}%`;
      document.getElementById('cbg-stage')?.style.setProperty('--cbg-veil', String(state.veilOpacity));
    });
    veilRange.addEventListener('change', () => void saveState());
    veilCard.appendChild(veilRange);
    body.appendChild(veilCard);

    const cloudCard = document.createElement('div');
    cloudCard.className = 'cbg-card';
    const cloud = sharedCloudStatus();
    cloudCard.innerHTML = `<div class="cbg-cloud-head"><span class="cbg-icon">${ICONS.cloud}</span>기기 간 배경 동기화</div><p class="cbg-help">${cloud.ready ? `🟢 Lore Sync 계정 공유 · ${cloud.email || '로그인됨'}` : cloud.reason}</p>`;
    const cloudActions = document.createElement('div');
    cloudActions.className = 'cbg-cloud-actions';
    const cloudUpload = makeButton('클라우드 저장', 'cbg-btn cbg-btn-primary');
    const cloudRestore = makeButton('6장 전부 받기');
    cloudUpload.disabled = !cloud.ready;
    cloudRestore.disabled = !cloud.ready;
    cloudUpload.addEventListener('click', () => void uploadCurrentRoom());
    cloudRestore.addEventListener('click', () => void restoreFromCloud());
    cloudActions.append(cloudUpload, cloudRestore);
    cloudCard.appendChild(cloudActions);
    body.appendChild(cloudCard);

    const note = document.createElement('p');
    note.className = 'cbg-help';
    note.textContent = '이미지는 로컬에 압축 저장되어 매 턴 다시 받지 않음. 클라우드도 버튼을 누를 때만 전송함. 폰은 세로 화면 전체, 데스크탑은 중앙 채팅 글자 영역에만 표시함.';
    const status = document.createElement('div');
    status.id = 'cbg-settings-status';
    status.className = 'cbg-status';
    status.textContent = `v${VERSION}`;
    body.append(note, status);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function dataUrlBytes(dataUrl) {
    const encoded = String(dataUrl).split(',')[1] || '';
    return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  }

  async function hashDataUrl(dataUrl) {
    const digest = await crypto.subtle.digest('SHA-256', dataUrlBytes(dataUrl));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function loadBlobImage(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob) || !blob.size) { reject(new Error('빈 이미지 파일임.')); return; }
      if (blob.size > MAX_SOURCE_BYTES) { reject(new Error('원본 이미지는 20MB 이하여야 함.')); return; }
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('지원하지 않는 이미지 형식임.')); };
      image.src = objectUrl;
    });
  }

  async function optimizeBlob(blob) {
    const source = await loadBlobImage(blob);
    let edge = MAX_IMAGE_EDGE;
    for (let pass = 0; pass < 5; pass += 1) {
      const scale = Math.min(1, edge / Math.max(source.naturalWidth, source.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.78, 0.7, 0.62]) {
        const dataUrl = canvas.toDataURL('image/webp', quality);
        if (dataUrlBytes(dataUrl).byteLength <= MAX_CLOUD_BYTES) return dataUrl;
      }
      edge = Math.round(edge * 0.82);
    }
    throw new Error('이미지를 700KB 이하로 압축하지 못했음. 더 작은 이미지를 사용해주셈.');
  }

  async function importBlob(index, blob, button) {
    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = '압축 중…';
    setStatus('이미지를 기기용으로 압축하는 중…');
    try {
      const dataUrl = await optimizeBlob(blob);
      const hash = await hashDataUrl(dataUrl);
      await GM_setValue(`${IMAGE_PREFIX}${hash}`, dataUrl);
      imageCache.set(hash, dataUrl);
      state.slots[index] = { hash, mime: 'image/webp', crop: { x: 50, y: 50, zoom: 1 } };
      state.activeSlot = index;
      state.visible = true;
      await saveState();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
      await openCropper(index);
    } catch (error) {
      console.warn('[Chat Background] import failed:', error);
      setStatus(error.message || '이미지 등록 실패', 'error');
      button.disabled = false;
      button.innerHTML = oldHtml;
    }
  }

  function requestImageBlob(url) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(url); } catch { reject(new Error('올바른 이미지 URL이 아님.')); return; }
      if (!/^https?:$/.test(parsed.protocol)) { reject(new Error('http 또는 https URL만 사용할 수 있음.')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url: parsed.href, responseType: 'blob', timeout: 30_000,
        onload(response) {
          if (response.status < 200 || response.status >= 300 || !(response.response instanceof Blob)) {
            reject(new Error(`이미지 다운로드 실패 (${response.status})`)); return;
          }
          resolve(response.response);
        },
        onerror: () => reject(new Error('이미지 URL에 연결하지 못했음.')),
        ontimeout: () => reject(new Error('이미지 다운로드 시간이 초과됨.')),
      });
    });
  }

  async function importUrl(index, url, button) {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '받는 중…';
    setStatus('URL 이미지를 한 번만 다운로드하는 중…');
    try { await importBlob(index, await requestImageBlob(url), button); }
    catch (error) {
      console.warn('[Chat Background] URL import failed:', error);
      setStatus(error.message || 'URL 이미지 등록 실패', 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function openCropper(index) {
    closeOverlay('cbg-crop-overlay');
    const slot = state.slots[index];
    const dataUrl = slot ? await getImageData(slot.hash) : null;
    if (!slot || !dataUrl) return;
    const draft = normalizeCrop(slot.crop);
    const overlay = document.createElement('div');
    overlay.id = 'cbg-crop-overlay';
    overlay.className = 'cbg-overlay';
    overlay.style.zIndex = '2147483200';
    const panel = document.createElement('div');
    panel.className = 'cbg-crop-panel';
    const head = document.createElement('div');
    head.className = 'cbg-panel-head';
    const title = document.createElement('h2');
    title.className = 'cbg-title';
    title.textContent = `${index + 1}번 배경 구도`;
    const close = makeIconButton(ICONS.close, '구도 조정 취소');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'cbg-crop-body';
    const frame = document.createElement('div');
    frame.className = 'cbg-crop-frame';
    applyPreviewGeometry(frame, true);
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    const grid = document.createElement('div');
    grid.className = 'cbg-crop-grid';
    frame.append(image, grid);
    body.appendChild(frame);
    const rangeHead = document.createElement('div');
    rangeHead.className = 'cbg-range-head';
    rangeHead.innerHTML = '<span>축소</span><span>확대</span>';
    const range = document.createElement('input');
    range.className = 'cbg-range';
    range.type = 'range'; range.min = '1'; range.max = '3'; range.step = '0.01'; range.value = String(draft.zoom);
    body.append(rangeHead, range);
    const refresh = () => applyCrop(image, draft);
    range.addEventListener('input', () => { draft.zoom = Number(range.value); refresh(); });
    let drag = null;
    frame.addEventListener('pointerdown', event => {
      drag = { id:event.pointerId, clientX:event.clientX, clientY:event.clientY, x:draft.x, y:draft.y };
      frame.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    frame.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const rect = frame.getBoundingClientRect();
      draft.x = clamp(drag.x - ((event.clientX - drag.clientX) / rect.width) * 100 / draft.zoom, 0, 100);
      draft.y = clamp(drag.y - ((event.clientY - drag.clientY) / rect.height) * 100 / draft.zoom, 0, 100);
      refresh(); event.preventDefault();
    });
    const endDrag = event => { if (drag?.id === event.pointerId) drag = null; };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    const actions = document.createElement('div');
    actions.className = 'cbg-crop-actions';
    const reset = makeButton('초기화');
    reset.addEventListener('click', () => { Object.assign(draft, { x:50, y:50, zoom:1 }); range.value = '1'; refresh(); });
    const save = makeButton('구도 저장', 'cbg-btn cbg-btn-primary');
    save.addEventListener('click', async () => {
      state.slots[index].crop = normalizeCrop(draft);
      await saveState();
      await renderStage();
      overlay.remove();
      await openSettings(true);
      setStatus(`${index + 1}번 배경 구도를 저장했음.`);
    });
    actions.append(reset, save);
    body.appendChild(actions);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    refresh();
  }

  async function uploadCurrentRoom() {
    setStatus('클라우드 상태를 확인하는 중…');
    try {
      const api = sharedCloudApi();
      const status = sharedCloudStatus();
      if (!api || !status.ready) throw new Error(status.reason);
      const remote = await api.getManifest(location.pathname);
      if (remote && Number(remote.revision) > state.cloudRevision
        && !confirm(`다른 기기의 더 최신 배경(rev ${remote.revision})이 있음. 현재 설정으로 덮어쓸까요?`)) return;
      const unique = new Map(state.slots.filter(Boolean).map(slot => [slot.hash, slot]));
      let index = 0;
      for (const slot of unique.values()) {
        index += 1;
        setStatus(`중복 제외 이미지 ${index}/${unique.size} 업로드 중…`);
        const dataUrl = await getImageData(slot.hash);
        if (!dataUrl) throw new Error(`${slot.hash.slice(0, 8)} 이미지가 이 기기에 없음.`);
        await api.uploadImage({ hash:slot.hash, mime:slot.mime, dataUrl });
      }
      const revision = Math.max(state.cloudRevision, Number(remote?.revision) || 0) + 1;
      const saved = await api.saveManifest({
        roomKey: location.pathname,
        state: { ...state, cloudRevision: revision },
        revision,
        deviceLabel: status.deviceLabel || '내 기기',
      });
      state.cloudRevision = Number(saved?.revision) || revision;
      await saveState();
      setStatus(`클라우드 저장 완료 · ${unique.size}장 · rev ${state.cloudRevision}`);
    } catch (error) {
      console.warn('[Chat Background] cloud upload failed:', error);
      setStatus(cloudErrorMessage(error, '클라우드 저장 실패'), 'error');
    }
  }

  async function restoreFromCloud() {
    setStatus('클라우드 배경 설정을 확인하는 중…');
    try {
      const api = sharedCloudApi();
      const status = sharedCloudStatus();
      if (!api || !status.ready) throw new Error(status.reason);
      const remote = await api.getManifest(location.pathname);
      if (!remote) throw new Error('이 채팅방의 클라우드 저장본이 없음.');
      if (state.slots.some(Boolean) && !confirm(`${remote.device_label || '다른 기기'}의 rev ${remote.revision} 배경으로 바꿀까요?`)) return;
      const next = normalizeState(remote.state);
      next.cloudRevision = Number(remote.revision) || next.cloudRevision;
      let downloaded = 0;
      for (const slot of new Map(next.slots.filter(Boolean).map(item => [item.hash, item])).values()) {
        if (await getImageData(slot.hash)) continue;
        setStatus(`이미지 ${downloaded + 1}장째 받는 중…`);
        const dataUrl = await api.downloadImage({ hash:slot.hash, mime:slot.mime });
        if (await hashDataUrl(dataUrl) !== slot.hash) throw new Error('받은 이미지 해시가 원격 설정과 다름.');
        await GM_setValue(`${IMAGE_PREFIX}${slot.hash}`, dataUrl);
        imageCache.set(slot.hash, dataUrl);
        downloaded += 1;
      }
      state = next;
      await saveState();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
      setStatus(`6개 슬롯 복원 완료 · 새 이미지 ${downloaded}장`);
    } catch (error) {
      console.warn('[Chat Background] cloud restore failed:', error);
      setStatus(cloudErrorMessage(error, '클라우드 복원 실패'), 'error');
    }
  }

  function cloudErrorMessage(error, fallback) {
    const raw = String(error?.message || error || '');
    if (/chat_background_sync|PGRST205|schema cache/i.test(raw)) return 'Supabase에서 supabase/chat_background_sync.sql을 먼저 Run해주셈.';
    if (/bucket|chat-backgrounds|not found/i.test(raw)) return 'Supabase 배경 이미지 버킷이 없음. 최신 chat_background_sync.sql을 Run해주셈.';
    return raw || fallback;
  }

  async function scan() {
    clearTimeout(scanTimer);
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      closeOverlay('cbg-settings-overlay');
      closeOverlay('cbg-crop-overlay');
      state = isChatRoute() ? await loadState() : defaultState();
      await renderStage();
    }
    mountHeaderButton();
    if (isChatRoute() && state.visible && state.slots[state.activeSlot] && !document.getElementById('cbg-stage')) {
      await renderStage();
    }
    positionStage();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => void scan(), 140);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  window.addEventListener('resize', positionStage, { passive:true });
  window.visualViewport?.addEventListener('resize', positionStage, { passive:true });
  setInterval(() => void scan(), 1800);
  void scan();
})();
