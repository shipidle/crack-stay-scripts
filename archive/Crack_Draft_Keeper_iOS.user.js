// ==UserScript==
// @name         크랙 자동저장 (iOS)
// @namespace    https://crack.wrtn.ai/
// @version      1.1.1
// @description  Keep unsent Crack/WRTN chat drafts per chat room after refresh, including iOS reloads.
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=crack.wrtn.ai
// @author       shipidle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/archive/Crack_Draft_Keeper_iOS.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/archive/Crack_Draft_Keeper_iOS.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORE_PREFIX = 'crackDraftKeeper:v1:';
  const LAST_SNAPSHOT_KEY = 'crackDraftKeeper:lastSnapshot:v1';
  const RESTORE_ATTR = 'data-crack-draft-restored';
  const SAVE_DELAY = 60;
  const SCAN_DELAY = 250;
  const RESTORE_MAX_AGE = 2 * 60 * 1000;

  let activeEditor = null;
  let activeRoomKey = '';
  let saveTimer = 0;
  let scanTimer = 0;
  let lastUrl = location.href;
  let pendingSendUntil = 0;

  const primaryEditorSelector = [
    '.__chat_input_textarea[contenteditable="true"]',
    '.tiptap.ProseMirror[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]'
  ].join(',');

  const fallbackEditorSelector = [
    'textarea[placeholder*="메시지"]',
    'textarea[aria-label*="메시지"]',
    '[role="textbox"][contenteditable="true"]'
  ].join(',');

  const editorSelector = `${primaryEditorSelector},${fallbackEditorSelector}`;

  function roomKey() {
    const path = location.pathname.replace(/\/+$/, '');
    const match = path.match(/\/stories\/[^/]+\/episodes\/[^/?#]+/);
    return STORE_PREFIX + location.origin + (match ? match[0] : path);
  }

  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function supportedEditor(el) {
    return Boolean(el && el.nodeType === 1 && el.matches(editorSelector));
  }

  function isEditor(el) {
    if (!supportedEditor(el) || !visible(el)) return false;
    if (el.closest('[aria-hidden="true"], [hidden]')) return false;
    return true;
  }

  function editorText(el) {
    if (!el) return '';
    if ('value' in el) return el.value || '';
    return (el.innerText || el.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\u200b/g, '')
      .replace(/\r\n?/g, '\n');
  }

  function makeInputEvent(type, options = {}) {
    try {
      return new InputEvent(type, { bubbles: true, composed: true, ...options });
    } catch {
      return new Event(type, { bubbles: true, composed: true });
    }
  }

  function replaceContentEditable(el, text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const fragment = document.createDocumentFragment();

    for (const line of lines) {
      const paragraph = document.createElement('p');
      if (line) paragraph.textContent = line;
      else paragraph.appendChild(document.createElement('br'));
      fragment.appendChild(paragraph);
    }

    el.replaceChildren(fragment);
  }

  function setEditorText(el, text) {
    el.dispatchEvent(makeInputEvent('beforeinput', {
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));

    if ('value' in el) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
    } else {
      replaceContentEditable(el, text);
    }

    el.dispatchEvent(makeInputEvent('input', { inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable in a private browsing context.
    }
  }

  function saveSnapshot(key, text) {
    writeStorage(LAST_SNAPSHOT_KEY, JSON.stringify({
      key,
      text,
      url: location.href,
      savedAt: Date.now()
    }));
  }

  function clearSnapshotFor(key) {
    try {
      const snapshot = JSON.parse(readStorage(LAST_SNAPSHOT_KEY) || 'null');
      if (snapshot?.key === key) removeStorage(LAST_SNAPSHOT_KEY);
    } catch {
      removeStorage(LAST_SNAPSHOT_KEY);
    }
  }

  function saveDraftNow(allowClear = false) {
    const el = activeEditor;
    if (!supportedEditor(el)) return;

    const text = editorText(el);
    const key = activeRoomKey || roomKey();

    if (text.trim()) {
      writeStorage(key, text);
      saveSnapshot(key, text);
      return;
    }

    if (!allowClear) return;
    removeStorage(key);
    clearSnapshotFor(key);
    if (Date.now() < pendingSendUntil) pendingSendUntil = 0;
  }

  function saveReloadSnapshot() {
    const el = activeEditor;
    if (!supportedEditor(el)) return;

    const text = editorText(el);
    const key = activeRoomKey || roomKey();

    if (text.trim()) {
      writeStorage(key, text);
      saveSnapshot(key, text);
      return;
    }

    if (Date.now() < pendingSendUntil) saveDraftNow(true);
  }

  function getFreshReloadSnapshot(key) {
    try {
      const snapshot = JSON.parse(readStorage(LAST_SNAPSHOT_KEY) || 'null');
      if (!snapshot || snapshot.key !== key) return '';
      if (Date.now() - Number(snapshot.savedAt || 0) > RESTORE_MAX_AGE) return '';
      return String(snapshot.text || '');
    } catch {
      return '';
    }
  }

  function savedDraftFor(key) {
    const roomDraft = readStorage(key);
    if (roomDraft?.trim()) return roomDraft;
    return getFreshReloadSnapshot(key);
  }

  function scheduleSave(allowClear = false) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraftNow(allowClear), SAVE_DELAY);
  }

  function restoreDraft(el) {
    if (!isEditor(el)) return;

    const key = roomKey();
    activeEditor = el;
    activeRoomKey = key;

    if (el.getAttribute(RESTORE_ATTR) === key) return;
    el.setAttribute(RESTORE_ATTR, key);

    const saved = savedDraftFor(key);
    if (saved && !editorText(el).trim()) {
      setEditorText(el, saved);
    } else if (editorText(el).trim()) {
      saveDraftNow();
    }
  }

  function findBestEditor() {
    const focused = document.activeElement;
    if (isEditor(focused)) return focused;

    for (const selector of [primaryEditorSelector, fallbackEditorSelector]) {
      const candidates = [...document.querySelectorAll(selector)].filter(isEditor);
      if (!candidates.length) continue;

      return candidates.sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.top - ar.top;
      })[0];
    }

    return null;
  }

  function scan() {
    if (location.href !== lastUrl) {
      saveDraftNow();
      lastUrl = location.href;
      activeEditor = null;
      activeRoomKey = '';
    }

    const editor = findBestEditor();
    if (editor) restoreDraft(editor);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DELAY);
  }

  function markMaybeSent() {
    pendingSendUntil = Date.now() + 2500;
    setTimeout(() => saveDraftNow(true), 300);
    setTimeout(() => saveDraftNow(true), 900);
    setTimeout(() => saveDraftNow(true), 1800);
  }

  document.addEventListener('focusin', (event) => {
    if (!isEditor(event.target)) return;
    activeEditor = event.target;
    restoreDraft(activeEditor);
  }, true);

  document.addEventListener('input', (event) => {
    const editor = event.target?.closest?.(editorSelector);
    if (!isEditor(editor)) return;
    activeEditor = editor;
    activeRoomKey = roomKey();

    if (editor.getAttribute(RESTORE_ATTR) !== activeRoomKey) {
      restoreDraft(editor);
    }

    saveDraftNow(event.isTrusted || Date.now() < pendingSendUntil);
  }, true);

  function scheduleEditorSave(event) {
    const editor = event.target?.closest?.(editorSelector);
    if (!isEditor(editor)) return;
    activeEditor = editor;
    activeRoomKey = roomKey();
    scheduleSave(true);
  }

  document.addEventListener('compositionend', scheduleEditorSave, true);
  document.addEventListener('paste', scheduleEditorSave, true);
  document.addEventListener('cut', scheduleEditorSave, true);

  document.addEventListener('keydown', (event) => {
    const editor = event.target?.closest?.(editorSelector);
    if (!isEditor(editor)) return;
    activeEditor = editor;

    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      markMaybeSent();
    }
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button,[role="button"]');
    if (!button || !activeEditor || !editorText(activeEditor).trim()) return;

    const label = [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent
    ].filter(Boolean).join(' ');

    if (/send|submit/i.test(label) || button.type === 'submit' || button.querySelector('svg')) {
      markMaybeSent();
    }
  }, true);

  window.addEventListener('beforeunload', saveReloadSnapshot);
  window.addEventListener('pagehide', saveReloadSnapshot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveReloadSnapshot();
  });
  document.addEventListener('freeze', saveReloadSnapshot);
  window.addEventListener('popstate', scheduleScan);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();
  setInterval(scan, 1500);
})();
