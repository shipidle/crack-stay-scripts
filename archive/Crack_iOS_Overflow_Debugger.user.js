// ==UserScript==
// @name         Crack iOS Overflow Debugger
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-ios-overflow-debugger
// @version      1.0.1
// @description  Find elements causing horizontal overflow on Crack using an iPhone.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/archive/Crack_iOS_Overflow_Debugger.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/archive/Crack_iOS_Overflow_Debugger.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'crack-overflow-debugger-style';
  const PANEL_ID = 'crack-overflow-debugger-panel';
  const MARK_ATTR = 'data-crack-overflow-debug';
  let offenders = [];
  let index = 0;

  function selectorFor(el) {
    if (!el || el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.localName;
      const classes = [...node.classList]
        .filter((name) => !name.startsWith('css-') && !name.startsWith('__') && name.length < 60)
        .slice(0, 2);
      if (classes.length) part += `.${classes.map(CSS.escape).join('.')}`;

      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.localName === node.localName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }

      parts.unshift(part);
      if (parts.length >= 5) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${MARK_ATTR}="true"] {
        outline: 3px solid #ff2d55 !important;
        outline-offset: -3px !important;
        background-image: linear-gradient(rgba(255, 45, 85, .10), rgba(255, 45, 85, .10)) !important;
      }
      #${PANEL_ID} {
        position: fixed !important;
        z-index: 2147483647 !important;
        left: max(8px, env(safe-area-inset-left)) !important;
        right: max(8px, env(safe-area-inset-right)) !important;
        bottom: max(8px, env(safe-area-inset-bottom)) !important;
        padding: 10px !important;
        border-radius: 12px !important;
        background: rgba(20, 20, 22, .95) !important;
        color: white !important;
        font: 12px/1.35 -apple-system, BlinkMacSystemFont, sans-serif !important;
        box-shadow: 0 4px 24px rgba(0,0,0,.4) !important;
      }
      #${PANEL_ID} button {
        min-height: 34px !important;
        margin: 6px 4px 0 0 !important;
        padding: 0 10px !important;
        border: 0 !important;
        border-radius: 8px !important;
        background: #3a3a3c !important;
        color: white !important;
        font: 600 12px -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
      #${PANEL_ID} .danger { background: #c9344a !important; }
      #${PANEL_ID} .selector {
        margin-top: 5px !important;
        padding: 7px !important;
        border-radius: 7px !important;
        background: #000 !important;
        word-break: break-all !important;
        user-select: text !important;
        -webkit-user-select: text !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function visible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findOffenders() {
    const viewportWidth = document.documentElement.clientWidth;
    const found = [];

    document.querySelectorAll('body *').forEach((el) => {
      if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`) || !visible(el)) return;

      const rect = el.getBoundingClientRect();
      const exceedsViewport = rect.right > viewportWidth + 1 || rect.left < -1;
      const scrollsInternally = el.scrollWidth > el.clientWidth + 1;

      if (!exceedsViewport && !scrollsInternally) return;

      const style = getComputedStyle(el);
      found.push({
        el,
        selector: selectorFor(el),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: style.overflowX,
        exceedsViewport,
        scrollsInternally
      });
    });

    found.sort((a, b) => {
      const aExtra = Math.max(0, a.right - viewportWidth, -a.left, a.scrollWidth - a.clientWidth);
      const bExtra = Math.max(0, b.right - viewportWidth, -b.left, b.scrollWidth - b.clientWidth);
      return bExtra - aExtra;
    });

    return found.slice(0, 80);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    }
  }

  function clearMarks() {
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.removeAttribute(MARK_ATTR));
  }

  function showCurrent() {
    clearMarks();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    if (!offenders.length) {
      panel.querySelector('.status').textContent = '가로 넘침 후보를 못 찾음';
      panel.querySelector('.selector').textContent = '채팅 화면에서 좌우로 흔들어 본 뒤 다시 검사 누르기';
      return;
    }

    index = Math.max(0, Math.min(index, offenders.length - 1));
    const item = offenders[index];
    item.el.setAttribute(MARK_ATTR, 'true');
    item.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });

    panel.querySelector('.status').textContent = `${index + 1}/${offenders.length} · viewport ${document.documentElement.clientWidth}px`;
    panel.querySelector('.selector').textContent = item.selector;
    panel.querySelector('.details').textContent =
      `rect ${item.left}→${item.right}px / width ${item.width}px · client ${item.clientWidth}px · scroll ${item.scrollWidth}px · overflow-x ${item.overflowX}`;
  }

  function scan() {
    offenders = findOffenders();
    index = 0;
    showCurrent();
  }

  function makePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div><strong>가로 스크롤 원인 검사</strong></div>
      <div class="status"></div>
      <div class="selector"></div>
      <div class="details"></div>
      <button type="button" data-action="scan">다시 검사</button>
      <button type="button" data-action="prev">이전</button>
      <button type="button" data-action="next">다음</button>
      <button type="button" data-action="copy">정보 복사</button>
      <button type="button" data-action="close" class="danger">닫기</button>
    `;

    panel.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();

      if (action === 'scan') scan();
      if (action === 'prev') {
        index = (index - 1 + offenders.length) % Math.max(1, offenders.length);
        showCurrent();
      }
      if (action === 'next') {
        index = (index + 1) % Math.max(1, offenders.length);
        showCurrent();
      }
      if (action === 'copy' && offenders.length) {
        const item = offenders[index];
        const text = [
          `selector: ${item.selector}`,
          `viewport: ${document.documentElement.clientWidth}`,
          `rect: left ${item.left}, right ${item.right}, width ${item.width}`,
          `clientWidth: ${item.clientWidth}`,
          `scrollWidth: ${item.scrollWidth}`,
          `overflow-x: ${item.overflowX}`,
          `outerHTML: ${item.el.outerHTML.slice(0, 1200)}`
        ].join('\n');
        const copied = await copyText(text);
        panel.querySelector('.status').textContent = copied ? '복사됨. 이 채팅에 붙여넣으면 됨.' : '복사 실패. 선택자 부분 길게 눌러 복사.';
      }
      if (action === 'close') {
        clearMarks();
        panel.remove();
      }
    }, true);

    document.body.appendChild(panel);
  }

  function start() {
    injectStyle();
    makePanel();
    setTimeout(scan, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
