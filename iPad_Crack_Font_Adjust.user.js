// ==UserScript==
// @name         크랙 폰트 조정 (패드)
// @namespace    https://github.com/shipidle/crack-stay-scripts/ipad-crack-font-adjust
// @version      1.0.2
// @description  🧪 BETA · crack.wrtn.ai 리스트 간격과 인용문 표시를 compact하게 조정
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/iPad_Crack_Font_Adjust.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/iPad_Crack_Font_Adjust.user.js
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement("style");
  style.textContent = `
    /* 리스트 위아래 공백 축소 */
    main ul,
    main ol {
      padding-left: 1.2em !important;
      margin-top: 0.04em !important;
      margin-bottom: 0.04em !important;
    }

    main li {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }

    main li > p,
    main li p,
    main ul p,
    main ol p {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
    }

    /* 인용문 compact */
    main blockquote,
    main blockquote * {
      line-height: 1.35 !important;
    }

    main blockquote {
      position: relative !important;
      margin: 0.12em 0 !important;
      padding: 0.08em 0 0.08em 0.65em !important;
      min-height: 0 !important;
      height: auto !important;
      align-self: flex-start !important;
      border-left: 0 !important;
    }

    main blockquote p {
      margin-top: 0 !important;
      margin-bottom: 0 !important;
    }

    main blockquote p:last-child {
      margin-bottom: 0 !important;
    }

    /* 인용문 왼쪽 바를 글자 높이만큼만 표시 */
    main blockquote::before {
      content: "" !important;
      position: absolute !important;
      left: 0 !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      bottom: auto !important;
      display: block !important;
      width: 3px !important;
      height: 1.05em !important;
      min-height: 0 !important;
      max-height: 1.05em !important;
      border-radius: 999px !important;
      background: #d1d5db !important;
      border: 0 !important;
    }

    main blockquote::after {
      content: none !important;
      display: none !important;
    }
  `;

  document.head.appendChild(style);
})();
