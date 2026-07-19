// ==UserScript==
// @name         줄바꿈 최적화
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.1.0
// @description  크랙의 강제 글자 쪼개기를 막고 iOS Safari에서도 단어 기준 줄바꿈을 적용합니다.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Linebreak_Optimizer.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Linebreak_Optimizer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'crack-linebreak-optimizer-style';
  const CSS = `
    /* 크랙 강제 쪼개기(break-all) 방지 */
    .break-all {
      word-break: keep-all !important;
    }

    /* 마크다운 텍스트 구역 단어 덩어리 유지 및 최적화 */
    .wrtn-markdown,
    .wrtn-markdown *,
    .wrtn-markdown p,
    .wrtn-markdown em,
    .wrtn-markdown strong,
    .wrtn-markdown span {
      max-width: 100% !important;
      text-align: left !important;
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
      white-space: pre-wrap !important;
    }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return true;

    const target = document.head || document.documentElement;
    if (!target) return false;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    target.appendChild(style);
    return true;
  }

  if (!injectStyle()) {
    const observer = new MutationObserver(() => {
      if (injectStyle()) observer.disconnect();
    });

    observer.observe(document, { childList: true, subtree: true });
  }
})();
