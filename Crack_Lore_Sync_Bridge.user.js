// ==UserScript==
// @name         크랙 로어 개인 동기화 브리지
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.1.5
// @description  기존 로어 인젝터를 수정하지 않고, 개인 Supabase에 암호화 백업을 자동 동기화합니다.
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @match        https://crack.wrtn.ai/
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-memory-manager-v2/Crack_Lore_Sync_Bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-memory-manager-v2/Crack_Lore_Sync_Bridge.user.js
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

  const VERSION = '1.1.5';
  const APP_KEY = 'shipidle:crack-lore-sync-bridge:v1';
  const BRIDGE = unsafeWindow || window;
  const AUTH_REDIRECT = 'https://crack.wrtn.ai/';
  const AUTO_SYNC_MS = 60_000;
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
  let syncState = { lastHash: '', lastRevision: 0, lastSyncAt: 0 };
  let session = null;
  let panel = null;
  let statusEl = null;
  let latestStatus = '';
  let latestStatusTone = '';
  let busy = false;
  let needsInitialChoice = false;

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
    session = next;
    await GM_setValue(`${APP_KEY}:session`, next);
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
          reject(new Error(message));
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  function validateConnection() {
    config.projectUrl = cleanUrl(config.projectUrl);
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.projectUrl)) throw new Error('Project URL 형식이 맞지 않음. https://...supabase.co 를 넣어줘.');
    if (!String(config.publishableKey || '').trim()) throw new Error('Publishable key를 넣어줘.');
  }

  async function refreshSessionIfNeeded() {
    if (!session?.access_token) throw new Error('먼저 로그인해줘.');
    const expiresSoon = Number(session.expires_at || 0) * 1000 < Date.now() + 90_000;
    if (!expiresSoon) return session;
    if (!session.refresh_token) throw new Error('로그인 세션이 만료됨. 다시 로그인해줘.');
    const next = await request(`${config.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: makeHeaders(), body: { refresh_token: session.refresh_token },
    });
    await persistSession(next);
    return next;
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
    const raw = await tools.exportFullBackup({ includeSecrets: false, includeLogs: false, includeEmbeddings: true, includeHistory: true });
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

  async function encryptBackup(backup) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(config.syncPassphrase, salt);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(JSON.stringify(backup)));
    return JSON.stringify({ v: 1, salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(data)) });
  }

  async function decryptBackup(ciphertext) {
    let envelope;
    try { envelope = JSON.parse(ciphertext); } catch { throw new Error('클라우드 데이터 형식이 올바르지 않음.'); }
    if (envelope?.v !== 1 || !envelope.salt || !envelope.iv || !envelope.data) throw new Error('지원하지 않는 클라우드 데이터 형식.');
    try {
      const key = await deriveKey(config.syncPassphrase, base64UrlToBytes(envelope.salt));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv) }, key, base64UrlToBytes(envelope.data));
      return JSON.parse(textDecoder.decode(plain));
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

  async function getRemote() {
    const active = await refreshSessionIfNeeded();
    const rows = await request(`${config.projectUrl}/rest/v1/lore_sync_state?owner_id=eq.${encodeURIComponent(active.user.id)}&select=ciphertext,revision,updated_at,device_label,schema_version`, {
      headers: await authHeaders(),
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async function upload(backup, hash, remoteRevision = 0) {
    const active = await refreshSessionIfNeeded();
    const revision = Math.max(Number(syncState.lastRevision || 0), Number(remoteRevision || 0)) + 1;
    const body = [{ owner_id: active.user.id, ciphertext: await encryptBackup(backup), revision, updated_at: new Date().toISOString(), device_label: config.deviceLabel || navigator.platform || '내 기기', schema_version: 1 }];
    const rows = await request(`${config.projectUrl}/rest/v1/lore_sync_state?on_conflict=owner_id`, {
      method: 'POST', headers: await authHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }), body,
    });
    syncState = { lastHash: hash, lastRevision: Number(rows?.[0]?.revision || revision), lastSyncAt: Date.now() };
    await persistState();
    setStatus(`☁️ 동기화 완료\n${new Date(syncState.lastSyncAt).toLocaleTimeString()} · revision ${syncState.lastRevision}`);
  }

  async function firstSync(mode) {
    const remote = await getRemote();
    const local = await exportBackup();
    const hash = await fingerprint(local);
    if (!remote) {
      if (mode === 'restore') throw new Error('클라우드에 복원할 백업이 아직 없음. 첫 기기에서는 먼저 백업을 올려줘.');
      await upload(local, hash, 0);
      needsInitialChoice = false;
      return;
    }
    if (mode === 'upload') {
      await upload(local, hash, remote?.revision || 0);
      needsInitialChoice = false;
      return;
    }
    const cloud = await decryptBackup(remote.ciphertext);
    await restoreBackup(cloud);
    const restoredHash = await fingerprint(sanitizeBackup(cloud));
    syncState = { lastHash: restoredHash, lastRevision: Number(remote.revision || 0), lastSyncAt: Date.now() };
    await persistState();
    needsInitialChoice = false;
    setStatus('☁️ 클라우드 로어 복원 완료. 현재 페이지는 새로고침하지 않았음.');
  }

  function isChatRoute() {
    return /^\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+\/?$/i.test(location.pathname)
      || /^\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+\/?$/i.test(location.pathname)
      || /^\/u\/[a-f0-9]+\/c\/[a-f0-9]+\/?$/i.test(location.pathname);
  }

  async function autoSync() {
    if (!isChatRoute() || busy || !session?.access_token || !config.syncPassphrase || !syncState.lastHash || needsInitialChoice) return;
    try {
      const local = await exportBackup();
      const hash = await fingerprint(local);
      const remote = await getRemote();
      if (remote && Number(remote.revision || 0) > Number(syncState.lastRevision || 0)) {
        if (hash !== syncState.lastHash) {
          setStatus('⚠️ 이 기기와 클라우드가 모두 바뀜.\n안전하게 자동 덮어쓰진 않았음. 패널에서 지금 업로드 또는 클라우드 복원을 골라줘.', 'warn');
          return;
        }
        setStatus('☁️ 다른 기기에서 최신 로어가 올라옴. 현재 페이지는 건드리지 않았음. 대화 마친 뒤 "클라우드 로어 복원"을 누르면 됨.', 'warn');
        return;
      }
      if (hash !== syncState.lastHash) await upload(local, hash, remote?.revision || 0);
    } catch (error) {
      console.warn('[Lore Sync Bridge] auto sync failed:', error);
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
    sync.innerHTML = '<h3>암호화 동기화</h3><p class="clsb-note">이 암호는 Supabase에 보내지지 않고 이 기기에만 저장됨. 폰과 컴퓨터에서 반드시 같은 암호를 넣어야 복원 가능. 이 기기의 변경은 1분마다 자동 업로드하며, 다른 기기 로어는 현재 대화를 건드리지 않도록 직접 복원할 때만 받음.</p>';
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
        makeButton('지금 업로드', '', async () => { const local = await exportBackup(); await upload(local, await fingerprint(local), (await getRemote())?.revision || 0); }),
        makeButton('클라우드 로어 복원', '', async () => { if (!config.syncPassphrase) throw new Error('동기화 암호를 먼저 저장해줘.'); await firstSync('restore'); }),
      );
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
    meta.textContent = `Bridge v${VERSION} · 마지막 동기화: ${syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : '아직 없음'} · Supabase 저장 데이터는 AES-256-GCM으로 암호화됨.`;
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
        const remote = await getRemote();
        if (!syncState.lastHash && remote) needsInitialChoice = true;
        else if (!syncState.lastHash && !remote) setStatus('☁️ 첫 기기임. 패널에서 "처음 백업 올리기"를 누르면 됨.');
        else await autoSync();
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
    setInterval(autoSync, AUTO_SYNC_MS);
  }

  initialize().catch(error => console.warn('[Lore Sync Bridge] init failed:', error));
})();
