// ==UserScript==
// @name         ↩️ 줄바꿈 최적화
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.5.0
// @description  🧪 BETA · 줄바꿈을 최적화하고 Enter 오전송을 막아 PC는 Ctrl+Enter, iPhone/iPad는 Command+Enter로 전송합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @inject-into  content
// @grant        GM_addStyle
// @grant        GM.addStyle
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Linebreak_Optimizer.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Linebreak_Optimizer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'crack-linebreak-optimizer-style';
  const GUARD_VERSION = '1.5.0';
  const CHAT_INPUT_SELECTOR = 'textarea[placeholder*="메시지"], div.__chat_input_textarea, div[contenteditable="true"].tiptap';
  const KEYBOARD_EVENT_TYPES = ['keydown', 'keypress', 'keyup'];
  const CSS = `
    /* 크랙 강제 쪼개기(break-all) 방지 */
    html body .break-all,
    html body .break-all * {
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      -webkit-hyphens: none !important;
      hyphens: none !important;
    }

    /* 마크다운 텍스트 구역 단어 덩어리 유지 및 최적화 */
    html body .wrtn-markdown,
    html body .wrtn-markdown * {
      max-width: 100% !important;
      text-align: left !important;
      word-break: keep-all !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      white-space: pre-wrap !important;
      -webkit-hyphens: none !important;
      hyphens: none !important;
    }

    /* 인용 바가 포맷용 빈 줄과 문단 기본 여백까지 감싸지 않도록 정리 */
    html body .wrtn-markdown > blockquote {
      white-space: normal !important;
    }

    html body .wrtn-markdown > blockquote > p {
      margin-block: 0 !important;
      white-space: pre-wrap !important;
    }

    html body .wrtn-markdown > blockquote > p + p {
      margin-top: 0.5em !important;
    }
  `;

  function injectManagerStyle() {
    try {
      if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
    } catch (_) {
      // DOM fallback below remains active.
    }

    try {
      if (typeof GM !== 'undefined' && typeof GM.addStyle === 'function') {
        const result = GM.addStyle(CSS);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } catch (_) {
      // DOM fallback below remains active.
    }
  }

  function injectNativeStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const target = document.head || document.documentElement;
    if (!target) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    target.appendChild(style);
  }

  function start() {
    injectManagerStyle();
    injectNativeStyle();
  }

  function getChatInput(target) {
    const input = target?.closest?.(CHAT_INPUT_SELECTOR);
    if (!input || input.dataset.loreRefinerMessageId || input.closest('.bg-surface_tertiary')) return null;

    const wrapperText = input.closest('div.flex.flex-col')?.innerText || '';
    if (wrapperText.includes('수정 완료') || wrapperText.includes('취소')) return null;
    return input;
  }

  function isAppleTouchDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isVisibleEnabledButton(button) {
    if (!(button instanceof HTMLElement) || button.matches(':disabled, [aria-disabled="true"]')) return false;
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function findSendButton(input) {
    const form = input.closest('form');
    const roots = [form];
    let ancestor = input.parentElement;

    for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
      roots.push(ancestor);
    }

    for (const root of roots.filter(Boolean)) {
      const buttons = Array.from(root.querySelectorAll('button, [role="button"]')).filter(isVisibleEnabledButton);
      const labeled = buttons.find((button) => {
        const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
          .filter(Boolean)
          .join(' ');
        return /전송|보내기|send|submit/i.test(label);
      });
      if (labeled) return labeled;

      const submit = buttons.find(button => button.matches('button[type="submit"]'));
      if (submit) return submit;
    }

    const inputRect = input.getBoundingClientRect();
    const nearbyButtons = Array.from((roots[roots.length - 1] || document).querySelectorAll('button'))
      .filter(button => isVisibleEnabledButton(button) && button.querySelector('svg'))
      .map(button => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => (
        rect.left >= inputRect.left + inputRect.width * 0.55
        && rect.top < inputRect.bottom + 12
        && rect.bottom > inputRect.top - 12
      ))
      .sort((a, b) => Math.abs(a.rect.right - inputRect.right) - Math.abs(b.rect.right - inputRect.right));

    return nearbyButtons[0]?.button || null;
  }

  function sendChatMessage(input) {
    const button = findSendButton(input);
    if (!button) {
      console.warn('[줄바꿈 최적화] 전송 버튼을 찾지 못해 단축키 전송을 취소했습니다.');
      return;
    }
    button.click();
  }

  function pageKeyboardGuard(config) {
    if (window.__crackLinebreakPageGuardVersion === config.version) return;
    window.__crackLinebreakPageGuardVersion = config.version;
    document.documentElement.dataset.crackEnterGuardPage = config.version;

    const getInput = target => target?.closest?.(config.selector) || null;
    const isAppleTouch = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isEnter = event => event.key === 'Enter'
      || event.code === 'Enter'
      || event.code === 'NumpadEnter'
      || event.keyCode === 13
      || event.which === 13;
    const findSend = (input) => {
      const roots = [input.closest('form')];
      let ancestor = input.parentElement;
      for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) roots.push(ancestor);

      for (const root of roots.filter(Boolean)) {
        const buttons = Array.from(root.querySelectorAll('button, [role="button"]'));
        const labeled = buttons.find((button) => {
          if (button.matches(':disabled, [aria-disabled="true"]')) return false;
          const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
            .filter(Boolean)
            .join(' ');
          return /전송|보내기|send|submit/i.test(label);
        });
        if (labeled) return labeled;
        const submit = buttons.find(button => button.matches('button[type="submit"]:not(:disabled)'));
        if (submit) return submit;
      }
      return null;
    };

    const handler = (event) => {
      if (!isEnter(event)) return;
      const input = getInput(event.target);
      if (!input || input.dataset.loreRefinerMessageId || input.closest('.bg-surface_tertiary')) return;

      const appleTouch = isAppleTouch();
      const shouldSend = appleTouch
        ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

      if (shouldSend && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === 'keydown' && !event.repeat) findSend(input)?.click();
        return;
      }

      if (appleTouch || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      event.stopImmediatePropagation();
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();

      if (event.type === 'keydown' && !event.repeat) {
        const accepted = input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: event.code === 'NumpadEnter' ? 'NumpadEnter' : 'Enter',
          keyCode: 13,
          which: 13,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
          composed: true,
        }));
        if (accepted) document.execCommand('insertLineBreak', false, null);
      }
    };

    ['keydown', 'keypress', 'keyup'].forEach(type => window.addEventListener(type, handler, true));
  }

  function injectPageKeyboardGuard() {
    const target = document.documentElement || document.head;
    if (!target) {
      document.addEventListener('readystatechange', injectPageKeyboardGuard, { once: true });
      return;
    }

    const script = document.createElement('script');
    const nonceSource = document.querySelector('script[nonce]');
    if (nonceSource?.nonce) script.nonce = nonceSource.nonce;
    script.textContent = `;(${pageKeyboardGuard.toString()})(${JSON.stringify({
      version: GUARD_VERSION,
      selector: CHAT_INPUT_SELECTOR,
    })});`;
    target.appendChild(script);
    script.remove();
    document.documentElement.dataset.crackEnterGuardVersion = GUARD_VERSION;
  }

  function isEnterKeyEvent(event) {
    return event.key === 'Enter'
      || event.code === 'Enter'
      || event.code === 'NumpadEnter'
      || event.keyCode === 13
      || event.which === 13;
  }

  function handleChatInputKeyEvent(event) {
    if (document.documentElement.dataset.crackEnterGuardPage === GUARD_VERSION) return;
    if (!isEnterKeyEvent(event)) return;

    const input = getChatInput(event.target);
    if (!input) return;

    const appleTouch = isAppleTouchDevice();
    const shouldSend = appleTouch
      ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

    if (shouldSend && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'keydown' && !event.repeat) sendChatMessage(input);
      return;
    }

    if (!appleTouch) {
      event.stopImmediatePropagation();
    }
  }

  function bindKeyboardGuard() {
    KEYBOARD_EVENT_TYPES.forEach(type => {
      window.addEventListener(type, handleChatInputKeyEvent, true);
    });
  }

  // content 격리 영역과 크랙 본체 영역은 키 이벤트 처리가 분리될 수 있어 본체 영역에도 가드를 설치함.
  injectPageKeyboardGuard();
  bindKeyboardGuard();

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
