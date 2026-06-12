// ==UserScript==
// @name         크랙 로고 숨김
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider
// @version      1.0.2
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

  const LOGO_SELECTOR = [
    'a[href="/"]',
    'a[href="https://crack.wrtn.ai/"]',
    'a[href="https://crack.wrtn.ai"]',
    'a[aria-label*="크랙"]',
    'a[title*="크랙"]',
    'a[class*="logo"]',
    'a[class*="Logo"]',
    'header [class*="logo"]',
    'header [class*="Logo"]',
    'nav [class*="logo"]',
    'nav [class*="Logo"]',
    'header a:has(img[alt*="크랙"])',
    'nav a:has(img[alt*="크랙"])'
  ].join(',');

  function injectEarlyStyle() {
    if (document.getElementById('crack-logo-hider-style')) return;

    const style = document.createElement('style');
    style.id = 'crack-logo-hider-style';
    style.textContent = `
      ${LOGO_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function hideElement(el) {
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("opacity", "0", "important");
  }

  function hideCrackLogo() {
    document.querySelectorAll(LOGO_SELECTOR).forEach(a => {
      const r = a.getBoundingClientRect();
      const text = a.textContent?.trim() || "";
      const label = `${a.getAttribute('aria-label') || ''} ${a.getAttribute('title') || ''}`;

      if (
        r.top >= 0 &&
        r.top < 96 &&
        r.height < 96 &&
        r.width < 220 &&
        (text.includes("크랙") || label.includes("크랙") || /^https:\/\/crack\.wrtn\.ai\/?$/.test(a.href))
      ) {
        hideElement(a);
      }
    });

    document.querySelectorAll('header img[alt*="크랙"], nav img[alt*="크랙"], header svg, nav svg').forEach(el => {
      const box = el.getBoundingClientRect();
      if (box.top >= 0 && box.top < 96 && box.left < 240 && box.width < 220 && box.height < 96) {
        hideElement(el.closest('a,button,div') || el);
      }
    });
  }

  injectEarlyStyle();
  hideCrackLogo();

  const observer = new MutationObserver(hideCrackLogo);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  let fastTicks = 0;
  const fastTimer = setInterval(() => {
    hideCrackLogo();
    fastTicks++;
    if (fastTicks >= 80) clearInterval(fastTimer);
  }, 50);

  setInterval(hideCrackLogo, 250);
})();
