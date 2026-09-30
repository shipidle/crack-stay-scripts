// ==UserScript==
// @name         🔖 채팅 찾기·북마크
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-chat-bookmarks
// @version      0.1.1
// @description  🧪 BETA · 채팅방별 문장 북마크·코멘트를 기기에 저장하고 북마크와 전체 대화를 검색합니다. 원문 대화 최신순 정렬·선택 삭제 지원.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Chat_Bookmarks.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Chat_Bookmarks.user.js
// ==/UserScript==

(() => {
  'use strict';

  // The API supplies newest-first conversation order. Never sort by bookmark creation time.
  function createBookmarkCore() {
    function chatId(path) {
      for (const re of [/\/stories\/[^/]+\/episodes\/([^/?#]+)/, /\/characters\/[^/]+\/chats\/([^/?#]+)/, /\/u\/[^/]+\/c\/([^/?#]+)/]) {
        const match = path.match(re);
        if (match) return match[1];
      }
      return '';
    }
    const compact = text => String(text || '').normalize('NFC').replace(/\s+/gu, '');
    const key = room => `shipidle:chat-bookmarks:v1:room:${encodeURIComponent(room)}`;
    const aliases = m => [...new Set([m._id, m.id, m.messageId, m.turnId, m.messageGroupId, m.groupId].filter(Boolean).map(String))];
    function resolve(draft, messages) {
      if (draft.messageId) return messages.find(m => m.id === draft.messageId) || null;
      const identified = messages.filter(m => m.aliases.some(id => draft.aliases.includes(id)));
      const quote = compact(draft.quote);
      const candidates = (identified.length ? identified : messages).filter(m => compact(m.text).includes(quote) && (!draft.role || draft.role === m.role));
      if (candidates.length === 1) return candidates[0];
      const exact = candidates.filter(m => compact(m.text) === compact(draft.fullText));
      return exact.length === 1 ? exact[0] : null;
    }
    function compare(a, b) {
      return (b.order - a.order) || ((b.offset || 0) - (a.offset || 0)) || String(a.id).localeCompare(String(b.id));
    }
    function matches(text, query, sensitive) {
      const a = String(text).normalize('NFC'), b = String(query).trim().normalize('NFC');
      return sensitive ? a.includes(b) : a.toLocaleLowerCase().includes(b.toLocaleLowerCase());
    }
    function page(json) {
      const data = json?.data || json;
      if (!Array.isArray(data?.messages)) throw new Error('대화 응답 형식을 확인할 수 없음. 새로고침 후 다시 시도해줘.');
      const cursor = String(data.nextCursor || json.nextCursor || '');
      if (data.hasNext === true && (!cursor || !data.messages.length)) throw new Error('과거 대화의 다음 페이지 정보가 없음. 전체 불러오기가 완료되지 않았음.');
      return { messages: data.messages, cursor: data.hasNext === false ? '' : cursor };
    }
    function reindex(bookmarks, messages) {
      const byId = new Map(messages.map(m => [m.id, m]));
      return bookmarks.map(b => byId.has(b.messageId) ? { ...b, order: byId.get(b.messageId).order } : b);
    }
    return { chatId, compact, key, aliases, resolve, compare, matches, page, reindex };
  }
  // PURE CORE END

  const C = createBookmarkCore();
  const API = 'https://crack-api.wrtn.ai/crack-gen/v3/chats/';
  const SETTINGS_KEY = 'shipidle:chat-bookmarks:v1:settings';
  const GROUP = '[data-message-group-id],[data-message-id],[data-turn-id]';
  const PAGE_SIZE = 50;
  let room = '', epoch = 0, bookmarks = [], messages = [], complete = false;
  let loading = null, controller = null, writes = Promise.resolve();
  let tab = 'bookmarks', query = '', limit = PAGE_SIZE, selected = new Set();
  let draft = null, pendingSelection = null, open = false, saving = false, storageError = '';
  let options = { caseSensitive: false, selectionButton: true };

  GM_addStyle(`
    #csb-toolbar-btn{pointer-events:auto}
    .csb-emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;font-size:15px;line-height:1;pointer-events:none}
    #csb-panel,#csb-pick,#csb-toast{font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#292b30;color-scheme:light}
    #csb-panel{position:fixed;right:16px;bottom:146px;z-index:2147483606;width:410px;max-width:calc(100vw - 24px);max-height:min(76vh,760px);display:flex;flex-direction:column;background:#fff;border:1px solid #dddfe3;border-radius:18px;box-shadow:0 16px 48px #161b2226;padding:16px;font-size:13px;line-height:1.5}
    #csb-panel *{box-sizing:border-box}
    #csb-panel [hidden],#csb-panel[hidden],#csb-pick[hidden],#csb-toast[hidden]{display:none!important}
    #csb-panel button,#csb-pick{font:inherit;cursor:pointer;border:1px solid #dddfe3;background:#f5f5f6;color:#36383e;border-radius:9px;padding:7px 10px;touch-action:manipulation}
    #csb-panel button:hover{background:#eaeaec}
    #csb-panel button:disabled{opacity:.45;cursor:default}
    #csb-panel button:focus-visible,#csb-panel input:focus-visible,#csb-panel textarea:focus-visible{outline:2px solid #7b7f88;outline-offset:2px}
    .csb-head,.csb-row{display:flex;align-items:center;gap:8px}
    .csb-head{justify-content:space-between;margin-bottom:10px;flex-shrink:0}
    .csb-title{font-size:16px;font-weight:750;white-space:nowrap}
    #csb-panel .csb-icon{width:32px;height:32px;padding:4px;font-size:18px;background:transparent;border:0;display:grid;place-items:center}
    #csb-panel input[type=checkbox]{appearance:auto;width:16px;height:16px;margin:0;accent-color:#555962;flex-shrink:0;cursor:pointer}
    .csb-mode{width:32px;height:32px;display:grid;place-items:center;cursor:pointer}
    .csb-tabs{display:flex;padding:3px;background:#f0f0f2;border-radius:11px;margin-bottom:10px;flex-shrink:0}
    #csb-panel .csb-tab{flex:1;border:0;background:transparent;font-weight:700}
    #csb-panel .csb-tab[aria-selected=true]{background:#fff;box-shadow:0 1px 4px #00000012}
    #csb-panel input[type=search],#csb-panel textarea{width:100%;min-width:0;border:1px solid #dddfe3;border-radius:10px;background:#fafafa;color:#292b30;font:inherit;padding:10px;outline:none}
    #csb-panel textarea{min-height:75px;resize:vertical;font-size:16px}
    #csb-search{font-size:16px!important}
    .csb-muted{font-size:11px;color:#757983;line-height:1.55;overflow-wrap:anywhere}
    #csb-status{padding:8px 0;white-space:pre-wrap;flex-shrink:0}
    #csb-list{overflow-y:auto;overscroll-behavior:contain;min-height:40px;flex:1}
    .csb-card{display:flex;gap:9px;border:1px solid #e2e3e6;border-radius:12px;background:#fafafa;padding:12px;margin-bottom:9px}
    .csb-card>input{margin-top:4px!important}
    .csb-body{min-width:0;flex:1}
    .csb-quote,.csb-full,.csb-note{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;user-select:text;-webkit-user-select:text}
    .csb-quote{margin:7px 0;color:#303238}
    .csb-note{border-top:1px solid #e4e5e8;padding-top:8px;margin:8px 0;color:#737780;font-size:12px}
    #csb-panel mark{background:#e2e4e9;color:inherit;border-radius:2px;padding:0 1px}
    .csb-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
    #csb-panel .csb-actions button{font-size:11px;padding:5px 8px;background:#fff}
    #csb-bulk{padding:9px 0;flex-wrap:wrap}
    #csb-settings{padding:12px;background:#f5f5f6;border-radius:12px;margin-bottom:10px;flex-shrink:0}
    #csb-settings label{display:flex;align-items:center;gap:8px;margin:5px 0 9px}
    #csb-editor{overflow:auto;min-height:0}
    #csb-editor blockquote{margin:8px 0 12px;padding:10px;background:#f5f5f6;border-left:3px solid #b5b8c0;max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
    .csb-empty{text-align:center;padding:26px 12px;color:#80848d;white-space:pre-wrap;line-height:1.8}
    #csb-panel details{margin-top:8px}#csb-panel summary{cursor:pointer;color:#656a73;font-size:12px}
    .csb-full{margin-top:9px;border-top:1px solid #e0e1e4;padding-top:9px;font-size:13px}
    #csb-pick{position:fixed;z-index:2147483646;box-shadow:0 3px 16px #0002;background:#fff;font-size:13px;padding:9px 12px;white-space:nowrap}
    #csb-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 30px);background:#3b3e46;color:#fff;border-radius:10px;padding:10px 16px;font-size:13px;pointer-events:none}
    @media(max-width:640px){#csb-panel{left:12px;right:12px;bottom:118px;width:auto;max-width:none;padding:13px;max-height:70dvh;border-radius:16px}}
  `);

  const panel = document.createElement('section');
  panel.id = 'csb-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '채팅 찾기·북마크');
  panel.innerHTML = `
    <header class="csb-head"><strong class="csb-title">🔖 찾기·북마크</strong><div class="csb-row">
      <label class="csb-mode" title="북마크 선택 모드"><input id="csb-select-mode" type="checkbox" aria-label="북마크 선택 모드"></label>
      <button class="csb-icon" id="csb-settings-toggle" title="설정" aria-label="설정" aria-expanded="false">⚙</button>
      <button class="csb-icon" id="csb-close" title="닫기" aria-label="닫기">×</button></div></header>
    <div id="csb-settings" hidden>
      <label><input type="checkbox" id="csb-case"> 영문 대소문자 구분</label>
      <label><input type="checkbox" id="csb-selection"> 문장 선택 시 북마크 버튼 표시</label>
      <div class="csb-muted">북마크·코멘트는 이 기기의 Stay / Tampermonkey에 방별 저장됨. 대화 원문은 검색할 때만 불러옴.</div>
    </div>
    <div class="csb-tabs" role="tablist" aria-label="검색 범위">
      <button class="csb-tab" role="tab" id="csb-bookmarks-tab" aria-selected="true">북마크</button>
      <button class="csb-tab" role="tab" id="csb-history-tab" aria-selected="false">전체 대화</button>
    </div>
    <div class="csb-row" id="csb-search-row"><input type="search" id="csb-search" placeholder="북마크·코멘트 찾기" aria-label="검색어"><button id="csb-refresh" hidden title="전체 대화 새로 불러오기" aria-label="전체 대화 새로 불러오기">↻</button><button id="csb-stop" hidden>중단</button></div>
    <div class="csb-row" id="csb-bulk" hidden><button id="csb-select-all">검색 결과 전체 선택</button><button id="csb-delete-selected" disabled>선택 삭제</button><button id="csb-delete-all">이 방 전체 삭제</button></div>
    <div id="csb-status" class="csb-muted" role="status" aria-live="polite"></div>
    <div id="csb-list"></div>
    <div id="csb-editor" hidden><div class="csb-muted" id="csb-editor-meta"></div><blockquote id="csb-editor-quote"></blockquote><label for="csb-comment">코멘트</label><textarea id="csb-comment" placeholder="이 문장을 남긴 이유, 감상, 메모…"></textarea><div class="csb-actions"><button id="csb-save">저장</button><button id="csb-cancel">취소</button></div></div>
  `;
  const toolbar = document.createElement('button'); toolbar.id = 'csb-toolbar-btn'; toolbar.type = 'button';
  toolbar.title = '채팅 찾기·북마크'; toolbar.setAttribute('aria-label', '채팅 찾기·북마크');
  toolbar.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';
  toolbar.style.cssText = 'pointer-events:auto;width:28px;height:28px;min-width:28px;border-radius:9999px';
  toolbar.innerHTML = '<span class="csb-emoji">🔖</span>';
  const pick = document.createElement('button'); pick.id = 'csb-pick'; pick.type = 'button'; pick.textContent = '🔖 북마크'; pick.hidden = true;
  const toastEl = document.createElement('div'); toastEl.id = 'csb-toast'; toastEl.hidden = true; toastEl.setAttribute('role', 'status');
  document.body.append(panel, pick, toastEl);
  const $ = selector => panel.querySelector(selector);
  let toastTimer;
  function toast(text) { toastEl.textContent = text; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000); }
  function status(text) { $('#csb-status').textContent = storageError || text; }
  function current(id, token) { return id === room && token === epoch && id === C.chatId(location.pathname); }

  // Serialize writes; capture the room before any async work, reread before mutation, and
  // update UI only after durable storage succeeds. Never write an old room into a new one.
  function mutate(id, change) {
    const task = writes.then(async () => {
      const raw = await GM_getValue(C.key(id), { version: 1, bookmarks: [] });
      if (raw?.version !== 1 || !Array.isArray(raw.bookmarks)) throw new Error('저장 데이터 형식을 확인할 수 없어 변경하지 않았음.');
      const next = change(raw.bookmarks);
      await GM_setValue(C.key(id), { version: 1, bookmarks: next });
      if (room === id && C.chatId(location.pathname) === id) { bookmarks = next; render(); }
      return next;
    });
    writes = task.catch(() => {});
    return task;
  }
  async function syncRoom() {
    const next = C.chatId(location.pathname);
    if (next === room) return;
    controller?.abort(); room = next; const token = ++epoch;
    messages = []; bookmarks = []; complete = false; loading = null; controller = null;
    tab = 'bookmarks'; query = ''; limit = PAGE_SIZE; selected.clear(); draft = null; pendingSelection = null; saving = false; storageError = '';
    $('#csb-select-mode').checked = false; $('#csb-search').value = ''; pick.hidden = true;
    showEditor(null); setOpen(false); render();
    if (!next) return;
    try {
      await writes;
      const raw = await GM_getValue(C.key(next), { version: 1, bookmarks: [] });
      if (!current(next, token)) return;
      if (raw?.version !== 1 || !Array.isArray(raw.bookmarks)) throw new Error('북마크 저장 데이터 형식이 다름.');
      bookmarks = raw.bookmarks; render();
    } catch (_) {
      if (current(next, token)) { storageError = '북마크 저장소를 읽지 못했음. 새로고침 후 다시 시도해줘.'; status(''); }
    }
  }

  // Render inert text only. No fetched HTML, Markdown, or comments are inserted as HTML.
  function plainText(raw) {
    return String(raw || '')
      .replace(/<!--RP_CONTEXT_MANAGER_START[\s\S]*?RP_CONTEXT_MANAGER_END-->/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\[\/\/\]:\s*#.*$/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/^(?:#{1,6}\s+|>\s?)/gm, '')
      .replace(/\*\*|__|~~|`{1,3}/g, '')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  function normalizeMessage(m, index) {
    const ids = C.aliases(m);
    if (!ids.length || typeof m.content !== 'string') throw new Error('일부 대화의 ID 또는 본문 형식을 읽을 수 없음.');
    const text = plainText(m.content);
    return { id: String(m._id || m.id || ids[0]), aliases: ids, role: m.role === 'user' ? 'user' : 'assistant', text,
      createdAt: m.createdAt || '', order: -index };
  }
  function headers() {
    const cookies = Object.fromEntries(document.cookie.split(';').map(item => { const i = item.indexOf('='); return i < 0 ? [item.trim(), ''] : [item.slice(0, i).trim(), item.slice(i + 1)]; }));
    const result = { 'Content-Type': 'application/json', platform: 'web', 'wrtn-locale': 'ko-KR' };
    if (cookies.access_token) result.Authorization = `Bearer ${cookies.access_token}`;
    if (cookies.__w_id) result['x-wrtn-id'] = cookies.__w_id;
    return result;
  }
  async function fetchHistory(force = false) {
    if (loading) return loading;
    if (complete && !force) return messages;
    const id = room, token = epoch;
    if (!id || id !== C.chatId(location.pathname)) throw new Error('채팅방을 다시 확인해줘.');
    const abort = new AbortController(); controller = abort;
    messages = []; complete = false;
    const task = (async () => {
      const seen = new Set(), cursors = new Set(); let cursor = '';
      try {
        do {
          if (!current(id, token)) throw new DOMException('Room changed', 'AbortError');
          const timer = setTimeout(() => abort.abort(), 30000);
          let json;
          try {
            const response = await fetch(`${API}${encodeURIComponent(id)}/messages?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: headers(), credentials: 'include', signal: abort.signal });
            if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '대화 접근이 만료됨. 크랙에 다시 로그인한 뒤 새로고침해줘.' : `대화 불러오기 실패 (HTTP ${response.status})`);
            json = await response.json();
          } finally { clearTimeout(timer); }
          if (!current(id, token) || abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          const page = C.page(json);
          for (const raw of page.messages) {
            const m = normalizeMessage(raw, messages.length);
            if (!seen.has(m.id)) { seen.add(m.id); messages.push(m); }
          }
          cursor = page.cursor;
          if (cursor && cursors.has(cursor)) throw new Error('같은 페이지가 반복되어 중단됨. 전체 불러오기를 다시 시도해줘.');
          if (cursor) cursors.add(cursor);
          renderList(); status(`전체 대화 불러오는 중 · ${messages.length.toLocaleString()}개 메시지`);
        } while (cursor);
        complete = true;
        // API order also handles regenerated replies and timestamps that do not reflect
        // their position in the conversation. Rebase stored ranks on every full refresh.
        const snapshot = messages;
        await mutate(id, list => C.reindex(list, snapshot));
        if (!current(id, token)) throw new DOMException('Room changed', 'AbortError');
        return messages;
      } catch (error) {
        if (current(id, token)) { complete = false; status(`${error.name === 'AbortError' ? '불러오기를 중단했거나 응답 대기 시간이 지났음.' : error.message}\n현재 ${messages.length}개만 검색 가능 · ↻ 버튼으로 다시 시도`); }
        throw error;
      } finally {
        if (current(id, token)) { loading = null; controller = null; controls(); }
      }
    })();
    loading = task; controls();
    try { const result = await task; if (current(id, token)) render(); return result; } catch (error) { throw error; }
  }

  function controls() {
    const editing = !!draft;
    $('#csb-refresh').hidden = tab !== 'history' || !!loading;
    $('#csb-stop').hidden = !loading;
    $('#csb-save').disabled = saving || !!storageError;
    $('#csb-select-mode').disabled = editing || tab !== 'bookmarks' || saving;
    $('#csb-bulk').hidden = editing || tab !== 'bookmarks' || !$('#csb-select-mode').checked;
    $('#csb-delete-selected').disabled = !selected.size || !!storageError;
    $('#csb-delete-selected').textContent = selected.size ? `선택 삭제 (${selected.size})` : '선택 삭제';
    $('#csb-delete-all').disabled = !bookmarks.length || !!storageError;
    $('#csb-search-row').hidden = editing && !loading;
  }
  const filteredBookmarks = () => bookmarks.filter(b => C.matches(`${b.quote}\n${b.comment}`, query, options.caseSensitive)).sort(C.compare);
  function render() {
    $('#csb-bookmarks-tab').setAttribute('aria-selected', String(tab === 'bookmarks'));
    $('#csb-history-tab').setAttribute('aria-selected', String(tab === 'history'));
    $('#csb-search').placeholder = tab === 'bookmarks' ? '북마크·코멘트 찾기' : '이 방 전체 대화 찾기';
    controls(); renderList();
    if (loading) status(`전체 대화 불러오는 중 · ${messages.length.toLocaleString()}개 메시지`);
    else if (draft) status('선택한 문장과 코멘트를 이 방에 저장함.');
    else if (tab === 'bookmarks') status(`${bookmarks.length}개 북마크 · 원문 대화 최신순`);
    else status(`${complete ? '전체 불러오기 완료' : '일부 대화만 불러옴'} · ${messages.length.toLocaleString()}개 메시지${complete ? ' · 새 대화는 ↻로 갱신' : ' · ↻로 다시 불러오기'}`);
  }
  function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  function highlighted(text) {
    const el = node('div', '', 'csb-quote');
    const q = query.trim(); const hay = options.caseSensitive ? text : text.toLocaleLowerCase(); const needle = options.caseSensitive ? q : q.toLocaleLowerCase();
    if (!needle) { el.textContent = text; return el; }
    let from = 0, pos;
    while ((pos = hay.indexOf(needle, from)) >= 0) { el.append(document.createTextNode(text.slice(from, pos)), node('mark', text.slice(pos, pos + q.length))); from = pos + q.length; }
    el.append(document.createTextNode(text.slice(from))); return el;
  }
  function action(label, fn) { const b = node('button', label); b.type = 'button'; b.onclick = fn; return b; }
  function meta(m) {
    const date = m.createdAt ? new Date(m.createdAt) : null;
    return `${m.role === 'user' ? '나' : '상대'}${date && !Number.isNaN(date.valueOf()) ? ` · ${date.toLocaleString('ko-KR')}` : ''}`;
  }
  function snippet(text) {
    const normalized = options.caseSensitive ? text : text.toLocaleLowerCase();
    const q = options.caseSensitive ? query.trim() : query.trim().toLocaleLowerCase();
    const pos = q ? Math.max(0, normalized.indexOf(q)) : 0;
    const start = Math.max(0, pos - 70), end = Math.min(text.length, start + Math.max(280, q.length + 140));
    return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  }
  function renderList() {
    const list = $('#csb-list'); list.replaceChildren(); list.hidden = !!draft;
    if (draft) return;
    const items = tab === 'bookmarks' ? filteredBookmarks() : messages.filter(m => C.matches(m.text, query, options.caseSensitive));
    if (!items.length) { list.append(node('div', query ? '검색 결과가 없음.' : tab === 'bookmarks' ? '남기고 싶은 문장을 드래그하거나\n길게 선택한 뒤 🔖 북마크를 눌러줘.' : loading ? '과거 대화를 불러오는 중…' : '불러온 대화가 없음.', 'csb-empty')); return; }
    list.append(node('div', `${items.length.toLocaleString()}개 결과`, 'csb-muted'));
    for (const item of items.slice(0, limit)) {
      const card = node('article', '', 'csb-card'), body = node('div', '', 'csb-body');
      if (tab === 'bookmarks' && $('#csb-select-mode').checked) {
        const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(item.id); checkbox.setAttribute('aria-label', `${item.quote.slice(0, 35)} 선택`);
        checkbox.onchange = () => { checkbox.checked ? selected.add(item.id) : selected.delete(item.id); controls(); }; card.append(checkbox);
      }
      body.append(node('div', meta(item), 'csb-muted'), highlighted(tab === 'bookmarks' ? item.quote : snippet(item.text)));
      const actions = node('div', '', 'csb-actions');
      if (tab === 'bookmarks') {
        if (item.comment) { const note = highlighted(item.comment); note.className = 'csb-note'; body.append(note); }
        actions.append(action('코멘트 수정', () => showEditor({ ...item, existingId: item.id, room })), action('원문 보기', () => revealSource(item)));
      } else {
        const details = node('details'), full = node('div', item.text, 'csb-full'); full.dataset.csbSource = item.id;
        details.append(node('summary', '원문 펼치기 · 문장을 선택해 북마크'), full); body.append(details);
        actions.append(action('대화 전체 북마크', () => showEditor({ room, messageId: item.id, quote: item.text, offset: 0 })));
      }
      body.append(actions); card.append(body); list.append(card);
    }
    if (items.length > limit) list.append(action('더 보기', () => { const top = list.scrollTop; limit += PAGE_SIZE; renderList(); list.scrollTop = top; }));
  }
  async function revealSource(bookmark) {
    const id = room, token = epoch;
    try {
      await fetchHistory(); if (!current(id, token)) return;
      const source = messages.find(m => m.id === bookmark.messageId);
      if (!source) { toast('현재 대화에서 원문을 찾지 못했음. 저장한 북마크는 그대로 보관됨.'); return; }
      tab = 'history'; query = ''; $('#csb-search').value = ''; showEditor(null); render();
      const list = $('#csb-list'); list.replaceChildren();
      const full = node('div', source.text, 'csb-full'); full.dataset.csbSource = source.id;
      list.append(action('검색 목록으로', render), node('div', meta(source), 'csb-muted'), full);
      status('원문 전체 · 문장을 선택해 추가 북마크 가능');
    } catch (_) { /* fetchHistory shows the actionable error */ }
  }

  function showEditor(value) {
    draft = value; $('#csb-editor').hidden = !value; $('#csb-list').hidden = !!value;
    if (value) {
      setOpen(true); $('#csb-editor-quote').textContent = value.quote;
      $('#csb-comment').value = value.comment || ''; $('#csb-editor-meta').textContent = value.existingId ? '북마크 코멘트 수정' : '새 북마크';
    }
    render();
  }
  async function saveDraft() {
    if (!draft || saving || storageError) return;
    const captured = { ...draft, comment: $('#csb-comment').value }, id = captured.room, token = epoch;
    if (!current(id, token)) { toast('채팅방이 바뀌었음. 문장을 다시 선택해줘.'); return; }
    saving = true; controls();
    try {
      let entry;
      if (captured.existingId) {
        await mutate(id, list => list.map(b => b.id === captured.existingId ? { ...b, comment: captured.comment } : b));
      } else {
        await fetchHistory(); if (!current(id, token)) return;
        let source = C.resolve(captured, messages);
        if (!source) { await fetchHistory(true); if (!current(id, token)) return; source = C.resolve(captured, messages); }
        if (!source) throw new Error('같은 문장이 여러 대화에 있거나 원문이 변경됨. 전체 대화 검색에서 해당 원문을 펼쳐 문장을 다시 선택해줘.');
        const offset = captured.offset != null ? captured.offset : Math.max(0, C.compact(source.text).indexOf(C.compact(captured.quote)));
        entry = { id: crypto.randomUUID(), messageId: source.id, quote: captured.quote, comment: captured.comment, offset,
          order: source.order, role: source.role, createdAt: source.createdAt };
        await mutate(id, list => {
          if (list.some(b => b.messageId === entry.messageId && b.offset === entry.offset && C.compact(b.quote) === C.compact(entry.quote))) throw new Error('이미 북마크한 문장임. 기존 북마크에서 코멘트를 수정할 수 있음.');
          return [...list, entry];
        });
      }
      if (current(id, token)) { tab = 'bookmarks'; query = ''; $('#csb-search').value = ''; showEditor(null); toast('북마크 저장됨'); }
    } catch (error) {
      if (current(id, token)) { status(error.message || '저장하지 못했음.'); toast(error.message || '저장하지 못했음.'); }
    } finally { if (current(id, token)) { saving = false; controls(); } }
  }

  async function deleteBookmarks(all) {
    const id = room, token = epoch, ids = new Set(all ? bookmarks.map(b => b.id) : selected);
    if (!ids.size || !current(id, token)) return;
    const question = all ? `이 방의 북마크 ${ids.size}개와 코멘트를 모두 삭제할까?\n검색어와 관계없이 이 방 전체에 적용됨.` : `선택한 북마크 ${ids.size}개와 코멘트를 삭제할까?`;
    if (!window.confirm(question)) return;
    try { await mutate(id, list => list.filter(b => !ids.has(b.id))); if (current(id, token)) { selected.clear(); render(); toast('북마크 삭제됨'); } }
    catch (_) { if (current(id, token)) toast('삭제를 저장하지 못했음. 다시 시도해줘.'); }
  }

  function selectionDraft() {
    if (!room || !options.selectionButton || room !== C.chatId(location.pathname)) return null;
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0), element = n => n.nodeType === 1 ? n : n.parentElement;
    const start = element(range.startContainer), end = element(range.endContainer);
    if (!start || !end || start.closest('textarea,input,[contenteditable=true]') || end.closest('textarea,input,[contenteditable=true]')) return null;
    const sourceEl = start.closest('[data-csb-source]');
    const group = sourceEl || start.closest(GROUP);
    if (!group || !group.contains(end) || (!sourceEl && panel.contains(start))) return null;
    const quote = sel.toString().trim(); if (!quote) return null;
    const aliases = [];
    if (!sourceEl) {
      let el = start;
      while (el) { for (const attr of ['data-message-id', 'data-message-group-id', 'data-turn-id']) { const value = el.getAttribute(attr); if (value) aliases.push(value); } if (el === group) break; el = el.parentElement; }
    }
    const content = sourceEl || group.querySelector('.wrtn-markdown') || group.querySelector('[class*="break-all"]') || group;
    const prefix = range.cloneRange(); prefix.selectNodeContents(content);
    let offset = null;
    if (content.contains(range.startContainer)) {
      prefix.setEnd(range.startContainer, range.startOffset);
      offset = C.compact(prefix.toString()).length;
    }
    const wrap = group.querySelector(':scope > div');
    return { room, quote, aliases, offset, fullText: content.innerText || content.textContent || '', messageId: sourceEl?.dataset.csbSource || '',
      role: sourceEl ? '' : wrap?.classList.contains('items-end') ? 'user' : '', rect: range.getBoundingClientRect() };
  }
  function updateSelection() {
    const value = selectionDraft();
    if (!value) { pick.hidden = true; pendingSelection = null; return; }
    pendingSelection = value; pick.hidden = false;
    const r = value.rect, width = pick.offsetWidth || 112;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const right = left + (viewport?.width || innerWidth), bottom = top + (viewport?.height || innerHeight);
    pick.style.left = `${Math.max(left + 8, Math.min(right - width - 8, r.left + r.width / 2 - width / 2))}px`;
    pick.style.top = `${Math.max(top + 8, Math.min(bottom - 48, r.bottom + 10))}px`;
  }
  let selectionTimer;
  document.addEventListener('selectionchange', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(updateSelection, 180); });
  document.addEventListener('pointerup', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(updateSelection, 80); });
  pick.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
  pick.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const value = pendingSelection;
    if (!value || value.room !== room || value.room !== C.chatId(location.pathname)) return;
    pick.hidden = true; pendingSelection = null; window.getSelection()?.removeAllRanges(); showEditor(value);
  });

  function setOpen(value) { open = value && !!room; panel.hidden = !open; toolbar.setAttribute('aria-expanded', String(open)); if (!open) pick.hidden = true; }
  toolbar.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); void syncRoom().then(() => { setOpen(!open); render(); }); });
  toolbar.addEventListener('mousedown', e => e.stopPropagation());
  $('#csb-close').onclick = () => setOpen(false);
  $('#csb-settings-toggle').onclick = () => { const hidden = !$('#csb-settings').hidden; $('#csb-settings').hidden = hidden; $('#csb-settings-toggle').setAttribute('aria-expanded', String(!hidden)); };
  async function switchTab(next) {
    if (saving) return;
    if (draft && $('#csb-comment').value !== (draft.comment || '') && !window.confirm('작성 중인 코멘트를 닫고 이동할까?')) return;
    tab = next; query = ''; limit = PAGE_SIZE; $('#csb-search').value = ''; selected.clear(); showEditor(null);
    if (next === 'history' && !complete) { try { await fetchHistory(); } catch (_) {} }
  }
  $('#csb-bookmarks-tab').onclick = () => switchTab('bookmarks');
  $('#csb-history-tab').onclick = () => switchTab('history');
  $('#csb-select-mode').onchange = () => { selected.clear(); render(); };
  let searchTimer;
  $('#csb-search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { query = $('#csb-search').value; limit = PAGE_SIZE; selected.clear(); render(); }, 100); };
  $('#csb-refresh').onclick = () => { void fetchHistory(true).catch(() => {}); };
  $('#csb-stop').onclick = () => controller?.abort();
  $('#csb-select-all').onclick = () => { const items = filteredBookmarks(); const all = items.length && items.every(b => selected.has(b.id)); selected = new Set(all ? [] : items.map(b => b.id)); render(); };
  $('#csb-delete-selected').onclick = () => deleteBookmarks(false);
  $('#csb-delete-all').onclick = () => deleteBookmarks(true);
  $('#csb-save').onclick = saveDraft;
  $('#csb-cancel').onclick = () => { if (!saving) showEditor(null); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } });
  async function saveOptions() {
    const next = { caseSensitive: $('#csb-case').checked, selectionButton: $('#csb-selection').checked };
    try { await GM_setValue(SETTINGS_KEY, next); options = next; if (!options.selectionButton) pick.hidden = true; render(); }
    catch (_) { $('#csb-case').checked = options.caseSensitive; $('#csb-selection').checked = options.selectionButton; toast('설정을 저장하지 못했음.'); }
  }
  $('#csb-case').onchange = saveOptions; $('#csb-selection').onchange = saveOptions;

  function isVisible(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }
  function findChatInput() {
    return [...document.querySelectorAll('textarea,input[type=text],[contenteditable=true],div[role=textbox]')]
      .filter(el => !panel.contains(el) && !el.closest(GROUP) && isVisible(el) && el.getBoundingClientRect().bottom > innerHeight * .45)
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  }
  function findToolbarNearInput(input) {
    if (!input) return null;
    const inputRect = input.getBoundingClientRect(); let root = input;
    for (let depth = 0; depth < 8 && root.parentElement; depth++) {
      root = root.parentElement;
      const exact = root.querySelector('.flex.items-center.space-x-2'); if (isVisible(exact)) return exact;
      const rows = [...root.querySelectorAll('div,section,footer')].filter(el => {
        if (!isVisible(el) || panel.contains(el)) return false;
        const r = el.getBoundingClientRect(), buttons = [...el.querySelectorAll('button')].filter(isVisible);
        return r.height <= 80 && r.width >= 40 && Math.abs(r.bottom - inputRect.bottom) <= 160 && buttons.length && (/flex|items-center|gap|space-x/.test(String(el.className)) || buttons.length > 1);
      });
      rows.sort((a, b) => Math.abs(a.getBoundingClientRect().bottom - inputRect.bottom) - Math.abs(b.getBoundingClientRect().bottom - inputRect.bottom));
      if (rows.length) return rows[0];
    }
    return null;
  }
  function injectToolbar() {
    if (!C.chatId(location.pathname)) { toolbar.remove(); return; }
    if (toolbar.isConnected && isVisible(toolbar.parentElement)) return;
    const reference = ['cdt-toolbar-btn', 'custom-rp-tools'].map(id => document.getElementById(id)).find(el => isVisible(el?.parentElement))
      || [...document.querySelectorAll('button')].find(el => isVisible(el) && !panel.contains(el) && (el.textContent || '').includes('추천답변'));
    const container = reference?.parentElement || findToolbarNearInput(findChatInput());
    if (!container || panel.contains(container)) return;
    if (reference) container.insertBefore(toolbar, reference.nextSibling); else container.append(toolbar);
  }
  // SPA navigation and toolbar remounts. A room change invalidates every pending task.
  let scheduled = false;
  function tick() { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; void syncRoom(); injectToolbar(); }, 100); }
  new MutationObserver(records => { if (records.some(r => !panel.contains(r.target) && r.target !== toastEl && r.target !== pick)) tick(); }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', tick); setInterval(tick, 1000);
  window.addEventListener('resize', () => { if (!pick.hidden) updateSelection(); });
  void (async () => {
    try { const value = await GM_getValue(SETTINGS_KEY, options); options = { caseSensitive: !!value.caseSensitive, selectionButton: value.selectionButton !== false }; } catch (_) {}
    $('#csb-case').checked = options.caseSensitive; $('#csb-selection').checked = options.selectionButton;
    await syncRoom(); injectToolbar();
  })();
})();
