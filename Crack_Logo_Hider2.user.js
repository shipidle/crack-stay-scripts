// ==UserScript==
// @name         🙈 Crack Logo Hider2
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider2
// @version      1.5.2
// @description  🧪 BETA · Hide the Crack header logo and prevent horizontal page drift without hiding drawers or popups.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Logo_Hider2.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Logo_Hider2.user.js
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
        max-width: 100% !important;
        overflow-x: hidden !important;
        overscroll-behavior-x: none !important;
      }

      @supports (overflow: clip) {
        html,
        body {
          overflow-x: clip !important;
        }
      }

      main.relative.h-full,
      main.relative.h-full > div.flex.flex-col,
      main.relative.h-full > div.flex.flex-col > div.flex.flex-row:nth-of-type(2) {
        min-width: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      div.bg-background.border-l > div.flex.flex-col.w-\\[260px\\].h-full.overflow-auto.pt-12 {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior-x: none !important;
        touch-action: pan-y !important;
      }

      .stick-to-bottom,
      .stick-to-bottom > div,
      .stick-to-bottom > div > div,
      .stick-to-bottom > div > div > div.flex.flex-col,
      .stick-to-bottom div.flex.flex-col.w-full.max-w-\\[768px\\],
      .stick-to-bottom [data-message-group-id],
      .stick-to-bottom .wrtn-markdown {
        box-sizing: border-box !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }

      .stick-to-bottom .wrtn-markdown,
      .stick-to-bottom .wrtn-markdown * {
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      .stick-to-bottom .wrtn-markdown img,
      .stick-to-bottom .wrtn-markdown video,
      .stick-to-bottom .wrtn-markdown iframe,
      .stick-to-bottom .wrtn-markdown canvas,
      .stick-to-bottom .wrtn-markdown svg,
      .stick-to-bottom .wrtn-markdown table,
      .stick-to-bottom .wrtn-markdown pre,
      .stick-to-bottom .wrtn-markdown code,
      .stick-to-bottom .wrtn-markdown span,
      .stick-to-bottom .wrtn-markdown p {
        box-sizing: border-box !important;
        max-width: 100% !important;
      }

      .stick-to-bottom .wrtn-markdown img,
      .stick-to-bottom .wrtn-markdown video,
      .stick-to-bottom .wrtn-markdown iframe,
      .stick-to-bottom .wrtn-markdown canvas,
      .stick-to-bottom .wrtn-markdown svg {
        height: auto !important;
      }

      .stick-to-bottom .wrtn-markdown pre,
      .stick-to-bottom .wrtn-markdown code,
      .stick-to-bottom .wrtn-markdown table {
        white-space: pre-wrap !important;
        overflow-x: hidden !important;
      }

      @media (max-width: 768px) {
        button[aria-haspopup="menu"]:has(img[alt*="하이퍼챗"]),
        button[aria-haspopup="menu"]:has(img[src*="model-icon"]) {
          box-sizing: border-box !important;
          width: 36px !important;
          min-width: 36px !important;
          max-width: 36px !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
          gap: 0 !important;
          overflow: hidden !important;
          flex: 0 0 36px !important;
        }

        button[aria-haspopup="menu"]:has(img[alt*="하이퍼챗"]) > span,
        button[aria-haspopup="menu"]:has(img[src*="model-icon"]) > span,
        button[aria-haspopup="menu"]:has(img[alt*="하이퍼챗"]) > svg,
        button[aria-haspopup="menu"]:has(img[src*="model-icon"]) > svg {
          display: none !important;
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
