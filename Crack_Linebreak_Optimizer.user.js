// ==UserScript==
// @name         줄바꿈 최적화
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.2.0
// @description  크랙의 강제 글자 쪼개기를 막고 iOS Safari에서도 단어 기준 줄바꿈을 적용합니다.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @inject-into  content
// @grant        GM_addStyle
// @grant        GM.addStyle
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Linebreak_Optimizer.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Linebreak_Optimizer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'crack-linebreak-optimizer-style';
  const BREAK_SELECTOR = '.break-all, .break-all *';
  const MARKDOWN_SELECTOR = '.wrtn-markdown, .wrtn-markdown *';
  const TARGET_SELECTOR = `${BREAK_SELECTOR}, ${MARKDOWN_SELECTOR}`;
  const CSS = `
    /* 크랙 강제 쪼개기(break-all) 방지 */
    html body .break-all,
    html body .break-all * {
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      -webkit-hyphens: none !important;
      hyphens: none !important;
    }

    /* 마크다운 텍스트 구역 단어 덩어리 유지 및 최적화 */
    html body .wrtn-markdown,
    html body .wrtn-markdown * {
      max-width: 100% !important;
      text-align: left !important;
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      white-space: pre-wrap !important;
      -webkit-hyphens: none !important;
      hyphens: none !important;
    }
  `;

  function injectManagerStyle() {
    try {
      if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
    } catch (_) {
      // DOM fallback below remains active.
    }

    try {
      if (typeof GM !== 'undefined' && typeof GM.addStyle === 'function') {
        const result = GM.addStyle(CSS);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } catch (_) {
      // DOM fallback below remains active.
    }
  }

  function injectNativeStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const target = document.head || document.documentElement;
    if (!target) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    target.appendChild(style);
  }

  function applyBreakStyle(element) {
    element.style.setProperty('word-break', 'keep-all', 'important');
    element.style.setProperty('overflow-wrap', 'break-word', 'important');
    element.style.setProperty('word-wrap', 'break-word', 'important');
    element.style.setProperty('-webkit-hyphens', 'none', 'important');
    element.style.setProperty('hyphens', 'none', 'important');
  }

  function applyMarkdownStyle(element) {
    applyBreakStyle(element);
    element.style.setProperty('max-width', '100%', 'important');
    element.style.setProperty('text-align', 'left', 'important');
    element.style.setProperty('white-space', 'pre-wrap', 'important');
  }

  function applyInlineStyles(root) {
    if (!root || root.nodeType !== 1) return;

    const targets = [];
    if (root.matches(TARGET_SELECTOR)) targets.push(root);
    targets.push(...root.querySelectorAll(TARGET_SELECTOR));

    targets.forEach((element) => {
      if (element.matches(MARKDOWN_SELECTOR)) applyMarkdownStyle(element);
      else applyBreakStyle(element);
    });
  }

  function start() {
    injectManagerStyle();
    injectNativeStyle();
    applyInlineStyles(document.documentElement);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach(applyInlineStyles);
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
