// ==UserScript==
// @name         주접이
// @namespace    crack-mini-dot-commentator
// @version      0.2.0
// @description  냐냐냥!!!
// @match        https://crack.wrtn.ai/*
// @updateURL    none
// @downloadURL  none
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==


(() => {
  'use strict';


  if (window.__CRACK_MINI_DOT_COMMENTATOR__) return;
  window.__CRACK_MINI_DOT_COMMENTATOR__ = true;


  const ID = 'cmdc';
  const STYLE_ID = `${ID}-style`;
  const ROOT_ID = `${ID}-root`;
  const PANEL_ID = `${ID}-panel`;
  const STORE_KEY = `${ID}:store:v1`;
  const POS_KEY = `${ID}:pos:v1`;
  const PANEL_POS_KEY = `${ID}:panel-pos:v1`;
  const TOKEN_COST_USD = {
    'gemini-2.5-flash-lite': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    'gemini-2.5-flash': { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    'gemini-3-flash-preview': { inputPerMillion: 0.50, outputPerMillion: 3.00 },
    'gemini-3-pro-preview': { inputPerMillion: 2.00, outputPerMillion: 12.00 },
  };
  const USD_TO_KRW = 1550;


  const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  const MODEL_OPTIONS = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
  ];
  const IDLE_SLEEP_MS = 1000 * 60 * 3;
  const STABLE_REPLY_MS = 2200;
  const MIN_REPLY_CHARS = 18;
  const MAX_REPLY_CHARS = 1300;
  const MAX_CONTEXT_CHARS = 650;
  const MAX_LOGS = 80;


  const TENDENCIES = {
    romance: { label: '완전야르다', words: /사랑|고백|질투|키스|입맞춤|연인|데이트|심장|눈빛|설렘|끌어안|품에|보고 싶|좋아해|사귀/i },
    spice: { label: '( ͡° ͜ʖ ͡°)', words: /벗|침대|허벅|가슴|허리|입술|뜨거|욕망|쾌락|애무|몸|나체|숨결|섹|야해/i },
    angst: { label: '상처수집가', words: /눈물|상처|버림|후회|미안|죽|고통|외로|절망|무너|울었|슬픔|불안|공포/i },
    power: { label: '권위처형인', words: /왕|황제|공작|상관|명령|권력|계급|귀족|복종|처벌|법|재판|군주|신하/i },
    chaos: { label: '혼돈중독', words: /ㅋㅋ|미친|돌았|난장|폭발|싸움|도망|사건|위험|비밀|배신|거짓|혼란|충격/i },
  };


  const apiCaptures = [];
  let summaryAccum = [];
  let summarySeen = {};
  let summaryChatId = null;


  function defaultStore() {
    return {
      apiKey: '',
      model: DEFAULT_MODEL,
      petName: '뽀뽀',
      personality: '재치, 막말, 풍자, 시적 비유, 권위 조롱, 자유분방한 로코 엔진',
      headerColor: '#8fbfd3',
      roomNotes: '',
      contextCount: 3,
      memoryCount: 3,
      sendUserNote: true,
      sendMemory: true,
      enabled: true,
      lastKey: '',
      lastActiveAt: Date.now(),
      level: 1,
      exp: 0,
      bond: 0,
      seen: 0,
      tendency: { romance: 0, spice: 0, angst: 0, power: 0, chaos: 0 },
      logs: [],
      usage: { input: 0, output: 0, count: 0 },
    };
  }


  function readStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const rooms = raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {};
      const legacyRoom = { ...raw };
      delete legacyRoom.apiKey;
      delete legacyRoom.model;
      delete legacyRoom.rooms;
      const room = rooms[roomKey()] || legacyRoom;
      const store = {
        ...defaultStore(),
        ...room,
        apiKey: raw.apiKey ?? room.apiKey ?? '',
        model: raw.model ?? room.model ?? DEFAULT_MODEL,
      };
      if (!store.headerColor || store.headerColor === '#8b5cf6') store.headerColor = '#8fbfd3';
      return store;
    } catch {
      return defaultStore();
    }
  }


  function writeStore(next) {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    const current = readStore();
    const merged = { ...current, ...next };
    const room = { ...merged };
    delete room.apiKey;
    delete room.model;
    delete room.rooms;
    const rooms = raw.rooms && typeof raw.rooms === 'object' ? { ...raw.rooms } : {};
    rooms[roomKey()] = room;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      apiKey: merged.apiKey || '',
      model: merged.model || DEFAULT_MODEL,
      rooms,
    }));
  }


  function updateStore(fn) {
    const store = readStore();
    fn(store);
    writeStore(store);
    return store;
  }


  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }


  function normalize(text) {
    return String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }


  function hashTiny(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }


  function roomKey() {
    const match = location.pathname.match(/\/stories\/([^/]+)\/episodes\/([^/?#]+)/);
    if (match) return `${match[1]}:${match[2]}`;
    return location.pathname || 'default';
  }


  function isEpisodePath() {
    return /\/stories\/[^/]+\/episodes\/[^/?#]+/.test(location.pathname) || /\/episodes\/[^/?#]+/.test(location.pathname);
  }


  function chatId() {
    const match = location.pathname.match(/(?:episodes|chats?)\/([a-zA-Z0-9]{8,})/);
    return match ? match[1] : null;
  }


  function latestCapture(reKey) {
    for (let i = apiCaptures.length - 1; i >= 0; i--) {
      if (reKey.test(apiCaptures[i].key)) return apiCaptures[i].json;
    }
    return null;
  }


  function getNextFallback() {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      const json = JSON.parse(el.textContent || '{}');
      return json?.props?.pageProps?.fallback || null;
    } catch {
      return null;
    }
  }


  function syncSummaryChat() {
    const id = chatId();
    if (!id || id === summaryChatId) return;
    summaryChatId = id;
    summaryAccum = [];
    summarySeen = {};
  }


  function mergeSummaries(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(item => {
      const key = item?._id || JSON.stringify(item);
      if (!summarySeen[key]) {
        summarySeen[key] = 1;
        summaryAccum.push(item);
        added++;
      }
    });
    return added;
  }


  function recordCapture(url, status, body) {
    if (!/crack-api\.wrtn\.ai/.test(String(url || ''))) return;
    if (!body || String(body).length > 600000) return;
    let json = null;
    try { json = JSON.parse(body); } catch { return; }
    const key = String(url).split('?')[0];
    const idx = apiCaptures.findIndex(item => item.key === key);
    const rec = { key, url: String(url), status, json, time: Date.now() };
    if (idx >= 0) apiCaptures[idx] = rec;
    else apiCaptures.push(rec);
    if (apiCaptures.length > 80) apiCaptures.shift();

    if (/\/summaries(\?|$)/.test(rec.url) && Array.isArray(json?.data?.summaries)) {
      const match = rec.url.match(/\/chats\/([a-zA-Z0-9]+)\/summaries/);
      syncSummaryChat();
      if (match?.[1] && match[1] === summaryChatId) {
        const added = mergeSummaries(json.data.summaries);
        const cursor = json.data.nextCursor;
        if (cursor && added > 0 && summaryAccum.length < 80) {
          const baseUrl = rec.url.split(/[?&]cursor=/)[0];
          proactiveFetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`);
        }
      }
    }
  }


  function proactiveFetch(url) {
    try { window.dispatchEvent(new CustomEvent(`${ID}-fetch`, { detail: String(url) })); } catch {}
  }


  function refreshFeatureData() {
    syncSummaryChat();
    const id = chatId();
    if (!id) return;
    const base = 'https://crack-api.wrtn.ai';
    proactiveFetch(`${base}/crack-gen/v3/chats/${id}`);
    proactiveFetch(`${base}/crack-gen/v3/chats/${id}/summaries?limit=20&type=longTerm&orderBy=newest&filter=all`);
  }


  function getRoomData() {
    const id = chatId();
    if (!id) return null;
    const captured = latestCapture(new RegExp(`/v3/chats/${id}$`));
    if (captured?.data) return captured.data;
    const fallback = getNextFallback();
    return fallback?.[`/v3/chats/${id}`]?.data || null;
  }


  function findUserNote() {
    const note = getRoomData()?.story?.userNote?.content;
    return typeof note === 'string' && note.trim() ? note.trim() : '';
  }


  function findSummary(count) {
    syncSummaryChat();
    const n = Math.max(0, Math.min(20, Number(count || 0)));
    if (n <= 0) return '';
    let list = summaryAccum;
    if (!list.length) {
      const captured = latestCapture(/\/summaries$/);
      list = Array.isArray(captured?.data?.summaries) ? captured.data.summaries : [];
    }
    return list.slice(0, n).reverse().map(item => {
      const title = item?.title ? `■ ${item.title}\n` : '';
      return `${title}${item?.summary || ''}`.trim();
    }).filter(Boolean).join('\n\n').slice(0, 1800);
  }


  function isOwnNode(el) {
    return !!el?.closest?.(`#${ROOT_ID}, #${PANEL_ID}`);
  }


  function installApiCapture() {
    if (window.__CRACK_MINI_DOT_CAPTURE__) return;
    window.__CRACK_MINI_DOT_CAPTURE__ = true;
    try {
      const script = document.createElement('script');
      script.textContent = `(${function (id) {
        const host = 'crack-api.wrtn.ai';
        const savedHeaders = {};
        const post = detail => {
          try { window.dispatchEvent(new CustomEvent(`${id}-capture`, { detail })); } catch {}
        };
        const rememberHeader = (name, value) => {
          if (!name || value == null) return;
          const key = String(name).toLowerCase();
          if (key === 'authorization' || key.indexOf('x-') === 0) savedHeaders[key] = String(value);
        };
        const collectHeaders = headers => {
          try {
            if (!headers) return;
            if (typeof headers.forEach === 'function') headers.forEach((v, k) => rememberHeader(k, v));
            else if (Array.isArray(headers)) headers.forEach(pair => rememberHeader(pair[0], pair[1]));
            else Object.keys(headers).forEach(k => rememberHeader(k, headers[k]));
          } catch {}
        };
        const originalFetch = window.fetch;
        if (originalFetch) {
          window.fetch = function () {
            const args = arguments;
            try {
              const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
              if (url.includes(host)) {
                collectHeaders(args[1]?.headers);
                collectHeaders(args[0]?.headers);
              }
            } catch {}
            return originalFetch.apply(this, args).then(res => {
              try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                if (url.includes(host)) {
                  res.clone().text().then(body => post({ url, status: res.status, body })).catch(() => {});
                }
              } catch {}
              return res;
            });
          };
        }
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        const setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.open = function (method, url) {
          this.__cmdcUrl = url;
          return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
          try { if (String(this.__cmdcUrl || '').includes(host)) rememberHeader(name, value); } catch {}
          return setRequestHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
          const xhr = this;
          xhr.addEventListener('load', () => {
            try {
              if (String(xhr.__cmdcUrl || '').includes(host)) {
                post({ url: String(xhr.__cmdcUrl), status: xhr.status, body: xhr.responseText });
              }
            } catch {}
          });
          return send.apply(this, arguments);
        };
        window.addEventListener(`${id}-fetch`, event => {
          const url = typeof event.detail === 'string' ? event.detail : '';
          if (!url) return;
          try {
            const headers = {};
            Object.keys(savedHeaders).forEach(key => { headers[key] = savedHeaders[key]; });
            fetch(url, { credentials: 'include', headers }).then(res => (
              res.text().then(body => post({ url, status: res.status, body }))
            )).catch(() => {});
          } catch {}
        });
      }.toString()})(${JSON.stringify(ID)});`;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
      window.addEventListener(`${ID}-capture`, event => {
        const data = event.detail || {};
        recordCapture(data.url, data.status, data.body);
      });
    } catch {}
  }


  function visible(el) {
    const r = el?.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) return false;
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }


  function cleanMarkdownText(markdown) {
    if (!(markdown instanceof HTMLElement) || isOwnNode(markdown)) return '';
    const clone = markdown.cloneNode(true);
    clone.querySelectorAll([
      '.not-wrtn-markdown',
      '[id^="cmdc"]',
      'script',
      'style',
      'button',
      '[role="button"]',
      'svg',
      'textarea',
      'input',
      'select',
      'pre',
      'code',
    ].join(',')).forEach(el => el.remove());
    return normalize(clone.innerText || clone.textContent || '');
  }


  function findMessageScope() {
    return document.querySelector('main [data-testid="virtuoso-scroller"][data-virtuoso-scroller="true"]')
      || document.querySelector('main [data-virtuoso-scroller="true"]')
      || document.querySelector('main div[tabindex="0"].scrollbar')
      || document.querySelector('main');
  }


  function messageSortKey(group, markdown, index) {
    const r = group?.getBoundingClientRect?.() || markdown?.getBoundingClientRect?.();
    const lenAt = Number(markdown?.getAttribute?.('data-sgb-len-at') || 0) || 0;
    const groupId = String(group?.getAttribute?.('data-message-group-id') || '').trim();
    const msgId = String(group?.getAttribute?.('data-message-id') || '').trim();
    return { lenAt, groupId, msgId, bottom: Number(r?.bottom || 0), top: Number(r?.top || 0), index };
  }


  function compareKey(a, b) {
    if (a.lenAt !== b.lenAt) return a.lenAt - b.lenAt;
    if (a.bottom !== b.bottom) return a.bottom - b.bottom;
    if (a.top !== b.top) return a.top - b.top;
    return a.index - b.index;
  }


  function getEntries() {
    if (!isEpisodePath()) return [];
    const scope = findMessageScope();
    if (!(scope instanceof HTMLElement)) return [];
    const groups = scope.matches?.('[data-message-group-id]')
      ? [scope]
      : Array.from(scope.querySelectorAll('[data-message-group-id]'));


    return groups.map((group, index) => {
      if (!(group instanceof HTMLElement) || isOwnNode(group)) return null;
      if (group.closest('[role="dialog"], #igx-live-popup')) return null;
      const markdown = group.querySelector('.wrtn-markdown:not(.not-wrtn-markdown)');
      if (!(markdown instanceof HTMLElement) || !visible(group)) return null;
      const text = cleanMarkdownText(markdown);
      if (text.length < 2) return null;
      return { group, markdown, text, key: messageSortKey(group, markdown, index) };
    }).filter(Boolean).sort((a, b) => compareKey(a.key, b.key));
  }


  function looksLikeUserMessage(entry, entries) {
    const group = entry?.group;
    const markdown = entry?.markdown;
    if (!(group instanceof HTMLElement) || !(markdown instanceof HTMLElement)) return false;


    const scope = findMessageScope();
    const attrParts = [];
    let node = group;


    for (let i = 0; node instanceof HTMLElement && node !== scope && i < 7; i++) {
      attrParts.push(
        node.getAttribute('data-author'),
        node.getAttribute('data-role'),
        node.getAttribute('data-sender'),
        node.getAttribute('data-testid'),
        node.getAttribute('aria-label'),
        node.getAttribute('class'),
        node.dataset?.author,
        node.dataset?.role,
        node.dataset?.sender,
      );
      node = node.parentElement;
    }


    const attrs = attrParts.filter(Boolean).join(' ').toLowerCase();


    if (/\b(user|human|me|client|outgoing|sent)\b|사용자|내\s*메시지|보낸\s*메시지/i.test(attrs)) return true;
    if (/\b(self-end|justify-end|items-end|ml-auto|text-right|outgoing|mine|my-message|user-message)\b/i.test(attrs)) return true;
    if (/\b(ai|assistant|bot|character|incoming|received)\b|답변|캐릭터/i.test(attrs)) return false;


    const scopeRect = scope?.getBoundingClientRect?.();
    const groupRect = group.getBoundingClientRect();
    const textRect = markdown.getBoundingClientRect();
    const center = scopeRect ? scopeRect.left + scopeRect.width / 2 : innerWidth / 2;
    const textCenter = textRect.left + textRect.width / 2;
    const groupStyle = getComputedStyle(group);
    const textStyle = getComputedStyle(markdown);


    if (groupStyle.textAlign === 'right' || textStyle.textAlign === 'right') return true;
    if (groupStyle.marginLeft === 'auto' || textStyle.marginLeft === 'auto') return true;


    for (let node = group; node instanceof HTMLElement && node !== scope; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.justifyContent === 'flex-end' || style.alignItems === 'flex-end') return true;
    }


    if (textRect.left > center) return true;
    if (textCenter > center + 80 && textRect.width < Math.max(760, innerWidth * 0.72)) return true;
    if (groupRect.left > center && groupRect.width < Math.max(760, innerWidth * 0.72)) return true;


    const index = entries.indexOf(entry);
    if (index >= 1) {
      const prev = entries[index - 1];
      const prevTextRect = prev?.markdown?.getBoundingClientRect?.();
      if (prevTextRect && textRect.left - prevTextRect.left > 80) return true;
    }


    return false;
  }


  function latestAiReply() {
    const entries = getEntries();
    if (!entries.length) return null;
    const store = readStore();
    const contextCount = Math.max(0, Math.min(12, Number(store.contextCount ?? 3)));
    const latestUserIndex = awaitingUserReply ? latestUserishEntryIndex(entries) : -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      const picked = entries[i];
      if (looksLikeUserMessage(picked, entries)) continue;
      if (matchesLastSubmittedText(picked.text)) continue;
      if (latestUserIndex >= 0 && i <= latestUserIndex) continue;
      const latest = normalize(picked.text);
      if (latest.length < MIN_REPLY_CHARS) continue;
      const context = entries
        .slice(Math.max(0, i - contextCount), i)
        .map(x => `${looksLikeUserMessage(x, entries) || matchesLastSubmittedText(x.text) ? '나' : '캐릭터'}: ${normalize(x.text).slice(-360)}`)
        .filter(Boolean)
        .join('\n---\n')
        .slice(-Math.max(MAX_CONTEXT_CHARS, contextCount * 420));
      const domKey = [
        picked.group.getAttribute('data-message-group-id') || '',
        picked.group.getAttribute('data-message-id') || '',
        picked.markdown.getAttribute('data-sgb-len-at') || '',
      ].filter(Boolean).join(':');
      return {
        latest,
        context,
        key: `${roomKey()}|${domKey}|${latest.length}:${hashTiny(latest)}:${latest.slice(-60)}`,
      };
    }
    return null;
  }


  function latestUserishEntryIndex(entries) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (looksLikeUserMessage(entries[i], entries) || matchesLastSubmittedText(entries[i].text)) return i;
    }
    return -1;
  }


  function topTendency(tendency) {
    const entries = Object.entries({ ...defaultStore().tendency, ...(tendency || {}) });
    entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
    const [key, value] = entries[0] || ['romance', 0];
    return Number(value || 0) > 0 ? key : 'romance';
  }


  function levelForExp(exp) {
    let level = 1;
    let need = 45;
    let left = Math.max(0, Number(exp || 0));
    while (left >= need) {
      left -= need;
      level++;
      need += 20;
    }
    return level;
  }


  function nextNeedForLevel(level) {
    return 45 + (Math.max(1, Number(level || 1)) - 1) * 20;
  }


  function expFloorForLevel(level) {
    let sum = 0;
    for (let i = 1; i < Math.max(1, Number(level || 1)); i++) sum += nextNeedForLevel(i);
    return sum;
  }


  function priceForModel(model) {
    const name = String(model || DEFAULT_MODEL).toLowerCase();
    if (name.includes('pro')) return TOKEN_COST_USD['gemini-3-pro-preview'];
    if (name.includes('3') && name.includes('flash')) return TOKEN_COST_USD['gemini-3-flash-preview'];
    if (name.includes('flash-lite')) return TOKEN_COST_USD['gemini-2.5-flash-lite'];
    if (name.includes('flash')) return TOKEN_COST_USD['gemini-2.5-flash'];
    return TOKEN_COST_USD[DEFAULT_MODEL];
  }


  function usageCost(usage = {}, model = DEFAULT_MODEL) {
    const price = priceForModel(model);
    const input = Number(usage.input || 0);
    const output = Number(usage.output || 0);
    return (input / 1000000) * price.inputPerMillion + (output / 1000000) * price.outputPerMillion;
  }


  function usageFromMetadata(metadata = {}) {
    const candidates = Number(metadata.candidatesTokenCount || 0);
    const thoughts = Number(metadata.thoughtsTokenCount || 0);
    const output = candidates + thoughts;
    const total = Number(metadata.totalTokenCount || 0);
    const inferredInput = total > output ? total - output : 0;
    return {
      input: Number(metadata.promptTokenCount || inferredInput || 0),
      output,
      thoughts,
    };
  }


  function formatCostKrw(usd) {
    const value = Number(usd || 0);
    const krw = value * USD_TO_KRW;
    return `약 ${krw.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원`;
  }


  function logId(item) {
    return item?.id || `${Number(item?.at || 0)}:${hashTiny(item?.line || '')}`;
  }


  function safeColor(value, fallback = '#8fbfd3') {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }


  function applyGrowth(text, line, usage = {}) {
    return updateStore(store => {
      const tendency = { ...defaultStore().tendency, ...(store.tendency || {}) };
      for (const [key, item] of Object.entries(TENDENCIES)) {
        if (item.words.test(text)) tendency[key] = Number(tendency[key] || 0) + 1;
      }
      store.tendency = tendency;
      store.seen = Number(store.seen || 0) + 1;
      store.exp = Number(store.exp || 0) + 12 + Math.min(10, Math.floor(text.length / 220));
      store.level = levelForExp(store.exp);
      store.bond = Math.min(100, Number(store.bond || 0) + 1);
      store.lastActiveAt = Date.now();
      store.usage = {
        input: Number(store.usage?.input || 0) + Number(usage.input || 0),
        output: Number(store.usage?.output || 0) + Number(usage.output || 0),
        count: Number(store.usage?.count || 0) + 1,
        cost: Number(store.usage?.cost || 0) + usageCost(usage, usage.model || store.model),
        lastCost: usageCost(usage, usage.model || store.model),
      };
      store.logs = [{
        id: `${Date.now()}:${hashTiny(`${line}:${Math.random()}`)}`,
        at: Date.now(),
        room: roomKey(),
        line,
        model: usage.model || store.model || DEFAULT_MODEL,
        usage: {
          input: Number(usage.input || 0),
          output: Number(usage.output || 0),
          thoughts: Number(usage.thoughts || 0),
          cost: usageCost(usage, usage.model || store.model),
        },
      }, ...(store.logs || [])].slice(0, MAX_LOGS);
    });
  }


  function promptFor(store, payload) {
    const latest = payload.latest.slice(-MAX_REPLY_CHARS);
    const contextLimit = Math.max(MAX_CONTEXT_CHARS, Math.max(0, Number(store.contextCount || 0)) * 420);
    const context = payload.context ? payload.context.slice(-contextLimit) : '';
    const petName = store.petName || '뽀뽀';
    const vibe = TENDENCIES[topTendency(store.tendency)]?.label || '로코광';
    const notes = store.roomNotes ? String(store.roomNotes).slice(-900) : '';
    const userNote = store.sendUserNote ? findUserNote().slice(-900) : '';
    const memory = store.sendMemory ? findSummary(store.memoryCount).slice(-1600) : '';
    const recent = recentBotLines(store, 10);


    return [
      '너는 사용자가 읽는 캐릭터 채팅을 옆에서 같이 보는 한국어 트친/절친 반응봇이다.',
      `이름은 ${petName}. 성격은 ${store.personality || '재치, 막말, 풍자, 로코 엔진'}. 현재 성장 성향은 ${vibe}.`,
      '반드시 최신 AI 답변에만 반응한다. 사용자가 보낸 말에 답하거나 조언하지 않는다.',
      '비서처럼 분석/칭찬/요약하지 말고, 지금 장면의 감정선과 캐릭터 관계를 보고 웃긴 주접 한 문장만 쓴다.',
      '욕설, 천박한 드립, 트위터식 밈, 풍자, 시적 비유를 허용한다. 단, 실제 혐오표현/위협/개인정보 언급은 하지 않는다.',
      '항상 한국어 1문장. 줄바꿈 금지. 30~70자 안에서 완결된 웃긴 주접을 쓴다. 문장을 중간에 끊지 말고 반드시 끝맺는다.',
      '카오모지/이모티콘/얼굴문자/괄호 이모티콘을 붙이지 않는다.',
      '최근에 쓴 단어, 비유, 말끝, 문장 구조, 유행어를 반복하지 말고 새 표현으로 바꾼다.',
      notes ? `노트(사용자가 직접 적은 세계관/관계 참고):\n${notes}` : '',
      userNote ? `유저노트(사이트에 저장된 참고):\n${userNote}` : '',
      memory ? `장기기억/요약메모리(최근 ${Math.max(0, Number(store.memoryCount || 0))}개):\n${memory}` : '',
      recent ? `최근 주접(표현 재사용 금지):\n${recent}` : '',
      context ? `과거대화(최근 ${Math.max(0, Number(store.contextCount || 0))}개):\n${context}` : '',
      `최신 AI 답변:\n${latest}`,
    ].filter(Boolean).join('\n\n');
  }


  function talkPromptFor(store, text) {
    const petName = store.petName || '뽀뽀';
    return [
      '너는 사용자가 캐릭터 채팅 보면서 옆에 세워둔 한국어 트친/절친 반응봇이다.',
      `이름은 ${petName}. 성격은 ${store.personality || '재치, 막말, 풍자, 로코 엔진'}.`,
      '아래 사용자의 짧은 말에만 반응한다. 채팅 본문을 상상해서 끼워넣지 않는다.',
      '사용자가 설정을 정정하면 맞장구치면서 그 정정을 앞으로 참고하겠다는 느낌을 자연스럽게 담는다.',
      '항상 한국어 1문장. 줄바꿈 금지. 30~70자 안에서 완결된 웃긴 반응을 쓴다. 카오모지/이모티콘은 붙이지 않는다.',
      `사용자가 말검:\n${String(text || '').slice(-500)}`,
    ].join('\n\n');
  }


  function recentBotLines(store, count = 8) {
    return (store.logs || [])
      .map(item => normalize(item?.line || ''))
      .filter(Boolean)
      .slice(0, count)
      .map((line, index) => `${index + 1}. ${line.slice(0, 120)}`)
      .join('\n');
  }


  function parseGeminiText(json) {
    return normalize(json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' ') || '');
  }


  function stripTrailingKaomoji(text) {
    return normalize(text)
      .replace(/\s*(?:[(（][^()\n（）]{1,24}[)）]|[♡♥ㅠㅜㅋㅎ]+|[ᐛ˶ᵔᵕᵔ•⤙˙꒳◜◡Φωฅ´ཀ]+)\s*$/u, '')
      .trim();
  }


  function cleanOneSentence(text) {
    let line = normalize(text).replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ');
    line = line.split(/\n/)[0] || '';
    line = stripTrailingKaomoji(line);
    if (line.length > 500) line = `${line.slice(0, 498).trim()}…`;
    return line;
  }


  function fallbackLine(text) {
    const samples = [
      '머임? 저 눈빛이면 주민등록상 연애 중이어야 됨',
      '아니 저러고 안 사귄다고? 나 오늘도 상식 패배함',
      '둘이 감정선으로 줄다리기하다가 전봇대 뽑겠는데',
      '냐냐냥!!! 지금 공기까지 옆에서 박수치는 중임',
      '저 분위기면 국세청도 썸세 걷으러 옴',
      '말은 아닌 척하는데 심장은 이미 혼인신고서 출력함',
    ];
    const spice = TENDENCIES.spice.words.test(text) ? '야르방댕이 공개쇼 직전의 공기 뭐임' : '';
    const picked = spice || samples[Math.floor(Math.random() * samples.length)];
    return picked;
  }


  function gmRequestJson({ url, headers, data }) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url,
          headers,
          data: JSON.stringify(data),
          timeout: 20000,
          onload: res => {
            try {
              const json = JSON.parse(res.responseText || '{}');
              if (res.status < 200 || res.status >= 300) reject(new Error(json?.error?.message || `HTTP ${res.status}`));
              else resolve(json);
            } catch (err) {
              reject(err);
            }
          },
          onerror: () => reject(new Error('network error')),
          ontimeout: () => reject(new Error('timeout')),
        });
      });
    }


    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    }).then(async res => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      return json;
    });
  }


  async function makeComment(payload) {
    const store = readStore();
    if (!store.apiKey) return fallbackLine(payload.latest);
    refreshFeatureData();


    const model = String(store.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const body = {
      contents: [{ role: 'user', parts: [{ text: promptFor(store, payload) }] }],
      generationConfig: {
        temperature: 1.05,
        topP: 0.9,
        maxOutputTokens: 120,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const json = await gmRequestJson({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': store.apiKey },
      data: body,
    });
    const usage = json?.usageMetadata || {};
    const countedUsage = usageFromMetadata(usage);
    const line = cleanOneSentence(parseGeminiText(json) || fallbackLine(payload.latest));
    applyGrowth(payload.latest, line, {
      ...countedUsage,
      model,
    });
    return line;
  }


  async function makeTalk(text) {
    const store = readStore();
    const cleanText = normalize(text).slice(0, 500);
    if (!cleanText) return '';

    if (!store.apiKey) {
      const line = fallbackLine(cleanText);
      applyGrowth(cleanText, line);
      rememberRoomNote(cleanText);
      return line;
    }

    const model = String(store.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const body = {
      contents: [{ role: 'user', parts: [{ text: talkPromptFor(store, cleanText) }] }],
      generationConfig: {
        temperature: 1.05,
        topP: 0.9,
        maxOutputTokens: 120,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const json = await gmRequestJson({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': store.apiKey },
      data: body,
    });
    const usage = json?.usageMetadata || {};
    const countedUsage = usageFromMetadata(usage);
    const line = cleanOneSentence(parseGeminiText(json) || fallbackLine(cleanText));
    applyGrowth(cleanText, line, {
      ...countedUsage,
      model,
    });
    rememberRoomNote(cleanText);
    return line;
  }


  function rememberRoomNote(text) {
    if (!/(아닌데|아님|아니고|설정|기억|참고|연하|연상|관계|성격|캐릭터|페르소나|ㅡㅡ)/.test(text)) return;
    updateStore(store => {
      const notes = normalize(`${store.roomNotes || ''}\n- ${text}`).split('\n').slice(-8).join('\n');
      store.roomNotes = notes.slice(-600);
    });
  }


  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}, #${PANEL_ID} { all: initial; color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
      #${ROOT_ID} { position: fixed; z-index: 2147483000; left: 24px; top: 180px; width: 74px; user-select: none; touch-action: none; }
      #${ROOT_ID} .${ID}-bubble { display: none; position: absolute; right: 44px; bottom: 34px; width: max-content; max-width: min(310px, calc(100vw - 112px)); padding: 9px 11px; border: 1px solid rgba(30,30,30,.18); border-radius: 8px; background: rgba(255,255,255,.94); color: #171717; font: 700 13px/1.35 ui-sans-serif, system-ui, sans-serif; box-shadow: 0 10px 28px rgba(0,0,0,.18); word-break: keep-all; overflow-wrap: anywhere; }
      #${ROOT_ID}.speaking .${ID}-bubble { display: block; animation: ${ID}-pop .16s ease-out; }
      #${ROOT_ID} .${ID}-pet { position: relative; width: 38px; height: 38px; margin-left: auto; border: 0; background: transparent; cursor: grab; padding: 0; display: grid; place-items: center; }
      #${ROOT_ID}.dragging .${ID}-pet { cursor: grabbing; }
      #${ROOT_ID}.thinking .${ID}-pet { filter: saturate(.8); }
      #${ROOT_ID} .${ID}-name { position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); padding: 2px 5px; border-radius: 999px; background: rgba(17,17,17,.76); color: #fff; font: 800 9px/1 ui-sans-serif, system-ui, sans-serif; white-space: nowrap; }
      #${ROOT_ID} .${ID}-zzz { display: none; position: absolute; right: 1px; top: -9px; color: #7463d6; font: 900 12px/1 ui-sans-serif, system-ui, sans-serif; animation: ${ID}-float 1.8s ease-in-out infinite; }
      #${ROOT_ID}.sleep .${ID}-zzz { display: block; }
      #${ROOT_ID} svg { width: 34px; height: 34px; image-rendering: pixelated; filter: drop-shadow(0 5px 7px rgba(0,0,0,.18)); transform-origin: 50% 55%; animation: ${ID}-bob 22s ease-in-out infinite; }
      #${ROOT_ID}.sleep svg { animation: ${ID}-sleep 2.4s ease-in-out infinite; }
      #${ROOT_ID}.dragging svg { animation: none; }
      #${ROOT_ID} .${ID}-eye { transform-box: fill-box; transform-origin: center; animation: ${ID}-blink 5.2s ease-in-out infinite; }
      #${ROOT_ID} .${ID}-sleep-eye { display: none; }
      #${ROOT_ID}.sleep .${ID}-eye { display: none; }
      #${ROOT_ID}.sleep .${ID}-sleep-eye { display: block; }
      #${PANEL_ID} { position: fixed; z-index: 2147483001; left: 24px; top: 96px; width: min(360px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 32px)); overflow: auto; box-sizing: border-box; border: 1px solid rgba(0,0,0,.16); border-radius: 8px; background: rgba(255,255,255,.97); color: #161616; box-shadow: 0 18px 45px rgba(0,0,0,.22); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; }
      #${PANEL_ID}[hidden] { display: none !important; }
      #${PANEL_ID} * { box-sizing: border-box; font-family: inherit; }
      #${PANEL_ID} .${ID}-head { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--cmdc-head-color, #8fbfd3); color: #fff; cursor: move; }
      #${PANEL_ID} .${ID}-head b { font-size: 13px; }
      #${PANEL_ID} .${ID}-head button { cursor: pointer; }
      #${PANEL_ID} button { border: 0; border-radius: 6px; padding: 7px 9px; background: #27272a; color: #fff; font-weight: 800; cursor: pointer; }
      #${PANEL_ID} button.secondary { background: #ececf0; color: #1d1d1f; }
      #${PANEL_ID} .${ID}-body { padding: 12px; display: grid; gap: 10px; }
      #${PANEL_ID} label { display: grid; gap: 5px; color: #333; font-weight: 800; }
      #${PANEL_ID} input, #${PANEL_ID} select, #${PANEL_ID} textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; color: #161616; background: #fff; font: 13px/1.35 ui-sans-serif, system-ui, sans-serif; }
      #${PANEL_ID} input[type="color"] { height: 38px; padding: 3px; }
      #${PANEL_ID} textarea { min-height: 68px; resize: vertical; }
      #${PANEL_ID} .${ID}-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      #${PANEL_ID} .${ID}-stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fafafa; }
      #${PANEL_ID} .${ID}-stat span { display: block; color: #6b7280; font-size: 11px; font-weight: 800; }
      #${PANEL_ID} .${ID}-stat b { display: block; margin-top: 2px; color: #111827; font-size: 14px; }
      #${PANEL_ID} .${ID}-log { display: grid; gap: 6px; max-height: 220px; overflow: auto; padding-right: 2px; }
      #${PANEL_ID} .${ID}-line { border-left: 3px solid #a78bfa; padding: 7px 8px; background: #f7f7fb; border-radius: 0 6px 6px 0; color: #171717; }
      #${PANEL_ID} .${ID}-line-inner { display: grid; grid-template-columns: auto 1fr; gap: 7px; align-items: start; }
      #${PANEL_ID} .${ID}-line input[type="checkbox"] { width: 16px; height: 16px; margin: 2px 0 0; padding: 0; }
      #${PANEL_ID} .${ID}-danger { background: #dc2626; color: #fff; }
      #${PANEL_ID} .${ID}-talk { display: grid; gap: 6px; }
      #${PANEL_ID} .${ID}-talk textarea { min-height: 46px; }
      #${PANEL_ID} .${ID}-muted { color: #6b7280; font-size: 12px; }
      #${PANEL_ID} .${ID}-row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
      @keyframes ${ID}-pop { from { transform: translateY(4px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes ${ID}-bob {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        8% { transform: translateY(-3px) rotate(0deg); }
        16% { transform: translateY(0) rotate(0deg); }
        24% { transform: translateY(-3px) rotate(0deg); }
        32% { transform: translateY(0) rotate(0deg); }
        40% { transform: translateY(-3px) rotate(0deg); }
        46% { transform: translateY(0) rotate(0deg); }
        47% { transform: translateY(-1px) rotate(-6deg); }
        47.7% { transform: translateY(-1px) rotate(7deg); }
        48.4% { transform: translateY(-1px) rotate(-4deg); }
        49.2% { transform: translateY(0) rotate(0deg); }
        58% { transform: translateY(-3px) rotate(0deg); }
        66% { transform: translateY(0) rotate(0deg); }
        74% { transform: translateY(-3px) rotate(0deg); }
        82% { transform: translateY(0) rotate(0deg); }
        90% { transform: translateY(-3px) rotate(0deg); }
        93% { transform: translateY(0) rotate(0deg); }
        96% { transform: translateY(-2px) rotate(360deg); }
        98%, 100% { transform: translateY(0) rotate(360deg); }
      }
      @keyframes ${ID}-blink { 0%, 88%, 92%, 100% { transform: scaleY(1); } 90% { transform: scaleY(.12); } }
      @keyframes ${ID}-sleep { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
      @keyframes ${ID}-float { 0%,100% { transform: translateY(0); opacity:.5; } 50% { transform: translateY(-7px); opacity:1; } }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} .${ID}-bubble { background: rgba(29,29,32,.96); color: #f8fafc; border-color: rgba(255,255,255,.16); }
        #${PANEL_ID} { background: rgba(30,30,34,.98); color: #f8fafc; border-color: rgba(255,255,255,.14); }
        #${PANEL_ID} label, #${PANEL_ID} .${ID}-stat b, #${PANEL_ID} .${ID}-line { color: #f8fafc; }
        #${PANEL_ID} input, #${PANEL_ID} select, #${PANEL_ID} textarea { background: #111114; color: #f8fafc; border-color: #3f3f46; }
        #${PANEL_ID} .${ID}-stat, #${PANEL_ID} .${ID}-line { background: #242428; border-color: #3f3f46; }
        #${PANEL_ID} button.secondary { background: #3f3f46; color: #fff; }
      }
    `;
    document.documentElement.appendChild(style);
  }


  function spriteSvg(color = readStore().headerColor) {
    const bodyColor = safeColor(color);
    return `
      <svg viewBox="0 0 14 12" aria-hidden="true">
        <rect x="5" y="1" width="5" height="1" fill="#000000"/>
        <rect x="4" y="2" width="1" height="1" fill="#000000"/><rect x="5" y="2" width="5" height="1" fill="${bodyColor}"/><rect x="10" y="2" width="1" height="1" fill="#000000"/>
        <rect x="3" y="3" width="1" height="1" fill="#000000"/><rect x="4" y="3" width="7" height="1" fill="${bodyColor}"/><rect x="11" y="3" width="1" height="1" fill="#000000"/>
        <rect x="3" y="4" width="1" height="1" fill="#000000"/><rect x="4" y="4" width="1" height="1" fill="${bodyColor}"/><rect class="${ID}-eye" x="5" y="4" width="1" height="2" fill="#000000"/><rect class="${ID}-sleep-eye" x="5" y="5" width="2" height="1" fill="#000000"/><rect x="6" y="4" width="3" height="1" fill="${bodyColor}"/><rect class="${ID}-eye" x="9" y="4" width="1" height="2" fill="#000000"/><rect class="${ID}-sleep-eye" x="8" y="5" width="2" height="1" fill="#000000"/><rect x="10" y="4" width="1" height="1" fill="${bodyColor}"/><rect x="11" y="4" width="1" height="1" fill="#000000"/>
        <rect x="3" y="5" width="1" height="1" fill="#000000"/><rect x="4" y="5" width="1" height="1" fill="${bodyColor}"/><rect x="6" y="5" width="3" height="1" fill="${bodyColor}"/><rect x="10" y="5" width="1" height="1" fill="${bodyColor}"/><rect x="11" y="5" width="1" height="1" fill="#000000"/>
        <rect x="3" y="6" width="1" height="1" fill="#000000"/><rect x="4" y="6" width="7" height="1" fill="${bodyColor}"/><rect x="11" y="6" width="1" height="1" fill="#000000"/>
        <rect x="4" y="7" width="1" height="1" fill="#000000"/><rect x="5" y="7" width="5" height="1" fill="${bodyColor}"/><rect x="10" y="7" width="1" height="1" fill="#000000"/>
        <rect x="3" y="8" width="1" height="1" fill="#000000"/><rect x="4" y="8" width="2" height="1" fill="${bodyColor}"/><rect x="6" y="8" width="1" height="1" fill="#000000"/><rect x="7" y="8" width="1" height="1" fill="${bodyColor}"/><rect x="8" y="8" width="1" height="1" fill="#000000"/><rect x="9" y="8" width="2" height="1" fill="${bodyColor}"/><rect x="11" y="8" width="1" height="1" fill="#000000"/>
        <rect x="4" y="9" width="2" height="1" fill="#000000"/><rect x="7" y="9" width="1" height="1" fill="#000000"/><rect x="9" y="9" width="2" height="1" fill="#000000"/>
      </svg>
    `;
  }


  function renderRoot() {
    injectStyle();
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = `
        <div class="${ID}-bubble"></div>
        <button class="${ID}-pet" type="button" title="로그/설정 열기">
          <span class="${ID}-zzz">zzz</span>
          ${spriteSvg(readStore().headerColor)}
          <span class="${ID}-name"></span>
        </button>
      `;
      document.body.appendChild(root);
      restorePosition(root, POS_KEY, { left: 24, top: 180 });
      makeDraggable(root, root.querySelector(`.${ID}-pet`), POS_KEY);
      root.querySelector(`.${ID}-pet`).addEventListener('click', event => {
        if (root.dataset.dragged === '1') return;
        event.preventDefault();
        togglePanel();
      });
    }
    const store = readStore();
    const svg = root.querySelector('svg');
    if (svg) svg.outerHTML = spriteSvg(store.headerColor);
    root.querySelector(`.${ID}-name`).textContent = store.petName || '뽀뽀';
    return root;
  }


  function say(line, ms = 6800) {
    const root = renderRoot();
    const bubble = root.querySelector(`.${ID}-bubble`);
    bubble.textContent = line;
    root.classList.add('speaking');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => root.classList.remove('speaking'), ms);
  }


  function setStateClass(name, on) {
    renderRoot().classList.toggle(name, !!on);
  }


  function renderPanel(view = 'log') {
    injectStyle();
    let panel = document.getElementById(PANEL_ID);
    const store = readStore();
    const top = topTendency(store.tendency);
    const floor = expFloorForLevel(store.level);
    const next = nextNeedForLevel(store.level);
    const progress = Math.max(0, Number(store.exp || 0) - floor);
    const logs = (store.logs || []).slice(0, MAX_LOGS);
    const isSettings = view === 'settings';
    const logCost = logs.reduce((sum, item) => sum + usageCost(item.usage || {}, item.model || store.model), 0);
    const totalCost = Math.max(Number(store.usage?.cost || 0), logCost);
    const lastCost = logs[0]?.usage ? usageCost(logs[0].usage, logs[0].model || store.model) : Number(store.usage?.lastCost || 0);


    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.hidden = true;
      document.body.appendChild(panel);
      restorePosition(panel, PANEL_POS_KEY, { left: 24, top: 96 });
    }
    panel.dataset.view = isSettings ? 'settings' : 'log';
    panel.style.setProperty('--cmdc-head-color', store.headerColor || '#8fbfd3');


    panel.innerHTML = `
      <div class="${ID}-head">
        <b>${esc(store.petName || '뽀뽀')} ${isSettings ? '설정' : '로그'}</b>
        <div class="${ID}-row">
          ${isSettings ? '<button type="button" class="secondary" data-action="back">로그</button>' : '<button type="button" class="secondary" data-action="settings">설정</button>'}
          <button type="button" class="secondary" data-action="close">닫기</button>
        </div>
      </div>
      <div class="${ID}-body">
        ${isSettings ? `
          <label>이름
            <input data-field="petName" maxlength="12" value="${esc(store.petName)}">
          </label>
          <label>성격
            <textarea data-field="personality" maxlength="260">${esc(store.personality)}</textarea>
          </label>
          <label>노트
            <textarea data-field="roomNotes" maxlength="1200" placeholder="세계관, 관계, 캐릭터 설정 같은 거 짧게 적기">${esc(store.roomNotes || '')}</textarea>
          </label>
          <label>과거대화 읽을 개수
            <input data-field-number="contextCount" type="number" min="0" max="12" step="1" value="${esc(store.contextCount ?? 3)}">
          </label>
          <label>장기기억 읽을 개수
            <input data-field-number="memoryCount" type="number" min="0" max="20" step="1" value="${esc(store.memoryCount ?? 3)}">
          </label>
          <label style="display:flex;gap:8px;align-items:center;font-weight:800;">
            <input data-field-check="sendUserNote" type="checkbox"${store.sendUserNote ? ' checked' : ''} style="width:auto;"> 유저노트 참고
          </label>
          <label style="display:flex;gap:8px;align-items:center;font-weight:800;">
            <input data-field-check="sendMemory" type="checkbox"${store.sendMemory ? ' checked' : ''} style="width:auto;"> 장기기억 참고
          </label>
          <label>상단 바 색
            <input data-field="headerColor" type="color" value="${esc(store.headerColor || '#8fbfd3')}">
          </label>
          <label>Gemini API Key
            <input data-field="apiKey" type="password" value="${esc(store.apiKey)}" placeholder="없으면 로컬 랜덤 드립만 사용">
          </label>
          <label>모델
            <select data-field="model">
              ${MODEL_OPTIONS.map(model => `<option value="${esc(model)}"${model === store.model ? ' selected' : ''}>${esc(model)}</option>`).join('')}
            </select>
          </label>
          <div class="${ID}-muted">가성비 기본값은 gemini-2.5-flash-lite. 3.5 Flash는 비싸서 목록에서 뺐습니다.</div>
          <div class="${ID}-row">
            <button type="button" class="secondary" data-action="test">테스트</button>
            <button type="button" data-action="save">저장</button>
          </div>
        ` : `
          <div class="${ID}-stats">
            <div class="${ID}-stat"><span>LV</span><b>${esc(store.level)}</b></div>
            <div class="${ID}-stat"><span>친밀도</span><b>${esc(store.bond)}%</b></div>
            <div class="${ID}-stat"><span>성향</span><b>${esc(TENDENCIES[top].label)}</b></div>
          </div>
          <div class="${ID}-muted">EXP ${progress}/${next} · 이 방 총 ${formatCostKrw(totalCost)} · 방금 전 ${formatCostKrw(lastCost)}</div>
          <div class="${ID}-talk">
            <label>말걸기
              <textarea data-field-talk maxlength="500" placeholder="짧게 말 걸면 얘가 거기에만 반응함"></textarea>
            </label>
            <div class="${ID}-row">
              <button type="button" class="secondary" data-action="talk">말걸기</button>
            </div>
          </div>
          <div class="${ID}-row">
            ${deleteMode
              ? '<button type="button" class="secondary" data-action="cancel-delete">취소</button><button type="button" class="cmdc-danger" data-action="delete-selected">삭제</button>'
              : '<button type="button" class="secondary" data-action="delete-mode">로그삭제</button>'}
          </div>
          <div class="${ID}-log">
            ${logs.length ? logs.map(item => {
              const usage = item.usage || {};
              const thoughts = Number(usage.thoughts || 0);
              const thoughtText = thoughts ? `(+${thoughts}think)` : '';
              const meta = `${new Date(item.at).toLocaleString()} · ${item.model || store.model || DEFAULT_MODEL} · ${Number(usage.input || 0)}in/${Number(usage.output || 0)}out${thoughtText} tok · ${formatCostKrw(usageCost(usage, item.model || store.model))}`;
              return `<div class="${ID}-line"><div class="${ID}-line-inner">${deleteMode ? `<input type="checkbox" data-log-id="${esc(logId(item))}" title="삭제 선택">` : ''}<div>${esc(item.line)}<div class="${ID}-muted">${esc(meta)}</div></div></div></div>`;
            }).join('') : `<div class="${ID}-muted">아직 한 말 없음. AI 답변이 뜨면 여기 쌓입니다.</div>`}
          </div>
        `}
      </div>
    `;


    makeDraggable(panel, panel.querySelector(`.${ID}-head`), PANEL_POS_KEY);
    panel.querySelector('[data-action="close"]').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('[data-action="settings"]')?.addEventListener('click', () => renderPanel('settings'));
    panel.querySelector('[data-action="back"]')?.addEventListener('click', () => renderPanel('log'));
    panel.querySelector('[data-action="save"]')?.addEventListener('click', savePanel);
    panel.querySelector('[data-action="test"]')?.addEventListener('click', () => {
      savePanel(false);
      const line = fallbackLine('둘이 눈 마주치고 아무 일도 아닌 척하는 장면');
      applyGrowth('둘이 눈 마주치고 아무 일도 아닌 척하는 장면', line);
      say(line);
      renderPanel('settings');
    });
    panel.querySelector('[data-action="talk"]')?.addEventListener('click', async () => {
      const input = panel.querySelector('[data-field-talk]');
      const text = input?.value || '';
      if (!normalize(text) || busy) return;
      input.value = '';
      busy = true;
      setStateClass('thinking', true);
      try {
        const line = await makeTalk(text);
        if (line) say(line);
      } catch (err) {
        const line = 'API가 또 드러누움. 이건 설정이 아니라 서버 컨디션 문제 같음';
        applyGrowth(text, line);
        say(line);
        console.debug('[Crack Mini Dot Commentator talk]', err);
      } finally {
        busy = false;
        setStateClass('thinking', false);
        renderPanel('log');
      }
    });
    panel.querySelector('[data-action="delete-mode"]')?.addEventListener('click', () => {
      deleteMode = true;
      renderPanel('log');
    });
    panel.querySelector('[data-action="cancel-delete"]')?.addEventListener('click', () => {
      deleteMode = false;
      renderPanel('log');
    });
    panel.querySelector('[data-action="delete-selected"]')?.addEventListener('click', () => {
      const selected = new Set(Array.from(panel.querySelectorAll('[data-log-id]:checked')).map(input => input.dataset.logId));
      if (!selected.size) {
        deleteMode = false;
        renderPanel('log');
        return;
      }
      updateStore(s => {
        s.logs = (s.logs || []).filter(item => !selected.has(logId(item)));
      });
      deleteMode = false;
      renderPanel('log');
    });
    return panel;
  }


  function savePanel(announce = true) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const patch = {};
    panel.querySelectorAll('[data-field]').forEach(input => {
      patch[input.dataset.field] = input.value.trim();
    });
    panel.querySelectorAll('[data-field-number]').forEach(input => {
      const min = Number(input.min || 0);
      const max = Number(input.max || 999);
      const value = Math.max(min, Math.min(max, Number(input.value || 0)));
      patch[input.dataset.fieldNumber] = Number.isFinite(value) ? value : min;
    });
    panel.querySelectorAll('[data-field-check]').forEach(input => {
      patch[input.dataset.fieldCheck] = !!input.checked;
    });
    writeStore(patch);
    renderRoot();
    renderPanel(panel.dataset.view || 'settings');
    if (announce) say('설정 저장함. 이제 주접 대기 탄다', 3200);
  }


  function togglePanel() {
    refreshFeatureData();
    const panel = renderPanel('log');
    panel.hidden = !panel.hidden;
  }


  function restorePosition(el, key, fallback) {
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const left = Math.min(Math.max(8, Number(pos?.left ?? fallback.left)), innerWidth - 48);
    const top = Math.min(Math.max(8, Number(pos?.top ?? fallback.top)), innerHeight - 48);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }


  function makeDraggable(el, handle, key) {
    if (!el || !handle || handle.dataset.cmdcDragReady) return;
    handle.dataset.cmdcDragReady = '1';
    let state = null;


    handle.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      if (el.id === PANEL_ID && event.target?.closest?.('button, input, select, textarea, label, [data-action]')) return;
      const r = el.getBoundingClientRect();
      state = { id: event.pointerId, sx: event.clientX, sy: event.clientY, left: r.left, top: r.top, moved: false };
      handle.setPointerCapture?.(event.pointerId);
      el.classList.add('dragging');
      if (el.id === ROOT_ID) beginActivity();
    });


    handle.addEventListener('pointermove', event => {
      if (!state || state.id !== event.pointerId) return;
      const dx = event.clientX - state.sx;
      const dy = event.clientY - state.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
      const left = Math.min(Math.max(4, state.left + dx), innerWidth - 40);
      const top = Math.min(Math.max(4, state.top + dy), innerHeight - 40);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      if (el.id === ROOT_ID) el.dataset.dragged = state.moved ? '1' : '0';
    });


    const end = event => {
      if (!state || state.id !== event.pointerId) return;
      const r = el.getBoundingClientRect();
      localStorage.setItem(key, JSON.stringify({ left: r.left, top: r.top }));
      el.classList.remove('dragging');
      if (el.id === ROOT_ID) setTimeout(() => { el.dataset.dragged = '0'; }, 80);
      state = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }


  function beginActivity() {
    updateStore(store => { store.lastActiveAt = Date.now(); });
    setStateClass('sleep', false);
  }


  function compactText(text) {
    return normalize(text).replace(/\s+/g, '').slice(-700);
  }


  function matchesLastSubmittedText(text) {
    if (!lastSubmittedText) return false;
    const candidate = compactText(text);
    const submitted = compactText(lastSubmittedText);
    if (!candidate || !submitted) return false;
    if (candidate === submitted) return true;
    if (submitted.length >= 12 && candidate.includes(submitted)) return true;
    if (candidate.length >= 12 && submitted.includes(candidate)) return true;
    return false;
  }


  let scanTimer = null;
  let busy = false;
  let pendingPayload = null;
  let deleteMode = false;
  let userTurnSerial = 0;
  let handledUserTurnSerial = 0;
  let awaitingUserReply = false;
  let lastUserSignalAt = 0;
  let lastSubmittedText = '';
  let lastSubmittedHash = '';
  const bootstrappedRooms = new Set();
  const bootStartedAt = Date.now();


  function markUserTurn(text = '') {
    if (!isEpisodePath()) return;
    const clean = normalize(text).slice(-700);
    const hash = compactText(clean) ? hashTiny(compactText(clean)) : '';
    if (hash && hash === lastSubmittedHash && Date.now() - lastUserSignalAt < 5000) {
      scheduleScan(STABLE_REPLY_MS);
      return;
    }
    userTurnSerial++;
    awaitingUserReply = true;
    lastUserSignalAt = Date.now();
    lastSubmittedText = clean;
    lastSubmittedHash = hash;
    pendingPayload = null;
    beginActivity();
    scheduleScan(STABLE_REPLY_MS);
  }


  function candidateMatchesSubmitted(payload) {
    return Boolean(payload && matchesLastSubmittedText(payload.latest));
  }


  function readComposerText(target) {
    const direct = target?.closest?.('textarea, [contenteditable="true"]');
    const active = document.activeElement?.matches?.('textarea, [contenteditable="true"]') ? document.activeElement : null;
    const el = direct || active || document.querySelector('textarea');
    if (!el || isOwnNode(el)) return '';
    return normalize(el.value ?? el.innerText ?? el.textContent ?? '');
  }


  function scheduleScan(delay = 700) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanLatest, delay);
  }


   async function scanLatest() {
    scanTimer = null;
    const store = readStore();
    if (!store.enabled || busy) return;


    const payload = latestAiReply();
    if (!payload) {
      pendingPayload = null;
      if (awaitingUserReply) scheduleScan(900);
      if (Date.now() - bootStartedAt > 5500) bootstrappedRooms.add(roomKey());
      return;
    }

    if (!bootstrappedRooms.has(roomKey())) {
      writeStore({ lastKey: payload.key });
      bootstrappedRooms.add(roomKey());
      pendingPayload = null;
      return;
    }


    if (!awaitingUserReply || userTurnSerial <= handledUserTurnSerial) {
      if (payload.key !== store.lastKey) writeStore({ lastKey: payload.key });
      pendingPayload = null;
      return;
    }


    if (Date.now() - lastUserSignalAt < 1200) {
      scheduleScan(1200);
      return;
    }


    if (candidateMatchesSubmitted(payload)) {
      writeStore({ lastKey: payload.key });
      pendingPayload = null;
      scheduleScan(900);
      return;
    }


    if (payload.key === store.lastKey) {
      pendingPayload = null;
      return;
    }


    if (!pendingPayload || pendingPayload.key !== payload.key) {
      pendingPayload = { ...payload, noticedAt: Date.now() };
      scheduleScan(STABLE_REPLY_MS);
      return;
    }


    const waited = Date.now() - Number(pendingPayload.noticedAt || 0);
    if (waited < STABLE_REPLY_MS) {
      scheduleScan(Math.max(250, STABLE_REPLY_MS - waited));
      return;
    }


    const confirmed = latestAiReply();
    if (!confirmed || confirmed.key !== pendingPayload.key) {
      pendingPayload = null;
      scheduleScan(700);
      return;
    }
    if (candidateMatchesSubmitted(confirmed)) {
      writeStore({ lastKey: confirmed.key });
      pendingPayload = null;
      scheduleScan(900);
      return;
    }


    pendingPayload = null;
    writeStore({ lastKey: confirmed.key });
    busy = true;
    setStateClass('thinking', true);
    try {
      const line = await makeComment(confirmed);
      if (!readStore().apiKey) applyGrowth(confirmed.latest, line);
      say(line);
      renderPanel(document.getElementById(PANEL_ID)?.dataset?.view || 'log');
    } catch (err) {
      const line = 'API가 삐끗함. 그래도 이 장면 냄새는 수상함';
      applyGrowth(confirmed.latest, line);
      say(line);
      console.debug('[Crack Mini Dot Commentator]', err);
    } finally {
      handledUserTurnSerial = userTurnSerial;
      awaitingUserReply = false;
      busy = false;
      setStateClass('thinking', false);
    }
  }


  function observeChat() {
    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => Array.from(m.addedNodes || []).some(n => n instanceof Element && !isOwnNode(n)))) {
        const entries = getEntries();
        const latest = entries[entries.length - 1];
        if (latest && looksLikeUserMessage(latest, entries)) markUserTurn(latest.text);
        beginActivity();
        scheduleScan(STABLE_REPLY_MS);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const text = readComposerText(event.target);
      if (text) markUserTurn(text);
    }, true);
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || isOwnNode(target)) return;
      const button = target.closest('button, [role="button"], [data-testid*="send" i], [aria-label*="send" i], [aria-label*="전송" i]');
      if (!button) return;
      const text = readComposerText(button);
      if (text) markUserTurn(text);
    }, true);
    setInterval(() => {
      if (awaitingUserReply) scheduleScan(900);
    }, 4500);
    setInterval(() => {
      const idle = Date.now() - Number(readStore().lastActiveAt || Date.now());
      setStateClass('sleep', idle >= IDLE_SLEEP_MS);
    }, 30000);
  }


  installApiCapture();
  refreshFeatureData();
  renderRoot();
  observeChat();
  scheduleScan(1400);
})();


