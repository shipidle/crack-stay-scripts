// ==UserScript==
// @name         🔁 채팅 이름 일괄 치환
// @namespace    https://github.com/shipidle/crack-stay-scripts/name-replacer
// @version      0.2.0
// @description  🧪 BETA · 전체 대화 서버 원문 일괄 치환(1건 시험·백업·개별 검증·중단), 화면 치환, 요약 메모리 확인.
// @match        https://crack.wrtn.ai/*
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Chat_Name_Replacer.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Chat_Name_Replacer.user.js
// ==/UserScript==

(() => {
  'use strict';
  const API = 'https://crack-api.wrtn.ai/crack-gen/v3/chats/';
  const GROUP = '[data-message-group-id],[data-message-id],[data-turn-id]';
  const DEFAULT = { from: '시류', to: '유우', active: false };
  const nodeSources = new WeakMap();
  let room = '', settings = { ...DEFAULT }, data = [], complete = false, busy = false;
  let controller = null, scheduled = false, button, panel, status, results, count;
  let backupRequested = false, probePassed = false, writing = false, haltWrites = false;
  let changedCount = 0, alreadyDone = 0;

  function getRoom(path) {
    for (const re of [/\/stories\/[^/]+\/episodes\/([^/?#]+)/,
      /\/characters\/[^/]+\/chats\/([^/?#]+)/, /\/u\/[^/]+\/c\/([^/?#]+)/]) {
      const m = path.match(re); if (m) return m[1];
    }
    return '';
  }
  const key = id => 'shipidle:name-replacer:v1:' + encodeURIComponent(id);
  const hits = (text, needle) => needle ? String(text).split(needle).length - 1 : 0;
  const allowed = () => !!settings.from.trim() && settings.from !== settings.to;
  const tell = message => { if (status) status.textContent = message; };

  function loadSettings(id) {
    try {
      const s = GM_getValue(key(id), null);
      if (s && typeof s === 'object') return {
        from: typeof s.from === 'string' ? s.from : DEFAULT.from,
        to: typeof s.to === 'string' ? s.to : DEFAULT.to, active: s.active === true
      };
    } catch (_) { /* unavailable on some userscript managers */ }
    return { ...DEFAULT };
  }
  function persist() {
    try { GM_setValue(key(room), { ...settings }); }
    catch (_) { tell('설정을 저장하지 못했음. 새로고침하면 풀릴 수 있음.'); }
  }

  function processNode(node) {
    const el = node.parentElement;
    if (!el || el.closest('#scnr-panel,#scnr-button,button,a,textarea,input,select,' +
        '[contenteditable="true"],[role="textbox"],script,style,svg')) return;
    const current = node.nodeValue || '';
    const old = nodeSources.get(node);
    let original = old ? old.original : current;
    if (old && current !== old.original && current !== old.converted) original = current;
    const converted = settings.active && allowed() ? original.replaceAll(settings.from, settings.to) : original;
    if (current !== converted) node.nodeValue = converted;
    if (converted !== original) nodeSources.set(node, { original, converted });
    else nodeSources.delete(node);
  }
  function paint() {
    const groups = [...document.querySelectorAll(GROUP)]
      .filter(el => !el.parentElement?.closest(GROUP));
    for (const group of groups) {
      const textAreas = [...group.querySelectorAll('.wrtn-markdown,[class*="break-all"],[data-message-content]')]
        .filter(el => !el.parentElement?.closest('.wrtn-markdown,[class*="break-all"],[data-message-content]'));
      for (const scope of textAreas.length ? textAreas : [group]) {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        let node; while ((node = walker.nextNode())) processNode(node);
      }
    }
    if (button) button.classList.toggle('scnr-on', settings.active);
  }
  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      updateRoom();
      if (room) paint();
    });
  }

  function resetData() {
    data = []; complete = false; backupRequested = false; probePassed = false;
    changedCount = 0; alreadyDone = 0;
    if (results) results.replaceChildren();
    if (count) count.textContent = '아직 검색하지 않음';
    controls();
  }
  function updateRoom() {
    const id = getRoom(location.pathname);
    if (id === room) { if (button) button.hidden = !id; return; }
    if (room && settings.active) {
      settings.active = false;
      paint(); // Restore visible nodes before switching to another room.
    }
    if (controller) controller.abort();
    haltWrites = true;
    controller = null; busy = false;
    room = id; settings = id ? loadSettings(id) : { ...DEFAULT };
    resetData();
    if (button) button.hidden = !id;
    if (panel) panel.hidden = true;
    if (id) { fill(); tell('현재 채팅방의 기록만 검색함.'); }
  }
  function headers() {
    const cookies = Object.fromEntries(document.cookie.split(';').map(part => {
      const i = part.indexOf('=');
      return i === -1 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1)];
    }));
    const h = { 'Content-Type': 'application/json', platform: 'web', 'wrtn-locale': 'ko-KR' };
    if (cookies.access_token) h.Authorization = 'Bearer ' + cookies.access_token;
    if (cookies.__w_id) h['x-wrtn-id'] = cookies.__w_id;
    return h;
  }
  function parse(json) {
    const body = json?.data || json;
    if (!Array.isArray(body?.messages)) throw new Error('API 응답 형식이 달라 전체 조회를 중지함.');
    const cursor = String(body.nextCursor || json.nextCursor || '');
    if (body.hasNext === true && (!cursor || !body.messages.length))
      throw new Error('과거 대화의 다음 페이지 정보가 없음.');
    return { messages: body.messages, cursor: body.hasNext === false ? '' : cursor };
  }
  async function scan() {
    if (!room || busy || writing || !allowed()) return;
    const id = room, aborter = new AbortController();
    controller = aborter; busy = true;
    resetData(); controls();
    let cursor = '';
    const ids = new Set(), cursors = new Set();
    try {
      for (let pageNo = 0; pageNo < 400; pageNo++) {
        if (id !== room || aborter.signal.aborted) throw new Error('검색이 중단됨.');
        const url = API + encodeURIComponent(id) + '/messages?limit=50' +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
        const timeout = setTimeout(() => aborter.abort(), 30000);
        let response;
        try {
          response = await fetch(url, { method: 'GET', headers: headers(),
            credentials: 'include', signal: aborter.signal });
        } finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? '로그인이 만료됨. 다시 로그인하고 새로고침해줘.'
          : '대화 조회 실패 (HTTP ' + response.status + ')');
        const page = parse(await response.json());
        for (const m of page.messages) {
          const idValue = m._id || m.id;
          if (idValue == null || typeof m.content !== 'string')
            throw new Error('메시지의 ID/본문을 확인할 수 없어 백업을 중단함.');
          if (ids.has(String(idValue))) continue;
          ids.add(String(idValue));
          data.push({ id: String(idValue), role: m.role || '',
            createdAt: m.createdAt || '', content: m.content,
            status: m.status || '', isPrologue: m.isPrologue === true });
        }
        tell('전체 기록 검색 중: ' + data.length.toLocaleString() + '개');
        cursor = page.cursor;
        if (!cursor) {
          if (id !== room || aborter.signal.aborted) throw new Error('검색이 중단됨.');
          complete = true; displayResults(); return;
        }
        if (cursors.has(cursor)) throw new Error('페이지가 반복되어 검색을 중지함.');
        cursors.add(cursor);
      }
      throw new Error('최대 페이지 수를 초과하여 전체 조회를 완료하지 못함.');
    } catch (err) {
      complete = false;
      tell(err.name === 'AbortError' ? '검색이 중단됨. 내보내려면 다시 검색해야 함.' : err.message);
    } finally {
      if (controller === aborter) controller = null;
      if (id === room) busy = false;
      controls();
    }
  }
  function snippet(content) {
    const i = content.indexOf(settings.from);
    if (i === -1) return content.slice(0, 145);
    return (i > 45 ? '…' : '') + content.slice(Math.max(0, i - 45), i + settings.from.length + 85) +
      (i + settings.from.length + 85 < content.length ? '…' : '');
  }
  function displayResults() {
    if (!complete) return;
    let matched = 0, total = 0;
    const sample = [];
    for (const m of data) {
      const n = hits(m.content, settings.from);
      if (!n) continue;
      matched++; total += n;
      if (sample.length < 8) sample.push([m, n]);
    }
    count.textContent = data.length.toLocaleString() + '개 메시지 중 ' +
      matched.toLocaleString() + '개에서 ' + total.toLocaleString() + '회 발견';
    results.replaceChildren();
    for (const [m, n] of sample) {
      const el = document.createElement('div');
      el.className = 'scnr-result';
      const head = document.createElement('strong');
      head.textContent = (m.role === 'user' ? '나' : 'AI') + ' · ' + n + '회';
      const before = document.createElement('p'), after = document.createElement('p');
      before.textContent = '전: ' + snippet(m.content);
      after.textContent = '후: ' + snippet(m.content).replaceAll(settings.from, settings.to);
      el.append(head, before, after); results.append(el);
    }
    if (!sample.length) {
      const el = document.createElement('p');
      el.textContent = '일치하는 메시지가 없음.';
      results.append(el);
    }
    tell('전체 검색 완료. 실제 서버 대화에는 아무것도 쓰지 않았음.');
    controls();
  }
  function exportJSON(replaced) {
    if (!complete || !room) return tell('전체 기록 검색 완료 후에만 내보내기 가능함.');
    const output = {
      format: 'shipidle-crack-name-replacer/v1', roomId: room,
      exportedAt: new Date().toISOString(),
      mode: replaced ? 'offline-replaced-copy' : 'original-backup',
      find: settings.from, replace: settings.to, serverModified: false,
      messages: data.map(m => ({ ...m, content: replaced
        ? m.content.replaceAll(settings.from, settings.to) : m.content }))
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'crack-' + room.replace(/[^a-z0-9_-]/gi, '_') + '-' +
      (replaced ? 'replaced' : 'backup') + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (!replaced) backupRequested = true;
    controls();
    tell((replaced ? '치환본' : '원본 백업') + ' 다운로드를 요청했음. 파일 앱에서 실제 저장 여부를 확인해줘.');
  }

  // All writes are opt-in. The route and {message: text} body are based on
  // CRACK-INJECTION-REFINER; this script additionally reads back each edit.
  function route(messageId = '') {
    const base = API + encodeURIComponent(room);
    return base + '/messages' + (messageId ? '/' + encodeURIComponent(messageId) : '');
  }
  async function request(method, url, body) {
    const response = await fetch(url, {
      method, headers: headers(), credentials: 'include', cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { /* reject malformed writes */ }
    if (!response.ok) throw new Error('서버 요청 실패 HTTP ' + response.status + (raw ? ' · ' + raw.slice(0, 120) : ''));
    if (parsed && parsed.result && parsed.result !== 'SUCCESS' && parsed.result !== 'success')
      throw new Error('서버가 요청을 승인하지 않았음: ' + String(parsed.result));
    if (method !== 'GET' && !parsed) throw new Error('쓰기 응답을 확인할 수 없어 작업 중단. 재조회가 필요함.');
    return parsed;
  }
  async function readOne(item) {
    const response = await request('GET', route(item.id));
    const m = response?.data ?? response;
    if (!m || String(m._id || m.id) !== item.id || typeof m.content !== 'string')
      throw new Error('메시지 ID 또는 원문 재조회 실패: ' + item.id);
    if (m.role !== item.role) throw new Error('메시지 역할이 달라 수정 중단: ' + item.id);
    if (m.deletedAt) throw new Error('삭제된 메시지여서 중단: ' + item.id);
    if (/generat|stream|pending|writing|in.progress/i.test(String(m.status || '')))
      throw new Error('생성 중인 메시지여서 중단: ' + item.id);
    return m.content;
  }
  function candidates() {
    return data.filter(m => ['assistant', 'user'].includes(m.role)
      && !m.isPrologue && !/generat|stream|pending|writing|in.progress/i.test(m.status)
      && hits(m.content, settings.from) > 0);
  }
  async function auditHistory() {
    const originalIds = data.map(m => m.id);
    const current = [], seen = new Set(), cursors = new Set();
    let cursor = '';
    for (let page = 0; page < 400; page++) {
      if (haltWrites || getRoom(location.pathname) !== room) throw new Error('방 변경 또는 중단으로 검증 실패.');
      const json = await request('GET', route() + '?limit=50' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      const parsed = parse(json);
      for (const m of parsed.messages) {
        const id = String(m._id || m.id || '');
        if (!id) throw new Error('메시지 ID가 비어 있어 검증 실패.');
        if (!seen.has(id)) { seen.add(id); current.push(id); }
      }
      cursor = parsed.cursor;
      if (!cursor) {
        if (current.length !== originalIds.length || current.some((id, i) => id !== originalIds[i]))
          throw new Error('수정 후 전체 대화의 개수 또는 순서가 달라짐. 즉시 중단했음.');
        return;
      }
      if (cursors.has(cursor)) throw new Error('검증 중 페이지 커서 반복. 작업 중단.');
      cursors.add(cursor);
    }
    throw new Error('검증 조회 최대 페이지 초과. 작업 중단.');
  }
  async function updateOne(item) {
    const original = item.content, desired = original.replaceAll(settings.from, settings.to);
    const now = await readOne(item);
    if (now === desired) { alreadyDone++; return false; }
    if (now !== original) throw new Error('원문이 조회 당시와 달라 작업 중지: ' + item.id);
    const patched = await request('PATCH', route(item.id), { message: desired });
    const returned = patched?.data;
    if (returned && (returned._id || returned.id) && String(returned._id || returned.id) !== item.id)
      throw new Error('서버가 다른 메시지 ID를 반환함. 작업 중단: ' + item.id);
    const after = await readOne(item);
    if (after !== desired) throw new Error('서버 저장 결과가 기대와 다름. 작업 중단: ' + item.id);
    changedCount++; return true;
  }
  function readiness() {
    if (!room || !complete || busy || writing) return '먼저 현재 방의 전체 기록 검색을 완료해줘.';
    if (!allowed()) return '치환 대상과 변경 문자를 확인해줘.';
    if (!backupRequested) return '먼저 원본 백업 JSON을 다운로드해줘.';
    if (!candidates().length) return '수정할 대화 본문이 없음.';
    return '';
  }
  async function serverTest() {
    const error = readiness();
    if (error) return tell(error);
    if (!confirm('원본 JSON 파일을 실제로 저장했어?\n\n가장 최근 일치 메시지 1개를 서버에서 직접 수정한 뒤, 전체 대화가 보존됐는지 확인함. 수정을 진행할까?')) return;
    const id = room, first = candidates()[0];
    writing = true; haltWrites = false; changedCount = 0; alreadyDone = 0;
    controls();
    try {
      tell('서버 시험 수정: 메시지 1건 확인 중...');
      await updateOne(first);
      tell('시험 수정 후 전체 메시지 유지 여부를 점검 중...');
      await auditHistory();
      if (id !== room) throw new Error('채팅방이 변경됨.');
      probePassed = true;
      tell('시험 수정 및 서버 재조회 성공. 전체 대화 ID/순서 유지 확인. 이제 전체 서버 수정 실행 가능.');
    } catch (err) {
      probePassed = false;
      tell('시험 단계 중단: ' + err.message + '\n이전에 수정한 메시지가 있다면 원본 백업을 보관해줘.');
    } finally {
      writing = false; controls();
    }
  }
  async function serverBulk() {
    const error = readiness();
    if (error) return tell(error);
    if (!probePassed) return tell('먼저 서버 1건 시험 수정과 전체 대화 유지 검사를 통과해야 함.');
    const items = candidates();
    if (!confirm('주의: 이 방의 ' + items.length + '개 메시지 중 이름을 포함한 내용을 실제 서버에서 순차 수정함.\n\n원본 JSON 백업이 저장됐는지 확인했어? 실행 후 원래대로 자동 복구되지 않음.')) return;
    const id = room;
    writing = true; haltWrites = false;
    controls();
    let progressed = 0;
    try {
      for (const item of items) {
        if (haltWrites || getRoom(location.pathname) !== room || id !== room)
          throw new Error('중단 요청 또는 채팅방 변경');
        await updateOne(item);
        progressed++;
        tell('서버 수정 진행: ' + progressed + '/' + items.length +
          '건 검사 · 실제 수정 ' + changedCount + '건 · 이미 완료 ' + alreadyDone + '건');
        if (progressed % 10 === 0) {
          await auditHistory();
        }
      }
      tell('서버 메시지 수정 완료. 전체 기록 보존 최종 검증 중...');
      await auditHistory();
      tell('서버 전체 수정 및 메시지별 재조회 완료. ' + changedCount +
        '건 수정, ' + alreadyDone + '건 기존 수정 확인.\n화면을 새로고침해 반영해줘. 요약 메모리는 별도 확인 필요.');
      probePassed = false;
    } catch (err) {
      probePassed = false;
      tell('일괄 수정 중단: ' + err.message + '\n이번 시도 수정 ' + changedCount +
        '건 · 이미 완료 ' + alreadyDone + '건. 다시 전체 조회 후 재개할 수 있음.');
    } finally {
      writing = false; controls();
    }
  }
  async function inspectMemory() {
    if (busy || writing || !room || !allowed()) return;
    busy = true; controls();
    const match = {};
    try {
      for (const type of ['longTerm', 'shortTerm', 'relationship', 'goal']) {
        let cursor = '', items = [], prev = new Set();
        for (let i = 0; i < 100; i++) {
          const params = new URLSearchParams({ limit: '20', type, orderBy: 'oldest', filter: 'all' });
          if (cursor) params.set('cursor', cursor);
          const json = await request('GET', API + encodeURIComponent(room) + '/summaries?' + params);
          const body = json?.data || {};
          const page = Array.isArray(body.summaries) ? body.summaries : [];
          items.push(...page);
          const next = String(body.nextCursor || '');
          if (!next) break;
          if (!page.length || prev.has(next)) throw new Error(type + ' 요약 페이지를 끝까지 조회하지 못함.');
          prev.add(next); cursor = next;
        }
        match[type] = items.filter(m => hits(String(m.title || '') + '\n' + String(m.summary || ''), settings.from)).length;
      }
      tell('요약 메모리 내 해당 이름 포함 항목\n' +
        '장기 ' + match.longTerm + ' · 단기 ' + match.shortTerm +
        ' · 관계 ' + match.relationship + ' · 목표 ' + match.goal +
        '\n요약 메모리는 서버 대화와 별도 저장됨. 이 버전은 자동 수정하지 않음.');
    } catch (err) { tell('요약 메모리 조회 실패: ' + err.message); }
    finally { busy = false; controls(); }
  }

  function fill() {
    if (!panel) return;
    panel.querySelector('#scnr-from').value = settings.from;
    panel.querySelector('#scnr-to').value = settings.to;
    panel.querySelector('#scnr-view').checked = settings.active;
    controls();
  }
  function controls() {
    if (!panel) return;
    panel.querySelector('#scnr-scan').disabled = busy || writing || !room || !allowed();
    panel.querySelector('#scnr-probe').disabled = !complete || busy || writing || !backupRequested;
    panel.querySelector('#scnr-bulk').disabled = !probePassed || !complete || busy || writing;
    panel.querySelector('#scnr-summary').disabled = busy || writing || !room;
    panel.querySelector('#scnr-stop').disabled = !busy && !writing;
    panel.querySelector('#scnr-backup').disabled = !complete || busy;
    panel.querySelector('#scnr-copy').disabled = !complete || busy;
    panel.querySelector('#scnr-view').disabled = !room || writing;
    if (button) button.classList.toggle('scnr-on', settings.active);
  }
  function apply() {
    if (writing || busy) return tell('작업 중에는 치환 단어를 변경할 수 없음.');
    const from = panel.querySelector('#scnr-from').value;
    const to = panel.querySelector('#scnr-to').value;
    if (!from.trim() || from === to) {
      panel.querySelector('#scnr-view').checked = settings.active;
      return tell('찾을 문자를 입력하고 서로 다른 문자열로 설정해줘.');
    }
    const changed = settings.from !== from || settings.to !== to;
    if (changed && settings.active) {
      settings.active = false; paint(); // Undo previous replacement before new pattern.
    }
    settings = { from, to, active: panel.querySelector('#scnr-view').checked };
    persist();
    if (changed) resetData();
    paint();
    tell(settings.active
      ? '현재 방 화면에서만 치환 중. 서버 원문 및 AI 문맥에는 적용되지 않음.'
      : '설정 저장됨. 화면 치환은 꺼져 있음.');
    controls();
  }
  function mount() {
    if (document.getElementById('scnr-button')) return;
    const style = document.createElement('style');
    style.textContent =
      '#scnr-button{position:fixed;right:12px;bottom:145px;z-index:2147483510;width:36px;height:36px;' +
      'border:1px solid #dadce0;border-radius:10px;background:#f2f2f4;color:#43464b;font-size:18px;' +
      'display:grid;place-items:center;box-shadow:0 3px 10px #0002;touch-action:manipulation}' +
      '#scnr-button.scnr-on{background:#d7f2df;border-color:#86cba0;color:#156b34}' +
      '#scnr-button[hidden],#scnr-panel[hidden]{display:none!important}' +
      '#scnr-panel{position:fixed;right:12px;bottom:190px;z-index:2147483511;box-sizing:border-box;' +
      'width:min(370px,calc(100vw - 24px));max-height:75dvh;overflow:auto;background:#fff;' +
      'color:#292b30;border:1px solid #dddfe3;border-radius:16px;padding:15px;' +
      'box-shadow:0 14px 40px #0003;font:13px/1.5 Pretendard,-apple-system,BlinkMacSystemFont,sans-serif;' +
      'color-scheme:light}#scnr-panel *{box-sizing:border-box}' +
      '#scnr-panel .scnr-head{display:flex;align-items:center;justify-content:space-between}' +
      '#scnr-panel h2{margin:0 0 8px;font-size:15px}' +
      '#scnr-panel button{font:inherit;border:1px solid #dddfe3;border-radius:8px;padding:7px 10px;' +
      'background:#f5f5f6;color:#30333a;touch-action:manipulation}' +
      '#scnr-panel button:disabled{opacity:.45}' +
      '#scnr-panel label{display:block;font-size:12px;font-weight:650;margin:8px 0 4px}' +
      '#scnr-panel input[type=text]{width:100%;font-size:16px;padding:8px 10px;border:1px solid #dddfe3;' +
      'border-radius:9px;background:#fff;color:#333}' +
      '#scnr-panel input[type=checkbox]{width:17px;height:17px;accent-color:#2b8650}' +
      '#scnr-panel .scnr-switch{display:flex;align-items:center;gap:8px;margin:9px 0}' +
      '#scnr-panel .scnr-switch label{margin:0}' +
      '#scnr-panel .scnr-actions{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}' +
      '#scnr-panel .scnr-note{font-size:11px;color:#707680;white-space:pre-wrap}' +
      '#scnr-panel #scnr-count{font-weight:700}' +
      '#scnr-panel #scnr-results{max-height:190px;overflow:auto}' +
      '#scnr-panel .scnr-result{background:#f6f6f7;margin:7px 0;padding:9px;border-radius:9px}' +
      '#scnr-panel .scnr-result p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;margin:5px 0}';
    document.head.append(style);
    button = document.createElement('button');
    button.id = 'scnr-button'; button.type = 'button';
    button.setAttribute('aria-label', '채팅 이름 일괄 치환');
    button.title = '채팅 이름 일괄 치환';
    button.textContent = '🔁';
    panel = document.createElement('section');
    panel.id = 'scnr-panel'; panel.hidden = true;
    panel.innerHTML =
      '<div class="scnr-head"><h2>🔁 채팅 이름 일괄 치환</h2><button id="scnr-close" type="button">×</button></div>' +
      '<label for="scnr-from">찾을 이름</label><input id="scnr-from" type="text" autocomplete="off">' +
      '<label for="scnr-to">바꿀 이름</label><input id="scnr-to" type="text" autocomplete="off">' +
      '<div class="scnr-switch"><input id="scnr-view" type="checkbox"><label for="scnr-view">현재 방 화면에서 치환</label></div>' +
      '<div class="scnr-actions"><button id="scnr-apply" type="button">설정 적용</button>' +
      '<button id="scnr-scan" type="button">전체 기록 검색</button>' +
      '<button id="scnr-stop" type="button">중단</button></div>' +
      '<p id="scnr-count">아직 검색하지 않음</p><div id="scnr-results"></div>' +
      '<div class="scnr-actions"><button id="scnr-backup" type="button">원본 백업 JSON</button>' +
      '<button id="scnr-copy" type="button">치환본 JSON</button></div>' +
      '<div class="scnr-actions"><button id="scnr-probe" type="button">서버 1건 시험 수정</button>' +
      '<button id="scnr-bulk" type="button">전체 서버 원문 수정</button></div>' +
      '<div class="scnr-actions"><button id="scnr-summary" type="button">요약 메모리 이름 검사</button></div>' +
      '<p id="scnr-status" class="scnr-note" role="status"></p>' +
      '<p class="scnr-note">실제 서버 수정은 원본 백업 다운로드 → 1건 시험 수정 → 전체 유지 확인 후에만 가능. 서버 저장은 메시지별 재조회로 검사함. 요약 메모리와 캐시가 자동 변경되는 것은 아님. 작업 전 다른 기기의 크랙을 닫고, 수정 중에는 채팅을 보내지 않는 것을 권장. JSON은 크랙에 자동 업로드되지 않음.</p>';
    document.body.append(button, panel);
    status = panel.querySelector('#scnr-status');
    results = panel.querySelector('#scnr-results');
    count = panel.querySelector('#scnr-count');
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) fill(); });
    panel.querySelector('#scnr-close').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('#scnr-apply').addEventListener('click', apply);
    panel.querySelector('#scnr-view').addEventListener('change', apply);
    panel.querySelector('#scnr-scan').addEventListener('click', () => { apply(); scan(); });
    panel.querySelector('#scnr-stop').addEventListener('click', () => {
      haltWrites = true;
      if (controller) controller.abort();
      if (writing) tell('중단 요청함. 진행 중이던 1개 요청 확인 후 멈춤.');
    });
    panel.querySelector('#scnr-probe').addEventListener('click', serverTest);
    panel.querySelector('#scnr-bulk').addEventListener('click', serverBulk);
    panel.querySelector('#scnr-summary').addEventListener('click', inspectMemory);
    panel.querySelector('#scnr-backup').addEventListener('click', () => exportJSON(false));
    panel.querySelector('#scnr-copy').addEventListener('click', () => exportJSON(true));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !panel.hidden) panel.hidden = true;
    });
    updateRoom(); controls();
  }
  function init() {
    mount();
    const observer = new MutationObserver(mutations => {
      if (mutations.every(m => m.target.nodeType === 1 && m.target.closest('#scnr-panel,#scnr-button'))) return;
      refresh();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    setInterval(() => { if (getRoom(location.pathname) !== room) refresh(); }, 1200);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
