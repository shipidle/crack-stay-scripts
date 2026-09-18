// ==UserScript==
// @name         🙈 Crack Logo Hider2
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-logo-hider2
// @version      1.6.0
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
  const TARGET_ATTR = 'data-crack-logo-hider-target';
  const LEGACY_LOGO_PATH_PREFIX = 'M20.4586 15.2656H0V19.3415';
  const LOGO_NAME_RE = /(?:^|\\b)(?:crack|크랙)(?:\\b|$)/i;
  let scanQueued = false;

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

      [${TARGET_ATTR}="true"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isRootUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin && url.pathname === '/' && !url.search && !url.hash;
    } catch {
      return false;
    }
  }

  function isInTopBar(el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    return rect.top < 140 && rect.bottom > -1 && rect.width <= 240 && rect.height <= 100;
  }

  function hasLogoSignature(el) {
    const name = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-cy'),
      el.textContent
    ].filter(Boolean).join(' ').trim();

    if (LOGO_NAME_RE.test(name)) return true;

    const media = el.matches('svg, img, picture')
      ? el
      : el.querySelector('svg, img, picture');
    if (!media) return false;

    const mediaName = [
      media.getAttribute?.('aria-label'),
      media.getAttribute?.('alt'),
      media.getAttribute?.('title'),
      media.getAttribute?.('src')
    ].filter(Boolean).join(' ');

    if (LOGO_NAME_RE.test(mediaName)) return true;

    if (media.tagName?.toLowerCase() === 'svg') {
      if (
        media.getAttribute('width') === '42' &&
        media.getAttribute('height') === '20' &&
        media.getAttribute('viewBox') === '0 0 42 20'
      ) return true;

      if (media.querySelector(`path[d^="${LEGACY_LOGO_PATH_PREFIX}"]`)) return true;
    }

    // The root link in the top bar is the site logo even when its SVG path,
    // dimensions, or asset URL changes.
    return el.matches('a[href], [role="link"]') && isRootUrl(el.getAttribute('href'));
  }

  function markHidden(el) {
    if (!el || el.getAttribute(TARGET_ATTR) === 'true') return;
    el.setAttribute(TARGET_ATTR, 'true');
  }

  function hideLogo() {
    const candidates = document.querySelectorAll([
      'header a[href]',
      'nav a[href]',
      '[role="banner"] a[href]',
      'a[href="/"]',
      'a[href="https://crack.wrtn.ai/"]',
      '[aria-label*="Crack" i]',
      '[aria-label*="크랙"]',
      '[title*="Crack" i]',
      '[title*="크랙"]',
      'img[alt*="Crack" i]',
      'img[alt*="크랙"]',
      'img[src*="logo" i]'
    ].join(','));

    candidates.forEach((candidate) => {
      const owner = candidate.closest('a[href], button, [role="link"], [role="button"]') || candidate;
      if (!isInTopBar(owner) || !hasLogoSignature(owner)) return;
      markHidden(owner);
    });
  }

  function queueLogoScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      injectStyle();
      hideLogo();
    });
  }

  injectStyle();
  hideLogo();

  new MutationObserver(queueLogoScan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', queueLogoScan, { once: true });
  window.addEventListener('load', queueLogoScan, { once: true });
})();
