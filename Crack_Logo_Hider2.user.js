// ==UserScript==
// @name         Crack Logo Hider2
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider2
// @version      1.2.0
// @description  Hide the Crack header logo and prevent horizontal page drift on crack.wrtn.ai.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider2.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Logo_Hider2.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'crack-logo-hider2-style';
  const LOGO_PATH_PREFIX = 'M20.4586 15.2656H0V19.3415';
  const LOGO_SELECTOR = [
    'svg[width="42"][height="20"][viewBox="0 0 42 20"]',
    `svg:has(path[d^="${LOGO_PATH_PREFIX}"])`,
    `header a:has(svg[width="42"][height="20"][viewBox="0 0 42 20"])`,
    `nav a:has(svg[width="42"][height="20"][viewBox="0 0 42 20"])`,
    `header a:has(svg path[d^="${LOGO_PATH_PREFIX}"])`,
    `nav a:has(svg path[d^="${LOGO_PATH_PREFIX}"])`
  ].join(',');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html,
      body {
        width: 100% !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
        overscroll-behavior-x: none !important;
      }

      body {
        position: relative !important;
      }

      main.relative.h-full,
      main.relative.h-full > div.flex.flex-col,
      main.relative.h-full > div.flex.flex-col > div.flex.flex-row:nth-of-type(2) {
        min-width: 0 !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
        overscroll-behavior-x: none !important;
      }

      div.bg-background.border-l > div.flex.flex-col.w-\\[260px\\].h-full.overflow-auto.pt-12 {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior-x: none !important;
        touch-action: pan-y !important;
      }

      @media (max-width: 768px) {
        main.relative.h-full > div.flex.flex-col > div.flex.flex-row:nth-of-type(2) > div.bg-background.border-l:nth-of-type(3) {
          display: none !important;
          width: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          overflow: hidden !important;
          border: 0 !important;
        }
      }

      ${LOGO_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isLogoSvg(svg) {
    if (!svg || svg.tagName?.toLowerCase() !== 'svg') return false;
    if (
      svg.getAttribute('width') === '42' &&
      svg.getAttribute('height') === '20' &&
      svg.getAttribute('viewBox') === '0 0 42 20'
    ) {
      return true;
    }

    return Boolean(svg.querySelector(`path[d^="${LOGO_PATH_PREFIX}"]`));
  }

  function hide(el) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function hideLogo() {
    document.querySelectorAll('header svg, nav svg, svg[viewBox="0 0 42 20"]').forEach((svg) => {
      if (!isLogoSvg(svg)) return;
      hide(svg);

      const owner = svg.closest('a, button, [role="link"], [role="button"]');
      if (owner) hide(owner);
    });
  }

  injectStyle();
  hideLogo();

  new MutationObserver(() => {
    injectStyle();
    hideLogo();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', hideLogo, { once: true });
  window.addEventListener('load', hideLogo, { once: true });
})();