// ==UserScript==
// @name         크랙 로고 숨김
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider
// @version      1.0.1
// @description  crack.wrtn.ai 상단 크랙 홈 로고 링크 숨김.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider.user.js
// ==/UserScript==

(function () {
  'use strict';

  const LOGO_SELECTOR = 'a[href="/"], a[href="https://crack.wrtn.ai/"]';

  function injectEarlyStyle() {
    if (document.getElementById('crack-logo-hider-style')) return;

    const style = document.createElement('style');
    style.id = 'crack-logo-hider-style';
    style.textContent = `
      ${LOGO_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function hideCrackLogo() {
    document.querySelectorAll(LOGO_SELECTOR).forEach(a => {
      const r = a.getBoundingClientRect();
      const text = a.textContent?.trim() || "";

      // 화면 맨 위쪽의 '크랙' 홈로고 링크만 숨김
      if (
        r.top >= 0 &&
        r.top < 80 &&
        r.height < 80 &&
        r.width < 160 &&
        (text.includes("크랙") || a.href === "https://crack.wrtn.ai/")
      ) {
        a.style.setProperty("display", "none", "important");
        a.style.setProperty("visibility", "hidden", "important");
        a.style.setProperty("pointer-events", "none", "important");
      }
    });
  }

  injectEarlyStyle();
  hideCrackLogo();
  setInterval(hideCrackLogo, 500);
})();
