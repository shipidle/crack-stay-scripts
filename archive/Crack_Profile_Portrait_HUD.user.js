// ==UserScript==
// @name         🖼️ 크랙 프로필 포트레이트 HUD
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.1.0
// @description  채팅방별 캐릭터와 내 캐릭터 이미지를 로컬에 저장하고 추가 데이터 사용 없이 화면 양쪽에 표시합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Profile_Portrait_HUD.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Profile_Portrait_HUD.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* global GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest */

(() => {
  'use strict';

  const VERSION = '0.1.0';
  const STORAGE_PREFIX = 'crackProfilePortraitHUD:v1:';
  const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 1280;
  const IMAGE_QUALITY = 0.84;
  const CHAT_ROUTES = [
    /^\/stories\/[^/]+\/episodes\/[^/]+/,
    /^\/characters\/[^/]+\/chats\/[^/]+/,
    /^\/u\/[^/]+\/c\/[^/]+/
  ];

  const ICONS = {
    portrait: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.75h14A1.25 1.25 0 0 1 20.25 5v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z"/><circle cx="9" cy="9" r="2.25"/><path d="m5.5 18 4.25-4.5 2.7 2.7 2.3-2.45L18.5 18"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 6.5 11 11m0-11-11 11"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.75m0 0-4 4m4-4 4 4M5 14.5v4.25c0 .7.55 1.25 1.25 1.25h11.5c.7 0 1.25-.55 1.25-1.25V14.5"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v12A1.5 1.5 0 0 0 8.5 17H20.5M3.5 7H15.5A1.5 1.5 0 0 1 17 8.5V20.5"/></svg>'
  };

  const defaults = () => ({
    visible: true,
    slots: {
      character: null,
      user: null
    }
  });

  let currentPath = '';
  let state = defaults();
  let scanTimer = 0;

  GM_addStyle(`
    :root { --cph-blue:#3182f6; --cph-text:#191f28; --cph-sub:#6b7684; --cph-line:#e5e8eb; --cph-bg:#f2f4f6; }
    #cph-header-button { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; border:1px solid #e5e8eb; border-radius:10px; background:#fff; color:#4e5968; padding:0; box-shadow:0 1px 2px rgba(0,0,0,.04); cursor:pointer; -webkit-tap-highlight-color:transparent; }
    #cph-header-button[data-active="true"] { border-color:var(--cph-blue); background:var(--cph-blue); color:#fff; }
    #cph-header-button svg, .cph-icon svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    #cph-stage { position:fixed; inset:0; z-index:2147482000; pointer-events:none; }
    .cph-portrait { position:absolute; bottom:calc(86px + env(safe-area-inset-bottom)); width:54px; aspect-ratio:3/4; overflow:hidden; border:1px solid rgba(0,0,0,.08); border-radius:13px; background:#f2f4f6; box-shadow:0 5px 16px rgba(0,0,0,.14); padding:0; pointer-events:auto; cursor:zoom-in; -webkit-tap-highlight-color:transparent; }
    .cph-portrait[data-role="character"] { left:10px; }
    .cph-portrait[data-role="user"] { right:10px; }
    .cph-portrait img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; pointer-events:none; user-select:none; -webkit-user-drag:none; }
    @media (min-width:1280px) {
      .cph-portrait { top:50%; bottom:auto; width:180px; border-radius:18px; transform:translateY(-50%); box-shadow:0 10px 30px rgba(0,0,0,.13); }
      .cph-portrait[data-role="character"] { left:24px; }
      .cph-portrait[data-role="user"] { right:24px; }
    }
    .cph-overlay { position:fixed; inset:0; z-index:2147483600; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(15,23,42,.38); font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo",sans-serif; color:var(--cph-text); -webkit-font-smoothing:antialiased; }
    .cph-panel { width:min(440px,100%); max-height:min(760px,calc(100dvh - 36px)); overflow:auto; overscroll-behavior:contain; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.22); }
    .cph-panel-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; min-height:66px; padding:0 20px; border-bottom:1px solid #f2f4f6; background:rgba(255,255,255,.96); backdrop-filter:blur(12px); }
    .cph-title { margin:0; font-size:20px; font-weight:750; letter-spacing:-.35px; }
    .cph-close { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:10px; background:#f2f4f6; color:#4e5968; padding:0; cursor:pointer; }
    .cph-close svg { width:19px; height:19px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
    .cph-panel-body { padding:18px 20px 24px; }
    .cph-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:18px; padding:16px; border-radius:16px; background:#f7f8fa; }
    .cph-toggle-title { font-size:15px; font-weight:700; }
    .cph-toggle-desc { margin-top:3px; color:var(--cph-sub); font-size:12px; line-height:1.4; }
    .cph-switch { position:relative; width:48px; height:28px; flex:0 0 auto; border:0; border-radius:999px; background:#d1d6db; padding:0; cursor:pointer; transition:background .16s ease; }
    .cph-switch::after { content:""; position:absolute; top:3px; left:3px; width:22px; height:22px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.2); transition:transform .16s ease; }
    .cph-switch[aria-checked="true"] { background:var(--cph-blue); }
    .cph-switch[aria-checked="true"]::after { transform:translateX(20px); }
    .cph-slot { padding:16px 0 18px; border-top:1px solid #f2f4f6; }
    .cph-slot:first-of-type { border-top:0; }
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
    .cph-help { margin:4px 0 0; color:#8b95a1; font-size:12px; line-height:1.55; }
    .cph-status { min-height:18px; margin:10px 0 0; color:var(--cph-sub); font-size:12px; }
    .cph-status[data-tone="error"] { color:#e42939; }
    .cph-crop-panel { width:min(390px,100%); overflow:hidden; border-radius:22px; background:#fff; box-shadow:0 24px 70px rgba(0,0,0,.24); }
    .cph-crop-body { padding:18px 20px 20px; }
    .cph-crop-frame { position:relative; width:min(270px,75vw); aspect-ratio:3/4; overflow:hidden; margin:0 auto 20px; border-radius:18px; background:#e5e8eb; touch-action:none; cursor:grab; }
    .cph-crop-frame:active { cursor:grabbing; }
    .cph-crop-frame img { width:100%; height:100%; display:block; object-fit:cover; transform-origin:center; pointer-events:none; user-select:none; -webkit-user-drag:none; }
    .cph-crop-grid { position:absolute; inset:0; pointer-events:none; background:linear-gradient(to right,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%),linear-gradient(to bottom,transparent 33.1%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.6%,transparent 33.8%,transparent 66.2%,rgba(255,255,255,.55) 66.4%,rgba(255,255,255,.55) 66.7%,transparent 66.9%); box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }
    .cph-range-label { display:flex; justify-content:space-between; margin-bottom:8px; color:var(--cph-sub); font-size:12px; }
    .cph-range { width:100%; accent-color:var(--cph-blue); }
    .cph-crop-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:18px; }
    .cph-viewer { cursor:zoom-out; }
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
  `);

  function isChatRoute() {
    return CHAT_ROUTES.some(pattern => pattern.test(location.pathname));
  }

  function roomStorageKey() {
    return `${STORAGE_PREFIX}${encodeURIComponent(location.pathname)}`;
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
    if (!slot || typeof slot.dataUrl !== 'string' || !slot.dataUrl.startsWith('data:image/')) return null;
    return { dataUrl: slot.dataUrl, crop: normalizeCrop(slot.crop) };
  }

  function loadState() {
    const fallback = defaults();
    try {
      const saved = JSON.parse(GM_getValue(roomStorageKey(), 'null'));
      if (!saved || typeof saved !== 'object') return fallback;
      return {
        visible: saved.visible !== false,
        slots: {
          character: normalizeSlot(saved.slots?.character),
          user: normalizeSlot(saved.slots?.user)
        }
      };
    } catch (error) {
      console.warn('[Profile Portrait HUD] 저장값을 읽지 못했습니다.', error);
      return fallback;
    }
  }

  function saveState() {
    GM_setValue(roomStorageKey(), JSON.stringify(state));
  }

  function applyCrop(image, crop) {
    const normalized = normalizeCrop(crop);
    image.style.objectPosition = `${normalized.x}% ${normalized.y}%`;
    image.style.transform = `scale(${normalized.zoom})`;
  }

  function slotLabel(role) {
    return role === 'character' ? '캐릭터' : '내 캐릭터';
  }

  function createPortrait(role, slot) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cph-portrait';
    button.dataset.role = role;
    button.title = `${slotLabel(role)} 이미지 크게 보기`;
    button.setAttribute('aria-label', `${slotLabel(role)} 이미지 크게 보기`);
    const image = document.createElement('img');
    image.src = slot.dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    button.appendChild(image);
    button.addEventListener('click', () => openViewer(slot.dataUrl));
    return button;
  }

  function renderStage() {
    document.getElementById('cph-stage')?.remove();
    if (!isChatRoute() || !state.visible) return;
    const entries = Object.entries(state.slots).filter(([, slot]) => slot?.dataUrl);
    if (!entries.length) return;
    const stage = document.createElement('div');
    stage.id = 'cph-stage';
    for (const [role, slot] of entries) stage.appendChild(createPortrait(role, slot));
    document.body.appendChild(stage);
  }

  function updateHeaderButton() {
    const button = document.getElementById('cph-header-button');
    if (!button) return;
    const hasImage = !!(state.slots.character || state.slots.user);
    button.dataset.active = String(state.visible && hasImage);
    button.title = hasImage ? '프로필 이미지 설정' : '프로필 이미지 등록';
  }

  function findHeaderHost() {
    const aiSummaryButton = document.querySelector('button[data-ce-ai-summary="true"]');
    if (aiSummaryButton?.parentElement) return aiSummaryButton.parentElement;
    const header = Array.from(document.querySelectorAll('div.absolute')).find(element => (
      element.classList.contains('z-[5]')
      && element.classList.contains('h-12')
      && element.classList.contains('justify-between')
    ));
    if (!header) return null;
    return Array.from(header.children).find(element => (
      element instanceof HTMLElement
      && element.classList.contains('flex')
      && element.classList.contains('items-center')
      && element.querySelector('button')
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
      button.addEventListener('click', openSettings);
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

  function renderThumb(container, slot) {
    container.replaceChildren();
    if (!slot) {
      container.innerHTML = ICONS.portrait;
      return;
    }
    const image = document.createElement('img');
    image.src = slot.dataUrl;
    image.alt = '';
    applyCrop(image, slot.crop);
    container.appendChild(image);
  }

  function createSlotSection(role) {
    const slot = state.slots[role];
    const section = document.createElement('section');
    section.className = 'cph-slot';

    const head = document.createElement('div');
    head.className = 'cph-slot-head';
    head.innerHTML = `<div class="cph-slot-name">${slotLabel(role)}</div><div class="cph-slot-note">이 채팅방에만 저장</div>`;
    section.appendChild(head);

    const main = document.createElement('div');
    main.className = 'cph-slot-main';
    const thumb = document.createElement('div');
    thumb.className = 'cph-thumb';
    thumb.id = `cph-thumb-${role}`;
    renderThumb(thumb, slot);
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
      if (!file) return;
      await importBlob(role, file, fileButton);
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
      const url = urlInput.value.trim();
      if (!url) {
        setStatus('이미지 URL을 입력해주셈.', 'error');
        urlInput.focus();
        return;
      }
      await importUrl(role, url, urlButton);
      if (state.slots[role]) urlInput.value = '';
    });
    urlRow.append(urlInput, urlButton);
    controls.appendChild(urlRow);

    if (slot) {
      const deleteButton = makeButton('이미지 삭제', 'cph-btn cph-btn-danger');
      deleteButton.style.marginTop = '9px';
      deleteButton.style.width = '100%';
      deleteButton.addEventListener('click', () => {
        if (!window.confirm(`${slotLabel(role)} 이미지를 이 채팅방에서 삭제할까요?`)) return;
        state.slots[role] = null;
        saveState();
        renderStage();
        updateHeaderButton();
        openSettings(true);
      });
      controls.appendChild(deleteButton);
    }

    cropButton.addEventListener('click', () => openCropper(role));
    main.appendChild(controls);
    section.appendChild(main);
    return section;
  }

  function openSettings(replace = false) {
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
    const toggleRow = document.createElement('div');
    toggleRow.className = 'cph-toggle-row';
    toggleRow.innerHTML = '<div><div class="cph-toggle-title">채팅 화면에 표시</div><div class="cph-toggle-desc">끄면 이미지 요소도 화면에서 완전히 제거됨</div></div>';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cph-switch';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', '채팅 화면에 프로필 이미지 표시');
    toggle.setAttribute('aria-checked', String(state.visible));
    toggle.addEventListener('click', () => {
      state.visible = !state.visible;
      toggle.setAttribute('aria-checked', String(state.visible));
      saveState();
      renderStage();
      updateHeaderButton();
    });
    toggleRow.appendChild(toggle);
    body.append(toggleRow, createSlotSection('character'), createSlotSection('user'));
    const help = document.createElement('p');
    help.className = 'cph-help';
    help.textContent = 'URL 이미지는 등록할 때 한 번만 다운로드한 뒤 압축해 로컬 저장함. 이후 채팅 중에는 해당 URL을 다시 호출하지 않음.';
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
      if (!(blob instanceof Blob) || !blob.size) {
        reject(new Error('빈 이미지 파일임.'));
        return;
      }
      if (blob.size > MAX_SOURCE_BYTES) {
        reject(new Error('이미지는 15MB 이하만 등록 가능함.'));
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          let dataUrl = canvas.toDataURL('image/webp', IMAGE_QUALITY);
          if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
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
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '처리 중…';
    setStatus('이미지를 압축해 로컬에 저장하는 중…');
    try {
      const dataUrl = await readBlobAsOptimizedDataUrl(blob);
      state.slots[role] = { dataUrl, crop: { x: 50, y: 50, zoom: 1 } };
      state.visible = true;
      saveState();
      renderStage();
      updateHeaderButton();
      openSettings(true);
      openCropper(role);
    } catch (error) {
      console.warn('[Profile Portrait HUD] 이미지 등록 실패:', error);
      setStatus(error.message || '이미지를 등록하지 못했음.', 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function requestImageBlob(url) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        reject(new Error('올바른 이미지 URL이 아님.'));
        return;
      }
      if (!/^https?:$/.test(parsed.protocol)) {
        reject(new Error('http 또는 https 이미지 URL만 사용할 수 있음.'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url: parsed.href,
        responseType: 'blob',
        timeout: 25000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`이미지 다운로드 실패 (${response.status})`));
            return;
          }
          const blob = response.response;
          if (!(blob instanceof Blob)) {
            reject(new Error('이미지 응답을 읽지 못했음.'));
            return;
          }
          resolve(blob);
        },
        ontimeout() { reject(new Error('이미지 다운로드 시간이 초과됨.')); },
        onerror() { reject(new Error('이미지 URL에 연결하지 못했음.')); }
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
      console.warn('[Profile Portrait HUD] URL 이미지 등록 실패:', error);
      setStatus(error.message || 'URL 이미지를 가져오지 못했음.', 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function openCropper(role) {
    closeOverlay('cph-crop-overlay');
    const slot = state.slots[role];
    if (!slot) return;
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
    title.textContent = `${slotLabel(role)} 구도`;
    const close = makeIconButton(ICONS.close, '구도 조정 취소');
    close.addEventListener('click', () => overlay.remove());
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'cph-crop-body';
    const frame = document.createElement('div');
    frame.className = 'cph-crop-frame';
    const image = document.createElement('img');
    image.src = slot.dataUrl;
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
    range.min = '1';
    range.max = '3';
    range.step = '0.01';
    range.value = String(draft.zoom);
    body.append(rangeLabel, range);

    const refreshPreview = () => applyCrop(image, draft);
    range.addEventListener('input', () => {
      draft.zoom = Number(range.value);
      refreshPreview();
    });

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
      refreshPreview();
      event.preventDefault();
    });
    const endDrag = event => {
      if (drag?.id === event.pointerId) drag = null;
    };
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);

    const actions = document.createElement('div');
    actions.className = 'cph-crop-actions';
    const reset = makeButton('초기화');
    reset.addEventListener('click', () => {
      draft.x = 50;
      draft.y = 50;
      draft.zoom = 1;
      range.value = '1';
      refreshPreview();
    });
    const save = makeButton('구도 저장', 'cph-btn cph-btn-primary');
    save.addEventListener('click', () => {
      state.slots[role].crop = normalizeCrop(draft);
      saveState();
      renderStage();
      updateHeaderButton();
      renderThumb(document.getElementById(`cph-thumb-${role}`), state.slots[role]);
      overlay.remove();
      setStatus(`${slotLabel(role)} 구도를 저장했음.`);
    });
    actions.append(reset, save);
    body.appendChild(actions);
    panel.append(head, body);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    refreshPreview();
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

  function scan() {
    clearTimeout(scanTimer);
    if (location.pathname !== currentPath) {
      currentPath = location.pathname;
      closeOverlay('cph-settings-overlay');
      closeOverlay('cph-crop-overlay');
      closeOverlay('cph-viewer');
      state = isChatRoute() ? loadState() : defaults();
      renderStage();
    }
    mountHeaderButton();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 120);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  setInterval(scan, 1500);
  scan();
})();
