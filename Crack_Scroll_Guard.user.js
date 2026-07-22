// ==UserScript==
// @name         🛡️ 스크롤 가드
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.0.0
// @description  🧪 BETA · 이전 대화를 읽는 동안 크랙이 화면을 강제로 아래로 내리는 동작만 차단합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

/* global GM_addStyle */

(() => {
  'use strict';

  if (window.__SHIPIDLE_SCROLL_GUARD__) return;
  window.__SHIPIDLE_SCROLL_GUARD__ = true;

  const BOTTOM_THRESHOLD = 8;
  const READY_CLASS = 'shipidle-scroll-guard-ready';
  let routeGeneration = 1;
  let currentPath = location.pathname;
  const readyGeneration = new WeakMap();

  GM_addStyle(`
    html.${READY_CLASS}, html.${READY_CLASS} * {
      scroll-behavior:auto !important;
      overflow-anchor:none !important;
    }
  `);

  function documentScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function isScrollable(target) {
    return !!target && target.scrollHeight > target.clientHeight + 1;
  }

  function resolveScrollTarget(element) {
    if (!element || element === window || element === document
      || element === document.body || element === document.documentElement) return documentScroller();
    if (isScrollable(element)) return element;
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      if (isScrollable(parent)) return parent;
      parent = parent.parentElement;
    }
    return documentScroller();
  }

  function distanceToBottom(target) {
    return Math.max(0, target.scrollHeight - target.scrollTop - target.clientHeight);
  }

  function markReady(target) {
    if (!isScrollable(target) || distanceToBottom(target) > BOTTOM_THRESHOLD) return;
    readyGeneration.set(target, routeGeneration);
    document.documentElement?.classList.add(READY_CLASS);
  }

  function isReadingUp(target) {
    return isScrollable(target)
      && readyGeneration.get(target) === routeGeneration
      && distanceToBottom(target) > BOTTOM_THRESHOLD;
  }

  function afterAllowedScroll(target) {
    queueMicrotask(() => markReady(target));
  }

  function resetForRoute() {
    routeGeneration += 1;
    currentPath = location.pathname;
    document.documentElement?.classList.remove(READY_CLASS);
  }

  function requestedTop(target, args, relative = false) {
    if (typeof args[0] === 'object' && args[0] !== null) {
      const value = Number(args[0].top);
      if (!Number.isFinite(value)) return null;
      return relative ? target.scrollTop + value : value;
    }
    const value = Number(args[1]);
    if (!Number.isFinite(value)) return null;
    return relative ? target.scrollTop + value : value;
  }

  function wouldMoveElementDown(element, target) {
    const elementRect = element.getBoundingClientRect();
    const bottom = target === documentScroller() ? innerHeight : target.getBoundingClientRect().bottom;
    return elementRect.bottom > bottom + 1;
  }

  const scrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  if (scrollTopDescriptor?.get && scrollTopDescriptor?.set && scrollTopDescriptor.configurable) {
    Object.defineProperty(Element.prototype, 'scrollTop', {
      ...scrollTopDescriptor,
      get() { return scrollTopDescriptor.get.call(this); },
      set(value) {
        const target = resolveScrollTarget(this);
        if (isReadingUp(target) && Number(value) > target.scrollTop) return;
        scrollTopDescriptor.set.call(this, value);
        afterAllowedScroll(target);
      }
    });
  }

  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      const target = resolveScrollTarget(this);
      const top = requestedTop(target, args, method === 'scrollBy');
      if (isReadingUp(target) && top !== null && top > target.scrollTop) return;
      const result = original.apply(this, args);
      afterAllowedScroll(target);
      return result;
    };
  }

  for (const method of ['scrollIntoView', 'scrollIntoViewIfNeeded']) {
    const original = Element.prototype[method];
    if (typeof original !== 'function') continue;
    Element.prototype[method] = function (...args) {
      const target = resolveScrollTarget(this);
      if (isReadingUp(target) && wouldMoveElementDown(this, target)) return;
      const result = original.apply(this, args);
      afterAllowedScroll(target);
      return result;
    };
  }

  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (options) {
    const target = resolveScrollTarget(this);
    if (isReadingUp(target) && wouldMoveElementDown(this, target)) {
      const safeOptions = options && typeof options === 'object'
        ? { ...options, preventScroll: true }
        : { preventScroll: true };
      return originalFocus.call(this, safeOptions);
    }
    return originalFocus.apply(this, arguments);
  };

  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = window[method];
    if (typeof original !== 'function') continue;
    window[method] = function (...args) {
      const target = documentScroller();
      const top = requestedTop(target, args, method === 'scrollBy');
      if (isReadingUp(target) && top !== null && top > target.scrollTop) return;
      const result = original.apply(this, args);
      afterAllowedScroll(target);
      return result;
    };
  }

  document.addEventListener('scroll', event => markReady(resolveScrollTarget(event.target)), true);
  window.addEventListener('scroll', () => markReady(documentScroller()), true);

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      if (location.pathname !== currentPath) resetForRoute();
      return result;
    };
  }
  window.addEventListener('popstate', () => {
    if (location.pathname !== currentPath) resetForRoute();
  });
  window.addEventListener('hashchange', () => {
    if (location.pathname !== currentPath) resetForRoute();
  });
  setInterval(() => {
    if (location.pathname !== currentPath) resetForRoute();
  }, 1000);
})();
