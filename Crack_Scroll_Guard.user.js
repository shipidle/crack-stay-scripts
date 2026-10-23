// ==UserScript==
// @name         🛡️ 스크롤 가드
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.8.1
// @description  🧪 BETA · iPhone 터치 중 하단 점프 방지, 유저스크립트 창 열기/닫기 위치 유지, 모델·키보드·최하단 버튼 보호.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Scroll_Guard.user.js
// @run-at       document-start
// @inject-into  page
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

/* global unsafeWindow */
(function installScrollGuard(window) {
  'use strict';
  // Stay documents unsafeWindow, not @inject-into. Patch the site's realm.
  const { document, Element, HTMLElement, history, location } = window;
  const getComputedStyle = window.getComputedStyle.bind(window);
  if (window.__SHIPIDLE_SCROLL_GUARD__) return;
  window.__SHIPIDLE_SCROLL_GUARD__ = { version: '1.8.1' };
  // Shared DOM marker for Stay's separate userscript execution worlds.
  function exposeStatus() {
    document.documentElement?.setAttribute('data-shipidle-scroll-guard', '1.8.1');
  }
  exposeStatus();
  if (!document.documentElement) document.addEventListener('readystatechange', exposeStatus);

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
  let layoutObserver = null;
  let observedLayoutTarget = null;
  let editorActive = false;
  let keyboardSettlingUntil = 0;
  let modelHold = null;
  let modelObserver = null;
  const MODEL_HOLD_MS = 9000;
  let panelHold = null;
  let panelObserver = null;
  const PANEL_GRACE_MS = 2100;
  const OVERLAY_SELECTOR = [
    '[role="dialog"]', '[aria-modal="true"]', '#cmm-overlay',
    '#cbg-settings-overlay', '#cbg-crop-overlay', '#csb-panel',
    '#crack-helper-panel', '#cwa-panel', '#cdt-panel',
    '#ch-panel', '#info-display-turn-adjust',
    '#btn-custom-dropdown-menu', '#btn-menu-settings-menu'
  ].join(',');
  const EDITOR_SELECTOR = 'textarea, input, [contenteditable="true"], [role="textbox"]';

  function isEditor(node) {
    return !!(node?.matches?.(EDITOR_SELECTOR) || node?.closest?.(EDITOR_SELECTOR));
  }
  function keyboardTransition() {
    return editorActive || Date.now() < keyboardSettlingUntil;
  }
  function releaseForKeyboard() {
    // Safari must be able to move the composer above its on-screen keyboard.
    keyboardSettlingUntil = Date.now() + 1300;
    clearPanelHold();
    clearReading();
  }

  function overlayTarget(node) {
    return !!node?.closest?.(OVERLAY_SELECTOR) ||
      !!node?.closest?.('#cwa-host, #crack-helper-panel, #csb-panel');
  }

  function overlayVisible() {
    const nodes = document.querySelectorAll?.(OVERLAY_SELECTOR) || [];
    for (const node of nodes) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') continue;
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden') continue;
      const rect = node.getBoundingClientRect?.();
      if (rect && rect.width > 15 && rect.height > 15) return true;
    }
    return false;
  }

  function clearPanelHold() {
    panelHold = null;
    panelObserver?.disconnect();
    panelObserver = null;
    if (!reading && !modelHold && checkTimer !== null) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  function holdForPanel() {
    if (!inChat()) return;
    // The chat composer can retain focus when opening a userscript panel.
    // Its old keyboard state must not disable restoration of the chat.
    if (editorActive) {
      editorActive = false;
      keyboardSettlingUntil = 0;
    }
    if (panelHold) {
      panelHold.until = Date.now() + PANEL_GRACE_MS;
      return;
    }
    const el = reading?.target?.isConnected && isScrollable(reading.target)
      ? reading.target : findReplacement();
    if (!el || !isScrollable(el)) return;
    const docScroller = documentScroller();
    panelHold = {
      target: el, top: el.scrollTop, height: el.scrollHeight,
      gap: bottomGap(el), atBottom: bottomGap(el) <= BOTTOM_GAP,
      docTop: docScroller.scrollTop,
      until: Date.now() + PANEL_GRACE_MS, hasOpened: false,
    };
    watchWhileReading();
    if (window.MutationObserver && document.body) {
      try {
        panelObserver = new window.MutationObserver(() => {
          if (panelHold && !gesture && !keyboardTransition()) {
            // Microtask/observer callback runs before the next visual frame.
            checkPosition();
          }
        });
        panelObserver.observe(document.body, {
          childList: true, subtree: true, attributes: true,
          attributeFilter: ['class','style','hidden','aria-hidden']
        });
      } catch (_) {
        panelObserver?.disconnect();
        panelObserver = null;
      }
    }
  }

  function restorePanelPosition() {
    if (!panelHold) return;
    const open = overlayVisible();
    if (open) {
      panelHold.hasOpened = true;
      panelHold.until = Date.now() + PANEL_GRACE_MS;
    }
    if (Date.now() > panelHold.until) {
      clearPanelHold();
      return;
    }
    const previous = panelHold.target;
    let el = previous;
    if (!el?.isConnected || !isScrollable(el)) {
      el = findReplacement();
      if (!el || !isScrollable(el)) return;
      panelHold.target = el;
    }
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (max < 100 || (!panelHold.atBottom && max + 40 < panelHold.top)) return;
    let desired = panelHold.atBottom ? max : Math.min(panelHold.top, max);
    const heightDelta = el.scrollHeight - panelHold.height;
    const scrollDelta = el.scrollTop - panelHold.top;
    // Accept native anchoring when the viewport really stays over the same text.
    if (!panelHold.atBottom && Math.abs(heightDelta) > 80 &&
        Math.abs(scrollDelta - heightDelta) < 20 &&
        Math.abs(bottomGap(el) - panelHold.gap) < 35) {
      panelHold.top = el.scrollTop;
      panelHold.height = el.scrollHeight;
      panelHold.gap = bottomGap(el);
      desired = el.scrollTop;
    }
    // Overlay focus may reset the chat scroller even without replacing it.
    if (Math.abs(el.scrollTop - desired) > 3) {
      restoreDirect(el, desired);
      if (reading && reading.target === el) {
        reading.top = desired;
        reading.height = el.scrollHeight;
        reading.gap = bottomGap(el);
      }
    }
    const docScroller = documentScroller();
    if (el !== docScroller && panelHold.docTop > 5 &&
        Math.abs(docScroller.scrollTop - panelHold.docTop) > 5 &&
        docScroller.scrollHeight > docScroller.clientHeight + panelHold.docTop - 5) {
      restoreDirect(docScroller, panelHold.docTop);
    }
  }

  function stopLayoutObserver() {
    layoutObserver?.disconnect();
    layoutObserver = null;
    observedLayoutTarget = null;
  }
  function watchLayout(el) {
    if (!window.MutationObserver || !el || observedLayoutTarget === el) return;
    stopLayoutObserver();
    observedLayoutTarget = el;
    layoutObserver = new window.MutationObserver(() => {
      if (!reading || gesture || correcting || keyboardTransition() || !inChat()) return;
      const target = readingTarget();
      if (!target || !isScrollable(target)) return;
      // Ignore small message/UI changes and never interrupt an active swipe.
      if (Math.abs(target.scrollHeight - (reading.height ?? target.scrollHeight)) > 70 ||
          (bottomGap(target) <= BOTTOM_GAP && reading.gap > 90)) {
        checkPosition();
      }
    });
    try { layoutObserver.observe(el, { childList: true, subtree: true }); }
    catch (_) { stopLayoutObserver(); }
  }

  function inChat() {
    if (path !== location.pathname) resetRoute();
    return /^\/(?:stories\/[^/]+\/episodes\/[^/]+|characters\/[^/]+\/chats\/[^/]+|u\/[^/]+\/c\/[^/]+)/.test(path);
  }

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
    stopLayoutObserver();
    if (checkTimer !== null && !modelHold && !panelHold) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  function watchWhileReading() {
    if ((reading || modelHold || panelHold) && checkTimer === null) checkTimer = setInterval(checkPosition, CHECK_INTERVAL_MS);
  }

  function clearModelHold() {
    modelHold = null;
    modelObserver?.disconnect();
    modelObserver = null;
    if (!reading && !panelHold && checkTimer !== null) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  function holdCurrentModelPosition() {
    if (!inChat()) return;
    const now = Date.now();
    // Opening the menu and picking an option are separate taps.
    if (modelHold && now < modelHold.until) {
      modelHold.until = now + MODEL_HOLD_MS;
      return;
    }
    const target = reading?.target?.isConnected ? reading.target : findReplacement();
    if (!isScrollable(target)) return;
    const gap = bottomGap(target);
    modelHold = { target, top: target.scrollTop, gap,
      atBottom: gap <= BOTTOM_GAP, until: now + MODEL_HOLD_MS };
    watchWhileReading();
    if (!modelObserver && window.MutationObserver && document.body) {
      try {
        modelObserver = new window.MutationObserver(() => {
          if (modelHold && !gesture && !keyboardTransition()) checkPosition();
        });
        modelObserver.observe(document.body, { childList: true, subtree: true });
      } catch (_) {
        modelObserver?.disconnect();
        modelObserver = null;
      }
    }
  }

  function restoreModelPosition() {
    if (!modelHold) return;
    if (Date.now() >= modelHold.until) {
      clearModelHold();
      return;
    }
    let el = modelHold.target;
    if (!el?.isConnected || !isScrollable(el)) {
      const replacement = findReplacement();
      if (!replacement) return;
      el = replacement;
      modelHold.target = replacement;
    }
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (max < 100) return;
    if (!modelHold.atBottom && max + 40 < modelHold.top) return;
    const desired = modelHold.atBottom ? max : Math.min(modelHold.top, max);
    if (Math.abs(el.scrollTop - desired) > Math.max(35, el.clientHeight * 0.12)) {
      restoreDirect(el, desired);
      if (reading && reading.target === el) {
        reading.top = desired;
        reading.height = el.scrollHeight;
        reading.gap = bottomGap(el);
        if (!reading.anchor?.isConnected) {
          reading.anchor = null;
          reading.anchorY = null;
        }
      }
    }
  }

  function saveVisibleAnchor() {
    if (!reading || !reading.target?.isConnected) return;
    const el = reading.target;
    const box = el === documentScroller()
      ? { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight }
      : el.getBoundingClientRect();
    if (box.bottom - box.top < 90) return;
    const x = (box.left + box.right) * 0.5;
    const y = Math.min(box.bottom - 32, box.top + Math.min(130, (box.bottom - box.top) * 0.3));
    const node = document.elementFromPoint?.(x, y);
    // Never anchor to a fixed overlay, background or the entire chat viewport.
    const anchor = node?.closest?.('.wrtn-markdown p, .wrtn-markdown li, .wrtn-markdown blockquote, [data-message-id]');
    if (!anchor) return;
    for (let parent = anchor; parent && parent !== el; parent = parent.parentElement) {
      if (/^(fixed|sticky)$/.test(getComputedStyle(parent).position)) return;
    }
    if (anchor && anchor !== el && (el === documentScroller() || el.contains(anchor))) {
      reading.anchor = anchor;
      reading.anchorY = anchor.getBoundingClientRect().top;
    }
  }

  function saveUserPosition(el) {
    if (!inChat() || keyboardTransition() || overlayVisible() || !isScrollable(el)) return;
    if (bottomGap(el) <= BOTTOM_GAP) {
      clearReading();
      return;
    }
    const previous = reading?.target === el ? reading : null;
    reading = {
      target: el,
      top: el.scrollTop,
      parents: previous ? previous.parents.map(parent => ({ target: parent.target, top: parent.target.scrollTop })) : parentPositions(el),
      anchor: null,
      anchorY: null,
      height: el.scrollHeight,
      gap: bottomGap(el),
      settledAt: Date.now() + 600,
      lastVisualCorrectionHeight: null,
    };
    watchWhileReading();
    watchLayout(el);
  }

  function parentPositions(el) {
    const parents = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (node === documentScroller() || isScrollable(node)) parents.push({ target: node, top: node.scrollTop });
    }
    return parents;
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
    if (!inChat() || !isScrollable(target)) return;
    // Arm before the first scroll event; JS scrolling stays guarded during touch.
    if (!gesture) checkPosition();
    saveUserPosition(target);
    if (finishTimer !== null) clearTimeout(finishTimer);
    finishTimer = null;
    gesture = { target, down, moved: !down, y: null, direction: 0,
      startedAt: Date.now(), acceptedTop: target.scrollTop,
      acceptedAt: Date.now() };
    if (!down) queueGestureEnd();
  }

  function pointerStart(event) {
    if (overlayTarget(event.target)) return;
    if (isEditor(event.target)) {
      // A panel's own input must not unlock or refocus the chat scroller.
      releaseForKeyboard();
      return;
    }
    const target = scrollTarget(event.target);
    if (isScrollable(target)) {
      startGesture(target, true);
      if (gesture) gesture.y = event.touches?.[0]?.clientY ?? null;
    }
  }

  function pointerMove(event) {
    if (!gesture) return;
    gesture.moved = true;
    const y = event?.touches?.[0]?.clientY;
    if (Number.isFinite(y) && gesture.y !== null && Math.abs(gesture.y - y) > 1) {
      gesture.direction = Math.sign(gesture.y - y);
    }
    if (Number.isFinite(y)) gesture.y = y;
  }

  function pointerEnd() {
    if (!gesture) return;
    gesture.down = false;
    queueGestureEnd();
  }

  function nativeScroll(event) {
    if (correcting || keyboardTransition() || !inChat()) return;
    const target = scrollTarget(event.target);
    if (!isScrollable(target)) return;
    if (gesture && (gesture.target === target || target.contains?.(gesture.target))) {
      // Native scroll chaining to an outer container is also user input.
      gesture.target = target;
      if (gesture.moved) {
        if (modelHold && modelHold.target === target) clearModelHold();
        if (panelHold && panelHold.target === target) clearPanelHold();
        // A cached native API can bypass wrappers. A bottom snap opposite an
        // upward swipe is not inertia; never save it as the user's new position.
        const delta = target.scrollTop - (gesture.acceptedTop ?? target.scrollTop);
        const elapsed = Date.now() - (gesture.acceptedAt ?? Date.now());
        const atBottom = bottomGap(target) <= BOTTOM_GAP;
        const priorGap = reading?.target === target ? reading.gap : Infinity;
        const fromHistory = priorGap > Math.max(160, target.clientHeight * 0.4);
        // A browser/app bottom snap is not the finger's movement.
        // Reject both contrary-to-finger jumps and implausibly fast jumps.
        const impossibleJump = delta > Math.max(450, target.clientHeight * 0.85) &&
          elapsed < 125;
        if (atBottom && fromHistory && reading?.target === target &&
            (gesture.direction < 0 || impossibleJump) && delta > 100) {
          restoreDirect(target, gesture.acceptedTop ?? reading.top);
          if (!gesture.down) queueGestureEnd();
          return;
        }
        gesture.acceptedTop = target.scrollTop;
        gesture.acceptedAt = Date.now();
        saveUserPosition(target);
        if (!gesture.down) queueGestureEnd();
      }
      return;
    }
    if ((reading && reading.target === target) ||
        (modelHold && modelHold.target === target) ||
        (panelHold && panelHold.target === target)) checkPosition();
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
    const sample = document.querySelector('main .wrtn-markdown') || document.querySelector('.wrtn-markdown') || document.querySelector('main');
    const target = sample && scrollTarget(sample);
    return isScrollable(target) ? target : (isScrollable(documentScroller()) ? documentScroller() : null);
  }

  function readingTarget() {
    if (!inChat() || !reading) return null;
    if (!reading.target?.isConnected) {
      const replacement = findReplacement();
      if (!replacement) return null;
      const old = reading.target;
      reading.target = replacement;
      reading.parents = parentPositions(replacement);
      reading.anchor = null;
      reading.anchorY = null;
      if (gesture?.target === old) gesture.target = replacement;
      // A replacement starts at zero; protect it before the app's first scroll.
      if (!gesture) restoreDirect(replacement, reading.top);
      reading.height = replacement.scrollHeight;
      reading.gap = bottomGap(replacement);
      reading.settledAt = Date.now() + 550;
      watchLayout(replacement);
    }
    return reading.target;
  }

  function checkPosition() {
    if (!inChat() || gesture || correcting || keyboardTransition()) return;
    restorePanelPosition();
    restoreModelPosition();
    if (!reading) return;
    const el = readingTarget();
    if (!el || !isScrollable(el)) return;
    for (const parent of reading.parents) {
      if (parent.target.isConnected && parent.target.scrollTop > parent.top + 2) {
        restoreDirect(parent.target, parent.top);
      }
    }
    const actual = el.scrollTop;
    const height = el.scrollHeight;
    const gap = bottomGap(el);
    const shift = actual - reading.top;
    // Restore native framework-driven top resets after changing a chat model.
    if (modelHold && actual <= 4 &&
        reading.top > Math.max(160, el.clientHeight * 0.4)) {
      if (height - el.clientHeight >= reading.top - 40) {
        restoreDirect(el, reading.top);
      }
      return;
    }
    const heightDelta = height - (reading.height ?? height);
    const savedGap = reading.gap ?? gap;
    let anchorDelta = null;
    if (reading.anchor?.isConnected && (el === documentScroller() || el.contains(reading.anchor))) {
      anchorDelta = reading.anchor.getBoundingClientRect().top - reading.anchorY;
    }

    // Pixel-level correction ONLY after a structural reply reflow, with
    // no active editor, touch, or momentum. Preserve the same visible paragraph.
    if (anchorDelta !== null && gap > BOTTOM_GAP &&
        Math.abs(heightDelta) >= 70 &&
        Math.abs(anchorDelta) > 12 && Math.abs(anchorDelta) < 320 &&
        Date.now() >= (reading.settledAt || 0) &&
        reading.lastVisualCorrectionHeight !== height) {
      const desired = Math.max(0, Math.min(height - el.clientHeight, actual + anchorDelta));
      reading.lastVisualCorrectionHeight = height;
      if (Math.abs(desired - actual) > 8) restoreDirect(el, desired);
      reading.top = desired;
      reading.height = height;
      reading.gap = bottomGap(el);
      return;
    }

    // In the iPhone log, scrollTop and scrollHeight grew by exactly 1697px:
    // native anchoring was preserving the visible text. Do not fight it.
    if (Math.abs(heightDelta) > 70 && Math.abs(shift - heightDelta) < 35 &&
        Math.abs(gap - savedGap) < 45) {
      reading.top = actual;
      reading.height = height;
      reading.gap = gap;
      return;
    }

    // 17ms later the rendered chat lost 1586px and Safari clamped scrollTop
    // to the new bottom. Restore the prior distance from the end instead.
    const clampedToBottom = gap <= BOTTOM_GAP &&
      savedGap > Math.max(80, el.clientHeight * 0.1);
    if (clampedToBottom) {
      const desired = Math.max(0, height - el.clientHeight - savedGap);
      if (Math.abs(actual - desired) > 3) restoreDirect(el, desired);
      reading.top = desired;
      reading.height = height;
      reading.gap = Math.max(0, height - el.clientHeight - desired);
      return;
    }

    // Normal response growth below the viewport is not an automatic jump.
    if (Math.abs(shift) <= 2) {
      reading.height = height;
      reading.gap = gap;
      return;
    }

    if (anchorDelta !== null && Math.abs(anchorDelta) <= 5 && gap > BOTTOM_GAP) {
      reading.top = actual;
      reading.height = height;
      reading.gap = gap;
      return;
    }
    const threshold = Math.max(85, el.clientHeight * 0.17);
    const movedFarDown = shift > threshold;
    const snappedToBottom = bottomGap(el) <= BOTTOM_GAP && shift > 2;
    if (!movedFarDown && !snappedToBottom) {
      reading.height = height;
      if (Math.abs(shift) < 45) {
        reading.top = actual;
        reading.gap = gap;
      }
      return;
    }

    const anchoredTop = anchorDelta !== null && Math.abs(anchorDelta) < 10000
      ? actual + anchorDelta : reading.top;
    if (Math.abs(actual - anchoredTop) > 6) restoreDirect(el, anchoredTop);
    reading.top = Math.max(0, Math.min(anchoredTop, height - el.clientHeight));
    reading.height = height;
    reading.gap = bottomGap(el);
  }

  function resetRoute() {
    path = location.pathname;
    clearPanelHold();
    clearModelHold();
    clearReading();
    editorActive = false;
    keyboardSettlingUntil = 0;
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
    if (correcting || keyboardTransition() ||
        desired === null || !Number.isFinite(desired)) return false;
    const target = readingTarget();
    const saved = reading
      ? (el === target ? reading.top :
        reading.parents.find(parent => parent.target === el)?.top)
      : undefined;
    // Never allow automated downward motion while reading history.
    if (saved !== undefined && desired > el.scrollTop) return true;
    // Model changes (and other React rerenders) sometimes write scrollTop=0.
    // Browser-native finger scrolling does not use this setter.
    const protectedTarget = saved !== undefined ||
      (modelHold && modelHold.target === el) ||
      (panelHold && panelHold.target === el);
    return !!protectedTarget && desired <= 4 &&
      el.scrollTop > Math.max(160, el.clientHeight * 0.4);
  }

  function intoViewTop(node, el, args, method) {
    const box = el === documentScroller()
      ? { top: 0, bottom: window.innerHeight } : el.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const padding = getComputedStyle(el);
    const top = box.top + (parseFloat(padding.scrollPaddingTop) || 0);
    const bottom = box.bottom - (parseFloat(padding.scrollPaddingBottom) || 0);
    const a = rect.top - (parseFloat(style.scrollMarginTop) || 0);
    const b = rect.bottom + (parseFloat(style.scrollMarginBottom) || 0);
    const arg = args[0];
    const block = method === 'scrollIntoViewIfNeeded' ? (arg === false ? 'nearest' : 'center')
      : arg === false ? 'end' : (arg && typeof arg === 'object' ? arg.block || 'start' : 'start');
    if (method === 'scrollIntoViewIfNeeded' && a >= top && b <= bottom) return el.scrollTop;
    let delta = 0;
    if (block === 'start') delta = a - top;
    else if (block === 'end') delta = b - bottom;
    else if (block === 'center') delta = (a + b - top - bottom) / 2;
    else if (block === 'nearest') {
      if (a < top && b > bottom) return el.scrollTop;
      if (a < top) delta = a - top;
      else if (b > bottom) delta = b - bottom;
    }
    return el.scrollTop + delta;
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
      const el = readingTarget();
      if (el && !correcting) {
        for (const target of [el, ...reading.parents.map(parent => parent.target)]) {
          if (target.contains(this) && guard(target, intoViewTop(this, target, args, method))) return;
        }
      }
      return original.apply(this, args);
    };
  }
  const nativeFocus = HTMLElement.prototype.focus;
  if (typeof nativeFocus === 'function') {
    HTMLElement.prototype.focus = function (options) {
      if (overlayTarget(this)) {
        holdForPanel();
        // Let Safari focus the popup editor without releasing chat protection.
        return nativeFocus.apply(this, arguments);
      }
      if (isEditor(this)) {
        editorActive = true;
        releaseForKeyboard();
        // Do NOT use preventScroll: true on a real editable composer.
        return nativeFocus.apply(this, arguments);
      }
      if (readingTarget() && !correcting && !keyboardTransition()) {
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

  document.addEventListener('focusin', event => {
    if (overlayTarget(event.target)) {
      holdForPanel();
      return;
    }
    if (isEditor(event.target)) {
      editorActive = true;
      releaseForKeyboard();
    }
  }, true);
  document.addEventListener('focusout', event => {
    if (overlayTarget(event.target)) return;
    if (isEditor(event.target)) {
      editorActive = false;
      // Closing the chat keyboard to open a popup must not unlock the chat.
      keyboardSettlingUntil = panelHold ? 0 : Date.now() + 1150;
    }
  }, true);
  window.visualViewport?.addEventListener('resize', () => {
    if (!panelHold && (editorActive ||
        (isEditor(document.activeElement) && !overlayTarget(document.activeElement)))) {
      releaseForKeyboard();
    }
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (!panelHold && (editorActive ||
        (isEditor(document.activeElement) && !overlayTarget(document.activeElement)))) {
      releaseForKeyboard();
    }
  }, { passive: true });

  document.addEventListener('touchstart', pointerStart, { capture: true, passive: true });
  document.addEventListener('touchmove', pointerMove, { capture: true, passive: true });
  document.addEventListener('touchend', pointerEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', pointerEnd, { capture: true, passive: true });
  document.addEventListener('wheel', event => {
    if (overlayTarget(event.target)) return;
    startGesture(scrollTarget(event.target), false);
    if (gesture) gesture.direction = Math.sign(event.deltaY);
  }, { capture: true, passive: true });
  document.addEventListener('keydown', event => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') || event.target?.isContentEditable) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      startGesture(scrollTarget(event.target), false);
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    const el = scrollTarget(event.target);
    const right = el === documentScroller() ? window.innerWidth : el.getBoundingClientRect().right;
    if (isScrollable(el) && event.clientX > right - 18) startGesture(el, true);
  }, true);
  // iOS emits both pointer and touch events; touchcancel/pointercancel differ.
  document.addEventListener('pointermove', event => { if (event.pointerType !== 'touch') pointerMove(); }, true);
  document.addEventListener('pointerup', event => { if (event.pointerType !== 'touch') pointerEnd(); }, true);
  document.addEventListener('pointercancel', event => { if (event.pointerType !== 'touch') pointerEnd(); }, true);
  document.addEventListener('scroll', nativeScroll, true);

  function isModelControl(target) {
    const control = target?.closest?.(
      'button, [role="button"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], select, option, label'
    );
    const icon = target?.closest?.('img[src*="model-icon"]');
    if (!control && !icon) return false;
    const node = control || icon.parentElement;
    const label = [
      node?.getAttribute?.('aria-label'), node?.getAttribute?.('title'),
      node?.getAttribute?.('data-testid'), node?.getAttribute?.('id'),
      node?.getAttribute?.('class'), (node?.textContent || '').slice(0, 180),
    ].filter(Boolean).join(' ');
    return /(?:하이퍼챗|슈퍼챗|프로챗|파워챗|hyperchat|superchat|prochat|powerchat|모델\s*(?:선택|설정|변경)|채팅\s*모델|대화\s*모델|chat[-_ ]?model|model[-_ ]?(?:select|picker|switch|change))/i.test(label)
      || !!icon || !!node?.querySelector?.('img[src*="model-icon"]');
  }

  function isBottomButton(target) {
    const button = target?.closest?.('button, [role="button"]');
    if (!button || isModelControl(button)) return false;
    // Composer-embedded mini-sidebar button is intentional user navigation.
    if (button.id === 'my-counter-scroll-bottom-button') return true;
    if (button.closest?.('[role="menu"], [role="listbox"], [role="dialog"], form')) return false;
    const label = [
      button.getAttribute?.('aria-label'), button.getAttribute?.('title'),
      button.getAttribute?.('data-testid'), button.getAttribute?.('id'),
      button.getAttribute?.('class'), (button.textContent || '').slice(0, 100),
    ].filter(Boolean).join(' ');
    if (/최하단|맨\s*아래|가장\s*아래|최신\s*(?:메시지|대화)|마지막\s*(?:메시지|대화)|새\s*메시지|아래로\s*(?:이동|가기)|아래\s*스크롤|끝으로\s*이동|[↓⇩⬇⤓]|(?:scroll|go|jump)[\s_-]*(?:to[\s_-]*)?(?:bottom|latest|end)|(?:to|scroll)[\s_-]*bottom/i.test(label)) return true;

    // The floating latest-message button can be an icon with no text/label.
    const svg = button.querySelector?.('svg');
    if (!svg) return false;
    const icon = [
      svg.getAttribute?.('class'), svg.getAttribute?.('data-lucide'),
      svg.querySelector?.('use')?.getAttribute?.('href'),
    ].filter(Boolean).join(' ');
    const downArrow = /(?:arrow|chevron|chevrons)[-_ ]?down(?:[-_ ]to[-_ ]line)?|down[-_ ]?(?:arrow|chevron)|scroll[-_ ]?down/i.test(icon);
    const paths = [...(svg.querySelectorAll?.('path, polyline') || [])]
      .map(el => el.getAttribute?.('d') || el.getAttribute?.('points') || '').join(' ');
    const downShape = /6\s+9\s+6\s+6\s+6\s*-\s*6|12\s+5\s*v\s*14|12\s+19\s*[vl]\s*-?\s*14|5\s+12\s*l\s*7\s+7\s+7\s*-\s*7/i.test(paths);
    if (!downArrow && !downShape) return false;
    const r = button.getBoundingClientRect?.();
    const scroller = reading?.target || modelHold?.target || findReplacement();
    const view = scroller?.getBoundingClientRect?.();
    if (!r || !view || r.width > 96 || r.height > 96) return false;
    const x = (r.left + r.right) / 2;
    return x > view.left + view.width * 0.18 &&
      x < view.right - view.width * 0.12 &&
      r.bottom > view.top + view.height * 0.58 &&
      r.top < view.bottom + 35;
  }

  function isTopButton(target) {
    const button = target?.closest?.('button, [role="button"]');
    if (!button || isModelControl(button)) return false;
    const label = [
      button.getAttribute?.('aria-label'), button.getAttribute?.('title'),
      button.getAttribute?.('data-testid'), button.getAttribute?.('id'),
      (button.textContent || '').slice(0, 90),
    ].filter(Boolean).join(' ');
    return /최상단|맨\s*위|가장\s*위|처음\s*(?:메시지|대화)|위로\s*(?:이동|가기)|(?:scroll|go|jump)[\s_-]*(?:to[\s_-]*)?top/i.test(label);
  }

  function panelTrigger(target) {
    const control = target?.closest?.('button, [role="button"], [role="menuitem"], #cwa-icon, #crack-helper-btn');
    if (!control) return false;
    const id = control.id || '';
    if (/^(?:my-counter-(?:profile|note|output|summary|image|archive|external-archive|settings)-button|cmm-header-button|cbg-header-button|csb-toolbar-btn|cwa-toolbar-btn|crack-helper-btn|cdt-toolbar-btn)$/.test(id)) return true;
    if (control.getAttribute?.('aria-haspopup') === 'dialog') return true;
    const parent = control.closest?.('#my-custom-btn-menu, #cwa-toolbar');
    return !!parent && !isBottomButton(control) && !isTopButton(control) &&
      !isModelControl(control);
  }

  function handleNavigationControl(event) {
    if (!inChat() || event.isTrusted === false) return;
    if (isBottomButton(event.target) || isTopButton(event.target)) {
      clearPanelHold();
      clearModelHold();
      clearReading();
    } else if (isModelControl(event.target)) {
      holdCurrentModelPosition();
    } else if (panelTrigger(event.target)) {
      holdForPanel();
    }
  }

  for (const type of ['touchstart', 'pointerdown', 'click', 'change']) {
    document.addEventListener(type, handleNavigationControl, { capture: true, passive: true });
  }

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
})(typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window);
