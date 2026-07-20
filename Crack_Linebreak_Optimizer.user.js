// ==UserScript==
// @name         ↩️ 줄바꿈 최적화
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.2.2
// @description  크랙의 강제 글자 쪼개기를 막고 iOS Safari에서도 단어 기준 줄바꿈을 적용합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
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

  function start() {
    injectManagerStyle();
    injectNativeStyle();
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
