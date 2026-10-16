// ==UserScript==
// @name         🛡️ 스크롤 가드
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.2.0
// @description  🧪 BETA · iPhone/PC: AI 답변 완료 후에도 읽던 채팅 위치를 유지하고 수동 스크롤을 허용합니다.
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

  const BOTTOM_THRESHOLD = 20;
  const GESTURE_GRACE_MS = 650;
  const RESTORE_WINDOW_MS = 1800;
  const EXTRA_FRAMES = 3;
  let route = location.pathname;
  let reading = null;
  let currentTouch = null;
  let dragTarget = null;
  let scheduled = false;
  let followFrames = 0;
  let restoreUntil = 0;
  let observedBody = null;
  let observer = null;
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const nativeScrollTo = Element.prototype.scrollTo;

  function documentScroller() {
    return document.scrollingElement || document.documentElement;
  }
  function scrollable(el) {
    return !!el && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
  }
  function scrollerFor(node) {
    if (!node || node === window || node === document || node === document.body || node === document.documentElement) {
      return documentScroller();
    }
    for (let el = node; el && el !== document.body; el = el.parentElement) {
      if (scrollable(el)) return el;
    }
    return documentScroller();
  }
  function remaining(el) {
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  }
  function now() {
    return performance.now();
  }
  function setScroll(el, top) {
    const next = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    if (scrollDescriptor?.set) scrollDescriptor.set.call(el, next);
    else if (typeof nativeScrollTo === 'function') nativeScrollTo.call(el, { top: next, behavior: 'instant' });
    else el.scrollTop = next;
  }
  function meaningful(el) {
    return scrollable(el) && el.scrollHeight - el.clientHeight > 100;
  }

  function saveAnchor(el) {
    if (!reading || reading.target !== el) return;
    const rect = el === documentScroller()
      ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
      : el.getBoundingClientRect();
    const y = Math.max(rect.top + 35, Math.min(rect.top + Math.min(140, (rect.bottom - rect.top) * 0.32), rect.bottom - 30));
    const x = rect.left + (rect.right - rect.left) * 0.5;
    const node = document.elementFromPoint?.(x, y);
    if (!node || (el !== documentScroller() && !el.contains(node))) return;
    // An actual visible text node is more stable than a recycled list container.
    const anchor = node.closest?.('p, li, blockquote, .wrtn-markdown, [data-message-id], [data-testid*="message"]') || node;
    if (!anchor || anchor === el) return;
    reading.anchor = anchor;
    reading.anchorY = anchor.getBoundingClientRect().top;
  }

  function recordGesture(el) {
    if (!meaningful(el)) return;
    const top = el.scrollTop;
    if (remaining(el) <= BOTTOM_THRESHOLD) {
      reading = null;
      return;
    }
    const prior = reading;
    reading = {
      target: el,
      top,
      anchor: prior?.target === el ? prior.anchor : null,
      anchorY: prior?.target === el ? prior.anchorY : null,
      gestureUntil: now() + GESTURE_GRACE_MS,
      lastGestureTop: top,
    };
    saveAnchor(el);
  }

  function isTouching(el) {
    return !!currentTouch && currentTouch.target === el;
  }
  function acceptableMomentum(el, pos) {
    if (!reading || reading.target !== el || now() >= reading.gestureUntil) return false;
    const diff = pos - reading.lastGestureTop;
    // Quick app snap-to-bottom must never overwrite the user's saved position.
    if (remaining(el) <= BOTTOM_THRESHOLD && (reading.top < pos - 90)) return false;
    return Math.abs(diff) < Math.max(100, el.clientHeight * 0.28);
  }

  function pickReplacement(old) {
    if (old?.isConnected && scrollable(old)) return old;
    const sample = document.querySelector?.('.wrtn-markdown') || document.querySelector?.('main');
    if (sample) {
      const candidate = scrollerFor(sample);
      if (scrollable(candidate)) return candidate;
    }
    const doc = documentScroller();
    if (scrollable(doc)) return doc;
    return old;
  }

  function restore() {
    if (!reading || route !== location.pathname) return;
    const target = pickReplacement(reading.target);
    if (!target || !scrollable(target)) return;
    if (target !== reading.target) {
      reading.target = target;
      reading.anchor = null;
      reading.anchorY = null;
      setScroll(target, reading.top);
    }
    if (isTouching(target)) return;

    // Maintain the same visible message when layout above the reader changes.
    if (reading.anchor?.isConnected && reading.anchorY !== null && target.contains?.(reading.anchor)) {
      const delta = reading.anchor.getBoundingClientRect().top - reading.anchorY;
      if (Math.abs(delta) > 2 && Math.abs(delta) < 5000) {
        // Remove the current scroll displacement from the anchor's visual shift.
        reading.top = Math.max(0, target.scrollTop + delta);
      }
    }

    const pos = target.scrollTop;
    if (acceptableMomentum(target, pos)) {
      reading.top = pos;
      reading.lastGestureTop = pos;
      saveAnchor(target);
      if (remaining(target) <= BOTTOM_THRESHOLD) reading = null;
      return;
    }
    if (Math.abs(pos - reading.top) > 2) setScroll(target, reading.top);
  }

  function tick() {
    scheduled = false;
    if (route !== location.pathname) resetRoute();
    restore();
    if (reading && (now() < restoreUntil || followFrames-- > 0)) schedule();
  }
  function schedule(frames = 0) {
    followFrames = Math.max(followFrames, frames);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  }
  function watchLayout() {
    if (!reading) return;
    restoreUntil = now() + RESTORE_WINDOW_MS;
    schedule(EXTRA_FRAMES);
  }

  function markGesture(event) {
    const target = scrollerFor(event.target);
    if (!meaningful(target)) return;
    if (event.type === 'touchstart') currentTouch = { target };
    if (event.type === 'touchmove' && (!currentTouch || currentTouch.target !== target)) currentTouch = { target };
    if (event.type === 'wheel' || event.type === 'keydown' || event.type === 'touchmove') {
      // Native iOS scrolling is composited; read the new position after the next frame.
      requestAnimationFrame(() => {
        recordGesture(target);
        if (reading) schedule();
      });
    }
    if (event.type === 'touchend' || event.type === 'touchcancel') {
      currentTouch = null;
      if (reading) reading.gestureUntil = now() + GESTURE_GRACE_MS;
      schedule(EXTRA_FRAMES);
    }
  }
  function onScroll(event) {
    const el = scrollerFor(event.target);
    if (!meaningful(el)) return;
    if (currentTouch?.target === el) {
      recordGesture(el);
      return;
    }
    if (reading && el === reading.target) {
      restore();
      schedule(EXTRA_FRAMES);
    }
  }
  function resetRoute() {
    if (route === location.pathname) return;
    route = location.pathname;
    reading = null;
    currentTouch = null;
    dragTarget = null;
    restoreUntil = 0;
    followFrames = 0;
  }
  function wrapperTop(el, args, relative = false) {
    const raw = args[0] && typeof args[0] === 'object' ? args[0].top : args[1];
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n + (relative ? el.scrollTop : 0) : null;
  }
  function protect(el, targetTop) {
    return !!reading && reading.target === el && !isTouching(el)
      && targetTop !== null && targetTop > el.scrollTop + 1;
  }

  // Best effort in page context; DOM and rAF restoration still work in isolated worlds.
  if (scrollDescriptor?.configurable && scrollDescriptor.get && scrollDescriptor.set) {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      ...scrollDescriptor,
      get() { return scrollDescriptor.get.call(this); },
      set(value) {
        if (protect(this, Number(value))) return;
        scrollDescriptor.set.call(this, value);
      },
    });
  }
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      if (protect(this, wrapperTop(this, args, method === 'scrollBy'))) return;
      return original.apply(this, args);
    };
  }
  for (const method of ['scrollIntoView', 'scrollIntoViewIfNeeded']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      if (reading && !isTouching(reading.target) && reading.target.contains?.(this)) {
        const bottom = reading.target === documentScroller()
          ? innerHeight : reading.target.getBoundingClientRect().bottom;
        if (this.getBoundingClientRect().bottom > bottom + 1) return;
      }
      return original.apply(this, args);
    };
  }
  const originalFocus = HTMLElement.prototype.focus;
  if (typeof originalFocus === 'function') {
    HTMLElement.prototype.focus = function (options) {
      if (reading && !isTouching(reading.target)) {
        return originalFocus.call(this, { ...(options && typeof options === 'object' ? options : {}), preventScroll: true });
      }
      return originalFocus.apply(this, arguments);
    };
  }
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = window[method];
    if (typeof original !== 'function') continue;
    window[method] = function (...args) {
      const el = documentScroller();
      if (protect(el, wrapperTop(el, args, method === 'scrollBy'))) return;
      return original.apply(this, args);
    };
  }

  // Touch and wheel interactions, and restoring native scroll events.
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel']) {
    document.addEventListener(type, markGesture, { capture: true, passive: true });
  }
  document.addEventListener('keydown', event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') || event.target?.isContentEditable) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) markGesture(event);
  }, true);
  document.addEventListener('pointerdown', event => {
    const el = scrollerFor(event.target);
    if (!scrollable(el)) return;
    const right = el === documentScroller() ? innerWidth : el.getBoundingClientRect().right;
    if (event.clientX >= right - 22) dragTarget = el;
  }, true);
  document.addEventListener('pointermove', () => {
    if (dragTarget) requestAnimationFrame(() => recordGesture(dragTarget));
  }, true);
  document.addEventListener('pointerup', () => { dragTarget = null; }, true);
  document.addEventListener('pointercancel', () => { dragTarget = null; }, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('scroll', onScroll, true);

  function startObserver() {
    if (!document.body || observedBody === document.body) return;
    observer?.disconnect();
    observedBody = document.body;
    observer = new MutationObserver(records => {
      if (!reading) return;
      const scroller = reading.target;
      if (records.some(record => (scroller === documentScroller()
        || scroller.contains?.(record.target)
        || !scroller.isConnected))) watchLayout();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      resetRoute();
      return result;
    };
  }
  window.addEventListener('popstate', resetRoute);
  window.addEventListener('hashchange', resetRoute);
  setInterval(() => { resetRoute(); startObserver(); }, 1000);
})();
