// ==UserScript==
// @name         크랙 폰트 조정 (폰)
// @namespace    https://github.com/shipidle/crack-stay-scripts/iphon-crack-font-adjust
// @version      1.0.2
// @description  crack.wrtn.ai 채팅 글자 크기와 코드블록, 인용문 표시를 작게 조정
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/iPhon_Crack_Font_Adjust.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/iPhon_Crack_Font_Adjust.user.js
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement("style");
  style.textContent = `
    /* 일반 채팅 */
    main p,
    main p *,
    main ul,
    main ul *,
    main ol,
    main ol *,
    main li,
    main li *,
    main div[class*="message"],
    main div[class*="message"] *,
    main div[class*="chat"],
    main div[class*="chat"] *,
    main div[class*="content"],
    main div[class*="content"] *,
    main strong,
    main b,
    main em,
    main i {
      font-size: 14px !important;
      line-height: 1.55 !important;
    }

    /* 리스트 간격/들여쓰기 축소 */
    main ul,
    main ol {
      padding-left: 1.2em !important;
      margin-top: 0.04em !important;
      margin-bottom: 0.04em !important;
    }

    main li {
      margin: 0 !important;
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
      font-size: 13px !important;
      line-height: 1.35 !important;
    }

    /* 인용문 박스 여백/높이 축소 */
    main blockquote {
      position: relative !important;
      margin: 0.12em 0 !important;
      padding: 0.08em 0 0.08em 0.65em !important;
      min-height: 0 !important;
      height: auto !important;
      align-self: flex-start !important;
      border-left: 0 !important;
    }

    /* 인용문 안 문단 여백 제거 */
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

    /* 코드블록 강제 축소 */
    main pre,
    main pre *,
    main code,
    main code *,
    main [class*="code"],
    main [class*="code"] *,
    main [class*="Code"],
    main [class*="Code"] *,
    main [class*="highlight"],
    main [class*="highlight"] *,
    main [class*="syntax"],
    main [class*="syntax"] *,
    main [class*="markdown"] pre,
    main [class*="markdown"] pre *,
    main [class*="markdown"] code,
    main [class*="markdown"] code * {
      font-size: 12px !important;
      line-height: 1.4 !important;
    }

    /* 코드블록 박스 자체 */
    main pre,
    main [class*="code"],
    main [class*="Code"] {
      overflow-x: auto !important;
      white-space: pre-wrap !important;
    }

    /* 입력창 */
    textarea,
    textarea *,
    input,
    input *,
    [contenteditable="true"],
    [contenteditable="true"] * {
      font-size: 14px !important;
      line-height: 1.45 !important;
    }
  `;

  document.head.appendChild(style);
})();
