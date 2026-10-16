// ==UserScript==
// @name         🛡️ 스크롤 가드
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.3.0
// @description  🧪 BETA · iPhone 터치 스크롤은 건드리지 않고, AI 응답 후 자동 하단 이동만 방지합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__SHIPIDLE_SCROLL_GUARD__) return;
  window.__SHIPIDLE_SCROLL_GUARD__ = true;

  const BOTTOM_GAP = 24;
  const INERTIA_QUIET_MS = 280;
  const CHECK_INTERVAL_MS = 180;
  const nativeScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  let path = location.pathname;
  let reading = null;
  let gesture = null;
  let finishTimer = null;
  let checkTimer = null;
  let correcting = false;

  function documentScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function isScrollable(el) {
    if (!el || el.clientHeight <= 0 || el.scrollHeight - el.clientHeight <= 30) return false;
    if (el === documentScroller()) return true;
    const overflow = getComputedStyle(el).overflowY;
    return /auto|scroll|overlay/.test(overflow) || el.scrollTop > 0;
  }

  function scrollTarget(el) {
    if (!el || el === window || el === document || el === document.body || el === document.documentElement) {
      return documentScroller();
    }
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (isScrollable(node)) return node;
    }
    return documentScroller();
  }

  function bottomGap(el) {
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  }

  function clearReading() {
    reading = null;
    if (checkTimer !== null) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  function watchWhileReading() {
    if (reading && checkTimer === null) checkTimer = setInterval(checkPosition, CHECK_INTERVAL_MS);
  }

  function saveVisibleAnchor() {
    if (!reading || !reading.target?.isConnected) return;
    const el = reading.target;
    const box = el === documentScroller()
      ? { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
      : el.getBoundingClientRect();
    if (box.bottom - box.top < 90) return;
    const x = (box.left + box.right) * 0.5;
    const y = Math.min(box.bottom - 32, box.top + Math.min(130, (box.bottom - box.top) * 0.3));
    const node = document.elementFromPoint?.(x, y);
    const anchor = node?.closest?.('[data-message-id], [data-testid*="message"], .wrtn-markdown p, .wrtn-markdown li, .wrtn-markdown blockquote') || node;
    if (anchor && anchor !== el && (el === documentScroller() || el.contains(anchor))) {
      reading.anchor = anchor;
      reading.anchorY = anchor.getBoundingClientRect().top;
    }
  }

  function saveUserPosition(el) {
    if (!isScrollable(el)) return;
    if (bottomGap(el) <= BOTTOM_GAP) {
      clearReading();
      return;
    }
    reading = {
      target: el,
      top: el.scrollTop,
      anchor: null,
      anchorY: null,
    };
    watchWhileReading();
  }

  function endGesture() {
    if (!gesture || gesture.down) return;
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = null;
    const { target, moved } = gesture;
    gesture = null;
    if (moved) {
      saveUserPosition(target);
      saveVisibleAnchor();
    }
  }

  function queueGestureEnd() {
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = setTimeout(endGesture, INERTIA_QUIET_MS);
  }

  function startGesture(target, down) {
    if (!isScrollable(target)) return;
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = null;
    gesture = { target, down, moved: !down };
    if (!down) queueGestureEnd();
  }

  function pointerStart(event) {
    if (event.target?.closest?.('textarea, input, [contenteditable="true"]')) return;
    const target = scrollTarget(event.target);
    if (isScrollable(target)) startGesture(target, true);
  }

  function pointerMove() {
    if (gesture) gesture.moved = true;
  }

  function pointerEnd() {
    if (!gesture) return;
    gesture.down = false;
    queueGestureEnd();
  }

  function nativeScroll(event) {
    if (correcting) return;
    const target = scrollTarget(event.target);
    if (!isScrollable(target)) return;
    if (gesture && gesture.target === target) {
      if (gesture.moved) {
        saveUserPosition(target);
        if (!gesture.down) queueGestureEnd();
      }
      return;
    }
    if (reading && reading.target === target) checkPosition();
  }

  function restoreDirect(el, value) {
    const bounded = Math.max(0, Math.min(value, el.scrollHeight - el.clientHeight));
    correcting = true;
    try {
      const priorBehavior = el.style?.scrollBehavior;
      if (el.style) el.style.scrollBehavior = 'auto';
      try {
        if (nativeScrollTop?.set) nativeScrollTop.set.call(el, bounded);
        else el.scrollTop = bounded;
      } finally {
        if (el.style) el.style.scrollBehavior = priorBehavior;
      }
    } finally {
      correcting = false;
    }
    // Crack can schedule a second scroll in its next animation frame.
    setTimeout(checkPosition, 50);
  }

  function findReplacement() {
    const sample = document.querySelector('.wrtn-markdown') || document.querySelector('main');
    const target = sample && scrollTarget(sample);
    return isScrollable(target) ? target : (isScrollable(documentScroller()) ? documentScroller() : null);
  }

  function checkPosition() {
    if (!reading || gesture) return;
    if (location.pathname !== path) {
      resetRoute();
      return;
    }
    let el = reading.target;
    if (!el?.isConnected || !isScrollable(el)) {
      const replacement = findReplacement();
      if (!replacement) return;
      reading.target = el = replacement;
      reading.anchor = null;
      reading.anchorY = null;
    }
    const actual = el.scrollTop;
    const shift = actual - reading.top;
    if (Math.abs(shift) <= 2) return;
    let anchorDelta = null;
    if (reading.anchor?.isConnected && (el === documentScroller() || el.contains(reading.anchor))) {
      anchorDelta = reading.anchor.getBoundingClientRect().top - reading.anchorY;
    }

    // If the browser anchored the same visible message while content above grew,
    // its numeric scrollTop change is correct and must NOT be undone.
    if (anchorDelta !== null && Math.abs(anchorDelta) <= 5 && Math.abs(shift) > 2) {
      reading.top = actual;
      return;
    }
    const threshold = Math.max(85, el.clientHeight * 0.17);
    const movedFarDown = shift > threshold;
    const snappedToBottom = bottomGap(el) <= BOTTOM_GAP && shift > 35;
    if (!movedFarDown && !snappedToBottom) return;

    const anchoredTop = anchorDelta !== null && Math.abs(anchorDelta) < 10000
      ? actual + anchorDelta : reading.top;
    if (Math.abs(actual - anchoredTop) <= 6) return;
    restoreDirect(el, anchoredTop);
  }

  function resetRoute() {
    path = location.pathname;
    clearReading();
    gesture = null;
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = null;
  }

  function intendedTop(el, args, relative) {
    const raw = args[0] && typeof args[0] === 'object' ? args[0].top : args[1];
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n + (relative ? el.scrollTop : 0) : null;
  }

  function guard(el, desired) {
    return !!reading && !gesture && !correcting && reading.target === el
      && desired !== null && Number.isFinite(desired) && desired > reading.top + 2;
  }

  // Programmatic-only interception; native iPhone touch inertia is never modified.
  if (nativeScrollTop?.configurable && nativeScrollTop.get && nativeScrollTop.set) {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      ...nativeScrollTop,
      get() { return nativeScrollTop.get.call(this); },
      set(value) {
        if (guard(this, Number(value))) return;
        nativeScrollTop.set.call(this, value);
      },
    });
  }
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      if (guard(this, intendedTop(this, args, method === 'scrollBy'))) return;
      return original.apply(this, args);
    };
  }
  for (const method of ['scrollIntoView', 'scrollIntoViewIfNeeded']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      const el = reading?.target;
      if (el && !gesture && !correcting && (el === documentScroller() || el.contains(this))) {
        const bottom = el === documentScroller() ? innerHeight : el.getBoundingClientRect().bottom;
        if (this.getBoundingClientRect().bottom > bottom + 2) return;
      }
      return original.apply(this, args);
    };
  }
  const nativeFocus = HTMLElement.prototype.focus;
  if (typeof nativeFocus === 'function') {
    HTMLElement.prototype.focus = function (options) {
      if (reading && !gesture && !correcting) {
        return nativeFocus.call(this, { ...(options && typeof options === 'object' ? options : {}), preventScroll: true });
      }
      return nativeFocus.apply(this, arguments);
    };
  }
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = window[method];
    if (typeof original !== 'function') continue;
    window[method] = function (...args) {
      const el = documentScroller();
      if (guard(el, intendedTop(el, args, method === 'scrollBy'))) return;
      return original.apply(this, args);
    };
  }

  document.addEventListener('touchstart', pointerStart, { capture: true, passive: true });
  document.addEventListener('touchmove', pointerMove, { capture: true, passive: true });
  document.addEventListener('touchend', pointerEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', pointerEnd, { capture: true, passive: true });
  document.addEventListener('wheel', event => startGesture(scrollTarget(event.target), false), { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') || event.target?.isContentEditable) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      startGesture(scrollTarget(event.target), false);
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    const el = scrollTarget(event.target);
    const right = el === documentScroller() ? innerWidth : el.getBoundingClientRect().right;
    if (isScrollable(el) && event.clientX > right - 18) startGesture(el, true);
  }, true);
  document.addEventListener('pointermove', pointerMove, true);
  document.addEventListener('pointerup', pointerEnd, true);
  document.addEventListener('pointercancel', pointerEnd, true);
  document.addEventListener('scroll', nativeScroll, true);

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      if (path !== location.pathname) resetRoute();
      return result;
    };
  }
  window.addEventListener('popstate', () => { if (path !== location.pathname) resetRoute(); });
  window.addEventListener('hashchange', () => { if (path !== location.pathname) resetRoute(); });
  window.addEventListener('pageshow', () => { if (path !== location.pathname) resetRoute(); });
  setInterval(() => { if (path !== location.pathname) resetRoute(); }, 1500);
})();
