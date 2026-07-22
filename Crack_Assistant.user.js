// ==UserScript==
// @name         🤖 캐챗 어시스턴트
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-dialogue-polisher/assistant
// @version      2.39.1-local
// @description  crack.wrtn.ai 캐릭터챗 어시스턴트 개인 수정판.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       extensionCode
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      googleapis.com
// @connect      open.er-api.com
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Assistant.user.js
// ==/UserScript==

(function () {
  'use strict';

  const CWA_VERSION = '2.39.1';
  let usdKrw = 1400;   // USD→KRW 환율 — open.er-api.com 에서 자동 갱신(1시간 캐시), 실패 시 이 기본값

  /* =========================================================================
   * 0. crack-api 네트워크 캡처  (document-start 에서 즉시 설치)
   *    - 페이지 컨텍스트에 스크립트를 주입해 fetch / XHR 을 감싼다.
   *    - crack-api.wrtn.ai 응답을 CustomEvent 로 userscript 에 전달.
   *    - 유저노트 / 요약메모리 / 페르소나 데이터를 여기서 확보한다.
   * ========================================================================= */

  const apiCaptures = [];                 // [{key,url,status,json,time}]
  const API_HOST_RE = /crack-api\.wrtn\.ai/;
  let uiRefreshHook = null;               // 캡처 도착 시 패널을 다시 그리는 콜백

  // 요약메모리 누적 (페이지네이션으로 전체를 모은다, 채팅방별로 스코프)
  let summaryAccum = [];                   // 최신순
  let summarySeen = {};
  let summaryChatId = null;

  function mergeSummaries(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(function (s) {
      const k = (s && s._id) || JSON.stringify(s);
      if (!summarySeen[k]) { summarySeen[k] = 1; summaryAccum.push(s); added++; }
    });
    return added;
  }

  // 현재 채팅방 기준으로 요약메모리 상태 동기화 + GM 저장소에서 캐시 복원
  // (페이지를 새로고침해도 직전에 모은 요약메모리가 살아남도록)
  function syncSummaryChat() {
    const cid = getChatId();
    if (!cid || cid === summaryChatId) return;
    summaryChatId = cid;
    summaryAccum = [];
    summarySeen = {};
    try {
      const cached = GM_getValue('cwa_sum_' + cid, null);
      if (Array.isArray(cached) && cached.length) {
        summaryAccum = cached;
        for (let i = 0; i < cached.length; i++) {
          const s = cached[i];
          summarySeen[(s && s._id) || JSON.stringify(s)] = 1;
        }
      }
    } catch (e) {}
  }
  function persistSummaries() {
    try { if (summaryChatId) GM_setValue('cwa_sum_' + summaryChatId, summaryAccum); } catch (e) {}
  }

  // 채팅 메시지 누적 (/messages API 페이지네이션 — 스크롤 없이 과거까지 확보)
  let messagesAccum = [];
  let messagesSeen = {};
  let messagesChatId = null;
  let messagesHasNext = false;       // 더 가져올 과거 페이지가 있는지
  let messagesNextCursor = null;     // 다음(미수집) 페이지 커서 — 이어받기 재개점
  function mergeMessages(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(function (m) {
      const k = (m && m._id) || JSON.stringify(m);
      if (!messagesSeen[k]) { messagesSeen[k] = 1; messagesAccum.push(m); added++; }
    });
    return added;
  }
  function syncMessagesChat() {
    const cid = getChatId();
    if (!cid || cid === messagesChatId) return;
    messagesChatId = cid;            // 채팅방이 바뀌면 초기화 (메시지는 영구저장 안 함)
    messagesAccum = [];
    messagesSeen = {};
    messagesHasNext = false;
    messagesNextCursor = null;
  }
  // 보낼 메시지 수를 늘렸을 때 모아둔 양이 부족하면 과거 페이지를 더 이어받는다.
  // (커서로 재개 → recordCapture 가 새 target 까지 자동으로 마저 페이지네이션)
  function ensureMoreMessages() {
    const want = Math.min(2000, (Number(settings.msgCount) || 20) + 20);
    if (messagesAccum.length >= want) return;
    if (!messagesHasNext || !messagesNextCursor) return;
    const cid = getChatId();
    if (!cid) return;
    proactiveFetch('https://crack-api.wrtn.ai/crack-gen/v3/chats/' + cid +
      '/messages?limit=20&cursor=' + encodeURIComponent(messagesNextCursor));
  }

  function recordCapture(url, status, body) {
    if (!url || !API_HOST_RE.test(url)) return;
    if (!body || body.length > 600000) return;          // 너무 큰 응답 제외
    let json;
    try { json = JSON.parse(body); } catch (e) { return; } // JSON 만
    const key = String(url).split('?')[0];
    const rec = { key: key, url: String(url), status: status, json: json, time: Date.now() };
    const idx = apiCaptures.findIndex(function (c) { return c.key === key; });
    if (idx >= 0) apiCaptures[idx] = rec; else apiCaptures.push(rec);
    if (apiCaptures.length > 80) apiCaptures.shift();

    // 요약메모리 페이지 누적 + 다음 페이지 이어받기 + 영구 저장
    if (/\/summaries(\?|$)/.test(rec.url) && json && json.data && Array.isArray(json.data.summaries)) {
      const mc = rec.url.match(/\/chats\/([a-zA-Z0-9]+)\/summaries/);
      const capCid = mc ? mc[1] : null;
      syncSummaryChat();   // 현재 채팅방으로 동기화(+캐시 복원)
      if (capCid && capCid === summaryChatId) {
        const added = mergeSummaries(json.data.summaries);
        persistSummaries();
        const cursor = json.data.nextCursor;
        if (cursor && added > 0 && summaryAccum.length < 800) {
          const baseUrl = rec.url.split(/[?&]cursor=/)[0];
          proactiveFetch(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
            'cursor=' + encodeURIComponent(cursor));
        }
      }
    }
    // 채팅 메시지 페이지 누적 + 필요한 만큼 과거 페이지 이어받기
    if (/\/messages(\?|$)/.test(rec.url) && json && json.data && Array.isArray(json.data.messages)) {
      const mc = rec.url.match(/\/chats\/([a-zA-Z0-9]+)\/messages/);
      const capCid = mc ? mc[1] : null;
      syncMessagesChat();
      if (capCid && capCid === messagesChatId) {
        const added = mergeMessages(json.data.messages);
        messagesHasNext = !!json.data.hasNext;
        messagesNextCursor = json.data.nextCursor || null;
        const target = Math.min(2000, (Number(settings.msgCount) || 20) + 20);
        if (json.data.hasNext && json.data.nextCursor && added > 0 && messagesAccum.length < target) {
          const baseUrl = rec.url.split(/[?&]cursor=/)[0];
          proactiveFetch(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
            'cursor=' + encodeURIComponent(json.data.nextCursor));
        }
      }
    }
    // 새 데이터가 들어왔으니 열려 있는 패널을 다시 그린다
    if (typeof uiRefreshHook === 'function') uiRefreshHook();
  }

  (function installInterceptor() {
    function pageHook() {
      var post = function (d) {
        try { window.dispatchEvent(new CustomEvent('cwa-capture', { detail: d })); } catch (e) {}
      };
      var H = 'crack-api.wrtn.ai';
      // 사이트가 crack-api 로 보내는 요청에서 채간 헤더 (Authorization 등)
      var savedHeaders = {};
      var rememberHeader = function (name, value) {
        if (!name || value == null) return;
        var n = String(name).toLowerCase();
        if (n === 'authorization' || n.indexOf('x-') === 0) savedHeaders[n] = String(value);
      };
      var collectFromHeaders = function (h) {
        try {
          if (!h) return;
          if (typeof h.forEach === 'function') { h.forEach(function (v, k) { rememberHeader(k, v); }); }
          else if (Array.isArray(h)) { h.forEach(function (p) { rememberHeader(p[0], p[1]); }); }
          else { for (var k in h) { if (Object.prototype.hasOwnProperty.call(h, k)) rememberHeader(k, h[k]); } }
        } catch (e) {}
      };

      var _fetch = window.fetch;
      if (_fetch) {
        window.fetch = function () {
          var args = arguments;
          try {
            var u0 = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
            if (u0.indexOf(H) >= 0) {
              if (args[1] && args[1].headers) collectFromHeaders(args[1].headers);
              if (args[0] && args[0].headers && typeof args[0] === 'object') collectFromHeaders(args[0].headers);
            }
          } catch (e) {}
          return _fetch.apply(this, args).then(function (res) {
            try {
              var u = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
              if (u.indexOf(H) >= 0) {
                res.clone().text().then(function (t) {
                  post({ url: u, status: res.status, body: t });
                }).catch(function () {});
              }
            } catch (e) {}
            return res;
          });
        };
      }
      var O = XMLHttpRequest.prototype.open, S = XMLHttpRequest.prototype.send;
      var SRH = XMLHttpRequest.prototype.setRequestHeader;
      XMLHttpRequest.prototype.open = function (m, u) { this.__cwaU = u; return O.apply(this, arguments); };
      XMLHttpRequest.prototype.setRequestHeader = function (n, v) {
        try { if (this.__cwaU && String(this.__cwaU).indexOf(H) >= 0) rememberHeader(n, v); } catch (e) {}
        return SRH.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        xhr.addEventListener('load', function () {
          try {
            if (xhr.__cwaU && String(xhr.__cwaU).indexOf(H) >= 0) {
              post({ url: String(xhr.__cwaU), status: xhr.status, body: xhr.responseText });
            }
          } catch (e) {}
        });
        return S.apply(this, arguments);
      };
      // userscript 요청으로 crack-api 를 직접 호출 — 채둔 인증 헤더 + 세션 쿠키 동봉
      // detail 은 문자열(URL) — 크로스 컨텍스트 전달 안전성을 위해 원시값 사용
      window.addEventListener('cwa-fetch', function (e) {
        var u = (typeof e.detail === 'string') ? e.detail : (e.detail && e.detail.url);
        if (!u) return;
        try {
          var hdrs = {};
          for (var k in savedHeaders) { if (Object.prototype.hasOwnProperty.call(savedHeaders, k)) hdrs[k] = savedHeaders[k]; }
          fetch(u, { credentials: 'include', headers: hdrs }).then(function (r) {
            return r.text().then(function (t) { post({ url: u, status: r.status, body: t }); });
          }).catch(function () {});
        } catch (err) {}
      });
    }
    try {
      const s = document.createElement('script');
      s.textContent = '(' + pageHook.toString() + ')();';
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      window.addEventListener('cwa-capture', function (e) {
        const d = e.detail || {};
        recordCapture(d.url, d.status, d.body);
      });
    } catch (e) { /* 무시 */ }
  })();

  /* =========================================================================
   * 1. 설정
   * ========================================================================= */

  const RESPONSE_STYLE_PROMPT =
    '답변 규칙:\n' +
    '- 한국어로 답합니다.\n' +
    '- 돌려 말하지 말고 있는 그대로 말합니다.\n' +
    '- 거두절미하고 바로 핵심부터 설명합니다.\n' +
    '- 실용성 최우선, 정보 위주로 답합니다. 쓸데없는 서론·주의·장황한 말은 쓰지 않습니다.\n' +
    '- 설명은 쉽고 핵심 위주로, 현실적으로 합니다.\n' +
    '- 필요하면 짧은 예시를 함께 제시합니다.\n' +
    '- 답변만 출력합니다. 불필요한 인사·사족·군더더기는 쓰지 않습니다.\n' +
    '- "상황에 따라 다름"이라고 회피하지 말고, 주어진 정보 기준 최선의 답을 고릅니다.\n' +
    '- Z세대처럼 자연스럽게 말하되 과하게 꾸미지 않습니다.\n' +
    '- 친근한 음슴체를 사용합니다. 애교 과다는 금지합니다.\n' +
    '- 밈·트위터 말투·인터넷식 표현·트위터 유머는 자연스러운 수준에서만 사용합니다.\n' +
    '- 욕설은 필요할 때만 사용할 수 있습니다.\n' +
    '- 아는 척하지 않습니다. 모르면 모른다고 말하고, 추측은 추측이라고 밝힙니다.\n' +
    '- 검증되지 않은 정보는 확신하지 말고 틀릴 수도 있다고 밝힙니다.\n' +
    '- 긍정편향 없이 현실적으로 답합니다.\n' +
    '- 마크다운 문법을 사용하지 않습니다. 별표, 샵, 코드블록, 표 마크다운, 링크 마크다운, 목록 마크다운을 쓰지 않습니다. 필요하면 일반 텍스트와 줄바꿈만 씁니다.';

  const DEFAULT_SYSTEM_PROMPT =
    '당신은 캐릭터 채팅(롤플레이) 플레이어를 돕는 보조 AI입니다.\n' +
    "아래에 페르소나·유저노트·요약메모리·채팅 로그가 주어질 수 있습니다. '캐릭터:'는 상대 캐릭터(AI)의 대사·지문, '나:'는 사용자(플레이어)의 대사·지문입니다.\n" +
    RESPONSE_STYLE_PROMPT;
  const DEFAULTS = {
    provider: 'gemini',          // 'gemini' | 'firebase'
    // Gemini API (AI Studio)
    geminiKey: '',
    // Firebase AI Logic — 백엔드 vertex 고정, Vertex 리전은 global 고정(코드 내)
    fbRaw: '',                   // 유저가 붙여넣은 firebaseConfig 원문 그대로
    fbApiKey: '',
    fbProject: '',
    fbAppId: '',
    fbBackend: 'vertex',         // 'vertex' | 'google'
    fbAppCheck: '',
    // 공통 — 모델·생각깊이는 질문창에서 바꿈
    model: 'gemini-3.1-flash-lite',
    thinking: '0',               // '0'=끔(빠름) | '-1'=자동 | 'high'=깊게
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    msgCount: 8,
    memoryCount: 3,              // 요약메모리 최근 N개만 전송. 0이면 안 보냄
    temperature: 0.9,
    // 첨부 토글
    sendPersona: true,
    sendUserNote: true,
    sendMemory: false,
    // 기타
    iconLeft: null,
    iconTop: null,
  };

  // 모델 목록 — 별칭(-latest) 없이 구체 버전만. 최신 우선. (2026-05 기준)
  const MODELS = [
    ['gemini-3.5-flash', 'Gemini 3.5 Flash (최신·권장)'],
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite (최저가)'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro (최고 품질)'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash (구버전·저렴)'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro (구버전)'],
  ];

  // 스크립트를 재설치하면 Tampermonkey GM 저장소가 초기화될 수 있으므로,
  // 사이트 localStorage 에도 백업해 두고 GM 저장소가 비면 거기서 복구한다.
  const LS_BACKUP = 'cwa_settings_backup';
  function saveSettings(s) {
    try { GM_setValue('settings', s); } catch (e) {}
    try { localStorage.setItem(LS_BACKUP, JSON.stringify(s)); } catch (e) {}
  }
  function loadSettings() {
    let saved = null;
    try { saved = GM_getValue('settings', null); } catch (e) {}
    if (!saved || typeof saved !== 'object' || !Object.keys(saved).length) {
      // GM 저장소가 비었음 → localStorage 백업에서 복구
      try {
        const ls = localStorage.getItem(LS_BACKUP);
        if (ls) {
          const parsed = JSON.parse(ls);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
            saved = parsed;
            try { GM_setValue('settings', saved); } catch (e) {}
          }
        }
      } catch (e) {}
    }
    return Object.assign({}, DEFAULTS, saved || {});
  }
  let settings = loadSettings();
  if (!String(settings.systemPrompt || '').includes('마크다운 문법을 사용하지 않습니다.')) {
    settings.systemPrompt = ((settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() + '\n\n' + RESPONSE_STYLE_PROMPT).trim();
  }
  saveSettings(settings);   // 로드 즉시 localStorage 백업을 만들어 둠 (재설치 대비)

  // USD→KRW 환율 — 무료 API 에서 가져와 1시간 캐시
  function fetchRate() {
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://open.er-api.com/v6/latest/USD',
        timeout: 15000,
        onload: function (r) {
          try {
            const j = JSON.parse(r.responseText);
            const krw = j && j.rates && j.rates.KRW;
            if (krw && krw > 0) {
              usdKrw = krw;
              GM_setValue('cwa_rate', { rate: krw, time: Date.now() });
              if (typeof uiRefreshHook === 'function') uiRefreshHook();
            }
          } catch (e) {}
        },
        onerror: function () {}, ontimeout: function () {},
      });
    } catch (e) {}
  }
  function initRate() {
    let c = null;
    try { c = GM_getValue('cwa_rate', null); } catch (e) {}
    if (c && c.rate > 0) usdKrw = c.rate;
    if (!c || !c.time || Date.now() - c.time > 3600000) fetchRate();   // 1시간 지나면 갱신
  }

  // 채팅방별 질문/답변 기록 (영구 저장)
  function loadQA(chatId) {
    try { const v = GM_getValue('cwa_qa_' + chatId, null); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function saveQA(chatId, arr) {
    try { GM_setValue('cwa_qa_' + chatId, (arr || []).slice(-100)); } catch (e) {}
  }

  /* =========================================================================
   * 2. 채팅 로그 — /messages API(스크롤 불필요) 우선, 없으면 DOM 스크래핑
   * ========================================================================= */

  // 메시지 본문 정리 — 숨김 주석/이미지 마크다운 제거
  function cleanContent(t) {
    return String(t || '')
      .replace(/^\[\/\/\]:\s*#.*$/gm, '')      // [//]: # (...) 주석 줄
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')     // ![alt](img)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function scrapeChatFromDom() {
    const groups = document.querySelectorAll('[data-message-group-id]');
    const out = [];
    groups.forEach(function (g) {
      const wrap = g.querySelector(':scope > div');
      if (!wrap) return;
      const role = wrap.classList.contains('items-end') ? 'user' : 'assistant';
      let nodes = g.querySelectorAll('.wrtn-markdown');
      if (!nodes.length) nodes = g.querySelectorAll('[class*="break-all"]');
      let text = '';
      nodes.forEach(function (n) {
        const t = (n.innerText || '').trim();
        if (t) text += (text ? '\n' : '') + t;
      });
      text = text.trim();
      if (text) out.push({ role: role, text: text });
    });
    // crack 의 DOM 은 최신 메시지가 위(먼저) → 오래된→최신 순으로 뒤집어 반환
    return out.reverse();
  }

  function scrapeChat() {
    // API 로 모은 메시지가 있고 현재 채팅방과 일치하면 사용 (스크롤 없이 과거까지 확보)
    if (messagesAccum.length && messagesChatId === getChatId()) {
      return messagesAccum.slice()
        .sort(function (a, b) {            // _id = ObjectId → 시간순 정렬
          const x = a._id || '', y = b._id || '';
          return x < y ? -1 : (x > y ? 1 : 0);
        })
        .map(function (m) {
          return {
            role: m.role === 'user' ? 'user' : 'assistant',
            text: cleanContent(m.content),
          };
        })
        .filter(function (m) { return m.text; });
    }
    // 폴백: 화면에 로드된 DOM 에서 긁기
    return scrapeChatFromDom();
  }

  /* =========================================================================
   * 3. 대화프로필 / 유저노트 / 요약메모리 추출  (crack-api 엔드포인트 확정)
   *    - 유저노트   : /crack-gen/v3/chats/{id}      → data.story.userNote.content
   *    - 대화프로필 : /crack-api/profiles/{pid}/chat-profiles
   *                   → data.chatProfiles[] 중 룸의 chatProfile._id 와 일치하는 것
   *    - 요약메모리 : /crack-gen/v3/chats/{id}/summaries?type=longTerm
   *                   → data.summaries[] 의 title + summary
   * ========================================================================= */

  function getChatId() {
    const m = location.pathname.match(/(?:episodes|chats?)\/([a-zA-Z0-9]{8,})/);
    return m ? m[1] : null;
  }

  function getNextFallback() {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      const j = JSON.parse(el.textContent);
      return (j.props && j.props.pageProps && j.props.pageProps.fallback) || null;
    } catch (e) { return null; }
  }

  // key 정규식에 맞는 가장 최근 캡처의 JSON 반환
  function latestCapture(reKey) {
    for (let i = apiCaptures.length - 1; i >= 0; i--) {
      if (reKey.test(apiCaptures[i].key)) return apiCaptures[i].json;
    }
    return null;
  }

  // 채팅방(room) 객체 — 캡처 우선, 없으면 __NEXT_DATA__
  function getRoomData() {
    const chatId = getChatId();
    if (!chatId) return null;
    const j = latestCapture(new RegExp('/v3/chats/' + chatId + '$'));
    if (j && j.data) return j.data;
    const fb = getNextFallback();
    if (fb && fb['/v3/chats/' + chatId] && fb['/v3/chats/' + chatId].data) {
      return fb['/v3/chats/' + chatId].data;
    }
    return null;
  }

  // 내 프로필 ID (chat-profiles 조회에 필요)
  function getProfileId() {
    const j = latestCapture(/\/crack-api\/profiles$/);
    return (j && j.data && j.data._id) || null;
  }

  function findUserNote() {
    const room = getRoomData();
    const un = room && room.story && room.story.userNote;
    if (un && typeof un.content === 'string' && un.content.trim()) return un.content.trim();
    return null;
  }

  function findProfile() {
    const room = getRoomData();
    const wantId = room && room.chatProfile && room.chatProfile._id;
    const j = latestCapture(/\/chat-profiles$/);
    const list = j && j.data && j.data.chatProfiles;
    if (!Array.isArray(list) || !list.length) return null;
    let p = null;
    if (wantId) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i]._id === wantId) { p = list[i]; break; }
      }
    }
    if (!p) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].isRepresentative) { p = list[i]; break; }
      }
    }
    if (!p) p = list[0];
    const parts = [];
    if (p.name) parts.push('이름: ' + p.name);
    if (p.information) parts.push(p.information);
    const t = parts.join('\n').trim();
    return t || null;
  }

  // 누적된 요약메모리 전체 개수
  function summaryTotal() {
    if (summaryAccum.length) return summaryAccum.length;
    const j = latestCapture(/\/summaries$/);
    const list = j && j.data && j.data.summaries;
    return Array.isArray(list) ? list.length : 0;
  }

  function findSummary() {
    let list = summaryAccum;
    if (!list.length) {
      const j = latestCapture(/\/summaries$/);
      list = (j && j.data && Array.isArray(j.data.summaries)) ? j.data.summaries : [];
    }
    if (!list.length) return null;
    // list 는 최신순 → 최근 N개만 추려서 오래된 순(타임라인)으로 제공
    const n = Math.max(0, Math.min(999, Number(settings.memoryCount) || 0));
    if (n <= 0) return null;
    const txt = list.slice(0, n).reverse().map(function (s) {
      return (s.title ? '■ ' + s.title + '\n' : '') + (s.summary || '');
    }).join('\n\n').trim();
    return txt ? txt.slice(0, 80000) : null;
  }

  function getFeatures() {
    return { profile: findProfile(), userNote: findUserNote(), memory: findSummary() };
  }

  /* crack-api 를 직접 호출(세션 쿠키 포함)해 데이터를 미리 캡처에 채운다.
   * 패널을 직접 열지 않아도 대화프로필·요약메모리를 확보하기 위함. */
  function proactiveFetch(url) {
    try { window.dispatchEvent(new CustomEvent('cwa-fetch', { detail: String(url) })); } catch (e) {}
  }
  function refreshFeatureData() {
    syncSummaryChat();        // 채팅방 캐시 동기화/복원
    syncMessagesChat();
    const base = 'https://crack-api.wrtn.ai';
    const chatId = getChatId();
    function pull() {
      proactiveFetch(base + '/crack-api/profiles');
      if (chatId) {
        proactiveFetch(base + '/crack-gen/v3/chats/' + chatId);
        // limit=20 첫 페이지만 — recordCapture 가 nextCursor 로 나머지를 자동 수집
        proactiveFetch(base + '/crack-gen/v3/chats/' + chatId +
          '/summaries?limit=20&type=longTerm&orderBy=newest&filter=all');
        proactiveFetch(base + '/crack-gen/v3/chats/' + chatId + '/messages?limit=20');
      }
      const pid = getProfileId();
      if (pid) proactiveFetch(base + '/crack-api/profiles/' + pid + '/chat-profiles');
    }
    pull();
    setTimeout(pull, 1700);   // 인증 헤더·profileId 가 늦게 잡히는 경우 대비 재시도
  }

  /* =========================================================================
   * 4. 프롬프트 구성
   * ========================================================================= */

  function buildUserText(chat, question, count) {
    const f = getFeatures();
    let parts = [];
    if (settings.sendPersona && f.profile) parts.push('[대화 프로필 / 페르소나]\n' + f.profile);
    if (settings.sendUserNote && f.userNote) parts.push('[유저노트]\n' + f.userNote);
    if (settings.sendMemory && f.memory) {
      parts.push('[장기기억 / 요약메모리 — 오래된 순, 맨 아래가 최근]\n' + f.memory);
    }

    // chat 은 항상 오래된→최신 순. 최근 count 개만.
    const slice = count > 0 ? chat.slice(-count) : chat;
    if (!slice.length) {
      parts.push('[채팅 로그]\n(채팅 로그를 찾지 못했습니다. 채팅방 화면에서 사용해 주세요.)');
    } else {
      const log = slice.map(function (m) {
        return (m.role === 'user' ? '나: ' : '캐릭터: ') + m.text;
      }).join('\n\n');
      parts.push('[지금까지의 채팅 로그 — 위가 과거, 맨 아래가 가장 최근(현재 장면)]\n' + log);
      parts.push('[현재 장면] 바로 위 채팅 로그의 맨 마지막 메시지가 지금 시점입니다. ' +
        '답변은 반드시 이 최신 장면을 기준으로 하세요. 오래된 장면이 아닙니다.');
    }
    parts.push('[질문]\n' + question);
    return parts.join('\n\n');
  }

  /* =========================================================================
   * 5. API 호출
   * ========================================================================= */

  const SAFETY_SETTINGS = [
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
  ].map(function (c) { return { category: c, threshold: 'BLOCK_NONE' }; });

  function enc(s) { return encodeURIComponent(String(s).trim()); }

  function gmRequest(opts) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: opts.method, url: opts.url, headers: opts.headers, data: opts.data,
        timeout: 90000,
        onload: function (r) { resolve(r); },
        onerror: function () { reject(new Error('네트워크 오류 (연결 실패)')); },
        ontimeout: function () { reject(new Error('요청 시간 초과')); },
      });
    });
  }

  // 생각(thinking) 토큰 예산 — 끄면 응답이 크게 빨라짐
  function thinkingBudget() {
    const t = settings.thinking;
    if (t === 'high') return 8192;
    if (t === '-1') return -1;            // 자동(모델이 결정)
    // '0' = 끔. 단 pro 모델은 0 을 허용하지 않으므로 자동으로
    return /pro/i.test(settings.model || '') ? -1 : 0;
  }

  // contents: [{role:'user'|'model', parts:[{text}]}, ...] 대화 전체
  function buildBody(systemText, contents) {
    return {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: contents,
      generationConfig: {
        temperature: Number(settings.temperature) || 0.9,
        thinkingConfig: { thinkingBudget: thinkingBudget() },
      },
      safetySettings: SAFETY_SETTINGS,
    };
  }

  function parseGenResponse(r) {
    let j;
    try { j = JSON.parse(r.responseText); }
    catch (e) { throw new Error('응답 파싱 실패 (HTTP ' + r.status + ')'); }
    if (r.status < 200 || r.status >= 300) {
      throw new Error((j && j.error && j.error.message) ? j.error.message : ('HTTP ' + r.status));
    }
    const cand = j.candidates && j.candidates[0];
    if (!cand) {
      const bp = j.promptFeedback && j.promptFeedback.blockReason;
      throw new Error(bp ? ('요청이 차단되었습니다: ' + bp) : '응답에 결과가 없습니다.');
    }
    const parts = (cand.content && cand.content.parts) || [];
    const txt = parts.map(function (p) { return p.text || ''; }).join('').trim();
    if (!txt) throw new Error('빈 응답 (finishReason: ' + (cand.finishReason || '?') + ')');
    const um = j.usageMetadata || {};
    return {
      text: txt,
      promptTokens: um.promptTokenCount || 0,
      outputTokens: um.candidatesTokenCount || 0,   // 답변 텍스트
      thoughtTokens: um.thoughtsTokenCount || 0,    // 추론(thinking) — 출력 요금으로 과금
      totalTokens: um.totalTokenCount || 0,
    };
  }

  // 모델별 100만 토큰당 단가(USD). Google Gemini API 공식 Standard/Paid Tier 기준, 2026-06 확인.
  // 출력 단가에는 Gemini 문서 기준 thinking tokens 가 포함된다.
  const MODEL_PRICES = {
    'gemini-3.5-flash':       { in: 1.50, out: 9.00, label: '공식 Standard' },
    'gemini-3.1-flash-lite':  { in: 0.25, out: 1.50, label: '공식 Standard' },
    'gemini-3.1-pro-preview': { in: 2.00, out: 12.00, inHigh: 4.00, outHigh: 18.00, threshold: 200000, label: '공식 Standard' },
    'gemini-3-flash-preview': { in: 0.50, out: 3.00, label: '공식 Standard' },
    'gemini-2.5-flash':       { in: 0.30, out: 2.50, label: '공식 Standard' },
    'gemini-2.5-flash-lite':  { in: 0.10, out: 0.40, label: '공식 Standard' },
    'gemini-2.5-flash-lite-preview-09-2025': { in: 0.10, out: 0.40, label: '공식 Standard' },
    'gemini-2.5-pro':         { in: 1.25, out: 10.00, inHigh: 2.50, outHigh: 15.00, threshold: 200000, label: '공식 Standard' },
  };
  function modelPricing(model, promptTokens) {
    const m = (model || '').toLowerCase().trim();
    let p = MODEL_PRICES[m] || null;
    if (!p) {
      for (const k in MODEL_PRICES) { if (m.indexOf(k) === 0) { p = MODEL_PRICES[k]; break; } }
    }
    if (!p) {
      const g3 = m.indexOf('gemini-3') >= 0;
      if (/flash-?lite/.test(m)) p = g3 ? { in: 0.25, out: 1.50, label: '모델명 추정' } : { in: 0.10, out: 0.40, label: '모델명 추정' };
      else if (/pro/.test(m)) p = g3 ? { in: 2.00, out: 12.00, inHigh: 4.00, outHigh: 18.00, threshold: 200000, label: '모델명 추정' } : { in: 1.25, out: 10.00, inHigh: 2.50, outHigh: 15.00, threshold: 200000, label: '모델명 추정' };
      else p = g3 ? { in: 1.50, out: 9.00, label: '모델명 추정' } : { in: 0.30, out: 2.50, label: '모델명 추정' };
    }
    if (p.threshold && promptTokens > p.threshold) {
      return { in: p.inHigh, out: p.outHigh, label: p.label + ' · 200k 초과 단가' };
    }
    return { in: p.in, out: p.out, label: p.label };
  }
  function estimateCostInfo(promptTokens, outputTokens, model) {
    const p = modelPricing(model || settings.model, promptTokens);
    const inputUsd = promptTokens / 1e6 * p.in;
    const outputUsd = outputTokens / 1e6 * p.out;
    const usd = inputUsd + outputUsd;
    return {
      usd: usd,
      inputUsd: inputUsd,
      outputUsd: outputUsd,
      usdVat: usd * 1.10,
      inRate: p.in,
      outRate: p.out,
      label: p.label,
    };
  }
  function estimateCost(promptTokens, outputTokens, model) {
    return estimateCostInfo(promptTokens, outputTokens, model).usd;
  }
  // --- Gemini API (AI Studio) ---
  async function callGemini(sys, contents) {
    const key = settings.geminiKey.trim();
    if (!key) throw new Error('Gemini API 키가 비어 있습니다. 설정에서 입력하세요.');
    const model = (settings.model || '').trim() || 'gemini-3.5-flash';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      enc(model) + ':generateContent?key=' + enc(key);
    const r = await gmRequest({
      method: 'POST', url: url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(buildBody(sys, contents)),
    });
    return parseGenResponse(r);
  }

  // --- Firebase AI Logic (firebasevertexai.googleapis.com) ---
  async function callFirebase(sys, contents) {
    const s = settings;
    if (!s.fbApiKey.trim()) throw new Error('Firebase API 키가 비어 있습니다.');
    if (!s.fbProject.trim()) throw new Error('Firebase 프로젝트 ID가 비어 있습니다.');
    const model = (settings.model || '').trim() || 'gemini-3.5-flash';
    let path;
    if (s.fbBackend === 'google') {
      // Gemini Developer API 백엔드
      path = '/v1beta/projects/' + enc(s.fbProject) + '/models/' + enc(model);
    } else {
      // Vertex AI 백엔드 — 최신·프리뷰 모델은 global 리전에만 있으므로 global 고정
      path = '/v1beta/projects/' + enc(s.fbProject) +
        '/locations/global/publishers/google/models/' + enc(model);
    }
    const url = 'https://firebasevertexai.googleapis.com' + path + ':generateContent';
    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': s.fbApiKey.trim(),
      'x-goog-api-client': 'gl-js/ fire/12.0.0',
    };
    if (s.fbAppId.trim()) headers['X-Firebase-Appid'] = s.fbAppId.trim();
    if (s.fbAppCheck.trim()) headers['X-Firebase-AppCheck'] = s.fbAppCheck.trim();
    const r = await gmRequest({
      method: 'POST', url: url, headers: headers,
      data: JSON.stringify(buildBody(sys, contents)),
    });
    return parseGenResponse(r);
  }

  function ask(sys, contents) {
    return settings.provider === 'firebase'
      ? callFirebase(sys, contents)
      : callGemini(sys, contents);
  }

  /* =========================================================================
   * 6. UI (body 준비 후 생성, Shadow DOM 으로 격리)
   * ========================================================================= */

  function whenBody(cb) {
    if (document.body) { cb(); return; }
    const mo = new MutationObserver(function () {
      if (document.body) { mo.disconnect(); cb(); }
    });
    mo.observe(document.documentElement, { childList: true });
  }

  syncSummaryChat();   // 페이지 로드 즉시 GM 캐시에서 요약메모리 복원
  initRate();          // 환율 로드/갱신
  whenBody(buildUI);

  function buildUI() {
    const host = document.createElement('div');
    host.id = 'cwa-host';
    host.style.cssText = 'all:initial;';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });

    root.innerHTML = [
      '<style>',
      ':host,*{box-sizing:border-box;}',
      '.cwa{font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,sans-serif;}',
      '.cwa-icon{display:none;position:fixed;right:auto;bottom:auto;width:38px;height:38px;border-radius:12px;',
      '  background:#5b9bd5;color:#fff;font-size:17px;line-height:38px;text-align:center;cursor:pointer;',
      '  box-shadow:0 3px 10px rgba(0,0,0,.18);opacity:.86;transition:opacity .15s,transform .1s;',
      '  z-index:2147483600;user-select:none;touch-action:none;}',
      '.cwa-icon:hover{opacity:1;}',
      '.cwa-icon:active{transform:scale(.92);}',
      '.cwa-panel{position:fixed;width:min(430px,94vw);max-height:min(820px,94vh);background:#fff;',
      '  border:1px solid #dfe4ec;border-radius:14px;box-shadow:0 16px 46px rgba(20,28,44,.28);z-index:2147483601;display:none;',
      '  flex-direction:column;overflow:hidden;color:#1f2330;}',
      '.cwa-panel.open{display:flex;}',
      '.cwa-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:#243447;color:#fff;}',
      '.cwa-head b{flex:1;font-size:14px;}',
      '.cwa-hbtn{cursor:pointer;border:0;background:rgba(255,255,255,.18);color:#fff;width:28px;height:28px;',
      '  border-radius:8px;font-size:14px;}',
      '.cwa-hbtn:hover{background:rgba(255,255,255,.32);}',
      '.cwa-body{padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;background:#fbfcfe;}',
      '.cwa-row{display:flex;align-items:center;gap:8px;font-size:12px;color:#526071;flex-wrap:wrap;}',
      '.cwa-row input[type=number]{width:58px;}',
      'label.cwa-lbl{font-size:12px;font-weight:600;color:#3a3f52;display:block;margin-bottom:4px;}',
      'input,select,textarea{font-family:inherit;font-size:13px;border:1px solid #d6d9e3;border-radius:8px;',
      '  padding:7px 9px;width:100%;outline:none;background:#fff;color:#1f2330;}',
      'input:focus,select:focus,textarea:focus{border-color:#5b9bd5;}',
      'textarea{resize:vertical;}',
      '.cwa-q{min-height:72px;}',
      '.cwa-btn{cursor:pointer;border:0;border-radius:8px;padding:9px 12px;font-size:13px;font-weight:700;',
      '  background:#2374ab;color:#fff;}',
      '.cwa-btn:hover{background:#1f6696;}',
      '.cwa-btn:disabled{opacity:.55;cursor:default;}',
      '.cwa-btn.sec{background:#eef0f6;color:#3a3f52;font-weight:600;}',
      '.cwa-btn.sec:hover{background:#e3e6f0;}',
      '.cwa-chk{display:flex;align-items:center;gap:5px;font-size:12px;color:#3a3f52;cursor:pointer;}',
      '.cwa-chk input{width:auto;}',
      '.cwa-chk .dot{font-size:10px;}',
      '.dot-ok{color:#1f9d55;}.dot-no{color:#c0c4d0;}',
      '.cwa-thread{border:1px solid #dfe4ec;border-radius:8px;padding:8px;background:#fff;',
      '  display:flex;flex-direction:column;gap:10px;max-height:480px;overflow-y:auto;min-height:180px;}',
      '.cwa-thread .empty{font-size:12px;color:#9498a8;text-align:center;padding:16px 4px;}',
      '.cwa-qa{display:flex;flex-direction:column;gap:3px;}',
      '.cwa-qbub{align-self:flex-end;max-width:88%;background:#5b9bd5;color:#fff;font-size:12.5px;',
      '  padding:6px 10px;border-radius:12px 12px 4px 12px;white-space:pre-wrap;word-break:break-word;}',
      '.cwa-abub{align-self:flex-start;max-width:96%;background:#fff;border:1px solid #dfe4ec;color:#1f2330;',
      '  font-size:13px;line-height:1.6;padding:8px 10px;border-radius:12px 12px 12px 4px;',
      '  white-space:pre-wrap;word-break:break-word;}',
      '.cwa-abub.err{background:#fdeceb;border-color:#f3b9b4;color:#b3261e;}',
      '.cwa-atools{display:flex;gap:11px;align-self:flex-start;flex-wrap:wrap;}',
      '.cwa-acopy{font-size:10px;color:#9498a8;cursor:pointer;background:none;border:0;padding:0;}',
      '.cwa-acopy:hover{color:#5b9bd5;}',
      '.cwa-meta{font-size:10px;color:#b7bac6;align-self:flex-start;}',
      '.cwa-muted{font-size:11px;color:#9498a8;}',
      '.cwa-fieldset{display:flex;flex-direction:column;gap:8px;border:1px solid #dfe4ec;border-radius:8px;padding:10px;background:#fff;}',
      '.cwa-hide{display:none!important;}',
      '.cwa-tip{font-size:11px;line-height:1.45;color:#526071;background:#eef6f8;border:1px solid #cfe4ea;border-radius:8px;padding:8px;}',
      '.cwa-foot{font-size:11px;color:#8b95a5;text-align:center;padding:2px 0 4px;}',
      '</style>',

      '<div class="cwa">',
      '  <div class="cwa-icon" id="cwa-icon" title="캐릭터챗 어시스턴트">🔍</div>',
      '  <div class="cwa-panel" id="cwa-panel">',
      '    <div class="cwa-head">',
      '      <b id="cwa-title">캐릭터챗 어시스턴트</b>',
      '      <button class="cwa-hbtn" id="cwa-gear" title="설정">⚙</button>',
      '      <button class="cwa-hbtn" id="cwa-close" title="닫기">✕</button>',
      '    </div>',

      /* ---- 메인 ---- */
      '    <div class="cwa-body" id="cwa-main">',
      '      <div class="cwa-row">',
      '        <span class="cwa-muted">채팅 로그 보낼 메시지 (최근)</span>',
      '        <input type="number" id="cwa-send-n" min="1" step="1">',
      '        <span class="cwa-muted" style="font-size:10px;">왕복 1회 = 메시지 2개</span>',
      '      </div>',
      '      <div class="cwa-row">',
      '        <span class="cwa-muted">요약메모리 보낼 개수 (최근)</span>',
      '        <input type="number" id="cwa-memcount" min="0" max="999" step="1">',
      '      </div>',
      '      <div class="cwa-row" style="gap:12px;">',
      '        <label class="cwa-chk"><input type="checkbox" id="cwa-c-persona">대화프로필 <span class="dot" id="cwa-d-persona">●</span></label>',
      '        <label class="cwa-chk"><input type="checkbox" id="cwa-c-note">유저노트 <span class="dot" id="cwa-d-note">●</span></label>',
      '        <label class="cwa-chk"><input type="checkbox" id="cwa-c-memory">요약메모리 <span class="dot" id="cwa-d-memory">●</span></label>',
      '      </div>',
      '      <div class="cwa-tip">최저가 추천: Flash-Lite · 생각 끔 · 최근 6~8메시지 · 요약메모리 0~3개. 긴 분석 아니면 이게 돈 덜 먹음.</div>',
      '      <div class="cwa-row" style="justify-content:space-between;">',
      '        <span class="cwa-muted" id="cwa-attach-info" style="flex:1;"></span>',
      '        <button class="cwa-btn sec" id="cwa-preview" style="padding:3px 8px;font-size:11px;">👀 미리보기</button>',
      '        <button class="cwa-btn sec" id="cwa-cheap" style="padding:3px 8px;font-size:11px;">💸 절약</button>',
      '        <button class="cwa-btn sec" id="cwa-refresh" style="padding:3px 8px;font-size:11px;">🔄 불러오기</button>',
      '      </div>',
      '      <div class="cwa-row">',
      '        <span class="cwa-muted">모델</span>',
      '        <select id="cwa-model" style="flex:1;min-width:80px;"></select>',
      '      </div>',
      '      <div class="cwa-row">',
      '        <span class="cwa-muted" title="모델이 답하기 전 추론(thinking)하는 양. 끄면 빨라짐">생각</span>',
      '        <select id="cwa-think" style="flex:1;min-width:78px;">',
      '          <option value="0">끔 (빠름)</option>',
      '          <option value="-1">자동</option>',
      '          <option value="high">깊게</option>',
      '        </select>',
      '      </div>',
      '      <input type="text" id="cwa-model-custom" placeholder="모델명 직접 입력 (예: gemini-2.5-pro)" style="display:none;">',
      '      <div class="cwa-row" style="justify-content:space-between;">',
      '        <span class="cwa-lbl" style="margin:0;">💬 이 채팅방 대화</span>',
      '        <button class="cwa-btn sec" id="cwa-clear" style="padding:3px 8px;font-size:11px;">비우기</button>',
      '      </div>',
      '      <div class="cwa-thread" id="cwa-thread"></div>',
      '      <textarea class="cwa-q" id="cwa-q" placeholder="질문 입력 (위 항목 + 채팅 로그 자동 첨부). 이어서 후속 질문도 가능"></textarea>',
      '      <button class="cwa-btn" id="cwa-send">물어보기  (Ctrl+Enter)</button>',
      '      <div class="cwa-foot">v<span id="cwa-ver">?</span> · <span id="cwa-prov">gemini</span> · $1≈₩<span id="cwa-rate">?</span></div>',
      '    </div>',

      /* ---- 설정 ---- */
      '    <div class="cwa-body cwa-hide" id="cwa-settings">',
      '      <div>',
      '        <label class="cwa-lbl">API 제공자</label>',
      '        <select id="cwa-provider">',
      '          <option value="gemini">Gemini API (AI Studio · API 키)</option>',
      '          <option value="firebase">Firebase AI Logic (firebaseConfig)</option>',
      '        </select>',
      '      </div>',

      '      <div class="cwa-fieldset" id="cwa-fs-gemini">',
      '        <div><label class="cwa-lbl">Gemini API 키</label>',
      '          <input type="password" id="cwa-gemini-key" placeholder="AIza..."></div>',
      '        <div class="cwa-muted">aistudio.google.com/apikey 에서 키 발급. (모델은 질문창에서 선택)</div>',
      '      </div>',

      '      <div class="cwa-fieldset cwa-hide" id="cwa-fs-firebase">',
      '        <div><label class="cwa-lbl">Firebase 콘솔 코드 붙여넣기</label>',
      '          <textarea id="cwa-fb-paste" style="min-height:110px;" placeholder="Firebase 콘솔이 주는 코드를 통째로 붙여넣으세요 (script 블록 전체 OK)"></textarea></div>',
      '        <div class="cwa-muted" id="cwa-fb-parsed"></div>',
      '        <div class="cwa-muted">import·initializeApp 까지 포함된 script 블록 전체를 그대로 붙여넣어도 됩니다 (입력한 형태 그대로 보관). App Check 는 "미적용", API 키 도메인 제한은 해제 상태여야 합니다.</div>',
      '      </div>',

      '      <div>',
      '        <label class="cwa-lbl">시스템 프롬프트</label>',
      '        <textarea id="cwa-sysprompt" style="min-height:110px;"></textarea>',
      '      </div>',
      '      <div style="display:flex;gap:8px;">',
      '        <button class="cwa-btn" id="cwa-save" style="flex:1;">저장</button>',
      '        <button class="cwa-btn sec" id="cwa-reset-prompt">프롬프트 기본값</button>',
      '      </div>',
      '      <div class="cwa-muted" id="cwa-save-msg"></div>',
      '    </div>',

      /* ---- 전송 내용 미리보기 ---- */
      '    <div class="cwa-body cwa-hide" id="cwa-preview-view">',
      '      <div class="cwa-row" style="justify-content:space-between;">',
      '        <span class="cwa-muted">AI 에게 실제로 보내지는 내용입니다.</span>',
      '        <span style="display:flex;gap:6px;">',
      '          <button class="cwa-btn sec" id="cwa-prev-copy" style="padding:4px 8px;font-size:11px;">복사</button>',
      '          <button class="cwa-btn sec" id="cwa-prev-back" style="padding:4px 8px;font-size:11px;">← 닫기</button>',
      '        </span>',
      '      </div>',
      '      <pre id="cwa-preview-text" style="white-space:pre-wrap;word-break:break-word;font-size:11px;',
      '        line-height:1.5;background:#f6f6fb;border:1px solid #e6e7f0;border-radius:8px;',
      '        padding:8px;margin:0;color:#3a3f52;"></pre>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');

    const $ = function (id) { return root.getElementById(id); };
    let iconEl = null;
    const fallbackIconEl = $('cwa-icon');
    const panelEl = $('cwa-panel');
    const views = {
      main: $('cwa-main'), settings: $('cwa-settings'),
      preview: $('cwa-preview-view'),
    };

    /* ---- 뷰 전환 ---- */
    function showView(name) {
      Object.keys(views).forEach(function (k) {
        views[k].classList.toggle('cwa-hide', k !== name);
      });
      $('cwa-title').textContent =
        name === 'settings' ? '설정'
        : name === 'preview' ? '전송 내용 미리보기' : '캐릭터챗 어시스턴트';
      if (name === 'main') refreshMain();
      if (name === 'settings') fillSettingsForm();
      if (name === 'preview') renderPreview();
      positionPanel();
    }

    /* ---- 패널 위치 ---- */
    function injectToolbarButton() {
      let existing = document.getElementById('cwa-toolbar-btn');
      if (existing) { iconEl = existing; return existing; }

      let btnContainer = null;
      let referenceNode = null;

      const customRpTools = document.getElementById('custom-rp-tools');
      if (customRpTools) {
        btnContainer = customRpTools.parentElement;
        referenceNode = customRpTools;
      } else {
        const buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
        const recommendBtn = buttons.find(function (b) {
          return b.textContent && b.textContent.indexOf('추천답변') >= 0;
        });
        if (recommendBtn) {
          btnContainer = recommendBtn.parentElement;
          referenceNode = recommendBtn;
        }
      }

      if (!btnContainer) {
        const textarea = document.querySelector('textarea');
        if (textarea) {
          const inputArea = textarea.closest('.flex-col') || (textarea.parentElement && textarea.parentElement.parentElement);
          if (inputArea) btnContainer = inputArea.querySelector('.flex.items-center.space-x-2');
        }
      }
      if (!btnContainer) return null;

      const btn = document.createElement('button');
      btn.id = 'cwa-toolbar-btn';
      btn.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';
      btn.style.pointerEvents = 'auto';
      btn.innerHTML = '<span style="font-size:14px;display:inline-block;transform:translate(-1px,1.5px);filter:grayscale(100%);pointer-events:none;">🔍</span>';

      const onClick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        iconEl = btn;
        togglePanel();
      };
      btn.addEventListener('click', onClick, true);
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); }, true);
      btn.addEventListener('touchstart', onClick, { passive: false, capture: true });

      if (referenceNode && referenceNode.nextSibling) btnContainer.insertBefore(btn, referenceNode.nextSibling);
      else if (referenceNode) btnContainer.appendChild(btn);
      else btnContainer.insertBefore(btn, btnContainer.firstChild);

      iconEl = btn;
      return btn;
    }
    function currentIconEl() {
      return injectToolbarButton() || iconEl || fallbackIconEl;
    }
    function positionPanel() {
      panelEl.style.left = '-9999px'; panelEl.style.top = '0px';
      const r = currentIconEl().getBoundingClientRect();
      const pw = panelEl.offsetWidth, ph = panelEl.offsetHeight;
      let left = r.right - pw;
      let top = r.top - ph - 8;
      if (top < 8) top = r.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
      panelEl.style.left = left + 'px';
      panelEl.style.top = top + 'px';
    }
    function openPanel() {
      panelEl.classList.add('open');
      showView('main');
      refreshFeatureData();   // 대화프로필·요약메모리 미리 불러오기
      softRefresh();
    }
    // 캡처는 비동기로 도착하므로 잠시 뒤 상태를 다시 갱신
    function softRefresh() {
      setTimeout(function () { if (panelEl.classList.contains('open')) refreshMain(); }, 1800);
      setTimeout(function () { if (panelEl.classList.contains('open')) refreshMain(); }, 4200);
    }
    function closePanel() { panelEl.classList.remove('open'); }
    function togglePanel() {
      if (panelEl.classList.contains('open')) closePanel(); else openPanel();
    }

    /* ---- 모델 선택 ---- */
    function populateModelSelect() {
      // 더 이상 -latest 별칭을 쓰지 않음 → 저장된 별칭은 최신 구체 버전으로 보정
      if (/-latest$/.test(settings.model || '')) {
        settings.model = /pro/.test(settings.model) ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';
        saveSettings(settings);
      }
      const sel = $('cwa-model');
      sel.textContent = '';
      MODELS.forEach(function (m) {
        const o = document.createElement('option');
        o.value = m[0]; o.textContent = m[1];
        sel.appendChild(o);
      });
      const oc = document.createElement('option');
      oc.value = '__custom__'; oc.textContent = '직접 입력…';
      sel.appendChild(oc);
      syncModelSelect();
    }
    // settings.model 값을 드롭다운(또는 직접입력칸)에 반영
    function syncModelSelect() {
      const known = MODELS.some(function (m) { return m[0] === settings.model; });
      if (known) {
        $('cwa-model').value = settings.model;
        $('cwa-model-custom').style.display = 'none';
      } else {
        $('cwa-model').value = '__custom__';
        $('cwa-model-custom').style.display = '';
        if (root.activeElement !== $('cwa-model-custom')) {
          $('cwa-model-custom').value = settings.model || '';
        }
      }
    }

    /* ---- 메인 갱신 ---- */
    function refreshMain() {
      $('cwa-ver').textContent = CWA_VERSION;
      const chat = scrapeChat();
      $('cwa-prov').textContent = settings.provider === 'firebase' ? 'Firebase AI Logic' : 'Gemini API';
      $('cwa-rate').textContent = Math.round(usdKrw).toLocaleString();
      if (root.activeElement !== $('cwa-model')) syncModelSelect();
      if (root.activeElement !== $('cwa-think')) $('cwa-think').value = settings.thinking || '0';
      if (root.activeElement !== $('cwa-send-n')) $('cwa-send-n').value = settings.msgCount;
      if (root.activeElement !== $('cwa-memcount')) $('cwa-memcount').value = settings.memoryCount;
      $('cwa-c-persona').checked = settings.sendPersona;
      $('cwa-c-note').checked = settings.sendUserNote;
      $('cwa-c-memory').checked = settings.sendMemory;
      const f = getFeatures();
      setDot('cwa-d-persona', f.profile);
      setDot('cwa-d-note', f.userNote);
      setDot('cwa-d-memory', f.memory);
      const got = [];
      if (f.profile) got.push('대화프로필');
      if (f.userNote) got.push('유저노트');
      if (f.memory) {
        const tot = summaryTotal();
        const n = Math.max(0, Math.min(999, Number(settings.memoryCount) || 0));
    if (n <= 0) return null;
        got.push('요약메모리(' + Math.min(tot, n) + '/' + tot + ')');
      }
      // 이번 질문에 실릴 입력 대략 크기 — 크면 줄이라는 신호
      const cnt = Math.max(1, parseInt($('cwa-send-n').value, 10) || settings.msgCount);
      const estK = Math.round(buildUserText(chat, '', cnt).length / 1000);
      $('cwa-attach-info').textContent = (got.length ? ('첨부: ' + got.join(', ')) : '※ 데이터 로딩 중…')
        + '  ·  입력 ≈' + estK + 'k자';
      syncThread();   // 채팅방이 바뀌었으면 해당 방 대화 기록으로 교체
    }
    // 캡처가 도착할 때마다 (요약메모리 페이지네이션 등) 패널을 자동 갱신
    let _refreshTimer = null;
    uiRefreshHook = function () {
      clearTimeout(_refreshTimer);
      _refreshTimer = setTimeout(function () {
        if (panelEl.classList.contains('open') && !views.main.classList.contains('cwa-hide')) {
          refreshMain();
        }
      }, 250);
    };
    function setDot(id, ok) {
      const el = $(id);
      el.textContent = ok ? '●' : '○';
      el.className = 'dot ' + (ok ? 'dot-ok' : 'dot-no');
      el.title = ok ? '데이터 감지됨' : '아직 캡처 안 됨';
    }

    /* ---- 채팅방별 대화(Q&A) 스레드 ---- */
    let thread = [];
    let threadChatId = null;
    const HISTORY_TURNS = 6;   // LLM 에 함께 보낼 직전 질문/답변 수 (토큰 절약)

    // 현재 채팅방 기준으로 스레드 로드 (채팅방이 바뀐 경우에만 다시 그림)
    function syncThread() {
      const cid = getChatId();
      if (cid === threadChatId) return;
      threadChatId = cid;
      thread = cid ? loadQA(cid) : [];
      renderThread();
    }
    function persistThread() {
      if (threadChatId) {
        saveQA(threadChatId, thread.filter(function (t) { return !t.error && !t.pending; }));
      }
    }
    function renderThread() {
      const box = $('cwa-thread');
      box.textContent = '';
      if (!thread.length) {
        const d = document.createElement('div');
        d.className = 'empty';
        d.textContent = '이 채팅방의 첫 질문을 해보세요. 대화는 채팅방별로 저장됩니다.';
        box.appendChild(d);
        return;
      }
      thread.forEach(function (turn, idx) {
        const isLast = idx === thread.length - 1;
        const wrap = document.createElement('div');
        wrap.className = 'cwa-qa';
        const q = document.createElement('div');
        q.className = 'cwa-qbub';
        q.textContent = turn.q;
        const a = document.createElement('div');
        a.className = 'cwa-abub' + (turn.error ? ' err' : '');
        a.textContent = turn.pending ? '생각 중…' : turn.a;
        wrap.appendChild(q);
        wrap.appendChild(a);
        if (!turn.pending) {
          const tools = document.createElement('div');
          tools.className = 'cwa-atools';
          const toolBtn = function (label, fn) {
            const b = document.createElement('button');
            b.className = 'cwa-acopy';
            b.textContent = label;
            b.addEventListener('click', fn);
            tools.appendChild(b);
            return b;
          };
          if (!turn.error) {
            const cp = toolBtn('복사', function () {
              if (!navigator.clipboard) return;
              navigator.clipboard.writeText(turn.a || '').then(function () {
                cp.textContent = '복사됨';
                setTimeout(function () { cp.textContent = '복사'; }, 1200);
              });
            });
          }
          toolBtn('수정', function () { editTurn(turn); });
          toolBtn('삭제', function () { deleteTurn(turn); });
          // 재생성은 최신(맨 아래) 답변에서만 — 예전 답변 재생성은 맥락이 어긋남
          if (isLast) toolBtn('↻ 재생성', function () { regenerate(turn); });
          wrap.appendChild(tools);
          if (turn.tokens) {
            const meta = document.createElement('div');
            meta.className = 'cwa-meta';
            let s = '입력 ' + turn.tokens.p.toLocaleString() +
              ' · 출력 ' + turn.tokens.o.toLocaleString();
            if (turn.tokens.t) s += ' · 추론 ' + turn.tokens.t.toLocaleString();
            if (turn.tokens.total) s += ' · 총 ' + turn.tokens.total.toLocaleString();
            meta.textContent = s + ' 토큰 · ' + fmtCostInfo(turn.costInfo || { usd: turn.cost });
            wrap.appendChild(meta);
          }
        }
        box.appendChild(wrap);
      });
      box.scrollTop = box.scrollHeight;
    }
    // 비용 표기 — USD + 원화 환산. 원 단위 반올림으로 0원처럼 보이지 않게 소수점까지 표시.
    function fmtWon(v) {
      if (!isFinite(v) || v <= 0) return '0원';
      if (v < 1) return v.toFixed(3) + '원';
      if (v < 10) return v.toFixed(2) + '원';
      if (v < 100) return v.toFixed(1) + '원';
      return Math.round(v).toLocaleString() + '원';
    }
    function fmtUsd(v) {
      if (!isFinite(v) || v <= 0) return '$0';
      if (v < 0.0001) return '$' + v.toFixed(7);
      if (v < 0.01) return '$' + v.toFixed(5);
      return '$' + v.toFixed(3);
    }
    function fmtCostInfo(info) {
      const usd = info && info.usd ? info.usd : 0;
      if (!usd) return '추정 $0 / 0원';
      const baseWon = usd * usdKrw;
      const vatWon = (info.usdVat || usd * 1.10) * usdKrw;
      let s = '추정 ' + fmtUsd(usd) + ' · ' + fmtWon(baseWon) + ' / VAT포함 ' + fmtWon(vatWon);
      if (info.inRate != null && info.outRate != null) {
        s += ' · 단가 $' + info.inRate + '/$' + info.outRate + ' per 1M';
      }
      if (info.label) s += ' · ' + info.label;
      return s;
    }
    function clearThread() {
      thread = [];
      persistThread();
      renderThread();
    }
    // 내가 보낸 질문 턴 삭제
    function deleteTurn(turn) {
      if (busy) return;
      const idx = thread.indexOf(turn);
      if (idx < 0) return;
      thread.splice(idx, 1);
      persistThread();
      renderThread();
    }
    // 질문 수정 — 질문을 입력칸으로 되돌리고 그 턴은 제거 (고쳐서 다시 물어보기)
    function editTurn(turn) {
      if (busy) return;
      const idx = thread.indexOf(turn);
      if (idx < 0) return;
      $('cwa-q').value = turn.q;
      thread.splice(idx, 1);
      persistThread();
      renderThread();
      $('cwa-q').focus();
    }

    /* ---- 질문 / 재생성 ---- */
    let busy = false;

    // 한 턴 실행: turn.q 를 현재 컨텍스트로 질의, priorTurns 를 대화 맥락으로 첨부
    async function runTurn(turn, priorTurns) {
      const count = Math.max(1, parseInt($('cwa-send-n').value, 10) || settings.msgCount);
      settings.msgCount = count;
      settings.sendPersona = $('cwa-c-persona').checked;
      settings.sendUserNote = $('cwa-c-note').checked;
      settings.sendMemory = $('cwa-c-memory').checked;
      saveSettings(settings);

      const sysText = (settings.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
      const ctxText = buildUserText(scrapeChat(), turn.q, count);
      // 직전 대화는 가볍게(질문/답변 텍스트만), 최신 턴에만 무거운 컨텍스트 첨부
      const contents = [];
      priorTurns.forEach(function (t) {
        if (t.error || t.pending) return;
        contents.push({ role: 'user', parts: [{ text: t.q }] });
        contents.push({ role: 'model', parts: [{ text: t.a }] });
      });
      contents.push({ role: 'user', parts: [{ text: ctxText }] });

      turn.a = ''; turn.pending = true; turn.error = false;
      turn.tokens = null; turn.cost = 0; turn.costInfo = null; turn.model = settings.model;
      renderThread();
      busy = true; $('cwa-send').disabled = true;
      try {
        const res = await ask(sysText, contents);
        turn.a = res.text;
        turn.tokens = { p: res.promptTokens, o: res.outputTokens, t: res.thoughtTokens || 0, total: res.totalTokens || 0 };
        // 추론 토큰도 출력 요금으로 과금
        turn.costInfo = estimateCostInfo(res.promptTokens, res.outputTokens + (res.thoughtTokens || 0), turn.model);
        turn.cost = turn.costInfo.usd;
        turn.pending = false;
      } catch (e) {
        turn.a = '오류: ' + (e && e.message ? e.message : e);
        turn.pending = false; turn.error = true;
      } finally {
        busy = false; $('cwa-send').disabled = false;
        persistThread();
        renderThread();
      }
    }
    async function doAsk() {
      if (busy) return;
      const question = $('cwa-q').value.trim();
      if (!question) { $('cwa-q').focus(); return; }
      // 채팅 로그가 많으면 토큰 비용·응답시간 경고
      const askCount = Math.max(1, parseInt($('cwa-send-n').value, 10) || settings.msgCount);
      if (askCount > 200 && !window.confirm(
        '채팅 로그 ' + askCount + '개를 전송합니다.\n\n' +
        '메시지가 많을수록 토큰 비용과 응답 시간이 크게 늘어납니다.\n' +
        '이대로 보낼까요?')) { $('cwa-q').focus(); return; }
      syncThread();   // 현재 채팅방 스레드 보장
      const entry = { q: question, a: '', t: Date.now() };
      const prior = thread.slice(-HISTORY_TURNS);
      thread.push(entry);
      $('cwa-q').value = '';
      await runTurn(entry, prior);
    }
    // 답변 재생성 — 같은 질문을 현재 채팅 상태로 다시 질의
    async function regenerate(turn) {
      if (busy) return;
      const idx = thread.indexOf(turn);
      if (idx < 0) return;
      await runTurn(turn, thread.slice(Math.max(0, idx - HISTORY_TURNS), idx));
    }

    /* ---- 설정 폼 ---- */
    function fillSettingsForm() {
      $('cwa-provider').value = settings.provider;
      $('cwa-gemini-key').value = settings.geminiKey;
      // 유저가 붙여넣은 원본 그대로 표시 (없으면 옛 저장분은 재구성으로 폴백)
      $('cwa-fb-paste').value = settings.fbRaw || fbConfigText();
      $('cwa-sysprompt').value = settings.systemPrompt;
      showFbStatus();
      updateProviderFields();
    }
    function updateProviderFields() {
      const p = $('cwa-provider').value;
      $('cwa-fs-gemini').classList.toggle('cwa-hide', p !== 'gemini');
      $('cwa-fs-firebase').classList.toggle('cwa-hide', p !== 'firebase');
    }
    // 저장된 값으로 firebaseConfig 스크립트 텍스트를 재구성
    function fbConfigText() {
      if (!settings.fbApiKey && !settings.fbProject) return '';
      return 'const firebaseConfig = {\n' +
        '  apiKey: "' + (settings.fbApiKey || '') + '",\n' +
        '  projectId: "' + (settings.fbProject || '') + '",\n' +
        (settings.fbAppId ? '  appId: "' + settings.fbAppId + '"\n' : '') +
        '};';
    }
    // 현재 firebase 설정 상태를 표시
    function showFbStatus() {
      if (settings.fbApiKey && settings.fbProject) {
        $('cwa-fb-parsed').textContent = '✓ 설정됨 (projectId: ' + settings.fbProject +
          '). 바꾸려면 새 firebaseConfig 로 덮어쓰세요.';
      } else {
        $('cwa-fb-parsed').textContent = '아직 설정 안 됨 — firebaseConfig 를 붙여넣으세요.';
      }
    }
    function fbGrab(t, name) {
      const m = t.match(new RegExp(name + '\\s*:\\s*["\']([^"\']+)["\']'));
      return m ? m[1] : '';
    }
    // 입력 중: 상태만 미리 표시 (settings 는 건드리지 않음 — 저장 눌러야 반영)
    function previewFbStatus() {
      const t = $('cwa-fb-paste').value;
      if (!t.trim()) {
        $('cwa-fb-parsed').textContent = '비어 있음 — 이대로 [저장]하면 Firebase 설정이 해제됩니다.';
        return;
      }
      const k = fbGrab(t, 'apiKey'), p = fbGrab(t, 'projectId');
      $('cwa-fb-parsed').textContent = (k && p)
        ? ('✓ 인식됨 (projectId: ' + p + ') — [저장]을 눌러주세요')
        : '⚠ apiKey / projectId 를 찾지 못했어요. firebaseConfig 전체를 붙여넣어 주세요.';
    }
    // 저장 시: 입력칸 내용을 settings 에 반영. 비어 있으면 Firebase 설정을 해제.
    function applyFbConfig() {
      const t = $('cwa-fb-paste').value;
      if (!t.trim()) {
        settings.fbRaw = ''; settings.fbApiKey = '';
        settings.fbProject = ''; settings.fbAppId = '';
        return;
      }
      settings.fbRaw = t;   // 유저가 작성한 원본 그대로 보관
      settings.fbApiKey = fbGrab(t, 'apiKey');
      settings.fbProject = fbGrab(t, 'projectId');
      settings.fbAppId = fbGrab(t, 'appId');
    }
    function applySettingsForm() {
      applyFbConfig();   // 입력칸의 firebaseConfig 를 settings 에 반영 (빈칸이면 해제)
      settings.provider = $('cwa-provider').value;
      settings.geminiKey = $('cwa-gemini-key').value.trim();
      settings.systemPrompt = $('cwa-sysprompt').value.trim() || DEFAULT_SYSTEM_PROMPT;
      saveSettings(settings);
    }

    /* ---- 전송 내용 미리보기 ---- */
    function renderPreview() {
      const cnt = Math.max(1, parseInt($('cwa-send-n').value, 10) || settings.msgCount);
      const f = getFeatures();
      const chat = scrapeChat();
      const L = [];
      const think = settings.thinking === '0' ? '끔' : (settings.thinking === 'high' ? '깊게' : '자동');
      L.push('● 모델 ' + (settings.model || '') + '  / 생각 ' + think);
      L.push('');
      L.push('[ 항목별 글자수 ]');
      const sec = function (label, on, content) {
        if (!on) L.push('  □ ' + label + ' : 꺼짐');
        else L.push('  ■ ' + label + ' : ' + (content ? content.length.toLocaleString() + '자' : '없음'));
      };
      sec('대화프로필', settings.sendPersona, f.profile);
      sec('유저노트', settings.sendUserNote, f.userNote);
      sec('요약메모리', settings.sendMemory, f.memory);
      const sliced = cnt > 0 ? chat.slice(-cnt) : chat;
      const logLen = sliced.reduce(function (s, m) { return s + (m.text ? m.text.length : 0); }, 0);
      L.push('  ■ 채팅 로그 : ' + logLen.toLocaleString() + '자 (' + sliced.length + '개 메시지)');
      const full = buildUserText(chat, '(여기에 질문이 들어갑니다)', cnt);
      L.push('  ─────────────');
      L.push('  전체 전송 크기 : ' + full.length.toLocaleString() + '자');
      L.push('');
      L.push('════════ AI 에게 실제로 보내지는 내용 ════════');
      L.push('');
      L.push(full);
      $('cwa-preview-text').textContent = L.join('\n');
    }

    /* ---- 이벤트 ---- */
    $('cwa-close').addEventListener('click', closePanel);
    $('cwa-gear').addEventListener('click', function () {
      showView(views.settings.classList.contains('cwa-hide') ? 'settings' : 'main');
    });
    $('cwa-send').addEventListener('click', doAsk);
    $('cwa-q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doAsk(); }
    });
    $('cwa-refresh').addEventListener('click', function () {
      const b = $('cwa-refresh');
      b.textContent = '불러오는 중…';
      refreshFeatureData();
      softRefresh();
      setTimeout(function () { b.textContent = '🔄 불러오기'; refreshMain(); }, 2600);
    });
    $('cwa-clear').addEventListener('click', function () {
      if (thread.length && !window.confirm('이 채팅방의 대화 기록을 모두 지울까요?')) return;
      clearThread();
    });
    // 모델·생각은 질문창에서 바로 변경 (변경 즉시 저장)
    $('cwa-model').addEventListener('change', function () {
      const v = $('cwa-model').value;
      if (v === '__custom__') {
        $('cwa-model-custom').style.display = '';
        $('cwa-model-custom').focus();
        return;
      }
      $('cwa-model-custom').style.display = 'none';
      settings.model = v;
      saveSettings(settings);
      refreshMain();   // 비용 추정 표시 갱신
    });
    $('cwa-model-custom').addEventListener('change', function () {
      settings.model = $('cwa-model-custom').value.trim() || DEFAULTS.model;
      saveSettings(settings);
      refreshMain();
    });
    $('cwa-think').addEventListener('change', function () {
      settings.thinking = $('cwa-think').value;
      saveSettings(settings);
    });
    // 첨부 체크박스 — 변경 즉시 settings 에 반영(저장)해야 refreshMain 이 되돌리지 않음
    function wireAttachChk(id, key) {
      $(id).addEventListener('change', function () {
        settings[key] = $(id).checked;
        saveSettings(settings);
        refreshMain();
      });
    }
    wireAttachChk('cwa-c-persona', 'sendPersona');
    wireAttachChk('cwa-c-note', 'sendUserNote');
    wireAttachChk('cwa-c-memory', 'sendMemory');
    // 채팅로그·요약메모리 개수 — 질문창에서 변경, 변경 즉시 저장 + 입력크기 표시 갱신
    function wireCountInput(id, key, lo, hi) {
      $(id).addEventListener('change', function () {
        let v = parseInt($(id).value, 10);
        if (isNaN(v)) v = settings[key];
        v = Math.max(lo, Math.min(hi, v));
        settings[key] = v;
        $(id).value = v;
        saveSettings(settings);
        if (key === 'msgCount') ensureMoreMessages();  // 늘렸으면 과거 메시지 더 수집
        refreshMain();
      });
    }
    wireCountInput('cwa-send-n', 'msgCount', 1, 99999);   // 상한 없음(사실상)
    wireCountInput('cwa-memcount', 'memoryCount', 0, 999);
    $('cwa-provider').addEventListener('change', updateProviderFields);
    // firebaseConfig 입력 중에는 상태만 표시, 실제 반영은 [저장] 시
    $('cwa-fb-paste').addEventListener('input', previewFbStatus);
    $('cwa-reset-prompt').addEventListener('click', function () {
      $('cwa-sysprompt').value = DEFAULT_SYSTEM_PROMPT;
    });
    $('cwa-save').addEventListener('click', function () {
      applySettingsForm();
      $('cwa-save-msg').textContent = '저장되었습니다 ✓';
      setTimeout(function () { $('cwa-save-msg').textContent = ''; }, 1800);
    });
    $('cwa-preview').addEventListener('click', function () { showView('preview'); });
    $('cwa-prev-back').addEventListener('click', function () { showView('main'); });
    $('cwa-prev-copy').addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText($('cwa-preview-text').textContent || '').then(function () {
        const b = $('cwa-prev-copy'); b.textContent = '복사됨';
        setTimeout(function () { b.textContent = '복사'; }, 1200);
      });
    });

    $('cwa-send-n').value = settings.msgCount;
    $('cwa-memcount').value = settings.memoryCount;
    populateModelSelect();   // 모델 드롭다운 초기화

    window.addEventListener('resize', function () {
      if (panelEl.classList.contains('open')) positionPanel();
    });
    setInterval(injectToolbarButton, 500);
    setTimeout(injectToolbarButton, 300);
    setTimeout(injectToolbarButton, 1800);

    try {
      GM_registerMenuCommand('어시스턴트 열기/닫기', togglePanel);
      GM_registerMenuCommand('설정 열기', function () {
        if (!panelEl.classList.contains('open')) panelEl.classList.add('open');
        showView('settings');
      });
    } catch (e) {}

    // 페이지 로드 후 한 번 미리 데이터를 받아둔다
    setTimeout(refreshFeatureData, 3000);

    // SPA 라 채팅방 이동 시 페이지 리로드가 없음 — URL 변경을 감지해 패널 갱신
    let _lastUrl = location.href;
    setInterval(function () {
      if (location.href === _lastUrl) return;
      _lastUrl = location.href;
      if (!panelEl.classList.contains('open')) return;   // 닫혀 있으면 다음에 열 때 갱신됨
      refreshFeatureData();   // 새 채팅방 데이터 수집(syncSummaryChat 포함)
      refreshMain();
      softRefresh();
    }, 800);

    console.log('[크랙 캐릭터챗 어시스턴트] v' + CWA_VERSION + ' 로드됨');
  }
})();
