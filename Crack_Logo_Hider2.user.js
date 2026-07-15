// ==UserScript==
// @name         Crack Logo Hider2
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider2
// @version      1.3.0
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

        .group\\/header,
        .group\\/header > div.absolute.left-0.w-full {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow: hidden !important;
        }

        .group\\/header > div.absolute.left-0.w-full {
          padding-left: 12px !important;
          padding-right: 12px !important;
          gap: 8px !important;
        }

        .group\\/header > div.absolute.left-0.w-full > button:first-child {
          min-width: 0 !important;
          max-width: calc(100% - 164px) !important;
          flex: 1 1 auto !important;
          overflow: hidden !important;
        }

        .group\\/header > div.absolute.left-0.w-full > button:first-child > span {
          min-width: 0 !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .group\\/header > div.absolute.left-0.w-full > div.flex.items-center {
          flex: 0 0 auto !important;
          min-width: 0 !important;
          max-width: 156px !important;
          gap: 4px !important;
          overflow: hidden !important;
        }

        .crack-ext-header-ai-btn,
        #clsb-fab,
        #summary-editor-btn,
        #lore-inj-entry-button,
        .lore-inj-entry-button {
          box-sizing: border-box !important;
          width: 32px !important;
          min-width: 32px !important;
          max-width: 32px !important;
          height: 32px !important;
          flex: 0 0 32px !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          white-space: nowrap !important;
          font-size: 0 !important;
          line-height: 32px !important;
          text-align: center !important;
          text-indent: 0 !important;
        }

        .crack-ext-header-ai-btn::before {
          content: '✨';
          font-size: 14px !important;
        }

        #clsb-fab::before {
          content: '☁️';
          font-size: 14px !important;
        }

        #summary-editor-btn::before {
          content: '📝';
          font-size: 14px !important;
        }

        #lore-inj-entry-button::before,
        .lore-inj-entry-button::before {
          content: '📚';
          font-size: 14px !important;
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