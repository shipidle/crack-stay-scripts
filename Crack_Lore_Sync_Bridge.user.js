// ==UserScript==
// @name         ☁️ 크랙 로어 개인 동기화 브리지
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.4.1
// @description  🧪 BETA · 개인 Supabase에 로어 백업과 메모리 요약 턴 체크포인트를 안전하게 동기화합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @match        https://crack.wrtn.ai/
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Lore_Sync_Bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Lore_Sync_Bridge.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect       supabase.co
// @run-at       document-idle
// ==/UserScript==

/* global GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest, unsafeWindow */

(() => {
  'use strict';

  const VERSION = '1.4.1';
  const APP_KEY = 'shipidle:crack-lore-sync-bridge:v1';
  const SUMMARY_SYNC_API_KEY = '__SHIPIDLE_CMM_TURN_SYNC__';
  const PROFILE_SYNC_API_KEY = '__SHIPIDLE_PROFILE_PORTRAIT_SYNC__';
  const PROFILE_BUCKET = 'profile-portraits';
  const PROFILE_TABLE = 'profile_portrait_sync';
  const PROFILE_MAX_BYTES = 350 * 1024;
  const BACKGROUND_SYNC_API_KEY = '__SHIPIDLE_CHAT_BACKGROUND_SYNC__';
  const BACKGROUND_BUCKET = 'chat-backgrounds';
  const BACKGROUND_TABLE = 'chat_background_sync';
  const BACKGROUND_MAX_BYTES = 700 * 1024;
  const BRIDGE = unsafeWindow || window;
  const AUTH_REDIRECT = 'https://crack.wrtn.ai/';
  const REMOTE_CHECK_MS = 10 * 60_000;
  const LOCAL_SCAN_MS = 2 * 60_000;
  const UPLOAD_DEBOUNCE_MS = 60_000;
  const SECRET_KEYS = new Set([
    'autoExtKey', 'autoExtVertexJson', 'autoExtFirebaseScript',
    'autoExtFirebaseEmbedKey', 'autoExtGeminiEmbedKey', 'autoExtDeepSeekKey',
    'autoExtOpenAIKey', 'backupServerPassword', 'backupServerToken',
  ]);

  const defaultConfig = {
    projectUrl: '',
    publishableKey: '',
    email: '',
    syncPassphrase: '',
    deviceLabel: '',
  };
  let config = { ...defaultConfig };
  let syncState = { lastHash: '', lastRevision: 0, lastSyncAt: 0, dirty: false };
  let session = null;
  let panel = null;
  let statusEl = null;
  let latestStatus = '';
  let latestStatusTone = '';
  let busy = false;
  let needsInitialChoice = false;
  let remoteMetadata = null;
  let remoteCheckRunning = false;
  let localScanRunning = false;
  let uploadTimer = null;
  let refreshSessionPromise = null;

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  GM_addStyle(`
    #clsb-fab { width:32px; min-width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #b9d8eb; border-radius:8px; background:#eef6fb; color:#24506d; padding:0; font:15px/1 Pretendard, -apple-system, BlinkMacSystemFont, sans-serif; box-shadow:none; white-space:nowrap; cursor:pointer; }
    #clsb-fab .clsb-cloud-emoji { display:block; font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',emoji; font-size:16px; font-weight:400; line-height:1; }
    #clsb-fab:hover { background:#e0f0fb; }
    #clsb-overlay { position:fixed; inset:0; z-index:2147483001; background:rgba(23,43,58,.32); display:flex; align-items:center; justify-content:center; padding:16px; font-family:Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif; }
    #clsb-panel { width:min(470px, 100%); max-height:min(760px, 100%); overflow:auto; box-sizing:border-box; color:#1d3546; background:#f9fcff; border:1px solid #c9dfef; border-radius:18px; box-shadow:0 22px 70px rgba(19,58,81,.28); padding:18px; }
    #clsb-panel * { box-sizing:border-box; }
    .clsb-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:13px; }
    .clsb-title { font-size:16px; font-weight:750; color:#275b79; }
    .clsb-close { border:0; background:transparent; color:#527185; font-size:22px; cursor:pointer; line-height:1; }
    .clsb-card { margin:10px 0; padding:12px; border:1px solid #d8e8f3; border-radius:12px; background:#fff; }
    .clsb-card h3 { margin:0 0 7px; font-size:13px; color:#2b6283; }
    .clsb-note { margin:0; color:#607b8d; font-size:11px; line-height:1.55; word-break:keep-all; }
    .clsb-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .clsb-field { display:block; margin:8px 0; color:#426276; font-size:11px; font-weight:650; }
    .clsb-field input { width:100%; margin-top:4px; padding:9px 10px; border:1px solid #c8dce9; border-radius:8px; background:#fff; color:#1d3546; font:13px Pretendard, sans-serif; }
    .clsb-field input:focus { outline:2px solid #9ed1ef; border-color:#8cc8e9; }
    .clsb-field input:disabled { background:#f1f7fb; color:#668092; cursor:not-allowed; }
    .clsb-row { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
    .clsb-btn { border:1px solid #b8d8ea; border-radius:8px; background:#eef6fb; color:#285b78; padding:8px 10px; font:650 12px Pretendard, sans-serif; cursor:pointer; }
    .clsb-btn:hover { background:#dff1fc; }
    .clsb-btn.primary { border-color:#76bce3; background:#5caedc; color:#fff; }
    .clsb-btn.danger { border-color:#e7b8bd; background:#fff5f5; color:#a6424d; }
    .clsb-status { margin-top:9px; border-radius:8px; padding:9px 10px; background:#eef6fb; color:#315d77; font-size:12px; line-height:1.45; white-space:pre-line; }
    .clsb-status.warn { background:#fff8e7; color:#806228; }
    .clsb-status.error { background:#fff1f1; color:#9b3945; }
    .clsb-meta { margin-top:8px; color:#7890a0; font-size:10px; line-height:1.5; }
    @media (max-width: 480px) { #clsb-panel { padding:15px; border-radius:15px; } .clsb-grid { grid-template-columns:1fr; } }
  `);

  function cleanUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function shortError(error) {
    const raw = String(error?.message || error || '알 수 없는 오류').replace(/\s+/g, ' ').trim();
    if (/summary_sync_state|summary_checkpoint|summary_batch|schema cache/i.test(raw)) {
      return 'Supabase에 supabase/summary_sync.sql을 먼저 실행해줘.';
    }
    if (/save_lore_sync_state|previous_ciphertext|content_hash|lore sync conflict/i.test(raw)) {
      return 'Supabase에 supabase/lore_sync_v2.sql을 먼저 실행해줘.';
    }
    if (/email not confirmed/i.test(raw)) return '이메일 인증이 아직 안 됨. 받은메일함의 인증 링크를 누른 뒤 다시 로그인하면 됨.';
    if (/invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 맞지 않음.';
    if (/user already registered/i.test(raw)) return '이미 가입된 이메일임. 로그인 버튼을 쓰면 됨.';
    if (/fetch|network|timeout/i.test(raw)) return '네트워크 요청 실패. Project URL과 Publishable key를 다시 확인해줘.';
    if (error?.name === 'OperationError' || /operation\s*error|operation-specific/i.test(raw)) {
      return '클라우드 백업 복호화 실패. 첫 기기와 이 기기의 동기화 암호가 대소문자·띄어쓰기까지 완전히 같은지 확인해줘. 암호가 맞다면 클라우드 데이터가 손상됐을 수 있음.';
    }
    return raw.slice(0, 240);
  }

  function setStatus(message, tone = '') {
    latestStatus = message;
    latestStatusTone = tone;
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `clsb-status ${tone}`.trim();
  }

  async function load() {
    config = { ...defaultConfig, ...(await GM_getValue(`${APP_KEY}:config`, {})) };
    syncState = { ...syncState, ...(await GM_getValue(`${APP_KEY}:state`, {})) };
    session = await GM_getValue(`${APP_KEY}:session`, null);
    await consumeAuthHash();
  }

  async function persistConfig() {
    await GM_setValue(`${APP_KEY}:config`, config);
  }

  async function persistState() {
    await GM_setValue(`${APP_KEY}:state`, syncState);
  }

  async function persistSession(next) {
    const stamped = next ? { ...next, shipidle_updated_at: Date.now() } : next;
    session = stamped;
    await GM_setValue(`${APP_KEY}:session`, stamped);
  }

  function makeHeaders(extra = {}) {
    if (!config.publishableKey) throw new Error('Publishable key를 먼저 저장해줘.');
    return { apikey: config.publishableKey, 'Content-Type': 'application/json', ...extra };
  }

  function request(url, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        timeout: 25_000,
        onload: (response) => {
          let parsed = null;
          try { parsed = response.responseText ? JSON.parse(response.responseText) : null; } catch { parsed = response.responseText; }
          if (response.status >= 200 && response.status < 300) return resolve(parsed);
          const message = parsed?.msg || parsed?.message || parsed?.error_description || parsed?.error || `HTTP ${response.status}`;
          const error = new Error(`[Supabase HTTP ${response.status}] ${message}`);
          error.status = response.status;
          error.source = 'Supabase';
          error.url = url;
          reject(error);
        },
        onerror: () => {
          const error = new Error('[Supabase] network error');
          error.source = 'Supabase';
          error.url = url;
          reject(error);
        },
        ontimeout: () => {
          const error = new Error('[Supabase] timeout');
          error.source = 'Supabase';
          error.url = url;
          reject(error);
        },
      });
    });
  }

  function validateConnection() {
    config.projectUrl = cleanUrl(config.projectUrl);
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.projectUrl)) throw new Error('Project URL 형식이 맞지 않음. https://...supabase.co 를 넣어줘.');
    if (!String(config.publishableKey || '').trim()) throw new Error('Publishable key를 넣어줘.');
  }

  async function syncStoredSession() {
    const stored = await GM_getValue(`${APP_KEY}:session`, null);
    if (!stored?.access_token) return session;
    const storedUpdatedAt = Number(stored.shipidle_updated_at || 0);
    const currentUpdatedAt = Number(session?.shipidle_updated_at || 0);
    const storedExpiry = Number(stored.expires_at || 0);
    const currentExpiry = Number(session?.expires_at || 0);
    if (!session?.access_token
      || storedUpdatedAt > currentUpdatedAt
      || (!storedUpdatedAt && !currentUpdatedAt && storedExpiry > currentExpiry)) session = stored;
    return session;
  }

  async function waitForRotatedSession(attemptedAccessToken) {
    for (const delay of [80, 160, 320, 640]) {
      await new Promise(resolve => setTimeout(resolve, delay));
      const stored = await GM_getValue(`${APP_KEY}:session`, null);
      if (stored?.access_token && stored.access_token !== attemptedAccessToken) {
        session = stored;
        return stored;
      }
    }
    return null;
  }

  function isAuthFailure(error) {
    return Number(error?.status || 0) === 401
      || /invalid\s*(?:refresh\s*)?token|refresh\s*token.*(?:used|invalid|expired|not\s*found)|invalid\s*jwt|jwt\s*expired|token\s*(?:expired|invalid)|unauthor/i.test(String(error?.message || error || ''));
  }

  async function refreshSessionIfNeeded(force = false) {
    await syncStoredSession();
    if (!session?.access_token) throw new Error('먼저 로그인해줘.');
    const expiresSoon = Number(session.expires_at || 0) * 1000 < Date.now() + 90_000;
    if (!force && !expiresSoon) return session;
    if (!session.refresh_token) throw new Error('로그인 세션이 만료됨. 다시 로그인해줘.');
    if (refreshSessionPromise) return refreshSessionPromise;

    const attemptedAccessToken = session.access_token;
    const attemptedRefreshToken = session.refresh_token;
    const operation = (async () => {
      try {
        const next = await request(`${config.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: makeHeaders(), body: { refresh_token: attemptedRefreshToken },
        });
        if (!next?.access_token || !next?.refresh_token) throw new Error('[Supabase] 토큰 갱신 응답이 비정상임.');
        await persistSession(next);
        return next;
      } catch (error) {
        if (isAuthFailure(error)) {
          const rotated = await waitForRotatedSession(attemptedAccessToken);
          if (rotated) return rotated;
        }
        throw error;
      }
    })();
    refreshSessionPromise = operation;
    try {
      return await operation;
    } finally {
      if (refreshSessionPromise === operation) refreshSessionPromise = null;
    }
  }

  async function consumeAuthHash() {
    const hash = String(location.hash || '').replace(/^#/, '');
    if (!hash.includes('access_token=')) return;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return;
    await persistSession({ access_token: accessToken, refresh_token: refreshToken, expires_at: Number(params.get('expires_at') || 0), user: { id: params.get('user_id') || '' } });
    history.replaceState(null, document.title, `${location.pathname}${location.search}`);
  }

  async function signUp(email, password) {
    validateConnection();
    const result = await request(`${config.projectUrl}/auth/v1/signup`, {
      method: 'POST', headers: makeHeaders(), body: { email, password, options: { emailRedirectTo: AUTH_REDIRECT } },
    });
    config.email = email;
    await persistConfig();
    if (result?.access_token) await persistSession(result);
    return !!result?.access_token;
  }

  async function signIn(email, password) {
    validateConnection();
    const result = await request(`${config.projectUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: makeHeaders(), body: { email, password },
    });
    if (!result?.access_token || !result?.user?.id) throw new Error('로그인 응답이 비정상임.');
    config.email = email;
    await persistConfig();
    await persistSession(result);
    return result;
  }

  async function authHeaders(extra = {}) {
    const active = await refreshSessionIfNeeded();
    return makeHeaders({ Authorization: `Bearer ${active.access_token}`, ...extra });
  }

  async function authedRequest(url, options = {}) {
    const { headers: extraHeaders = {}, ...requestOptions } = options;
    const send = active => request(url, {
      ...requestOptions,
      headers: makeHeaders({ ...extraHeaders, Authorization: `Bearer ${active.access_token}` }),
    });
    const first = await refreshSessionIfNeeded();
    try {
      return await send(first);
    } catch (error) {
      if (!isAuthFailure(error)) throw error;
      await syncStoredSession();
      const retrySession = session?.access_token && session.access_token !== first.access_token
        ? session
        : await refreshSessionIfNeeded(true);
      return send(retrySession);
    }
  }

  function profileSyncStatus() {
    if (!config.projectUrl || !config.publishableKey) return { ready: false, reason: 'Lore Sync에 Supabase 연결 정보를 저장해줘.' };
    if (!session?.access_token) return { ready: false, reason: 'Lore Sync에서 Supabase 로그인해줘.' };
    return {
      ready: true,
      email: session.user?.email || config.email || '',
      deviceLabel: config.deviceLabel || '내 기기',
    };
  }

  function validateProfileRoomKey(roomKey) {
    const value = String(roomKey || '');
    if (!/^\/(stories\/[^/]+\/episodes|characters\/[^/]+\/chats|u\/[^/]+\/c)\/[^/?#]+$/.test(value)) {
      throw new Error('프로필 동기화 채팅방 경로가 올바르지 않음.');
    }
    return value;
  }

  function validateProfileSlot(hash, mime) {
    const normalizedHash = String(hash || '').toLowerCase();
    const normalizedMime = String(mime || '');
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) throw new Error('프로필 이미지 해시가 올바르지 않음.');
    if (!/^image\/(webp|jpeg|png)$/.test(normalizedMime)) throw new Error('지원하지 않는 프로필 이미지 형식임.');
    return { hash: normalizedHash, mime: normalizedMime };
  }

  function profileSlotPath(userId, hash, mime) {
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    return `${userId}/${hash}.${extension}`;
  }

  function profileDataUrlBytes(dataUrl, expectedMime) {
    const match = String(dataUrl || '').match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1] !== expectedMime) throw new Error('프로필 이미지 데이터 형식이 올바르지 않음.');
    return Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  }

  async function profileHashBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function profileRawRequest(url, { method = 'GET', headers = {}, data, responseType = 'text', acceptStatuses = [] } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data,
        responseType,
        timeout: 30_000,
        onload(response) {
          if ((response.status >= 200 && response.status < 300) || acceptStatuses.includes(response.status)) return resolve(response);
          let message = `Supabase 요청 실패 (${response.status})`;
          try { message = JSON.parse(response.responseText || '{}').message || message; } catch { /* ignore */ }
          reject(new Error(message));
        },
        onerror: () => reject(new Error('Supabase에 연결하지 못했음.')),
        ontimeout: () => reject(new Error('Supabase 요청 시간이 초과됨.')),
      });
    });
  }

  async function getProfileManifest(roomKey) {
    const active = await refreshSessionIfNeeded();
    const path = validateProfileRoomKey(roomKey);
    const query = `owner_id=eq.${encodeURIComponent(active.user.id)}&room_key=eq.${encodeURIComponent(path)}&select=state,layout,revision,updated_at,device_label`;
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/${PROFILE_TABLE}?${query}`);
    return rows?.[0] || null;
  }

  async function saveProfileManifest({ roomKey, state: profileState, layout, revision, deviceLabel } = {}) {
    const active = await refreshSessionIfNeeded();
    const path = validateProfileRoomKey(roomKey);
    const safeRevision = Math.max(1, Number(revision) || 1);
    const stateJson = JSON.stringify(profileState || {});
    const layoutJson = JSON.stringify(layout || {});
    if (stateJson.length > 30_000 || layoutJson.length > 8_000) throw new Error('프로필 동기화 설정 크기가 비정상적으로 큼.');
    const stateCopy = JSON.parse(stateJson);
    const layoutCopy = JSON.parse(layoutJson);
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/${PROFILE_TABLE}?on_conflict=owner_id,room_key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        owner_id: active.user.id,
        room_key: path,
        state: stateCopy,
        layout: layoutCopy,
        revision: safeRevision,
        device_label: String(deviceLabel || config.deviceLabel || '내 기기').slice(0, 80),
      },
    });
    return rows?.[0] || { revision: safeRevision };
  }

  async function uploadProfileImage({ hash, mime, dataUrl } = {}) {
    const active = await refreshSessionIfNeeded();
    const slot = validateProfileSlot(hash, mime);
    const bytes = profileDataUrlBytes(dataUrl, slot.mime);
    if (!bytes.byteLength || bytes.byteLength > PROFILE_MAX_BYTES) throw new Error('프로필 이미지는 350KB 이하여야 함.');
    if (await profileHashBytes(bytes) !== slot.hash) throw new Error('프로필 이미지 데이터와 해시가 일치하지 않음.');
    const response = await profileRawRequest(`${config.projectUrl}/storage/v1/object/${PROFILE_BUCKET}/${profileSlotPath(active.user.id, slot.hash, slot.mime)}`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': slot.mime, 'x-upsert': 'false', 'cache-control': '31536000' }),
      data: new Blob([bytes], { type: slot.mime }),
      acceptStatuses: [400, 409],
    });
    if ([400, 409].includes(response.status) && !/exist|duplicate/i.test(response.responseText || '')) {
      throw new Error(`이미지 업로드 실패 (${response.status})`);
    }
    return { stored: true, hash: slot.hash };
  }

  async function downloadProfileImage({ hash, mime } = {}) {
    const active = await refreshSessionIfNeeded();
    const slot = validateProfileSlot(hash, mime);
    const response = await profileRawRequest(`${config.projectUrl}/storage/v1/object/authenticated/${PROFILE_BUCKET}/${profileSlotPath(active.user.id, slot.hash, slot.mime)}`, {
      headers: await authHeaders({ Accept: slot.mime }),
      responseType: 'arraybuffer',
    });
    const bytes = new Uint8Array(response.response);
    if (!bytes.byteLength || bytes.byteLength > PROFILE_MAX_BYTES) throw new Error('받은 프로필 이미지 크기가 올바르지 않음.');
    if (await profileHashBytes(bytes) !== slot.hash) throw new Error('받은 프로필 이미지 해시가 올바르지 않음.');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:${slot.mime};base64,${btoa(binary)}`;
  }

  function backgroundSyncStatus() {
    if (!config.projectUrl || !config.publishableKey) return { ready: false, reason: 'Lore Sync에 Supabase 연결 정보를 저장해주셈.' };
    if (!session?.access_token) return { ready: false, reason: 'Lore Sync에서 Supabase 로그인해주셈.' };
    return { ready: true, email: session.user?.email || config.email || '', deviceLabel: config.deviceLabel || '내 기기' };
  }

  function validateBackgroundRoomKey(roomKey) {
    const value = String(roomKey || '');
    if (!/^\/(stories\/[^/]+\/episodes|characters\/[^/]+\/chats|u\/[^/]+\/c)\/[^/?#]+$/.test(value)) throw new Error('배경 동기화 채팅방 경로가 올바르지 않음.');
    return value;
  }

  function validateBackgroundImage(hash, mime) {
    const safeHash = String(hash || '').toLowerCase();
    const safeMime = String(mime || '');
    if (!/^[a-f0-9]{64}$/.test(safeHash)) throw new Error('배경 이미지 해시가 올바르지 않음.');
    if (!/^image\/(webp|jpeg|png)$/.test(safeMime)) throw new Error('지원하지 않는 배경 이미지 형식임.');
    return { hash: safeHash, mime: safeMime };
  }

  function backgroundImagePath(userId, hash, mime) {
    const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    return `${userId}/${hash}.${extension}`;
  }

  function backgroundDataUrlBytes(dataUrl, expectedMime) {
    const match = String(dataUrl || '').match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1] !== expectedMime) throw new Error('배경 이미지 데이터 형식이 올바르지 않음.');
    return Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  }

  async function backgroundHashBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function backgroundRawRequest(url, { method = 'GET', headers = {}, data, responseType = 'text', acceptStatuses = [] } = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url, headers, data, responseType, timeout: 30_000,
        onload(response) {
          if ((response.status >= 200 && response.status < 300) || acceptStatuses.includes(response.status)) return resolve(response);
          let message = `Supabase 요청 실패 (${response.status})`;
          try { message = JSON.parse(response.responseText || '{}').message || message; } catch { /* ignore */ }
          reject(new Error(message));
        },
        onerror: () => reject(new Error('Supabase에 연결하지 못했음.')),
        ontimeout: () => reject(new Error('Supabase 요청 시간이 초과됨.')),
      });
    });
  }

  async function getBackgroundManifest(roomKey) {
    const active = await refreshSessionIfNeeded();
    const path = validateBackgroundRoomKey(roomKey);
    const query = `owner_id=eq.${encodeURIComponent(active.user.id)}&room_key=eq.${encodeURIComponent(path)}&select=state,revision,updated_at,device_label`;
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/${BACKGROUND_TABLE}?${query}`);
    return rows?.[0] || null;
  }

  async function saveBackgroundManifest({ roomKey, state: backgroundState, revision, deviceLabel } = {}) {
    const active = await refreshSessionIfNeeded();
    const path = validateBackgroundRoomKey(roomKey);
    const safeRevision = Math.max(1, Number(revision) || 1);
    const stateJson = JSON.stringify(backgroundState || {});
    if (stateJson.length > 40_000) throw new Error('배경 동기화 설정 크기가 비정상적으로 큼.');
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/${BACKGROUND_TABLE}?on_conflict=owner_id,room_key`, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { owner_id: active.user.id, room_key: path, state: JSON.parse(stateJson), revision: safeRevision, device_label: String(deviceLabel || config.deviceLabel || '내 기기').slice(0, 80) },
    });
    return rows?.[0] || { revision: safeRevision };
  }

  async function uploadBackgroundImage({ hash, mime, dataUrl } = {}) {
    const active = await refreshSessionIfNeeded();
    const image = validateBackgroundImage(hash, mime);
    const bytes = backgroundDataUrlBytes(dataUrl, image.mime);
    if (!bytes.byteLength || bytes.byteLength > BACKGROUND_MAX_BYTES) throw new Error('배경 이미지는 700KB 이하여야 함.');
    if (await backgroundHashBytes(bytes) !== image.hash) throw new Error('배경 이미지 데이터와 해시가 일치하지 않음.');
    const response = await backgroundRawRequest(`${config.projectUrl}/storage/v1/object/${BACKGROUND_BUCKET}/${backgroundImagePath(active.user.id, image.hash, image.mime)}`, {
      method: 'POST', headers: await authHeaders({ 'Content-Type': image.mime, 'x-upsert': 'false', 'cache-control': '31536000' }),
      data: new Blob([bytes], { type: image.mime }), acceptStatuses: [400, 409],
    });
    if ([400, 409].includes(response.status) && !/exist|duplicate/i.test(response.responseText || '')) throw new Error(`배경 이미지 업로드 실패 (${response.status})`);
    return { hash: image.hash };
  }

  async function downloadBackgroundImage({ hash, mime } = {}) {
    const active = await refreshSessionIfNeeded();
    const image = validateBackgroundImage(hash, mime);
    const response = await backgroundRawRequest(`${config.projectUrl}/storage/v1/object/authenticated/${BACKGROUND_BUCKET}/${backgroundImagePath(active.user.id, image.hash, image.mime)}`, {
      headers: await authHeaders({ Accept: image.mime }), responseType: 'arraybuffer',
    });
    const bytes = new Uint8Array(response.response);
    if (!bytes.byteLength || bytes.byteLength > BACKGROUND_MAX_BYTES) throw new Error('받은 배경 이미지 크기가 비정상임.');
    if (await backgroundHashBytes(bytes) !== image.hash) throw new Error('받은 배경 이미지 해시가 일치하지 않음.');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:${image.mime};base64,${btoa(binary)}`;
  }

  function sanitizeBackup(backup) {
    const copy = JSON.parse(JSON.stringify(backup));
    const settings = copy.settings && typeof copy.settings === 'object' ? copy.settings : {};
    for (const key of SECRET_KEYS) delete settings[key];
    for (const key of ['urlExtLogs', 'urlInjLogs', 'urlRefinerLogs']) delete settings[key];
    copy.settings = settings;
    copy.includeSecrets = false;
    copy.logsExcluded = true;
    return copy;
  }

  async function waitForBackupTools(timeoutMs = 20_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const tools = BRIDGE.__LoreInj?.backupTools;
      if (tools?.exportFullBackup && tools?.importFullBackup) return tools;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('기존 로어 인젝터를 찾지 못함. 현재 인젝터가 켜진 채팅방에서 다시 열어줘.');
  }

  async function exportBackup() {
    const tools = await waitForBackupTools();
    const raw = await tools.exportFullBackup({ includeSecrets: false, includeLogs: false, includeEmbeddings: true, includeHistory: false });
    return sanitizeBackup(raw);
  }

  async function restoreBackup(backup) {
    const tools = await waitForBackupTools();
    setStatus('☁️ 클라우드 데이터를 복원 중...\n현재 페이지는 새로고침하지 않음.');
    await tools.importFullBackup(backup, 'replace', { includeSecrets: false, importSettings: true });
  }

  function bytesToBase64Url(bytes) {
    let text = '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) text += String.fromCharCode(...arr.subarray(i, i + 0x8000));
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    let text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    const binary = atob(text);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  async function deriveKey(passphrase, salt) {
    if (String(passphrase || '').length < 8) throw new Error('동기화 암호는 8자 이상으로 정해줘.');
    const material = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function gzip(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzip(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 gzip 복원을 지원하지 않음. 최신 브라우저에서 복원해줘.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encryptBackup(backup) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(config.syncPassphrase, salt);
    const plain = textEncoder.encode(JSON.stringify(backup));
    const compressed = await gzip(plain);
    const envelopeVersion = compressed ? 2 : 1;
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed || plain);
    return JSON.stringify({ v: envelopeVersion, compression: compressed ? 'gzip' : undefined, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(data)) });
  }

  async function decryptBackup(ciphertext) {
    let envelope;
    try { envelope = JSON.parse(ciphertext); } catch { throw new Error('클라우드 데이터 형식이 올바르지 않음.'); }
    if (![1, 2].includes(envelope?.v) || !envelope.salt || !envelope.iv || !envelope.data) throw new Error('지원하지 않는 클라우드 데이터 형식.');
    try {
      const key = await deriveKey(config.syncPassphrase, base64UrlToBytes(envelope.salt));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv) }, key, base64UrlToBytes(envelope.data));
      const decoded = envelope.v === 2 ? await gunzip(new Uint8Array(plain)) : new Uint8Array(plain);
      return JSON.parse(textDecoder.decode(decoded));
    } catch (error) {
      if (error?.name === 'OperationError' || /operation\s*error|operation-specific/i.test(String(error?.message || error))) {
        const friendly = new Error('클라우드 백업 복호화 실패. 첫 기기와 이 기기의 동기화 암호가 대소문자·띄어쓰기까지 완전히 같은지 확인해줘.');
        friendly.cause = error;
        throw friendly;
      }
      throw error;
    }
  }

  async function fingerprint(backup) {
    const copy = JSON.parse(JSON.stringify(backup));
    delete copy.exportedAt;
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(JSON.stringify(copy)));
    return bytesToBase64Url(new Uint8Array(digest));
  }

  function summarySyncStatus() {
    if (!config.projectUrl || !config.publishableKey) return { ready: false, reason: 'Supabase 연결 정보를 저장해줘.' };
    if (!session?.access_token) return { ready: false, reason: '로어 동기화에서 Supabase 로그인해줘.' };
    if (!config.syncPassphrase || config.syncPassphrase.length < 8) return { ready: false, reason: '동기화 암호를 저장해줘.' };
    return { ready: true, reason: '' };
  }

  function validateSummarySyncInput(chatId, batchEndCount = null, lockOwner = '') {
    if (!/^[a-z0-9-]{1,128}$/i.test(String(chatId || ''))) throw new Error('채팅 ID 형식이 올바르지 않음.');
    if (batchEndCount !== null && (!Number.isInteger(batchEndCount) || batchEndCount < 0 || batchEndCount % 20 !== 0)) {
      throw new Error('요약 턴 경계가 올바르지 않음.');
    }
    if (lockOwner && String(lockOwner).length < 8) throw new Error('동기화 잠금 ID가 올바르지 않음.');
  }

  async function summaryRpc(name, body) {
    const status = summarySyncStatus();
    if (!status.ready) throw new Error(status.reason);
    return authedRequest(`${config.projectUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body,
    });
  }

  function normalizeCheckpoint(row) {
    if (!row) return null;
    return {
      batchEndCount: Number(row.batch_end_count ?? row.row_batch_end_count ?? 0),
      batchStartTurnId: String(row.batch_start_turn_id ?? row.row_batch_start_turn_id ?? ''),
      batchEndTurnId: String(row.batch_end_turn_id ?? row.row_batch_end_turn_id ?? '__start__'),
      status: String(row.status ?? row.row_status ?? ''),
      lockOwner: String(row.lock_owner ?? row.row_lock_owner ?? ''),
      createdSummaryIds: Array.isArray(row.created_summary_ids ?? row.row_created_summary_ids)
        ? (row.created_summary_ids ?? row.row_created_summary_ids).map(String)
        : [],
    };
  }

  async function getSummaryCheckpoint(chatId) {
    validateSummarySyncInput(chatId);
    const status = summarySyncStatus();
    if (!status.ready) throw new Error(status.reason);
    const active = await refreshSessionIfNeeded();
    const query = new URLSearchParams({
      owner_id: `eq.${active.user.id}`,
      chat_id: `eq.${chatId}`,
      status: 'eq.completed',
      select: 'batch_end_count,batch_start_turn_id,batch_end_turn_id,status,lock_owner,created_summary_ids',
      order: 'batch_end_count.desc',
      limit: '1',
    });
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/summary_sync_state?${query}`);
    return normalizeCheckpoint(Array.isArray(rows) ? rows[0] : null);
  }

  async function initializeSummaryCheckpoint({ chatId, batchEndCount, batchEndTurnId }) {
    validateSummarySyncInput(chatId, batchEndCount);
    const rows = await summaryRpc('initialize_summary_checkpoint', {
      p_chat_id: chatId,
      p_batch_end_count: batchEndCount,
      p_batch_end_turn_id: batchEndTurnId || '__start__',
    });
    return normalizeCheckpoint(Array.isArray(rows) ? rows[0] : null);
  }

  async function claimSummaryBatch({ chatId, batchStartTurnId, batchEndTurnId, batchEndCount, lockOwner }) {
    validateSummarySyncInput(chatId, batchEndCount, lockOwner);
    const rows = await summaryRpc('claim_summary_batch', {
      p_chat_id: chatId,
      p_batch_start_turn_id: batchStartTurnId || '',
      p_batch_end_turn_id: batchEndTurnId,
      p_batch_end_count: batchEndCount,
      p_lock_owner: lockOwner,
      p_lock_ttl_seconds: 1800,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error('요약 구간 잠금 응답이 비어 있음.');
    const checkpoint = normalizeCheckpoint(row);
    const ciphertext = row.row_payload_ciphertext || '';
    return {
      ...checkpoint,
      claimed: row.claimed === true,
      payload: ciphertext ? await decryptBackup(ciphertext) : null,
    };
  }

  async function saveSummaryBatch({ chatId, batchEndCount, lockOwner, payload, createdSummaryIds }) {
    validateSummarySyncInput(chatId, batchEndCount, lockOwner);
    await summaryRpc('save_summary_batch_progress', {
      p_chat_id: chatId,
      p_batch_end_count: batchEndCount,
      p_lock_owner: lockOwner,
      p_payload_ciphertext: payload ? await encryptBackup(payload) : null,
      p_created_summary_ids: Array.isArray(createdSummaryIds) ? createdSummaryIds.map(String) : [],
    });
  }

  async function completeSummaryBatch({ chatId, batchEndCount, lockOwner, createdSummaryIds }) {
    validateSummarySyncInput(chatId, batchEndCount, lockOwner);
    await summaryRpc('complete_summary_batch', {
      p_chat_id: chatId,
      p_batch_end_count: batchEndCount,
      p_lock_owner: lockOwner,
      p_created_summary_ids: Array.isArray(createdSummaryIds) ? createdSummaryIds.map(String) : [],
    });
  }

  async function failSummaryBatch({ chatId, batchEndCount, lockOwner, error }) {
    validateSummarySyncInput(chatId, batchEndCount, lockOwner);
    await summaryRpc('fail_summary_batch', {
      p_chat_id: chatId,
      p_batch_end_count: batchEndCount,
      p_lock_owner: lockOwner,
      p_last_error: String(error?.message || error || 'unknown error').slice(0, 500),
    });
  }

  function normalizeRemoteMetadata(row) {
    if (!row) return null;
    return {
      revision: Number(row.revision || 0),
      updatedAt: row.updated_at || '',
      deviceLabel: row.device_label || '',
      schemaVersion: Number(row.schema_version || 1),
      contentHash: row.content_hash || '',
      previousRevision: Number(row.previous_revision || 0),
      previousUpdatedAt: row.previous_updated_at || '',
      previousDeviceLabel: row.previous_device_label || '',
      previousSchemaVersion: Number(row.previous_schema_version || 1),
      previousContentHash: row.previous_content_hash || '',
    };
  }

  async function getRemoteMetadata() {
    const active = await refreshSessionIfNeeded();
    const select = 'revision,updated_at,device_label,schema_version,content_hash,previous_revision,previous_updated_at,previous_device_label,previous_schema_version,previous_content_hash';
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/lore_sync_state?owner_id=eq.${encodeURIComponent(active.user.id)}&select=${select}`);
    remoteMetadata = normalizeRemoteMetadata(Array.isArray(rows) ? rows[0] : null);
    return remoteMetadata;
  }

  async function getRemoteBackup(slot = 'current') {
    const active = await refreshSessionIfNeeded();
    const previous = slot === 'previous';
    const select = previous
      ? 'previous_ciphertext,previous_revision,previous_updated_at,previous_device_label,previous_schema_version,previous_content_hash'
      : 'ciphertext,revision,updated_at,device_label,schema_version,content_hash';
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/lore_sync_state?owner_id=eq.${encodeURIComponent(active.user.id)}&select=${select}`);
    const row = Array.isArray(rows) ? rows[0] : null;
    const ciphertext = previous ? row?.previous_ciphertext : row?.ciphertext;
    if (!ciphertext) throw new Error(previous ? '클라우드에 이전 백업이 아직 없음.' : '클라우드에 복원할 백업이 아직 없음.');
    return {
      ciphertext,
      revision: Number(previous ? row.previous_revision : row.revision || 0),
      contentHash: previous ? row.previous_content_hash || '' : row.content_hash || '',
    };
  }

  async function upload(backup, hash, remoteRevision = 0) {
    setStatus('☁️ 클라우드에 저장 중...');
    const ciphertext = await encryptBackup(backup);
    const schemaVersion = Number(JSON.parse(ciphertext).v || 1);
    const rows = await authedRequest(`${config.projectUrl}/rest/v1/rpc/save_lore_sync_state`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        p_ciphertext: ciphertext,
        p_content_hash: hash,
        p_base_revision: Number(remoteRevision || 0),
        p_device_label: config.deviceLabel || navigator.platform || '내 기기',
        p_schema_version: schemaVersion,
      },
    });
    remoteMetadata = normalizeRemoteMetadata(Array.isArray(rows) ? rows[0] : null);
    const revision = remoteMetadata?.revision || Number(remoteRevision || 0) + 1;
    syncState = { ...syncState, lastHash: hash, lastRevision: revision, lastSyncAt: Date.now(), dirty: false };
    await persistState();
    setStatus(`☁️ 동기화 완료\n${new Date(syncState.lastSyncAt).toLocaleTimeString()} · revision ${syncState.lastRevision}`);
  }

  async function firstSync(mode) {
    const remote = await getRemoteMetadata();
    if (!remote) {
      if (mode === 'restore') throw new Error('클라우드에 복원할 백업이 아직 없음. 첫 기기에서는 먼저 백업을 올려줘.');
      const local = await exportBackup();
      const hash = await fingerprint(local);
      await upload(local, hash, 0);
      needsInitialChoice = false;
      return;
    }
    if (mode === 'upload') {
      const local = await exportBackup();
      await upload(local, await fingerprint(local), remote.revision);
      needsInitialChoice = false;
      return;
    }
    await restoreRemote('current');
    needsInitialChoice = false;
  }

  async function restoreRemote(slot = 'current') {
    const remote = await getRemoteBackup(slot);
    const cloud = await decryptBackup(remote.ciphertext);
    await restoreBackup(cloud);
    const restoredHash = remote.contentHash || await fingerprint(sanitizeBackup(cloud));
    syncState = { ...syncState, lastHash: restoredHash, lastRevision: remote.revision, lastSyncAt: Date.now(), dirty: false };
    await persistState();
    setStatus(slot === 'previous'
      ? '☁️ 이전 클라우드 로어 복원 완료. 클라우드 최신본은 그대로 유지함.'
      : '☁️ 클라우드 로어 복원 완료. 현재 페이지는 새로고침하지 않았음.');
  }

  function isChatRoute() {
    return /^\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+\/?$/i.test(location.pathname)
      || /^\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+\/?$/i.test(location.pathname)
      || /^\/u\/[a-f0-9]+\/c\/[a-f0-9]+\/?$/i.test(location.pathname);
  }

  function syncReady() {
    return isChatRoute() && session?.access_token && config.syncPassphrase && config.projectUrl && config.publishableKey;
  }

  async function checkRemoteMetadata() {
    if (!syncReady() || document.hidden || remoteCheckRunning) return;
    remoteCheckRunning = true;
    try {
      const remote = await getRemoteMetadata();
      if (!syncState.lastHash && remote) {
        needsInitialChoice = true;
      } else if (remote && remote.revision > Number(syncState.lastRevision || 0)) {
        if (remote.contentHash && remote.contentHash === syncState.lastHash) {
          syncState.lastRevision = remote.revision;
          await persistState();
        } else {
          setStatus(syncState.dirty
            ? '⚠️ 이 기기와 클라우드가 모두 바뀜. 자동 업로드를 멈춤. 패널에서 업로드 또는 복원을 골라줘.'
            : '☁️ 다른 기기에서 최신 로어가 올라옴. 내려받진 않았음. 패널에서 복원하면 됨.', 'warn');
        }
      }
    } catch (error) {
      console.warn('[Lore Sync Bridge] metadata check failed:', error);
    } finally {
      remoteCheckRunning = false;
      if (panel) renderPanel();
    }
  }

  async function flushPendingUpload() {
    uploadTimer = null;
    if (!syncReady() || needsInitialChoice || !syncState.lastHash) return;
    try {
      const local = await exportBackup();
      const hash = await fingerprint(local);
      if (hash === syncState.lastHash) {
        syncState.dirty = false;
        await persistState();
        return;
      }
      const remote = await getRemoteMetadata();
      if (remote && remote.revision > Number(syncState.lastRevision || 0) && remote.contentHash !== syncState.lastHash) {
        setStatus('⚠️ 이 기기와 클라우드가 모두 바뀜. 자동 업로드를 멈춤. 패널에서 업로드 또는 복원을 골라줘.', 'warn');
        return;
      }
      if (remote?.contentHash && remote.contentHash === hash) {
        syncState = { ...syncState, lastHash: hash, lastRevision: remote.revision, dirty: false };
        await persistState();
        return;
      }
      await upload(local, hash, remote?.revision || 0);
    } catch (error) {
      console.warn('[Lore Sync Bridge] delayed upload failed:', error);
      setStatus(`❌ 자동 업로드 실패: ${shortError(error)}`, 'error');
    }
  }

  async function scheduleUpload() {
    syncState.dirty = true;
    await persistState();
    if (uploadTimer) clearTimeout(uploadTimer);
    setStatus('☁️ 로어 변경 감지됨. 1분 동안 변경을 모은 뒤 업로드함.');
    uploadTimer = setTimeout(() => void flushPendingUpload(), UPLOAD_DEBOUNCE_MS);
  }

  async function scanLocalChanges() {
    if (!syncReady() || document.hidden || localScanRunning || needsInitialChoice || !syncState.lastHash) return;
    localScanRunning = true;
    try {
      const local = await exportBackup();
      const hash = await fingerprint(local);
      if (hash !== syncState.lastHash && remoteMetadata && remoteMetadata.revision > Number(syncState.lastRevision || 0) && remoteMetadata.contentHash !== syncState.lastHash) {
        syncState.dirty = true;
        await persistState();
        setStatus('⚠️ 이 기기와 클라우드가 모두 바뀜. 자동 업로드를 멈춤. 패널에서 업로드 또는 복원을 골라줘.', 'warn');
      } else if (hash !== syncState.lastHash) await scheduleUpload();
      else if (syncState.dirty) {
        syncState.dirty = false;
        await persistState();
      }
    } catch (error) {
      console.warn('[Lore Sync Bridge] local change scan failed:', error);
    } finally {
      localScanRunning = false;
    }
  }

  function value(id) {
    return panel?.querySelector(`#${id}`)?.value?.trim() || '';
  }

  async function withBusy(action) {
    if (busy) return;
    busy = true;
    try { await action(); } catch (error) { setStatus(`❌ ${shortError(error)}`, 'error'); } finally { busy = false; renderPanel(); }
  }

  function makeButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `clsb-btn ${className || ''}`.trim();
    button.textContent = label;
    button.addEventListener('click', () => withBusy(handler));
    return button;
  }

  function addField(host, id, label, type, current, placeholder, disabled = false) {
    const wrap = document.createElement('label');
    wrap.className = 'clsb-field';
    wrap.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.value = current || '';
    input.placeholder = placeholder || '';
    input.autocomplete = type === 'password' ? 'new-password' : 'off';
    input.disabled = disabled;
    wrap.appendChild(input);
    host.appendChild(wrap);
  }

  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'clsb-head';
    const title = document.createElement('div');
    title.className = 'clsb-title';
    title.textContent = '☁️ 크랙 로어 개인 동기화';
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'clsb-close'; close.textContent = '×'; close.onclick = closePanel;
    head.append(title, close); panel.appendChild(head);

    const intro = document.createElement('div');
    intro.className = 'clsb-card';
    intro.innerHTML = '<h3>기존 인젝터는 건드리지 않음</h3><p class="clsb-note">현재 로어 인젝터의 공식 백업/복원 기능만 사용함. Gemini 키·크랙 토큰·제작자 서버 로그인 정보는 업로드하지 않음.</p>';
    panel.appendChild(intro);

    const connection = document.createElement('div'); connection.className = 'clsb-card';
    connection.innerHTML = '<h3>Supabase 연결</h3>';
    addField(connection, 'clsb-url', 'Project URL', 'url', config.projectUrl, 'https://...supabase.co');
    addField(connection, 'clsb-key', 'Publishable / anon key', 'password', config.publishableKey, 'sb_publishable_... 또는 eyJ...');
    addField(connection, 'clsb-device', '이 기기 이름', 'text', config.deviceLabel, '예: 아이폰 / 내 컴퓨터');
    const saveConnection = makeButton('연결 정보 저장', '', async () => {
      config.projectUrl = value('clsb-url'); config.publishableKey = value('clsb-key'); config.deviceLabel = value('clsb-device') || '내 기기';
      validateConnection(); await persistConfig(); setStatus('✅ Supabase 연결 정보를 이 기기에 저장함.');
    });
    connection.appendChild(saveConnection); panel.appendChild(connection);

    const account = document.createElement('div'); account.className = 'clsb-card';
    const loggedIn = Boolean(session?.access_token);
    account.innerHTML = '<h3>동기화 계정</h3>';
    const accountNote = document.createElement('p'); accountNote.className = 'clsb-note';
    accountNote.textContent = loggedIn
      ? `🟢 ${session?.user?.email || config.email || '저장된 계정'}으로 로그인 중. 로그아웃 전까지 계정 입력은 잠김.`
      : 'Supabase 가입용 이메일과 비밀번호. 비밀번호는 저장하지 않고, 로그인 세션만 이 기기에 저장함.';
    account.appendChild(accountNote);
    addField(account, 'clsb-email', '이메일', 'email', config.email, '내 Gmail 주소', loggedIn);
    addField(account, 'clsb-password', '계정 비밀번호', 'password', '', '8자 이상 새 비밀번호', loggedIn);
    const accountRow = document.createElement('div'); accountRow.className = 'clsb-row';
    if (loggedIn) {
      accountRow.append(makeButton('로그아웃', 'danger', async () => { await persistSession(null); setStatus('로그아웃됨.'); }));
    } else {
      accountRow.append(
        makeButton('가입', '', async () => { const email = value('clsb-email'); const password = value('clsb-password'); if (!email || !password) throw new Error('이메일과 비밀번호를 입력해줘.'); const active = await signUp(email, password); setStatus(active ? '✅ 가입과 로그인이 완료됨.' : '✅ 가입됨. 로그인 버튼을 눌러줘.'); }),
        makeButton('로그인', 'primary', async () => { const email = value('clsb-email'); const password = value('clsb-password'); if (!email || !password) throw new Error('이메일과 비밀번호를 입력해줘.'); await signIn(email, password); setStatus('✅ 로그인 완료. 이제 동기화 암호를 설정해줘.'); }),
      );
    }
    account.appendChild(accountRow); panel.appendChild(account);

    const sync = document.createElement('div'); sync.className = 'clsb-card';
    sync.innerHTML = '<h3>암호화 동기화</h3><p class="clsb-note">이 암호는 Supabase에 보내지지 않고 이 기기에만 저장됨. 로컬 변경은 2분마다 기기 안에서만 확인하고, 변경 발견 후 1분간 모아 gzip 압축·암호화하여 자동 업로드함. 원격은 접속 시와 화면을 보는 동안 10분마다 작은 메타데이터만 확인하며, 실제 백업은 복원 버튼을 눌렀을 때만 내려받음. 자동 백업에는 임베딩을 포함하고 내부 히스토리는 제외함.</p>';
    addField(sync, 'clsb-passphrase', '동기화 암호', 'password', config.syncPassphrase, '8자 이상, 기기마다 같은 암호');
    const syncRow = document.createElement('div'); syncRow.className = 'clsb-row';
    syncRow.append(makeButton('동기화 암호 저장', '', async () => { config.syncPassphrase = value('clsb-passphrase'); if (config.syncPassphrase.length < 8) throw new Error('동기화 암호는 8자 이상이어야 함.'); await persistConfig(); setStatus('✅ 이 기기에 동기화 암호를 저장함.'); }));
    if (needsInitialChoice) {
      syncRow.append(
        makeButton('클라우드 로어 복원', 'primary', async () => { if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.'); await firstSync('restore'); }),
        makeButton('이 기기 로어로 클라우드 덮어쓰기', 'danger', async () => {
          if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.');
          if (!confirm('이 기기의 로어를 새 클라우드 기준으로 저장함. 기존 클라우드 로어는 덮어써짐. 계속할까?')) return;
          await firstSync('upload');
        }),
      );
    } else if (!syncState.lastHash) {
      syncRow.append(makeButton('처음 백업 올리기', 'primary', async () => { if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.'); await firstSync('upload'); }));
    } else {
      syncRow.append(
        makeButton('지금 업로드', '', async () => { const local = await exportBackup(); await upload(local, await fingerprint(local), (await getRemoteMetadata())?.revision || 0); }),
        makeButton('최신 클라우드 로어 복원', '', async () => { if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.'); await restoreRemote('current'); }),
      );
      if (remoteMetadata?.previousRevision) {
        syncRow.append(makeButton('이전 클라우드 로어 복원', '', async () => { if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.'); await restoreRemote('previous'); }));
      }
    }
    sync.appendChild(syncRow); panel.appendChild(sync);

    statusEl = document.createElement('div');
    statusEl.className = 'clsb-status';
    if (latestStatus) {
      statusEl.textContent = latestStatus;
      statusEl.className = `clsb-status ${latestStatusTone}`.trim();
    } else if (session?.access_token) {
      statusEl.textContent = '✅ 로그인된 상태. 동기화 암호를 저장한 뒤 백업 또는 복원을 선택해줘.';
    } else {
    const injectorFound = !!BRIDGE.__LoreInj?.backupTools;
    statusEl.textContent = needsInitialChoice
      ? '⚠️ 클라우드 백업이 이미 있음. 클라우드 기준을 받을 땐 "클라우드 로어 복원", 이 기기 로어를 새 기준으로 쓸 땐 "이 기기 로어로 클라우드 덮어쓰기"를 눌러줘.'
      : `${injectorFound ? '✅ 기존 로어 인젝터 감지됨' : '⏳ 기존 로어 인젝터 기다리는 중'}\n동기화 비용: 1회 0.00원 · 누적 0.00원`;
    }
    panel.appendChild(statusEl);
    const meta = document.createElement('div'); meta.className = 'clsb-meta';
    meta.textContent = `Bridge v${VERSION} · 마지막 동기화: ${syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : '아직 없음'} · 클라우드 revision ${remoteMetadata?.revision || syncState.lastRevision || 0} · 현재본과 이전본 1개만 보관 · AES-256-GCM 암호화.`;
    panel.appendChild(meta);
  }

  function openPanel() {
    if (document.getElementById('clsb-overlay')) return;
    const overlay = document.createElement('div'); overlay.id = 'clsb-overlay';
    panel = document.createElement('div'); panel.id = 'clsb-panel';
    overlay.appendChild(panel); overlay.addEventListener('click', event => { if (event.target === overlay) closePanel(); });
    document.body.appendChild(overlay); renderPanel();
  }

  function closePanel() {
    document.getElementById('clsb-overlay')?.remove(); panel = null; statusEl = null;
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

  function mountButton() {
    const headerHost = findHeaderHost();
    const existing = document.getElementById('clsb-fab');
    if (!headerHost) {
      existing?.remove();
      return;
    }
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = 'clsb-fab'; button.type = 'button'; button.title = '크랙 로어 개인 동기화'; button.setAttribute('aria-label', '크랙 로어 개인 동기화');
      button.addEventListener('click', openPanel);
    }
    if (button.parentElement !== headerHost) headerHost.insertBefore(button, headerHost.firstChild);
    let cloudIcon = button.querySelector('.clsb-cloud-emoji');
    if (!cloudIcon) {
      button.replaceChildren();
      cloudIcon = document.createElement('span');
      cloudIcon.className = 'clsb-cloud-emoji';
      cloudIcon.setAttribute('aria-hidden', 'true');
      button.appendChild(cloudIcon);
    }
    cloudIcon.textContent = '\u2601\uFE0F';
  }

  let chatSyncPrepared = false;
  let chatSyncPreparing = false;

  async function prepareChatSync() {
    if (chatSyncPrepared || chatSyncPreparing || !isChatRoute()) return;
    chatSyncPreparing = true;
    try {
      if (session?.access_token && config.syncPassphrase && config.projectUrl && config.publishableKey) {
        const remote = await getRemoteMetadata();
        if (!syncState.lastHash && remote) needsInitialChoice = true;
        else if (!syncState.lastHash && !remote) setStatus('☁️ 첫 기기임. 패널에서 "처음 백업 올리기"를 누르면 됨.');
        else {
          if (remote && remote.revision > Number(syncState.lastRevision || 0) && remote.contentHash !== syncState.lastHash) {
            setStatus('☁️ 다른 기기에서 최신 로어가 올라옴. 내려받진 않았음. 패널에서 복원하면 됨.', 'warn');
          }
          await scanLocalChanges();
        }
      }
    } catch (error) {
      console.warn('[Lore Sync Bridge] boot check failed:', error);
    } finally {
      chatSyncPrepared = true;
      chatSyncPreparing = false;
    }
  }

  function syncBridgeRoute() {
    if (!isChatRoute()) {
      document.getElementById('clsb-fab')?.remove();
      if (panel) closePanel();
      chatSyncPrepared = false;
      return;
    }
    mountButton();
    void prepareChatSync();
  }

  async function initialize() {
    await load();
    syncBridgeRoute();
    setInterval(syncBridgeRoute, 1000);
    setInterval(() => void checkRemoteMetadata(), REMOTE_CHECK_MS);
    setInterval(() => void scanLocalChanges(), LOCAL_SCAN_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      void checkRemoteMetadata();
      void scanLocalChanges();
    });
    window.addEventListener('online', () => {
      void checkRemoteMetadata();
      void scanLocalChanges();
    });
  }

  Object.defineProperty(BRIDGE, SUMMARY_SYNC_API_KEY, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      getStatus: summarySyncStatus,
      getCheckpoint: getSummaryCheckpoint,
      initializeCheckpoint: initializeSummaryCheckpoint,
      claimBatch: claimSummaryBatch,
      saveBatch: saveSummaryBatch,
      completeBatch: completeSummaryBatch,
      failBatch: failSummaryBatch,
    }),
  });

  Object.defineProperty(BRIDGE, PROFILE_SYNC_API_KEY, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      getStatus: profileSyncStatus,
      getManifest: getProfileManifest,
      saveManifest: saveProfileManifest,
      uploadImage: uploadProfileImage,
      downloadImage: downloadProfileImage,
    }),
  });

  Object.defineProperty(BRIDGE, BACKGROUND_SYNC_API_KEY, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      getStatus: backgroundSyncStatus,
      getManifest: getBackgroundManifest,
      saveManifest: saveBackgroundManifest,
      uploadImage: uploadBackgroundImage,
      downloadImage: downloadBackgroundImage,
    }),
  });

  initialize().catch(error => console.warn('[Lore Sync Bridge] init failed:', error));
})();
