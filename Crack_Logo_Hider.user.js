// ==UserScript==
// @name         크랙 로고 숨김
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider
// @version      1.0.0
// @description  crack.wrtn.ai 상단 크랙 홈 로고 링크 숨김.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider.user.js
// ==/UserScript==

(function () {
  'use strict';

  function hideCrackLogo() {
    document.querySelectorAll('a[href="/"], a[href="https://crack.wrtn.ai/"]').forEach(a => {
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

  hideCrackLogo();
  setInterval(hideCrackLogo, 500);
})();
