// ==UserScript==
// @name         🧪 스크롤 점프 진단 (임시)
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.3.1
// @description  iPhone 답변 도착 시 강제 하단 이동을 진단합니다. 채팅 본문과 계정 정보는 수집하지 않습니다.
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        unsafeWindow
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/diagnostics/Crack_Scroll_Jump_Probe.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/diagnostics/Crack_Scroll_Jump_Probe.user.js
// ==/UserScript==

/* global unsafeWindow */
(function installProbe(w) {
  'use strict';
  const doc = w.document;
  if (!doc || !w.Element || !w.HTMLElement || w.__SHIPIDLE_SCROLL_JUMP_PROBE__) return;
  const VERSION = '0.3.1';
  w.__SHIPIDLE_SCROLL_JUMP_PROBE__ = { version: VERSION };

  function guardVersion() {
    // A DOM attribute crosses Stay's isolated userscript execution worlds.
    return doc.documentElement?.getAttribute('data-shipidle-scroll-guard')
      || w.__SHIPIDLE_SCROLL_GUARD__?.version || 'missing';
  }
  const UI_ID = 'shipidle-scroll-jump-probe';
  const MAX_EVENTS = 220;
  const candidates = new Map();
  const ids = new WeakMap();
  const lastLogged = new WeakMap();
  let nextId = 0;
  let events = [];
  let startRecord = null;
  let significantEvents = [];
  let recording = false;
  let begunAt = 0;
  let startedAt = '';
  let manual = { touching: false, lastAt: -1, direction: 0, y: null };
  let timer = null;
  let observer = null;
  let pendingMutation = { added: 0, removed: 0 };
  let lastMutationLog = 0;
  let markAt = null;
  let bubble = null;
  let panel = null;
  let status = null;
  let manualCopy = null;
  let jumpCount = 0;
  let lastPageKind = '';

  function clock() { return w.performance?.now?.() || Date.now(); }
  function pageKind() {
    const p = w.location.pathname;
    return /^\/stories\//.test(p) ? 'story' :
      /^\/characters\//.test(p) ? 'character' :
      /^\/u\//.test(p) ? 'short-chat' : 'other';
  }
  function documentScroller() {
    return doc.scrollingElement || doc.documentElement;
  }
  function safeRound(n) {
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  function describe(el) {
    if (!el) return 'unknown';
    if (el === documentScroller()) return 'document-scroller';
    if (el === doc.documentElement) return 'html';
    if (el === doc.body) return 'body';
    const tag = String(el.tagName || 'node').toLowerCase();
    const cls = String(el.className?.baseVal || el.className || '');
    const kind = cls.match(/\b(overflow-y-auto|overflow-auto|overflow-y-scroll|scrollbar|chat-container|chat-scroll)\b/)?.[1];
    return kind ? `${tag}.${kind}` : tag;
  }
  function sid(el) {
    if (!ids.has(el)) ids.set(el, `s${++nextId}`);
    return ids.get(el);
  }
  function metrics(el) {
    if (!el || typeof el.scrollTop !== 'number') return null;
    return { scroller: sid(el), kind: describe(el), top: safeRound(el.scrollTop),
      gap: safeRound(el.scrollHeight - el.clientHeight - el.scrollTop),
      height: safeRound(el.scrollHeight), viewport: safeRound(el.clientHeight),
      connected: el.isConnected !== false };
  }
  function add(type, data = {}) {
    if (!recording) return;
    const ms = Math.round(clock() - begunAt);
    // A blocked site scroll animation calls scrollTop hundreds of times and
    // previously flushed real movement events out of the 220-entry ring.
    if (type === 'JS_SCROLL_CALL') {
      const last = events[events.length - 1];
      if (last?.type === type && last.method === data.method &&
          last.target?.scroller === data.target?.scroller &&
          ms - (last.lastMs ?? last.ms) <= 320) {
        last.calls = (last.calls || 1) + 1;
        last.lastMs = ms;
        last.lastIntendedTop = data.intendedTop;
        return;
      }
    }
    const item = { ms, type, ...data };
    if (type === 'START') startRecord = item;
    // Store jumps independently: the exported 25-second window previously hid
    // the only detected jump when the user captured a longer conversation.
    if (type === 'DOWNWARD_JUMP' || type === 'BOTTOM_CLAMP') {
      significantEvents.push(item);
      if (significantEvents.length > 8) significantEvents.shift();
    }
    events.push(item);
    if (events.length > MAX_EVENTS) events.shift();
  }
  function stackHint() {
    return String(new Error().stack || '').split('\n').slice(2, 8)
      .map(line => {
        const fn = line.trim().replace(/^at\s+/, '').split(/[@(]/)[0]
          .replace(/[^A-Za-z0-9_$.[\]<>-]/g, '').slice(0, 50) || '?';
        const file = line.match(/([A-Za-z0-9_.-]+\.js):(\d+)(?::(\d+))?/);
        return `${fn}${file ? '@' + file[0] : ''}`;
      }).filter(Boolean).slice(0, 5);
  }
  function track(el) {
    if (!el || typeof el.scrollTop !== 'number' || el.clientHeight < 50 ||
      el.scrollHeight <= el.clientHeight + 10 || candidates.has(el)) return;
    const snap = metrics(el);
    candidates.set(el, { last: snap, when: clock(), lastMessageAt: 0,
      anchor: null, lastAnchorAt: 0 });
    add('SCROLLER_FOUND', snap);
  }
  function trackAncestors(el) {
    for (let n = el; n; n = n.parentElement) {
      if (n === doc.body) break;
      track(n);
    }
    track(documentScroller());
  }
  function scan() {
    track(documentScroller());
    const target = doc.querySelector('[data-message-group-id], [data-message-id], .wrtn-markdown');
    if (target) trackAncestors(target);
    const main = doc.querySelector('main');
    if (main) trackAncestors(main);
  }
  function visibleTextAnchor(el) {
    if (typeof doc.elementFromPoint !== 'function') return null;
    const rect = el === documentScroller()
      ? { left: 0, right: w.innerWidth, top: 0, bottom: w.innerHeight }
      : el.getBoundingClientRect();
    if (rect.bottom - rect.top < 80) return null;
    const x = (rect.left + rect.right) / 2;
    const y = rect.top + Math.min(130, (rect.bottom - rect.top) * 0.3);
    const node = doc.elementFromPoint(x, y)?.closest?.(
      '.wrtn-markdown p, .wrtn-markdown li, .wrtn-markdown blockquote, [data-message-id]'
    );
    return node?.isConnected && (el === documentScroller() || el.contains(node))
      ? { node, y: node.getBoundingClientRect().top } : null;
  }
  function manualAge() {
    return manual.lastAt < 0 ? null : Math.round(clock() - manual.lastAt);
  }
  function inspect(reason) {
    if (!recording) return;
    if (pageKind() !== lastPageKind) {
      add('ROUTE_TYPE_CHANGED', { from: lastPageKind, to: pageKind() });
      lastPageKind = pageKind();
    }
    for (const [el, item] of candidates) {
      if (el.isConnected === false) {
        add('SCROLLER_REMOVED', { scroller: sid(el), kind: describe(el) });
        candidates.delete(el);
        continue;
      }
      const current = metrics(el);
      if (!current) continue;
      const prev = item.last;
      const delta = current.top - prev.top;
      const changeHeight = current.height - prev.height;
      const passed = Math.round(clock() - item.when);
      const changed = Math.abs(delta) > 2 || Math.abs(changeHeight) > 100;
      if (changed) {
        const snappedBottom = current.gap <= 30 && prev.gap > 120 && delta > 30;
        const jumped = delta > Math.max(130, current.viewport * 0.22) && passed <= 1100;
        const nativeAnchoring = delta > 120 && Math.abs(delta - changeHeight) < 35 &&
          Math.abs(prev.gap - current.gap) < 45;
        const bottomClamp = prev.gap > 100 && current.gap <= 24 && changeHeight < -150;
        if (nativeAnchoring) {
          add('NATIVE_ANCHORING', { reason, delta: safeRound(delta),
            heightChange: safeRound(changeHeight), previousGap: prev.gap,
            touching: manual.touching, ...current });
        } else if (bottomClamp) {
          jumpCount++;
          add('BOTTOM_CLAMP', { reason, from: prev.top, to: current.top,
            delta: safeRound(delta), heightChange: safeRound(changeHeight),
            previousGap: prev.gap, lastTouchMsAgo: manualAge(), ...current });
          if (bubble) bubble.textContent = `진단 (${jumpCount})`;
        } else if (jumped || snappedBottom) {
          jumpCount++;
          add('DOWNWARD_JUMP', { reason, from: prev.top, to: current.top, delta: safeRound(delta),
            heightChange: safeRound(changeHeight), elapsedMs: passed, toBottom: snappedBottom,
            touching: manual.touching, lastTouchMsAgo: manualAge(), direction: manual.direction, ...current });
          if (bubble) bubble.textContent = `진단 (${jumpCount})`;
        } else if ((Math.abs(delta) > 18 || Math.abs(changeHeight) > 240) &&
          clock() - item.lastMessageAt >= 220) {
          add('SCROLL_OR_LAYOUT', { reason, delta: safeRound(delta),
            heightChange: safeRound(changeHeight), touching: manual.touching,
            lastTouchMsAgo: manualAge(), ...current });
          item.lastMessageAt = clock();
        } else if (delta > 2 && delta <= 18 && !manual.touching &&
          (manualAge() === null || manualAge() > 800) &&
          clock() - item.lastMessageAt >= 220) {
          add('MICRO_SCROLL', { reason, delta: safeRound(delta),
            heightChange: safeRound(changeHeight), lastTouchMsAgo: manualAge(), ...current });
          item.lastMessageAt = clock();
        }
      }
      // Track a visible paragraph's position, not its content or ID.
      // This detects a visual wobble even when scrollTop stays unchanged.
      if (!manual.touching && (manualAge() === null || manualAge() > 800)) {
        if (item.anchor?.node?.isConnected) {
          const visualShift = item.anchor.node.getBoundingClientRect().top - item.anchor.y;
          if (Math.abs(visualShift) >= 3 && clock() - item.lastAnchorAt >= 180) {
            const box = item.anchor.node.getBoundingClientRect();
            const screenTop = el === documentScroller() ? 0 : el.getBoundingClientRect().top;
            const screenBottom = el === documentScroller() ? w.innerHeight : el.getBoundingClientRect().bottom;
            const visibleBefore = item.anchor.y < screenBottom && item.anchor.y + box.height > screenTop;
            const visibleAfter = box.top < screenBottom && box.bottom > screenTop;
            add('VISIBLE_TEXT_SHIFT', { reason, pixelDelta: safeRound(visualShift),
              scrollDelta: safeRound(delta), heightChange: safeRound(changeHeight),
              anchorVisibleBefore: visibleBefore, anchorVisibleAfter: visibleAfter, ...current });
            item.lastAnchorAt = clock();
          }
          item.anchor.y += visualShift;
        } else {
          item.anchor = visibleTextAnchor(el);
        }
      } else {
        item.anchor = null;
      }
      item.last = current;
      item.when = clock();
    }
  }

  function onActualScroll(e) {
    if (!recording) return;
    const el = e.target === doc || e.target === w ? documentScroller() : e.target;
    track(el);
    inspect('scroll-event');
  }
  function onTouchStart(e) {
    if (!recording) return;
    manual.touching = true;
    manual.lastAt = clock();
    manual.y = e.touches?.[0]?.clientY ?? null;
    manual.direction = 0;
    add('TOUCH_START', { kind: describe(e.target) });
  }
  function onTouchMove(e) {
    if (!recording) return;
    const y = e.touches?.[0]?.clientY;
    if (Number.isFinite(y) && manual.y !== null && Math.abs(y - manual.y) > 1) {
      manual.direction = Math.sign(manual.y - y);
    }
    if (Number.isFinite(y)) manual.y = y;
    manual.lastAt = clock();
  }
  function onTouchEnd() {
    if (!recording) return;
    manual.touching = false;
    manual.lastAt = clock();
    add('TOUCH_END', { direction: manual.direction });
  }
  function wrapMethod(owner, method, type, targetResolver, targetTop) {
    const original = owner?.[method];
    if (typeof original !== 'function') return;
    try {
      owner[method] = function (...args) {
        if (recording) {
          const el = targetResolver(this, args);
          if (el) track(el);
          const before = el && metrics(el);
          const desired = targetTop ? targetTop(el, args, method) : null;
          const shouldLog = type === 'focus' || type === 'intoView' ||
            (Number.isFinite(desired) && before && desired > before.top + 25);
          if (shouldLog) {
            add('JS_SCROLL_CALL', { method: type + '.' + method,
              target: before, intendedTop: safeRound(desired), source: stackHint() });
          }
        }
        return original.apply(this, args);
      };
    } catch (_) { /* Monitoring is best-effort and never blocks original calls. */ }
  }
  function fromArgs(el, args, method) {
    if (!el) return null;
    const raw = args[0] && typeof args[0] === 'object' ? args[0].top : args[1];
    if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return null;
    return (method === 'scrollBy' ? el.scrollTop : 0) + Number(raw);
  }

  // Record calls but never prevent or change scrolling.
  wrapMethod(w.Element.prototype, 'scrollTo', 'element', function (self) { return self; }, fromArgs);
  wrapMethod(w.Element.prototype, 'scroll', 'element', function (self) { return self; }, fromArgs);
  wrapMethod(w.Element.prototype, 'scrollBy', 'element', function (self) { return self; }, fromArgs);
  for (const method of ['scrollIntoView', 'scrollIntoViewIfNeeded']) {
    wrapMethod(w.Element.prototype, method, 'intoView', function (self) {
      trackAncestors(self);
      for (let p = self.parentElement; p; p = p.parentElement) {
        if (candidates.has(p)) return p;
      }
      return documentScroller();
    }, null);
  }
  wrapMethod(w.HTMLElement.prototype, 'focus', 'focus', function () { return documentScroller(); }, null);
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    wrapMethod(w, method, 'window', function () { return documentScroller(); }, fromArgs);
  }
  const prop = Object.getOwnPropertyDescriptor(w.Element.prototype, 'scrollTop');
  if (prop?.configurable && prop?.get && prop?.set) {
    try {
      Object.defineProperty(w.Element.prototype, 'scrollTop', { ...prop,
        get() { return prop.get.call(this); },
        set(value) {
          if (recording && Number.isFinite(Number(value))) {
            const prev = prop.get.call(this);
            if (Number(value) > prev + 25) {
              track(this);
              add('JS_SCROLL_CALL', { method: 'element.scrollTop=',
                target: metrics(this), intendedTop: safeRound(Number(value)), source: stackHint() });
            }
          }
          return prop.set.call(this, value);
        },
      });
    } catch (_) { /* Native descriptor not patchable on this WebKit build. */ }
  }

  doc.addEventListener('scroll', onActualScroll, { capture: true, passive: true });
  w.addEventListener('scroll', onActualScroll, { capture: true, passive: true });
  doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  doc.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
  doc.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  doc.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
  w.addEventListener('resize', () => add('VIEWPORT_RESIZE',
    { width: w.innerWidth, height: w.innerHeight }), { passive: true });
  w.visualViewport?.addEventListener('resize', () => add('VISUAL_VIEWPORT_RESIZE',
    { height: safeRound(w.visualViewport.height), offsetTop: safeRound(w.visualViewport.offsetTop) }), { passive: true });

  function start() {
    stop();
    events = [];
    startRecord = null;
    significantEvents = [];
    candidates.clear();
    jumpCount = 0;
    manual = { touching: false, lastAt: -1, direction: 0, y: null };
    markAt = null;
    recording = true;
    begunAt = clock();
    startedAt = new Date().toISOString();
    lastPageKind = pageKind();
    add('START', { guardVersion: guardVersion(),
      device: /iPhone|iPad/i.test(w.navigator.userAgent) ? 'iOS' : 'other',
      viewportWidth: w.innerWidth, viewportHeight: w.innerHeight,
      visualViewportHeight: safeRound(w.visualViewport?.height || 0),
      chatType: lastPageKind });
    scan();
    inspect('start');
    timer = w.setInterval(() => { scan(); inspect('poll'); }, 160);
    if (doc.body && w.MutationObserver) {
      observer = new w.MutationObserver(items => {
        if (!recording) return;
        for (const item of items) {
          pendingMutation.added += item.addedNodes?.length || 0;
          pendingMutation.removed += item.removedNodes?.length || 0;
        }
        if (clock() - lastMutationLog > 550 && pendingMutation.added + pendingMutation.removed > 0) {
          add('DOM_CHANGE', { ...pendingMutation });
          pendingMutation = { added: 0, removed: 0 };
          lastMutationLog = clock();
        }
      });
      observer.observe(doc.body, { subtree: true, childList: true });
    }
    if (status) {
      const version = guardVersion();
      status.textContent = version === 'missing'
        ? '스크롤 가드 미감지! Stay에서 스크롤 가드 설치·활성화·업데이트를 확인해 줘.'
        : `가드 ${version} 실행 확인 · AI 답변이 도착하면 진단을 눌러.`;
    }
    if (bubble) bubble.textContent = '진단 기록중';
    if (panel) panel.hidden = true;
    if (manualCopy) manualCopy.hidden = true;
  }
  function stop() {
    recording = false;
    if (timer !== null) w.clearInterval(timer);
    timer = null;
    if (observer) observer.disconnect();
    observer = null;
    if (bubble) bubble.textContent = '진단';
  }
  function mark() {
    if (recording) {
      inspect('manual-mark');
      add('USER_MARKED_DOWNWARD_JUMP',
        { guardVersion: guardVersion() });
    }
    markAt = clock() - begunAt;
    stop();
    if (status) status.textContent = `기록 완료 · 점프 의심 ${jumpCount}회 · 기록 복사를 눌러줘.`;
  }
  function payload() {
    const ending = markAt ?? (clock() - begunAt);
    const recent = events.filter(e => e.ms >= ending - 25000).slice(-175);
    const startEvent = startRecord;
    return JSON.stringify({
      tool: 'Crack Scroll Jump Probe', version: VERSION,
      createdAt: startedAt, chatType: lastPageKind,
      guardVersion: guardVersion(),
      privacy: 'No chat content, account IDs, URLs, or tokens collected.',
      totalEvents: events.length, detectedJumps: jumpCount,
      start: startEvent || null, significantEvents, events: recent
    }, null, 2);
  }
  async function copyLog() {
    const data = payload();
    try {
      await w.navigator.clipboard.writeText(data);
      status.textContent = '로그 복사 완료. ChatGPT에 붙여넣어 줘.';
      return;
    } catch (_) { /* Display selectable text on WebKit clipboard denial. */ }
    manualCopy.value = data;
    manualCopy.hidden = false;
    manualCopy.focus();
    manualCopy.select();
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch (_) {}
    status.textContent = ok ? '로그 복사 완료.' : '아래 상자를 길게 눌러 전체 선택 후 복사해 줘.';
  }
  function createInterface() {
    if (!doc.body || doc.getElementById(UI_ID)) return;
    const wrap = doc.createElement('div');
    wrap.id = UI_ID;
    wrap.style.cssText = 'position:fixed!important;z-index:2147483647!important;top:calc(env(safe-area-inset-top) + 56px)!important;right:8px!important;font:12px -apple-system,sans-serif!important;color:#fff!important;pointer-events:none!important;';
    bubble = doc.createElement('button');
    bubble.textContent = '진단';
    bubble.type = 'button';
    bubble.setAttribute('aria-label', '스크롤 점프 진단 열기');
    bubble.style.cssText = 'display:block!important;border:0!important;border-radius:16px!important;background:#20232a!important;color:white!important;padding:8px 12px!important;font-size:12px!important;pointer-events:auto!important;box-shadow:0 2px 8px #0005!important;';
    panel = doc.createElement('div');
    panel.hidden = true;
    panel.style.cssText = 'box-sizing:border-box!important;position:absolute!important;top:40px!important;right:0!important;width:min(300px,calc(100vw - 20px))!important;border-radius:12px!important;padding:12px!important;background:#22262e!important;box-shadow:0 6px 18px #0008!important;color:#fff!important;pointer-events:auto!important;';
    const heading = doc.createElement('strong');
    heading.textContent = '스크롤 점프 진단 (임시)';
    panel.appendChild(heading);
    status = doc.createElement('p');
    status.textContent = '기록 시작 → 답변 도착 후 진단 열기 → 튀었음 → 로그 복사';
    status.style.cssText = 'font-size:12px!important;line-height:1.45!important;white-space:normal!important;';
    panel.appendChild(status);
    function button(label, action) {
      const b = doc.createElement('button');
      b.textContent = label;
      b.type = 'button';
      b.dataset.action = action;
      b.style.cssText = 'margin:3px!important;padding:7px 9px!important;background:#525967!important;border:0!important;border-radius:6px!important;color:white!important;font-size:12px!important;touch-action:manipulation!important;';
      b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (action === 'start') start();
        else if (action === 'mark') mark();
        else if (action === 'copy') copyLog();
        else if (action === 'close') panel.hidden = true;
      });
      panel.appendChild(b);
    }
    button('기록 시작', 'start');
    button('튀었음 · 기록 끝', 'mark');
    button('로그 복사', 'copy');
    button('닫기', 'close');
    manualCopy = doc.createElement('textarea');
    manualCopy.hidden = true;
    manualCopy.readOnly = true;
    manualCopy.setAttribute('aria-label', '진단 로그 복사 상자');
    manualCopy.style.cssText = 'width:100%!important;box-sizing:border-box!important;height:125px!important;font-size:11px!important;user-select:text!important;-webkit-user-select:text!important;color:#222!important;background:white!important;margin-top:6px!important;';
    panel.appendChild(manualCopy);
    wrap.appendChild(bubble);
    wrap.appendChild(panel);
    bubble.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    doc.body.appendChild(wrap);
  }

  if (doc.body) createInterface();
  else doc.addEventListener('DOMContentLoaded', createInterface, { once: true });
})(typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window);
