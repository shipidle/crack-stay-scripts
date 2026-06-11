// ==UserScript==
// @name         크랙 자동저장 (iOS)
// @namespace    https://crack.wrtn.ai/
// @version      0.1.0
// @description  Keep unsent Crack/WRTN chat drafts per chat room after refresh.
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=crack.wrtn.ai
// @author       shipidle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Draft_Keeper_iOS.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Draft_Keeper_iOS.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORE_PREFIX = 'crackDraftKeeper:v1:';
  const RESTORE_ATTR = 'data-crack-draft-restored';
  const SAVE_DELAY = 160;
  const SCAN_DELAY = 500;

  let activeEditor = null;
  let saveTimer = 0;
  let scanTimer = 0;
  let lastUrl = location.href;
  let pendingSendUntil = 0;

  const editorSelector = [
    'textarea',
    'input[type="text"]',
    'input[type="search"]',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '.ProseMirror'
  ].join(',');

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

  function isEditor(el) {
    if (!el || el.nodeType !== 1 || !visible(el)) return false;
    if (el.matches('input') && !['text', 'search'].includes((el.type || '').toLowerCase())) return false;
    if (el.closest('[aria-hidden="true"], [hidden]')) return false;
    return el.matches(editorSelector);
  }

  function editorText(el) {
    if (!el) return '';
    if ('value' in el) return el.value || '';
    return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ');
  }

  function setEditorText(el, text) {
    if ('value' in el) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
    } else {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      if (editorText(el) !== text) el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function saveDraftNow() {
    const el = activeEditor;
    if (!isEditor(el)) return;

    const text = editorText(el);
    const key = roomKey();

    if (text.trim()) {
      localStorage.setItem(key, text);
      return;
    }

    localStorage.removeItem(key);
    if (Date.now() < pendingSendUntil) {
      pendingSendUntil = 0;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, SAVE_DELAY);
  }

  function restoreDraft(el) {
    if (!isEditor(el) || el.getAttribute(RESTORE_ATTR) === roomKey()) return;
    activeEditor = el;

    const saved = localStorage.getItem(roomKey());
    if (saved && !editorText(el).trim()) {
      setEditorText(el, saved);
    }

    el.setAttribute(RESTORE_ATTR, roomKey());
  }

  function findBestEditor() {
    const focused = document.activeElement;
    if (isEditor(focused)) return focused;

    const candidates = [...document.querySelectorAll(editorSelector)].filter(isEditor);
    if (!candidates.length) return null;

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.top - ar.top;
    })[0];
  }

  function scan() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      activeEditor = null;
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
    setTimeout(saveDraftNow, 300);
    setTimeout(saveDraftNow, 900);
    setTimeout(saveDraftNow, 1800);
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
    scheduleSave();
  }, true);

  document.addEventListener('compositionend', scheduleSave, true);
  document.addEventListener('paste', scheduleSave, true);
  document.addEventListener('cut', scheduleSave, true);

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

  window.addEventListener('beforeunload', saveDraftNow);
  window.addEventListener('pagehide', saveDraftNow);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();
  setInterval(scan, 1500);
})();
