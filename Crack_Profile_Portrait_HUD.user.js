// ==UserScript==
// @name         🖼️ 크랙 프로필 포트레이트 HUD
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.4.0
// @description  🧪 BETA · 채팅방별 A/B/C 프로필 세트를 로컬 저장하고 선택적으로 Supabase 기기 간 동기화합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Profile_Portrait_HUD.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Profile_Portrait_HUD.user.js
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

  const VERSION = '0.4.0';
  const SET_IDS = ['A', 'B', 'C'];
  const ROLES = ['character', 'user'];
  const ROOM_PREFIX = 'crackProfilePortraitHUD:v2:room:';
  const LEGACY_ROOM_PREFIX = 'crackProfilePortraitHUD:v1:';
  const IMAGE_PREFIX = 'crackProfilePortraitHUD:v2:image:';
  const LAYOUT_KEY = 'crackProfilePortraitHUD:v2:layout';
  const CLOUD_CONFIG_KEY = 'crackProfilePortraitHUD:v2:cloudConfig';
  const CLOUD_SESSION_KEY = 'crackProfilePortraitHUD:v2:cloudSession';
  const CLOUD_BUCKET = 'profile-portraits';
  const CLOUD_TABLE = 'profile_portrait_sync';
  const SHARED_CLOUD_API_KEY = '__SHIPIDLE_PROFILE_PORTRAIT_SYNC__';
  const BRIDGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
  const MAX_STORED_BYTES = 350 * 1024;
  const MAX_IMAGE_EDGE = 1280;
  const CHAT_ROUTES = [
    /^\/stories\/[^/]+\/episodes\/[^/]+/,
    /^\/characters\/[^/]+\/chats\/[^/]+/,
    /^\/u\/[^/]+\/c\/[^/]+/
  ];

  const ICONS = {
    portrait: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h14A1.25 1.25 0 0 1 20.25 5v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z"/><circle cx="9" cy="9" r="2.25"/><path d="m5.5 18 4.25-4.5 2.7 2.7 2.3-2.45L18.5 18"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.75m0 0-4 4m4-4 4 4M5 14.5v4.25c0 .7.55 1.25 1.25 1.25h11.5c.7 0 1.25-.55 1.25-1.25V14.5"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v12A1.5 1.5 0 0 0 8.5 17H20.5M3.5 7H15.5A1.5 1.5 0 0 1 17 8.5V20.5"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 18.5h10.2a4.05 4.05 0 0 0 .55-8.06A6.2 6.2 0 0 0 6.2 8.65a4.95 4.95 0 0 0 1.05 9.85Z"/></svg>'
  };

  const emptySet = () => ({ character: null, user: null });
  const defaultState = () => ({
    schemaVersion: 2,
    visible: true,
    activeSet: 'A',
    sets: { A: emptySet(), B: emptySet(), C: emptySet() },
    cloudRevision: 0,
    updatedAt: Date.now()
  });
  const emptyPositions = () => ({ character: null, user: null });
  const defaultLayout = () => ({
    customEnabled: false,
    mobileWidth: 54,
    desktopWidth: 320,
    mobile: emptyPositions(),
    desktop: emptyPositions()
  });
  const defaultCloudConfig = () => ({ projectUrl: '', publishableKey: '', email: '', deviceLabel: '내 기기' });

  let currentPath = '';
  let state = defaultState();
  let layout = defaultLayout();
  let cloudConfig = defaultCloudConfig();
  let cloudSession = null;
  let scanTimer = 0;
  let renderToken = 0;
  let positionEditMode = false;
  let positionDrag = null;
  const imageCache = new Map();

  GM_addStyle(`
    :root { --cph-blue:#3182f6; --cph-text:#191f28; --cph-sub:#6b7684; --cph-line:#e5e8eb; --cph-bg:#f2f4f6; }
    #cph-header-button { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; border:1px solid #e5e8eb; border-radius:10px; background:#fff; color:#4e5968; padding:0; box-shadow:0 1px 2px rgba(0,0,0,.04); cursor:pointer; -webkit-tap-highlight-color:transparent; }
    #cph-header-button[data-active="true"] { border-color:var(--cph-blue); background:var(--cph-blue); color:#fff; }
    #cph-header-button svg, .cph-icon svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    #cph-stage { position:fixed; inset:0; z-index:2147482000; pointer-events:none; }
    .cph-portrait { position:absolute; overflow:hidden; border:1px solid rgba(0,0,0,.08); border-radius:13px; background:#f2f4f6; box-shadow:0 5px 16px rgba(0,0,0,.14); padding:0; pointer-events:auto; cursor:zoom-in; touch-action:none; -webkit-tap-highlight-color:transparent; }
    .cph-portrait img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; pointer-events:none; user-select:none; -webkit-user-drag:none; }
    #cph-stage[data-editing="true"] .cph-portrait { border:2px dashed var(--cph-blue); cursor:move; box-shadow:0 0 0 4px rgba(49,130,246,.16),0 8px 24px rgba(0,0,0,.18); }
    #cph-position-bar { position:fixed; left:50%; bottom:calc(22px + env(safe-area-inset-bottom)); z-index:2147483550; display:flex; gap:8px; transform:translateX(-50%); padding:8px; border:1px solid #e5e8eb; border-radius:14px; background:#fff; box-shadow:0 8px 30px rgba(0,0,0,.18); font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .cph-overlay { position:fixed; inset:0; z-index:2147483600; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(15,23,42,.38); font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo",sans-serif; color:var(--cph-text); -webkit-font-smoothing:antialiased; }
    .cph-panel { width:min(460px,100%); max-height:min(800px,calc(100dvh - 36px)); overflow:auto; overscroll-behavior:contain; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.22); }
    .cph-panel-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; min-height:66px; padding:0 20px; border-bottom:1px solid #f2f4f6; background:rgba(255,255,255,.96); backdrop-filter:blur(12px); }
    .cph-title { margin:0; font-size:20px; font-weight:750; letter-spacing:-.35px; }
    .cph-close { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:10px; background:#f2f4f6; color:#4e5968; padding:0; cursor:pointer; }
    .cph-close svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
    .cph-panel-body { padding:18px 20px 24px; }
    .cph-control-card { margin-bottom:14px; padding:16px; border-radius:16px; background:#f7f8fa; }
    .cph-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .cph-toggle-title { font-size:15px; font-weight:700; }
    .cph-toggle-desc { margin-top:3px; color:var(--cph-sub); font-size:12px; line-height:1.45; }
    .cph-switch { position:relative; width:48px; height:28px; flex:0 0 auto; border:0; border-radius:999px; background:#d1d6db; padding:0; cursor:pointer; transition:background .16s ease; }
    .cph-switch::after { content:""; position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .16s ease; }
    .cph-switch[aria-checked="true"] { background:var(--cph-blue); }
    .cph-switch[aria-checked="true"]::after { transform:translateX(20px); }
    .cph-set-label { margin:14px 0 8px; color:var(--cph-sub); font-size:12px; font-weight:650; }
    .cph-segments { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; padding:4px; border-radius:12px; background:#e9ecef; }
    .cph-segment { height:36px; border:0; border-radius:9px; background:transparent; color:#6b7684; font:700 14px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; }
    .cph-segment[data-active="true"] { background:#fff; color:var(--cph-blue); box-shadow:0 1px 4px rgba(0,0,0,.1); }
    .cph-slot { padding:16px 0 18px; border-top:1px solid #f2f4f6; }
    .cph-slot-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .cph-slot-name { font-size:16px; font-weight:750; }
    .cph-slot-note { color:var(--cph-sub); font-size:12px; }
    .cph-slot-main { display:grid; grid-template-columns:78px minmax(0,1fr); gap:14px; align-items:start; }
    .cph-thumb { width:78px; aspect-ratio:3/4; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid var(--cph-line); border-radius:14px; background:var(--cph-bg); color:#8b95a1; }
    .cph-thumb img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; }
    .cph-thumb svg { width:26px; height:26px; fill:none; stroke:currentColor; stroke-width:1.6; }
    .cph-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .cph-btn { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid var(--cph-line); border-radius:11px; background:#fff; color:#333d4b; padding:0 12px; font:650 13px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; }
    .cph-btn:hover { background:#f7f8fa; }
    .cph-btn:disabled { opacity:.4; cursor:default; }
    .cph-btn-primary { border-color:var(--cph-blue); background:var(--cph-blue); color:#fff; }
    .cph-btn-primary:hover { background:#1b64da; }
    .cph-btn-danger { color:#e42939; }
    .cph-icon { width:17px; height:17px; display:inline-flex; }
    .cph-url-row { display:flex; gap:8px; margin-top:9px; }
    .cph-input { width:100%; min-width:0; height:40px; border:1px solid var(--cph-line); border-radius:11px; background:#fff; color:var(--cph-text); padding:0 12px; outline:none; font:13px Pretendard,-apple-system,BlinkMacSystemFont,sans-serif; }
    .cph-input:focus { border-color:var(--cph-blue); box-shadow:0 0 0 3px rgba(49,130,246,.12); }
    .cph-help { margin:5px 0 0; color:#8b95a1; font-size:12px; line-height:1.55; }
    .cph-status { min-height:18px; margin:10px 0 0; color:var(--cph-sub); font-size:12px; line-height:1.5; }
    .cph-status[data-tone="error"] { color:#e42939; }
    .cph-layout-actions, .cph-cloud-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
    .cph-cloud-card { margin-top:4px; padding:16px; border:1px solid #e5e8eb; border-radius:16px; background:#fff; }
    .cph-cloud-head { display:flex; align-items:center; gap:9px; font-size:15px; font-weight:750; }
    .cph-cloud-head .cph-icon { color:var(--cph-blue); }
    .cph-crop-panel { width:min(390px,100%); overflow:hidden; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.24); }
    .cph-crop-body { padding:18px 20px 20px; }
    .cph-crop-frame { position:relative; width:min(270px,75vw); aspect-ratio:3/4; overflow:hidden; margin:0 auto 20px; border-radius:18px; background:#e5e8eb; touch-action:none; cursor:grab; }
    .cph-crop-frame:active { cursor:grabbing; }
    .cph-crop-frame img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; pointer-events:none; user-select:none; -webkit-user-drag:none; }
    .cph-crop-grid { position:absolute; inset:0; pointer-events:none; background:linear-gradient(to right,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%),linear-gradient(to bottom,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%); box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }
    .cph-range-label { display:flex; justify-content:space-between; margin-bottom:8px; color:var(--cph-sub); font-size:12px; }
    .cph-range { width:100%; accent-color:var(--cph-blue); }
    .cph-crop-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:18px; }
    .cph-viewer { cursor:zoom-out; background:#fff; color-scheme:light; }
    .cph-viewer img { max-width:min(94vw,1100px); max-height:92dvh; object-fit:contain; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.28); }
    @media (max-width:420px) {
      .cph-overlay { padding:10px; align-items:flex-end; }
      .cph-panel { max-height:calc(100dvh - 20px); border-radius:22px 22px 16px 16px; }
      .cph-panel-body { padding:16px 16px 22px; }
      .cph-panel-head { padding:0 16px; }
      .cph-slot-main { grid-template-columns:72px minmax(0,1fr); gap:12px; }
      .cph-thumb { width:72px; }
      .cph-crop-panel { border-radius:22px 22px 16px 16px; }
    }
    @media (max-width:600px) {
      .cph-overlay { background:#fff; color-scheme:light; }
      #cph-position-bar { color-scheme:light; }
    }
  `);

  function isChatRoute() {
    return CHAT_ROUTES.some(pattern => pattern.test(location.pathname));
  }

  function roomStorageKey() {
    return `${ROOM_PREFIX}${encodeURIComponent(location.pathname)}`;
  }

  function legacyRoomStorageKey() {
    return `${LEGACY_ROOM_PREFIX}${encodeURIComponent(location.pathname)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeCrop(crop) {
    const x = Number(crop?.x);
    const y = Number(crop?.y);
    const zoom = Number(crop?.zoom);
    return {
      x: clamp(Number.isFinite(x) ? x : 50, 0, 100),
      y: clamp(Number.isFinite(y) ? y : 50, 0, 100),
      zoom: clamp(Number.isFinite(zoom) ? zoom : 1, 1, 3)
    };
  }

  function normalizeSlot(slot) {
    if (!slot || typeof slot.hash !== 'string' || !/^[a-f0-9]{64}$/.test(slot.hash)) return null;
    return {
      hash: slot.hash,
      mime: /^image\/(webp|jpeg|png)$/.test(slot.mime || '') ? slot.mime : 'image/webp',
      crop: normalizeCrop(slot.crop)
    };
  }

  function normalizeState(saved) {
    const next = defaultState();
    if (!saved || typeof saved !== 'object') return next;
    next.visible = saved.visible !== false;
    next.activeSet = SET_IDS.includes(saved.activeSet) ? saved.activeSet : 'A';
    for (const setId of SET_IDS) {
      for (const role of ROLES) next.sets[setId][role] = normalizeSlot(saved.sets?.[setId]?.[role]);
    }
    next.cloudRevision = Math.max(0, Number(saved.cloudRevision) || 0);
    next.updatedAt = Number(saved.updatedAt) || Date.now();
    return next;
  }

  function normalizePoint(point) {
    if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
    return { x: clamp(Number(point.x), 0, 1), y: clamp(Number(point.y), 0, 1) };
  }

  function normalizeLayout(saved) {
    const next = defaultLayout();
    if (!saved || typeof saved !== 'object') return next;
    next.customEnabled = saved.customEnabled === true;
    next.mobileWidth = clamp(Number(saved.mobileWidth) || 54, 44, 84);
    next.desktopWidth = clamp(Number(saved.desktopWidth) || 320, 240, 480);
    for (const mode of ['mobile', 'desktop']) {
      for (const role of ROLES) next[mode][role] = normalizePoint(saved[mode]?.[role]);
    }
    return next;
  }

  function parseSaved(raw, fallback = null) {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function dataUrlBytes(dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  }

  function dataUrlSize(dataUrl) {
    return dataUrlBytes(dataUrl).byteLength;
  }

  async function hashDataUrl(dataUrl) {
    const digest = await crypto.subtle.digest('SHA-256', dataUrlBytes(dataUrl));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function persistImage(dataUrl) {
    if (!String(dataUrl).startsWith('data:image/')) throw new Error('이미지 데이터 형식이 올바르지 않음.');
    const hash = await hashDataUrl(dataUrl);
    imageCache.set(hash, dataUrl);
    await GM_setValue(`${IMAGE_PREFIX}${hash}`, dataUrl);
    return {
      hash,
      mime: dataUrl.match(/^data:(image\/(?:webp|jpeg|png));base64,/)?.[1] || 'image/webp'
    };
  }

  async function getImageData(hash) {
    if (!hash) return null;
    if (imageCache.has(hash)) return imageCache.get(hash);
    const value = await GM_getValue(`${IMAGE_PREFIX}${hash}`, null);
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      imageCache.set(hash, value);
      return value;
    }
    return null;
  }

  async function migrateLegacyState() {
    const legacy = parseSaved(await GM_getValue(legacyRoomStorageKey(), null));
    if (!legacy?.slots) return null;
    const migrated = defaultState();
    migrated.visible = legacy.visible !== false;
    for (const role of ROLES) {
      const oldSlot = legacy.slots?.[role];
      if (!oldSlot?.dataUrl) continue;
      const stored = await persistImage(oldSlot.dataUrl);
      migrated.sets.A[role] = { ...stored, crop: normalizeCrop(oldSlot.crop) };
    }
    await GM_setValue(roomStorageKey(), JSON.stringify(migrated));
    return migrated;
  }

  async function loadState() {
    const saved = parseSaved(await GM_getValue(roomStorageKey(), null));
    if (saved) return normalizeState(saved);
    return (await migrateLegacyState()) || defaultState();
  }

  async function saveState() {
    state.updatedAt = Date.now();
    await GM_setValue(roomStorageKey(), JSON.stringify(state));
  }

  async function loadGlobals() {
    layout = normalizeLayout(parseSaved(await GM_getValue(LAYOUT_KEY, null)));
    cloudConfig = { ...defaultCloudConfig(), ...(parseSaved(await GM_getValue(CLOUD_CONFIG_KEY, null)) || {}) };
    cloudSession = parseSaved(await GM_getValue(CLOUD_SESSION_KEY, null));
  }

  async function saveLayout() {
    await GM_setValue(LAYOUT_KEY, JSON.stringify(layout));
  }

  async function saveCloudConfig() {
    await GM_setValue(CLOUD_CONFIG_KEY, JSON.stringify(cloudConfig));
  }

  async function saveCloudSession(session) {
    cloudSession = session;
    await GM_setValue(CLOUD_SESSION_KEY, JSON.stringify(session));
  }

  function applyCrop(image, crop) {
    const normalized = normalizeCrop(crop);
    image.style.objectPosition = `${normalized.x}% ${normalized.y}%`;
    const panLimit = (normalized.zoom - 1) * 50;
    const translateX = clamp((50 - normalized.x) * normalized.zoom, -panLimit, panLimit);
    const translateY = clamp((50 - normalized.y) * normalized.zoom, -panLimit, panLimit);
    image.style.transform = `translate(${translateX}%, ${translateY}%) scale(${normalized.zoom})`;
  }

  function slotLabel(role) {
    return role === 'character' ? '캐릭터' : '내 캐릭터';
  }

  function currentMode() {
    const desktopPointer = typeof matchMedia === 'function'
      && matchMedia('(hover: hover) and (pointer: fine)').matches;
    return innerWidth >= 1280 || (innerWidth >= 900 && desktopPointer) ? 'desktop' : 'mobile';
  }

  function findEditor() {
    return document.querySelector('.tiptap.ProseMirror[contenteditable="true"], .__chat_input_textarea[contenteditable="true"], [role="textbox"][contenteditable="true"], textarea');
  }

  function findComposerRect() {
    const editor = findEditor();
    if (!editor) return null;
    let node = editor;
    for (let depth = 0; depth < 9 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      const rect = node.getBoundingClientRect();
      if (rect.width >= Math.min(280, innerWidth * .65)
        && rect.height >= 70 && rect.height <= 360
        && rect.bottom > innerHeight * .52 && rect.bottom <= innerHeight + 8) return rect;
    }
    return editor.getBoundingClientRect();
  }

  function portraitMetrics() {
    const mode = currentMode();
    if (mode === 'mobile') {
      const width = clamp(layout.mobileWidth, 44, 84);
      return { width, height: width * 4 / 3 };
    }
    const width = clamp(layout.desktopWidth, 240, 480);
    return { width, height: width * 4 / 3 };
  }

  function defaultPortraitPosition(role, metrics) {
    const mode = currentMode();
    const composer = findComposerRect();
    if (mode === 'mobile') {
      const top = clamp((composer?.top ?? innerHeight - 180) - metrics.height - 10, 64, innerHeight - metrics.height - 24);
      return { left: role === 'character' ? 18 : innerWidth - metrics.width - 18, top };
    }
    const contentLeft = composer?.left ?? (innerWidth - 760) / 2;
    const contentRight = composer?.right ?? (innerWidth + 760) / 2;
    return {
      left: role === 'character'
        ? clamp(contentLeft - metrics.width - 54, 16, innerWidth - metrics.width - 16)
        : clamp(contentRight + 34, 16, innerWidth - metrics.width - 16),
      top: clamp((innerHeight - metrics.height) / 2, 56, innerHeight - metrics.height - 24)
    };
  }

  function positionPortrait(button, role) {
    const metrics = portraitMetrics();
    button.style.width = `${metrics.width}px`;
    button.style.height = `${metrics.height}px`;
    button.style.borderRadius = currentMode() === 'desktop' ? '20px' : '13px';
    const saved = layout.customEnabled ? layout[currentMode()][role] : null;
    const position = saved ? {
      left: saved.x * Math.max(1, innerWidth - metrics.width),
      top: saved.y * Math.max(1, innerHeight - metrics.height)
    } : defaultPortraitPosition(role, metrics);
    button.style.left = `${clamp(position.left, 0, innerWidth - metrics.width)}px`;
    button.style.top = `${clamp(position.top, 0, innerHeight - metrics.height)}px`;
  }

  function positionStage() {
    document.querySelectorAll('#cph-stage .cph-portrait').forEach(button => positionPortrait(button, button.dataset.role));
  }

  function saveDraggedPosition(button) {
    const rect = button.getBoundingClientRect();
    layout[currentMode()][button.dataset.role] = {
      x: clamp(rect.left / Math.max(1, innerWidth - rect.width), 0, 1),
      y: clamp(rect.top / Math.max(1, innerHeight - rect.height), 0, 1)
    };
    layout.customEnabled = true;
    void saveLayout();
  }

  function bindPortraitDrag(button) {
    button.addEventListener('pointerdown', event => {
      if (!positionEditMode) return;
      const rect = button.getBoundingClientRect();
      positionDrag = { id: event.pointerId, button, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      button.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    button.addEventListener('pointermove', event => {
      if (!positionDrag || positionDrag.id !== event.pointerId || positionDrag.button !== button) return;
      const rect = button.getBoundingClientRect();
      button.style.left = `${clamp(event.clientX - positionDrag.dx, 0, innerWidth - rect.width)}px`;
      button.style.top = `${clamp(event.clientY - positionDrag.dy, 0, innerHeight - rect.height)}px`;
      event.preventDefault();
    });
    const finish = event => {
      if (!positionDrag || positionDrag.id !== event.pointerId || positionDrag.button !== button) return;
      saveDraggedPosition(button);
      positionDrag = null;
    };
    button.addEventListener('pointerup', finish);
    button.addEventListener('pointercancel', finish);
  }

  function createPortrait(role, slot, dataUrl) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cph-portrait';
    button.dataset.role = role;
    button.title = `${slotLabel(role)} 이미지 크게 보기`;
    button.setAttribute('aria-label', `${slotLabel(role)} 이미지 크게 보기`);
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    button.appendChild(image);
    button.addEventListener('click', () => { if (!positionEditMode) openViewer(dataUrl); });
    bindPortraitDrag(button);
    return button;
  }

  async function renderStage() {
    const token = ++renderToken;
    document.getElementById('cph-stage')?.remove();
    if (!isChatRoute() || !state.visible) return;
    const active = state.sets[state.activeSet];
    const resolved = await Promise.all(ROLES.map(async role => ({ role, slot: active[role], dataUrl: await getImageData(active[role]?.hash) })));
    if (token !== renderToken) return;
    const available = resolved.filter(item => item.slot && item.dataUrl);
    if (!available.length) return;
    const stage = document.createElement('div');
    stage.id = 'cph-stage';
    stage.dataset.editing = String(positionEditMode);
    for (const item of available) stage.appendChild(createPortrait(item.role, item.slot, item.dataUrl));
    document.body.appendChild(stage);
    positionStage();
  }

  function updateHeaderButton() {
    const button = document.getElementById('cph-header-button');
    if (!button) return;
    const active = state.sets[state.activeSet];
    const hasImage = !!(active.character || active.user);
    button.dataset.active = String(state.visible && hasImage);
    button.title = hasImage ? `프로필 이미지 설정 · ${state.activeSet} 세트` : '프로필 이미지 등록';
  }

  function findHeaderHost() {
    const aiSummaryButton = document.querySelector('button[data-ce-ai-summary="true"]');
    if (aiSummaryButton?.parentElement) return aiSummaryButton.parentElement;
    const header = Array.from(document.querySelectorAll('div.absolute')).find(element => (
      element.classList.contains('z-[5]') && element.classList.contains('h-12') && element.classList.contains('justify-between')
    ));
    if (!header) return null;
    return Array.from(header.children).find(element => (
      element instanceof HTMLElement && element.classList.contains('flex') && element.classList.contains('items-center') && element.querySelector('button')
    )) || header.querySelector('div.flex.items-center');
  }

  function mountHeaderButton() {
    const existing = document.getElementById('cph-header-button');
    if (!isChatRoute()) {
      existing?.remove();
      return;
    }
    const host = findHeaderHost();
    if (!host) return;
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = 'cph-header-button';
      button.type = 'button';
      button.innerHTML = ICONS.portrait;
      button.setAttribute('aria-label', '프로필 이미지 설정');
      button.addEventListener('click', () => void openSettings());
    }
    if (button.parentElement !== host) host.insertBefore(button, host.firstChild);
    updateHeaderButton();
  }

  function closeOverlay(id) {
    document.getElementById(id)?.remove();
  }

  function makeButton(text, className = 'cph-btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
  }

  function makeIconButton(icon, label, className = 'cph-close') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  function setStatus(message, tone = '') {
    const status = document.getElementById('cph-settings-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  async function renderThumb(container, slot) {
    if (!container) return;
    container.replaceChildren();
    const dataUrl = await getImageData(slot?.hash);
    if (!slot || !dataUrl) {
      container.innerHTML = ICONS.portrait;
      return;
    }
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    container.appendChild(image);
  }

  async function activateSet(setId) {
    if (!SET_IDS.includes(setId)) return;
    state.activeSet = setId;
    await saveState();
    await ensureSetImages(setId, false);
    await renderStage();
    updateHeaderButton();
  }

  async function createSlotSection(role) {
    const slot = state.sets[state.activeSet][role];
    const section = document.createElement('section');
    section.className = 'cph-slot';
    const head = document.createElement('div');
    head.className = 'cph-slot-head';
    head.innerHTML = `<div class="cph-slot-name">${slotLabel(role)} ${state.activeSet}</div><div class="cph-slot-note">이 채팅방에 저장</div>`;
    section.appendChild(head);
    const main = document.createElement('div');
    main.className = 'cph-slot-main';
    const thumb = document.createElement('div');
    thumb.className = 'cph-thumb';
    thumb.id = `cph-thumb-${role}`;
    await renderThumb(thumb, slot);
    main.appendChild(thumb);
    const controls = document.createElement('div');
    const actions = document.createElement('div');
    actions.className = 'cph-actions';
    const fileButton = makeButton('파일 선택', 'cph-btn cph-btn-primary');
    fileButton.innerHTML = `<span class="cph-icon">${ICONS.upload}</span>파일 선택`;
    const cropButton = makeButton('구도 조정');
    cropButton.innerHTML = `<span class="cph-icon">${ICONS.crop}</span>구도 조정`;
    cropButton.disabled = !slot;
    actions.append(fileButton, cropButton);
    controls.appendChild(actions);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    fileInput.hidden = true;
    fileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) await importBlob(role, file, fileButton);
      fileInput.value = '';
    });
    controls.appendChild(fileInput);
    const urlRow = document.createElement('div');
    urlRow.className = 'cph-url-row';
    const urlInput = document.createElement('input');
    urlInput.className = 'cph-input';
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.placeholder = '이미지 URL 붙여넣기';
    urlInput.setAttribute('aria-label', `${slotLabel(role)} 이미지 URL`);
    const urlButton = makeButton('가져오기');
    urlButton.addEventListener('click', async () => {
      if (!urlInput.value.trim()) return setStatus('이미지 URL을 입력해주셈.', 'error');
      await importUrl(role, urlInput.value.trim(), urlButton);
    });
    urlRow.append(urlInput, urlButton);
    controls.appendChild(urlRow);
    if (slot) {
      const deleteButton = makeButton('이미지 삭제', 'cph-btn cph-btn-danger');
      deleteButton.style.cssText = 'margin-top:9px;width:100%';
      deleteButton.addEventListener('click', async () => {
        if (!confirm(`${slotLabel(role)} ${state.activeSet} 이미지를 삭제할까요?`)) return;
        state.sets[state.activeSet][role] = null;
        await saveState();
        await renderStage();
        updateHeaderButton();
        await openSettings(true);
      });
      controls.appendChild(deleteButton);
    }
    cropButton.addEventListener('click', () => void openCropper(role));
    main.appendChild(controls);
    section.appendChild(main);
    return section;
  }

  function createSwitch(checked, label, onChange) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cph-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-checked', String(checked));
    toggle.addEventListener('click', async () => {
      const next = toggle.getAttribute('aria-checked') !== 'true';
      toggle.setAttribute('aria-checked', String(next));
      await onChange(next);
    });
    return toggle;
  }

  function startPositionEdit() {
    closeOverlay('cph-settings-overlay');
    positionEditMode = true;
    void renderStage();
    document.getElementById('cph-position-bar')?.remove();
    const bar = document.createElement('div');
    bar.id = 'cph-position-bar';
    const reset = makeButton('기본 위치');
    reset.addEventListener('click', async () => {
      layout[currentMode()] = emptyPositions();
      layout.customEnabled = false;
      await saveLayout();
      positionStage();
    });
    const done = makeButton('완료', 'cph-btn cph-btn-primary');
    done.addEventListener('click', async () => {
      positionEditMode = false;
      bar.remove();
      await renderStage();
    });
    bar.append(reset, done);
    document.body.appendChild(bar);
  }

  function cloudStatusText() {
    const shared = sharedCloudStatus();
    if (shared.ready) return `🟢 Lore Sync 계정 공유 · ${shared.email || '로그인됨'}`;
    if (cloudSession?.access_token) return `🟢 ${cloudSession.user?.email || cloudConfig.email || '로그인됨'}`;
    if (cloudConfig.projectUrl && cloudConfig.publishableKey) return '연결 정보 저장됨 · 로그인 필요';
    if (shared.reason) return shared.reason;
    return 'Supabase 연결 안 됨 · Lore Sync 설정을 자동 감지함';
  }

  function sharedCloudApi() {
    const api = BRIDGE?.[SHARED_CLOUD_API_KEY];
    return api?.version >= 1 ? api : null;
  }

  function sharedCloudStatus() {
    const api = sharedCloudApi();
    if (!api) return { ready: false, reason: '' };
    try { return api.getStatus?.() || { ready: false, reason: 'Lore Sync 상태를 확인하지 못했음.' }; }
    catch (error) { return { ready: false, reason: error.message || 'Lore Sync 상태 확인 실패' }; }
  }

  function cloudAccessReady() {
    return sharedCloudStatus().ready || Boolean(cloudSession?.access_token);
  }

  async function activeCloudProvider() {
    const api = sharedCloudApi();
    const shared = sharedCloudStatus();
    if (api && shared.ready) return { type: 'lore', api, status: shared };
    if (cloudSession?.access_token) return { type: 'direct', session: await activeCloudSession() };
    throw new Error(shared.reason || 'Lore Sync에서 Supabase 로그인하거나 HUD에 직접 연결해주셈.');
  }

  async function openSettings(replace = false) {
    if (replace) closeOverlay('cph-settings-overlay');
    if (document.getElementById('cph-settings-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cph-settings-overlay';
    overlay.className = 'cph-overlay';
    const panel = document.createElement('div');
    panel.className = 'cph-panel';
    const head = document.createElement('div');
    head.className = 'cph-panel-head';
    const title = document.createElement('h2');
    title.className = 'cph-title';
    title.textContent = '프로필 이미지';
    const close = makeIconButton(ICONS.close, '닫기');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'cph-panel-body';

    const displayCard = document.createElement('div');
    displayCard.className = 'cph-control-card';
    const displayRow = document.createElement('div');
    displayRow.className = 'cph-toggle-row';
    displayRow.innerHTML = '<div><div class="cph-toggle-title">채팅 화면에 표시</div><div class="cph-toggle-desc">끄면 이미지 요소도 화면에서 완전히 제거됨</div></div>';
    displayRow.appendChild(createSwitch(state.visible, '채팅 화면에 프로필 이미지 표시', async value => {
      state.visible = value;
      await saveState();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
    }));
    displayCard.appendChild(displayRow);
    if (state.visible) {
      const label = document.createElement('div');
      label.className = 'cph-set-label';
      label.textContent = '활성 세트 · 캐릭터와 내 캐릭터가 함께 바뀜';
      const segments = document.createElement('div');
      segments.className = 'cph-segments';
      for (const setId of SET_IDS) {
        const segment = document.createElement('button');
        segment.type = 'button';
        segment.className = 'cph-segment';
        segment.dataset.active = String(state.activeSet === setId);
        segment.textContent = setId;
        segment.addEventListener('click', async () => {
          await activateSet(setId);
          await openSettings(true);
        });
        segments.appendChild(segment);
      }
      displayCard.append(label, segments);
    }
    body.appendChild(displayCard);

    const layoutCard = document.createElement('div');
    layoutCard.className = 'cph-control-card';
    const layoutRow = document.createElement('div');
    layoutRow.className = 'cph-toggle-row';
    layoutRow.innerHTML = '<div><div class="cph-toggle-title">사용자 위치 사용</div><div class="cph-toggle-desc">OFF면 입력창·채팅 여백 기준 기본 위치로 돌아감</div></div>';
    layoutRow.appendChild(createSwitch(layout.customEnabled, '사용자 위치 사용', async value => {
      layout.customEnabled = value;
      await saveLayout();
      await renderStage();
    }));
    const desktopSize = currentMode() === 'desktop';
    const sizeKey = desktopSize ? 'desktopWidth' : 'mobileWidth';
    const sizeName = desktopSize ? '데스크톱 이미지 크기' : '모바일 이미지 크기';
    const sizeControl = document.createElement('div');
    sizeControl.style.cssText = 'margin-top:14px';
    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'cph-range-label';
    sizeLabel.innerHTML = `<span>${sizeName}</span><strong id="cph-size-value">${layout[sizeKey]}px</strong>`;
    const sizeRange = document.createElement('input');
    sizeRange.type = 'range';
    sizeRange.className = 'cph-range';
    sizeRange.min = desktopSize ? '240' : '44';
    sizeRange.max = desktopSize ? '480' : '84';
    sizeRange.step = desktopSize ? '10' : '2';
    sizeRange.value = String(layout[sizeKey]);
    sizeRange.setAttribute('aria-label', sizeName);
    sizeRange.addEventListener('input', () => {
      layout[sizeKey] = Number(sizeRange.value);
      sizeLabel.querySelector('strong').textContent = `${layout[sizeKey]}px`;
      positionStage();
    });
    sizeRange.addEventListener('change', () => void saveLayout());
    sizeControl.append(sizeLabel, sizeRange);
    layoutCard.appendChild(sizeControl);
    const layoutActions = document.createElement('div');
    layoutActions.className = 'cph-layout-actions';
    const editPosition = makeButton('위치 편집', 'cph-btn cph-btn-primary');
    editPosition.disabled = !(state.sets[state.activeSet].character || state.sets[state.activeSet].user);
    editPosition.addEventListener('click', startPositionEdit);
    const resetPosition = makeButton('기본 위치로 초기화');
    resetPosition.addEventListener('click', async () => {
      layout[currentMode()] = emptyPositions();
      layout.customEnabled = false;
      await saveLayout();
      await renderStage();
      await openSettings(true);
    });
    layoutActions.append(editPosition, resetPosition);
    layoutCard.append(layoutRow, layoutActions);
    body.appendChild(layoutCard);

    body.append(await createSlotSection('character'), await createSlotSection('user'));

    const cloudCard = document.createElement('div');
    cloudCard.className = 'cph-cloud-card';
    cloudCard.innerHTML = `<div class="cph-cloud-head"><span class="cph-icon">${ICONS.cloud}</span>기기 간 이미지 동기화</div><p class="cph-help">${cloudStatusText()} · 새로고침마다 로그인하지 않음</p>`;
    const cloudActions = document.createElement('div');
    cloudActions.className = 'cph-cloud-actions';
    const sharedReady = sharedCloudStatus().ready;
    const cloudSetup = makeButton(sharedReady ? 'Lore Sync 설정 사용 중' : 'Supabase 설정');
    cloudSetup.addEventListener('click', openCloudSettings);
    const cloudUpload = makeButton('클라우드 저장', 'cph-btn cph-btn-primary');
    cloudUpload.disabled = !cloudAccessReady();
    cloudUpload.addEventListener('click', () => void uploadCurrentRoom());
    const cloudCurrent = makeButton('현재 세트 받기');
    cloudCurrent.disabled = !cloudAccessReady();
    cloudCurrent.addEventListener('click', () => void restoreFromCloud('current'));
    const cloudAll = makeButton('A/B/C 전부 받기');
    cloudAll.disabled = !cloudAccessReady();
    cloudAll.addEventListener('click', () => void restoreFromCloud('all'));
    cloudActions.append(cloudSetup, cloudUpload, cloudCurrent, cloudAll);
    cloudCard.appendChild(cloudActions);
    body.appendChild(cloudCard);

    const help = document.createElement('p');
    help.className = 'cph-help';
    help.textContent = 'Lore Sync가 로그인되어 있으면 같은 Supabase 설정을 자동 사용함. 이미지는 350KB 이하로 압축하고, 이 기기에 없는 이미지만 다운로드함.';
    const status = document.createElement('p');
    status.id = 'cph-settings-status';
    status.className = 'cph-status';
    status.textContent = `Profile Portrait HUD v${VERSION}`;
    body.append(help, status);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function readBlobAsOptimizedDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (!(blob instanceof Blob) || !blob.size) return reject(new Error('빈 이미지 파일임.'));
      if (blob.size > MAX_SOURCE_BYTES) return reject(new Error('이미지는 15MB 이하만 등록 가능함.'));
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          let edge = MAX_IMAGE_EDGE;
          let quality = .84;
          let dataUrl = '';
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('이미지 압축 캔버스를 만들지 못했음.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            dataUrl = canvas.toDataURL('image/webp', quality);
            if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrlSize(dataUrl) <= MAX_STORED_BYTES) break;
            if (quality > .58) quality -= .07;
            else edge = Math.max(520, Math.round(edge * .84));
          }
          if (dataUrlSize(dataUrl) > MAX_STORED_BYTES) throw new Error('350KB 이하로 압축하지 못했음. 더 단순하거나 작은 이미지를 사용해주셈.');
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('지원하지 않거나 손상된 이미지임.'));
      };
      image.src = objectUrl;
    });
  }

  async function importBlob(role, blob, button) {
    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = '처리 중…';
    setStatus('350KB 이하로 압축해 로컬에 저장하는 중…');
    try {
      const dataUrl = await readBlobAsOptimizedDataUrl(blob);
      const stored = await persistImage(dataUrl);
      state.sets[state.activeSet][role] = { ...stored, crop: { x: 50, y: 50, zoom: 1 } };
      state.visible = true;
      await saveState();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
      await openCropper(role);
    } catch (error) {
      console.warn('[Profile Portrait HUD] 이미지 등록 실패:', error);
      setStatus(error.message || '이미지를 등록하지 못했음.', 'error');
      button.disabled = false;
      button.innerHTML = oldHtml;
    }
  }

  function requestImageBlob(url) {
    return new Promise((resolve, reject) => {
      let parsed;
      try { parsed = new URL(url); } catch { return reject(new Error('올바른 이미지 URL이 아님.')); }
      if (!/^https?:$/.test(parsed.protocol)) return reject(new Error('http 또는 https URL만 사용할 수 있음.'));
      GM_xmlhttpRequest({
        method: 'GET', url: parsed.href, responseType: 'blob', timeout: 25000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) return reject(new Error(`이미지 다운로드 실패 (${response.status})`));
          if (!(response.response instanceof Blob)) return reject(new Error('이미지 응답을 읽지 못했음.'));
          resolve(response.response);
        },
        ontimeout: () => reject(new Error('이미지 다운로드 시간이 초과됨.')),
        onerror: () => reject(new Error('이미지 URL에 연결하지 못했음.'))
      });
    });
  }

  async function importUrl(role, url, button) {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '받는 중…';
    setStatus('URL 이미지를 한 번만 다운로드하는 중…');
    try {
      const blob = await requestImageBlob(url);
      await importBlob(role, blob, button);
    } catch (error) {
      setStatus(error.message || 'URL 이미지를 가져오지 못했음.', 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function openCropper(role) {
    closeOverlay('cph-crop-overlay');
    const slot = state.sets[state.activeSet][role];
    const dataUrl = await getImageData(slot?.hash);
    if (!slot || !dataUrl) return;
    const draft = normalizeCrop(slot.crop);
    const overlay = document.createElement('div');
    overlay.id = 'cph-crop-overlay';
    overlay.className = 'cph-overlay';
    overlay.style.zIndex = '2147483700';
    const panel = document.createElement('div');
    panel.className = 'cph-crop-panel';
    const head = document.createElement('div');
    head.className = 'cph-panel-head';
    const title = document.createElement('h2');
    title.className = 'cph-title';
    title.textContent = `${slotLabel(role)} ${state.activeSet} 구도`;
    const close = makeIconButton(ICONS.close, '구도 조정 취소');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'cph-crop-body';
    const frame = document.createElement('div');
    frame.className = 'cph-crop-frame';
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '';
    const grid = document.createElement('div');
    grid.className = 'cph-crop-grid';
    frame.append(image, grid);
    body.appendChild(frame);
    const rangeLabel = document.createElement('div');
    rangeLabel.className = 'cph-range-label';
    rangeLabel.innerHTML = '<span>축소</span><span>확대</span>';
    const range = document.createElement('input');
    range.className = 'cph-range';
    range.type = 'range';
    range.min = '1'; range.max = '3'; range.step = '.01'; range.value = String(draft.zoom);
    body.append(rangeLabel, range);
    const refresh = () => applyCrop(image, draft);
    range.addEventListener('input', () => { draft.zoom = Number(range.value); refresh(); });
    let drag = null;
    frame.addEventListener('pointerdown', event => {
      drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: draft.x, y: draft.y };
      frame.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    frame.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const rect = frame.getBoundingClientRect();
      draft.x = clamp(drag.x - ((event.clientX - drag.clientX) / rect.width) * 100 / draft.zoom, 0, 100);
      draft.y = clamp(drag.y - ((event.clientY - drag.clientY) / rect.height) * 100 / draft.zoom, 0, 100);
      refresh();
      event.preventDefault();
    });
    const endDrag = event => { if (drag?.id === event.pointerId) drag = null; };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    const actions = document.createElement('div');
    actions.className = 'cph-crop-actions';
    const reset = makeButton('초기화');
    reset.addEventListener('click', () => { draft.x = 50; draft.y = 50; draft.zoom = 1; range.value = '1'; refresh(); });
    const save = makeButton('구도 저장', 'cph-btn cph-btn-primary');
    save.addEventListener('click', async () => {
      state.sets[state.activeSet][role].crop = normalizeCrop(draft);
      await saveState();
      await renderStage();
      await renderThumb(document.getElementById(`cph-thumb-${role}`), state.sets[state.activeSet][role]);
      overlay.remove();
      setStatus(`${slotLabel(role)} ${state.activeSet} 구도를 저장했음.`);
    });
    actions.append(reset, save);
    body.appendChild(actions);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    refresh();
  }

  function openViewer(dataUrl) {
    closeOverlay('cph-viewer');
    const overlay = document.createElement('div');
    overlay.id = 'cph-viewer';
    overlay.className = 'cph-overlay cph-viewer';
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = '프로필 이미지 전체 보기';
    overlay.appendChild(image);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  function cleanProjectUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function cloudErrorMessage(error, fallback) {
    const raw = String(error?.message || error || fallback).replace(/\s+/g, ' ').trim();
    if (/profile_portrait_sync|PGRST205|schema cache/i.test(raw)) {
      return 'Supabase가 프로필 테이블을 찾지 못했음. 같은 Lore Sync 프로젝트에서 최신 profile_portrait_sync.sql을 다시 Run해주셈.';
    }
    return raw || fallback;
  }

  function cloudRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const body = options.body;
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: body instanceof Blob || body instanceof ArrayBuffer ? body : body == null ? undefined : JSON.stringify(body),
        responseType: options.responseType || 'text',
        timeout: options.timeout || 30000,
        onload(response) {
          const ok = response.status >= 200 && response.status < 300;
          if (ok || options.acceptStatuses?.includes(response.status)) return resolve(response);
          let message = `Supabase 요청 실패 (${response.status})`;
          try { message = JSON.parse(response.responseText || '{}').message || message; } catch { /* ignore */ }
          reject(new Error(message));
        },
        onerror: () => reject(new Error('Supabase에 연결하지 못했음.')),
        ontimeout: () => reject(new Error('Supabase 요청 시간이 초과됨.'))
      });
    });
  }

  function publicCloudHeaders(extra = {}) {
    if (!cloudConfig.publishableKey) throw new Error('Publishable key를 먼저 저장해주셈.');
    return { apikey: cloudConfig.publishableKey, 'Content-Type': 'application/json', ...extra };
  }

  async function activeCloudSession() {
    if (!cloudSession?.access_token) throw new Error('Supabase에 먼저 로그인해주셈.');
    const expiresSoon = Number(cloudSession.expires_at || 0) * 1000 < Date.now() + 90000;
    if (!expiresSoon) return cloudSession;
    if (!cloudSession.refresh_token) throw new Error('로그인 세션이 만료됨. 다시 로그인해주셈.');
    const response = await cloudRequest(`${cloudConfig.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: publicCloudHeaders(), body: { refresh_token: cloudSession.refresh_token }
    });
    const next = JSON.parse(response.responseText);
    if (!next.expires_at) next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600);
    await saveCloudSession(next);
    return next;
  }

  async function authCloudHeaders(extra = {}) {
    const session = await activeCloudSession();
    return { ...publicCloudHeaders(), Authorization: `Bearer ${session.access_token}`, ...extra };
  }

  async function signInCloud(email, password) {
    const response = await cloudRequest(`${cloudConfig.projectUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: publicCloudHeaders(), body: { email, password }
    });
    const next = JSON.parse(response.responseText);
    if (!next.expires_at) next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600);
    cloudConfig.email = email;
    await saveCloudConfig();
    await saveCloudSession(next);
  }

  async function signUpCloud(email, password) {
    const response = await cloudRequest(`${cloudConfig.projectUrl}/auth/v1/signup`, {
      method: 'POST', headers: publicCloudHeaders(), body: { email, password }
    });
    const next = JSON.parse(response.responseText);
    cloudConfig.email = email;
    await saveCloudConfig();
    if (next.access_token) {
      if (!next.expires_at) next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600);
      await saveCloudSession(next);
    }
    return Boolean(next.access_token);
  }

  function openCloudSettings() {
    closeOverlay('cph-cloud-overlay');
    const overlay = document.createElement('div');
    overlay.id = 'cph-cloud-overlay';
    overlay.className = 'cph-overlay';
    overlay.style.zIndex = '2147483700';
    const panel = document.createElement('div');
    panel.className = 'cph-panel';
    const head = document.createElement('div');
    head.className = 'cph-panel-head';
    const title = document.createElement('h2');
    title.className = 'cph-title';
    title.textContent = 'Supabase 연결';
    const close = makeIconButton(ICONS.close, '닫기');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'cph-panel-body';
    const shared = sharedCloudStatus();
    if (shared.ready) {
      const card = document.createElement('div');
      card.className = 'cph-control-card';
      card.innerHTML = `<div class="cph-toggle-title">Lore Sync 설정 자동 사용 중</div><p class="cph-help">${shared.email || '로그인된 계정'} · ${shared.deviceLabel || '내 기기'}</p><p class="cph-help">Project URL·Publishable key·로그인 세션은 Lore Sync에서 안전하게 관리함. 이 HUD에는 따로 입력하거나 저장하지 않음.</p>`;
      const done = makeButton('확인', 'cph-btn cph-btn-primary');
      done.style.cssText = 'width:100%;margin-top:14px';
      done.addEventListener('click', () => overlay.remove());
      body.append(card, done);
      panel.append(head, body);
      overlay.appendChild(panel);
      overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
      return;
    }
    const fields = [
      ['cph-cloud-url', 'Project URL', 'url', cloudConfig.projectUrl, 'https://...supabase.co'],
      ['cph-cloud-key', 'Publishable / anon key', 'password', cloudConfig.publishableKey, 'sb_publishable_... 또는 eyJ...'],
      ['cph-cloud-email', '이메일', 'email', cloudConfig.email, 'Supabase 계정 이메일'],
      ['cph-cloud-password', '비밀번호', 'password', '', '가입은 8자 이상 · 저장 안 함'],
      ['cph-cloud-device', '기기 이름', 'text', cloudConfig.deviceLabel, '예: iPhone, 내 컴퓨터']
    ];
    for (const [id, label, type, value, placeholder] of fields) {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:block;margin-bottom:12px;color:#4e5968;font-size:12px;font-weight:650';
      wrap.textContent = label;
      const input = document.createElement('input');
      input.id = id; input.className = 'cph-input'; input.type = type; input.value = value; input.placeholder = placeholder;
      input.style.marginTop = '6px';
      wrap.appendChild(input);
      body.appendChild(wrap);
    }
    const note = document.createElement('p');
    note.className = 'cph-help';
    note.textContent = `${shared.reason ? `${shared.reason} ` : ''}Lore Sync를 사용할 수 없을 때만 HUD에 직접 연결함. 비밀번호는 저장하지 않음. 먼저 supabase/profile_portrait_sync.sql 실행 필요.`;
    const actions = document.createElement('div');
    actions.className = 'cph-cloud-actions';
    const signup = makeButton('새 계정 가입');
    const login = makeButton(cloudSession?.access_token ? '다시 로그인' : '저장하고 로그인', 'cph-btn cph-btn-primary');
    const logout = makeButton('이 기기 로그아웃');
    const status = document.createElement('p');
    status.className = 'cph-status';
    status.textContent = cloudStatusText();
    signup.addEventListener('click', async () => {
      signup.disabled = true;
      status.textContent = '가입 처리 중…';
      try {
        cloudConfig.projectUrl = cleanProjectUrl(document.getElementById('cph-cloud-url').value);
        cloudConfig.publishableKey = document.getElementById('cph-cloud-key').value.trim();
        cloudConfig.deviceLabel = document.getElementById('cph-cloud-device').value.trim() || '내 기기';
        const email = document.getElementById('cph-cloud-email').value.trim();
        const password = document.getElementById('cph-cloud-password').value;
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cloudConfig.projectUrl)) throw new Error('Project URL 형식이 맞지 않음.');
        if (!cloudConfig.publishableKey || !email || password.length < 8) throw new Error('키·이메일·8자 이상 비밀번호가 필요함.');
        await saveCloudConfig();
        const active = await signUpCloud(email, password);
        status.textContent = active ? '가입과 로그인 완료.' : '가입됨. 확인 메일이 왔다면 인증한 뒤 로그인해주셈.';
      } catch (error) {
        status.textContent = error.message;
        status.dataset.tone = 'error';
      } finally {
        signup.disabled = false;
      }
    });
    login.addEventListener('click', async () => {
      login.disabled = true;
      status.textContent = '로그인 중…';
      try {
        cloudConfig.projectUrl = cleanProjectUrl(document.getElementById('cph-cloud-url').value);
        cloudConfig.publishableKey = document.getElementById('cph-cloud-key').value.trim();
        cloudConfig.deviceLabel = document.getElementById('cph-cloud-device').value.trim() || '내 기기';
        const email = document.getElementById('cph-cloud-email').value.trim();
        const password = document.getElementById('cph-cloud-password').value;
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cloudConfig.projectUrl)) throw new Error('Project URL 형식이 맞지 않음.');
        if (!cloudConfig.publishableKey || !email || !password) throw new Error('키·이메일·비밀번호를 모두 입력해주셈.');
        await saveCloudConfig();
        await signInCloud(email, password);
        overlay.remove();
        await openSettings(true);
        setStatus(`로그인 완료 · ${cloudSession.user?.email || email}`);
      } catch (error) {
        status.textContent = error.message;
        status.dataset.tone = 'error';
      } finally {
        login.disabled = false;
      }
    });
    logout.addEventListener('click', async () => {
      await saveCloudSession(null);
      overlay.remove();
      await openSettings(true);
      setStatus('이 기기에서 로그아웃했음.');
    });
    actions.append(signup, login, logout);
    body.append(note, actions, status);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function slotPath(userId, slot) {
    const extension = slot.mime === 'image/jpeg' ? 'jpg' : slot.mime === 'image/png' ? 'png' : 'webp';
    return `${userId}/${slot.hash}.${extension}`;
  }

  function dataUrlToBlob(dataUrl) {
    const bytes = dataUrlBytes(dataUrl);
    return new Blob([bytes], { type: dataUrl.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream' });
  }

  function arrayBufferToDataUrl(buffer, mime) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:${mime};base64,${btoa(binary)}`;
  }

  async function uploadSlot(provider, slot) {
    const dataUrl = await getImageData(slot.hash);
    if (!dataUrl) throw new Error(`${slot.hash.slice(0, 8)} 이미지가 이 기기에 없음.`);
    if (provider.type === 'lore') {
      await provider.api.uploadImage({ hash: slot.hash, mime: slot.mime, dataUrl });
      return;
    }
    const userId = provider.session.user.id;
    const response = await cloudRequest(`${cloudConfig.projectUrl}/storage/v1/object/${CLOUD_BUCKET}/${slotPath(userId, slot)}`, {
      method: 'POST',
      headers: await authCloudHeaders({ 'Content-Type': slot.mime, 'x-upsert': 'false', 'cache-control': '31536000' }),
      body: dataUrlToBlob(dataUrl),
      acceptStatuses: [400, 409]
    });
    if ([400, 409].includes(response.status) && !/exist|duplicate/i.test(response.responseText || '')) {
      throw new Error(`이미지 업로드 실패 (${response.status})`);
    }
  }

  async function downloadSlot(provider, slot) {
    if (await getImageData(slot.hash)) return false;
    let dataUrl;
    if (provider.type === 'lore') {
      dataUrl = await provider.api.downloadImage({ hash: slot.hash, mime: slot.mime });
    } else {
      const userId = provider.session.user.id;
      const response = await cloudRequest(`${cloudConfig.projectUrl}/storage/v1/object/authenticated/${CLOUD_BUCKET}/${slotPath(userId, slot)}`, {
        headers: await authCloudHeaders({ Accept: slot.mime }), responseType: 'arraybuffer'
      });
      dataUrl = arrayBufferToDataUrl(response.response, slot.mime);
    }
    if (await hashDataUrl(dataUrl) !== slot.hash) throw new Error('받은 이미지 해시가 원격 설정과 다름.');
    await GM_setValue(`${IMAGE_PREFIX}${slot.hash}`, dataUrl);
    imageCache.set(slot.hash, dataUrl);
    return true;
  }

  async function getRemoteManifest(provider = null) {
    const active = provider || await activeCloudProvider();
    if (active.type === 'lore') return active.api.getManifest(location.pathname);
    const session = active.session;
    const query = `owner_id=eq.${encodeURIComponent(session.user.id)}&room_key=eq.${encodeURIComponent(location.pathname)}&select=state,layout,revision,updated_at,device_label`;
    const response = await cloudRequest(`${cloudConfig.projectUrl}/rest/v1/${CLOUD_TABLE}?${query}`, { headers: await authCloudHeaders() });
    return JSON.parse(response.responseText || '[]')[0] || null;
  }

  async function saveRemoteManifest(provider, revision) {
    if (provider.type === 'lore') {
      return provider.api.saveManifest({
        roomKey: location.pathname,
        state: { ...state, cloudRevision: revision },
        layout,
        revision,
        deviceLabel: provider.status.deviceLabel || '내 기기'
      });
    }
    const response = await cloudRequest(`${cloudConfig.projectUrl}/rest/v1/${CLOUD_TABLE}?on_conflict=owner_id,room_key`, {
      method: 'POST',
      headers: await authCloudHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: {
        owner_id: provider.session.user.id,
        room_key: location.pathname,
        state: { ...state, cloudRevision: revision },
        layout,
        revision,
        device_label: cloudConfig.deviceLabel
      }
    });
    return JSON.parse(response.responseText || '[]')[0] || { revision };
  }

  async function uploadCurrentRoom() {
    setStatus('원격 상태를 확인하는 중…');
    try {
      const provider = await activeCloudProvider();
      const remote = await getRemoteManifest(provider);
      if (remote && Number(remote.revision) > state.cloudRevision
        && !confirm(`다른 기기의 더 최신 설정(rev ${remote.revision})이 있음. 현재 기기 설정으로 덮어쓸까요?`)) return;
      const unique = new Map();
      for (const setId of SET_IDS) for (const role of ROLES) {
        const slot = state.sets[setId][role];
        if (slot) unique.set(slot.hash, slot);
      }
      let index = 0;
      for (const slot of unique.values()) {
        index += 1;
        setStatus(`중복 제외 이미지 ${index}/${unique.size} 업로드 중…`);
        await uploadSlot(provider, slot);
      }
      const revision = Math.max(state.cloudRevision, Number(remote?.revision) || 0) + 1;
      const saved = await saveRemoteManifest(provider, revision);
      state.cloudRevision = Number(saved?.revision) || revision;
      await saveState();
      setStatus(`클라우드 저장 완료 · ${unique.size}개 이미지 · rev ${state.cloudRevision}`);
    } catch (error) {
      console.warn('[Profile Portrait HUD] cloud upload failed:', error);
      setStatus(cloudErrorMessage(error, '클라우드 저장 실패'), 'error');
    }
  }

  async function ensureSetImages(setId, announce = true) {
    if (!cloudAccessReady()) return 0;
    const provider = await activeCloudProvider();
    let downloaded = 0;
    for (const role of ROLES) {
      const slot = state.sets[setId]?.[role];
      if (!slot || await getImageData(slot.hash)) continue;
      if (announce) setStatus(`${setId} 세트 ${slotLabel(role)} 받는 중…`);
      if (await downloadSlot(provider, slot)) downloaded += 1;
    }
    return downloaded;
  }

  async function restoreFromCloud(mode) {
    setStatus('클라우드 설정을 확인하는 중…');
    try {
      const remote = await getRemoteManifest();
      if (!remote) throw new Error('이 채팅방의 클라우드 저장본이 없음.');
      if ((SET_IDS.some(id => ROLES.some(role => state.sets[id][role])))
        && !confirm(`현재 기기 설정을 ${remote.device_label || '다른 기기'}의 rev ${remote.revision} 설정으로 바꿀까요?`)) return;
      state = normalizeState(remote.state);
      state.cloudRevision = Number(remote.revision) || state.cloudRevision;
      layout = normalizeLayout(remote.layout);
      const targets = mode === 'all' ? SET_IDS : [state.activeSet];
      let downloaded = 0;
      for (const setId of targets) downloaded += await ensureSetImages(setId, true);
      await saveState();
      await saveLayout();
      await renderStage();
      updateHeaderButton();
      await openSettings(true);
      setStatus(`${mode === 'all' ? 'A/B/C 전체' : `${state.activeSet} 세트`} 복원 완료 · 새 이미지 ${downloaded}개`);
    } catch (error) {
      console.warn('[Profile Portrait HUD] cloud restore failed:', error);
      setStatus(cloudErrorMessage(error, '클라우드 복원 실패'), 'error');
    }
  }

  async function scan() {
    clearTimeout(scanTimer);
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      positionEditMode = false;
      document.getElementById('cph-position-bar')?.remove();
      closeOverlay('cph-settings-overlay');
      closeOverlay('cph-crop-overlay');
      closeOverlay('cph-cloud-overlay');
      closeOverlay('cph-viewer');
      state = isChatRoute() ? await loadState() : defaultState();
      await renderStage();
    }
    mountHeaderButton();
    if (!positionDrag) positionStage();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => void scan(), 120);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  window.addEventListener('resize', () => { positionStage(); });
  window.visualViewport?.addEventListener('resize', positionStage);
  window.visualViewport?.addEventListener('scroll', positionStage);
  setInterval(() => void scan(), 1500);
  void loadGlobals().then(scan);
})();
