// ==UserScript==
// @name         🛡️ 스크롤 가드
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.1.0
// @description  🧪 BETA · iPhone/PC에서 이전 대화를 읽는 동안 자동 하단 이동을 막고 수동 스크롤을 유지합니다.
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

  const BOTTOM_THRESHOLD = 16;
  const USER_SCROLL_WINDOW_MS = 1200;
  let currentPath = location.pathname;
  let states = new WeakMap();
  let scrollbarDragTarget = null;
  const nativeScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');

  function documentScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function isScrollable(target) {
    return !!target && target.scrollHeight > target.clientHeight + 1;
  }

  function resolveScrollTarget(element) {
    if (!element || element === window || element === document || element === document.body
      || element === document.documentElement) return documentScroller();
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (isScrollable(node)) return node;
    }
    return documentScroller();
  }

  function distanceToBottom(target) {
    return Math.max(0, target.scrollHeight - target.scrollTop - target.clientHeight);
  }

  function getState(target) {
    if (!states.has(target)) states.set(target, {
      reading: false, userUntil: 0, top: 0, bottomDistance: 0,
    });
    return states.get(target);
  }

  function recordManualScroll(target) {
    if (!isScrollable(target)) return;
    const state = getState(target);
    state.top = target.scrollTop;
    state.bottomDistance = distanceToBottom(target);
    state.reading = state.bottomDistance > BOTTOM_THRESHOLD;
  }

  function markUserScroll(event) {
    const target = resolveScrollTarget(event.target);
    if (!isScrollable(target)) return;
    getState(target).userUntil = performance.now() + USER_SCROLL_WINDOW_MS;
  }

  function isReadingUp(target) {
    return isScrollable(target) && !!states.get(target)?.reading;
  }

  function restoreTop(target, value) {
    if (nativeScrollTop?.set) nativeScrollTop.set.call(target, value);
    else target.scrollTop = value;
  }

  function handleScroll(event) {
    const target = resolveScrollTarget(event.target);
    if (!isScrollable(target)) return;
    const state = getState(target);
    const distance = distanceToBottom(target);

    if (performance.now() < state.userUntil) {
      recordManualScroll(target);
      return;
    }
    if (!state.reading) return;

    // Native scrolling and app/framework auto-scroll may bypass JS API wrappers.
    // Do not disable overflow-anchor: browser anchoring keeps text in place.
    const snappedToBottom = distance <= BOTTOM_THRESHOLD;
    const jumpedDown = target.scrollTop > state.top + Math.max(120, target.clientHeight * 0.35)
      && distance < state.bottomDistance - 80;
    if (snappedToBottom || jumpedDown) {
      restoreTop(target, Math.min(state.top, Math.max(0, target.scrollHeight - target.clientHeight)));
      return;
    }
    if (Math.abs(distance - state.bottomDistance) < 32) {
      // Layout grew above the viewport, but the visible message stayed anchored.
      state.top = target.scrollTop;
    }
  }

  function requestedTop(target, args, relative = false) {
    const value = args[0] && typeof args[0] === 'object' ? Number(args[0].top) : Number(args[1]);
    return Number.isFinite(value) ? (relative ? target.scrollTop + value : value) : null;
  }

  function wouldMoveDown(element, target) {
    const rect = element.getBoundingClientRect();
    const bottom = target === documentScroller() ? innerHeight : target.getBoundingClientRect().bottom;
    return rect.bottom > bottom + 1;
  }

  if (nativeScrollTop?.get && nativeScrollTop?.set && nativeScrollTop.configurable) {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      ...nativeScrollTop,
      get() { return nativeScrollTop.get.call(this); },
      set(value) {
        const target = resolveScrollTarget(this);
        if (isReadingUp(target) && this === target && Number(value) > target.scrollTop + 1) return;
        nativeScrollTop.set.call(this, value);
      },
    });
  }

  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      const target = resolveScrollTarget(this);
      const top = requestedTop(target, args, method === 'scrollBy');
      if (this === target && isReadingUp(target) && top !== null && top > target.scrollTop + 1) return;
      return original.apply(this, args);
    };
  }

  for (const method of ['scrollIntoView', 'scrollIntoViewIfNeeded']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      const target = resolveScrollTarget(this);
      if (isReadingUp(target) && wouldMoveDown(this, target)) return;
      return original.apply(this, args);
    };
  }

  const originalFocus = HTMLElement.prototype.focus;
  if (typeof originalFocus === 'function') {
    HTMLElement.prototype.focus = function (options) {
      const target = resolveScrollTarget(this);
      if (isReadingUp(target) && wouldMoveDown(this, target)) {
        return originalFocus.call(this, { ...(options && typeof options === 'object' ? options : {}), preventScroll: true });
      }
      return originalFocus.apply(this, arguments);
    };
  }

  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = window[method];
    if (typeof original !== 'function') continue;
    window[method] = function (...args) {
      const target = documentScroller();
      const top = requestedTop(target, args, method === 'scrollBy');
      if (isReadingUp(target) && top !== null && top > target.scrollTop + 1) return;
      return original.apply(this, args);
    };
  }

  document.addEventListener('wheel', markUserScroll, { capture: true, passive: true });
  document.addEventListener('touchmove', markUserScroll, { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') || event.target?.isContentEditable) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) markUserScroll(event);
  }, true);
  document.addEventListener('pointerdown', event => {
    const target = resolveScrollTarget(event.target);
    if (!isScrollable(target)) return;
    const right = target === documentScroller() ? innerWidth : target.getBoundingClientRect().right;
    if (event.clientX >= right - 22) scrollbarDragTarget = target;
  }, true);
  document.addEventListener('pointermove', () => {
    if (scrollbarDragTarget) getState(scrollbarDragTarget).userUntil = performance.now() + USER_SCROLL_WINDOW_MS;
  }, true);
  document.addEventListener('pointerup', () => { scrollbarDragTarget = null; }, true);
  document.addEventListener('pointercancel', () => { scrollbarDragTarget = null; }, true);
  document.addEventListener('scroll', handleScroll, true);

  function resetForRoute() {
    if (location.pathname === currentPath) return;
    currentPath = location.pathname;
    states = new WeakMap();
    scrollbarDragTarget = null;
  }

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      resetForRoute();
      return result;
    };
  }
  window.addEventListener('popstate', resetForRoute);
  window.addEventListener('hashchange', resetForRoute);
  setInterval(resetForRoute, 1000);
})();
