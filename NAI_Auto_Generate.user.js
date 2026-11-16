// ==UserScript==
// @name         🖼️ NAI 무한 이미지 생성
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.1.0
// @description  🧪 BETA · NovelAI의 현재 프롬프트와 설정으로 반복 생성합니다. 짧게 누르면 ON/OFF, 길게 누르면 생성 간격을 설정합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://novelai.net/image*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @sandbox      DOM
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/NAI_Auto_Generate.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/NAI_Auto_Generate.user.js
// ==/UserScript==

(function naiAutoGenerate() {
  'use strict';

  const STORAGE_KEY = 'shipidle.naiAutoGenerate.delaySeconds.v1';
  const DEFAULT_DELAY = 3;
  const LONG_PRESS_MS = 650;
  const POLL_MS = 180;
  const ACK_TIMEOUT_MS = 20000;
  const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
  const HOST_ID = 'shipidle-nai-auto-generate';
  const BUTTON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2.5"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5"></path></svg>';
  const GEAR_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.2 1.6V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15 1.7 1.7 0 0 0 2.6 13.8H2v-4h.6A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2 1.7 1.7 0 0 0 9.8 2.6V2h4v.6A1.7 1.7 0 0 0 15 4.2a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 1.6 1.2h1v4h-1a1.7 1.7 0 0 0-1.6 1.2Z"></path></svg>';

  function readDelay() {
    try {
      const stored = typeof GM_getValue === 'function'
        ? GM_getValue(STORAGE_KEY, DEFAULT_DELAY)
        : window.localStorage.getItem(STORAGE_KEY);
      const number = Number(stored);
      return Number.isFinite(number) && number >= 0 && number <= 600 ? number : DEFAULT_DELAY;
    } catch (_) {
      return DEFAULT_DELAY;
    }
  }

  function saveDelay(value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, value);
      else window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (_) {
      // A storage failure does not prevent use during the current session.
    }
  }

  const state = {
    active: false,
    phase: 'idle',
    delaySeconds: readDelay(),
    requestAt: 0,
    nextAt: 0,
    completed: 0,
    currentButton: null
  };

  const style = document.createElement('style');
  style.textContent = [
    '#' + HOST_ID + '{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;vertical-align:middle;position:relative;z-index:20;line-height:1}',
    '#' + HOST_ID + '.naig-floating{position:fixed;right:18px;bottom:92px;z-index:2147483000}',
    '#' + HOST_ID + ' button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;border:1px solid rgba(255,255,255,.20);color:#fff;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.18);font-family:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}',
    '#' + HOST_ID + ' .naig-toggle{width:30px;height:30px;min-width:30px;min-height:30px;padding:0;border-radius:7px;background:#626873;transition:background .15s ease}',
    '#' + HOST_ID + ' .naig-toggle.naig-active{background:#239452}',
    '#' + HOST_ID + ' .naig-toggle:focus-visible,#' + HOST_ID + ' .naig-gear:focus-visible{outline:2px solid #a3d6ff;outline-offset:2px}',
    '#' + HOST_ID + ' .naig-gear{width:27px;height:27px;padding:0;border-radius:7px;background:#434953}',
    '#naig-settings{position:fixed;z-index:2147483646;width:224px;box-sizing:border-box;padding:13px;border:1px solid #424956;border-radius:11px;background:#252a33;color:#f0f2f5;box-shadow:0 7px 28px rgba(0,0,0,.35);font:13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,sans-serif}',
    '#naig-settings label{display:block;font-weight:650;margin-bottom:8px}',
    '#naig-settings input{width:100%;height:34px;box-sizing:border-box;padding:5px 9px;border:1px solid #647080;border-radius:6px;background:#171b22;color:white;font:inherit}',
    '#naig-settings small{display:block;margin-top:8px;color:#b9c0cb;font-size:11px;line-height:1.45}',
    '#naig-toast{position:fixed;z-index:2147483647;left:50%;bottom:26px;transform:translateX(-50%);max-width:min(90vw,360px);padding:8px 12px;border-radius:8px;background:#282e37;color:white;box-shadow:0 4px 16px #0006;font:12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;text-align:center}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  const host = document.createElement('span');
  host.id = HOST_ID;
  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'naig-toggle';
  toggleButton.setAttribute('aria-label', 'NAI 자동 이미지 생성 켜기');
  toggleButton.setAttribute('aria-pressed', 'false');
  toggleButton.innerHTML = BUTTON_ICON;

  const gearButton = document.createElement('button');
  gearButton.type = 'button';
  gearButton.className = 'naig-gear';
  gearButton.setAttribute('aria-label', 'NAI 자동 생성 간격 설정');
  gearButton.title = '이미지 생성 간격 설정';
  gearButton.innerHTML = GEAR_ICON;
  gearButton.hidden = true;
  gearButton.style.display = 'none';
  host.append(toggleButton, gearButton);

  const settings = document.createElement('div');
  settings.id = 'naig-settings';
  settings.hidden = true;
  settings.style.display = 'none';
  settings.innerHTML = '<label for="naig-delay">생성 간격 (초)</label><input id="naig-delay" type="number" min="0" max="600" step="0.5" inputmode="decimal"><small>이미지 생성이 완료된 뒤 다음 생성까지 기다리는 시간입니다. 0초부터 600초까지 설정할 수 있습니다.</small>';
  const delayInput = settings.querySelector('#naig-delay');
  delayInput.value = String(state.delaySeconds);

  let longPressTimer = null;
  let longPressed = false;
  let movementCancelled = false;
  let pointerOrigin = null;
  let toastTimer = null;

  function notify(message) {
    let toast = document.getElementById('naig-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'naig-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.remove(); }, 3700);
  }

  function isVisible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const css = window.getComputedStyle(element);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }

  function nativeGenerateButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(function (button) {
      if (!isVisible(button) || host.contains(button)) return false;
      return /Generate\s+\d+\s+Images?\b/i.test(button.textContent || '');
    }) || buttons.find(function (button) {
      if (!isVisible(button) || host.contains(button)) return false;
      const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
        .filter(Boolean).join(' ').trim();
      return /^Generate(?:\s+Images?)?(?:\s+\d+\s+Images?)?(?:\s+\d+\s+Anlas)?$/i.test(label);
    }) || null;
  }

  function currentGenerateButton() {
    return nativeGenerateButton() || (state.currentButton && state.currentButton.isConnected ? state.currentButton : null);
  }

  function isBusy(button) {
    if (!button) return false;
    return button.disabled
      || button.getAttribute('aria-disabled') === 'true'
      || button.getAttribute('aria-busy') === 'true'
      || /\b(?:Generating|Processing|Queueing|Cancelling|Cancel Generation|Stop Generation)\b/i.test(button.textContent || '');
  }

  function render() {
    toggleButton.classList.toggle('naig-active', state.active);
    toggleButton.setAttribute('aria-pressed', String(state.active));
    toggleButton.setAttribute('aria-label', state.active ? 'NAI 자동 이미지 생성 끄기' : 'NAI 자동 이미지 생성 켜기');
    toggleButton.title = state.active
      ? '자동 생성 ON · 완료 ' + state.completed + '회 · 짧게 눌러 중지 / 길게 눌러 설정'
      : '자동 생성 OFF · 짧게 눌러 시작 / 길게 눌러 설정';
  }

  function stop(message) {
    state.active = false;
    state.phase = 'idle';
    state.currentButton = null;
    render();
    if (message) notify(message);
  }

  function submitGeneration() {
    if (!state.active) return;
    const button = nativeGenerateButton();
    if (!button) {
      stop('NAI 생성 버튼을 찾지 못해 자동 생성을 중지했습니다.');
      return;
    }
    if (isBusy(button)) {
      state.phase = 'waiting-existing';
      state.currentButton = button;
      return;
    }
    state.currentButton = button;
    state.requestAt = Date.now();
    state.phase = 'awaiting-busy';
    try {
      button.click();
    } catch (_) {
      stop('이미지 생성 버튼 클릭에 실패했습니다.');
      return;
    }
    if (isBusy(button)) state.phase = 'generating';
  }

  function start() {
    const button = nativeGenerateButton();
    if (!button) {
      notify('NAI 이미지 생성 페이지에서 생성 버튼을 찾지 못했습니다.');
      return;
    }
    state.active = true;
    state.completed = 0;
    state.currentButton = button;
    state.phase = isBusy(button) ? 'waiting-existing' : 'idle';
    render();
    if (state.phase === 'idle') submitGeneration();
    else notify('진행 중인 생성을 마친 뒤 자동 생성을 시작합니다.');
  }

  function tick() {
    if (!state.active) return;
    if (!/^\/image(?:\/|$)/.test(window.location.pathname)) {
      stop('이미지 생성 페이지를 벗어나 자동 생성을 중지했습니다.');
      return;
    }

    const button = currentGenerateButton();
    const now = Date.now();
    if (state.phase === 'waiting-existing') {
      if (button && !isBusy(button) && nativeGenerateButton()) submitGeneration();
      return;
    }
    if (state.phase === 'awaiting-busy') {
      if (button && isBusy(button)) {
        state.phase = 'generating';
      } else if (now - state.requestAt > ACK_TIMEOUT_MS) {
        stop('생성 시작 상태를 확인하지 못해 중지했습니다.');
      }
      return;
    }
    if (state.phase === 'generating') {
      if (button && !isBusy(button) && nativeGenerateButton()) {
        state.completed += 1;
        state.phase = 'cooldown';
        state.nextAt = now + state.delaySeconds * 1000;
        state.currentButton = null;
        render();
      } else if (now - state.requestAt > GENERATION_TIMEOUT_MS) {
        stop('생성 완료를 10분 동안 확인하지 못해 중지했습니다.');
      }
      return;
    }
    if (state.phase === 'cooldown' && now >= state.nextAt) {
      submitGeneration();
    }
  }

  function toggle() {
    if (state.active) stop('자동 생성을 중지했습니다. 진행 중인 1회는 그대로 완료됩니다.');
    else start();
  }

  function closeSettings() {
    settings.hidden = true;
    settings.style.display = 'none';
    gearButton.hidden = true;
    gearButton.style.display = 'none';
  }

  function showGear() {
    gearButton.hidden = false;
    gearButton.style.display = 'inline-flex';
  }

  function openSettings() {
    showGear();
    delayInput.value = String(state.delaySeconds);
    settings.hidden = false;
    settings.style.display = 'block';
    const rect = gearButton.getBoundingClientRect();
    const width = 224;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
    settings.style.left = Math.max(8, left) + 'px';
    settings.style.top = Math.max(8, Math.min(window.innerHeight - settings.offsetHeight - 8, rect.bottom + 9)) + 'px';
    delayInput.focus();
    delayInput.select();
  }

  function updateDelay() {
    const number = Number(delayInput.value);
    if (!Number.isFinite(number) || number < 0 || number > 600 || delayInput.value.trim() === '') {
      delayInput.value = String(state.delaySeconds);
      notify('생성 간격은 0~600초로 입력해주세요.');
      return;
    }
    state.delaySeconds = Math.round(number * 10) / 10;
    delayInput.value = String(state.delaySeconds);
    saveDelay(state.delaySeconds);
    if (state.active && state.phase === 'cooldown') {
      state.nextAt = Date.now() + state.delaySeconds * 1000;
    }
    notify('생성 간격: ' + state.delaySeconds + '초');
  }

  delayInput.addEventListener('change', updateDelay);
  delayInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      updateDelay();
      closeSettings();
      toggleButton.focus();
    } else if (event.key === 'Escape') {
      closeSettings();
      toggleButton.focus();
    }
  });

  gearButton.addEventListener('click', function (event) {
    event.stopPropagation();
    if (settings.hidden) openSettings();
    else closeSettings();
  });

  function clearLongPress() {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function beginPress(x, y) {
    longPressed = false;
    movementCancelled = false;
    pointerOrigin = { x: x, y: y };
    clearLongPress();
    longPressTimer = window.setTimeout(function () {
      longPressed = true;
      showGear();
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }

  function movePress(x, y) {
    if (!pointerOrigin) return;
    if (Math.abs(x - pointerOrigin.x) > 12 || Math.abs(y - pointerOrigin.y) > 12) {
      movementCancelled = true;
      clearLongPress();
    }
  }

  function endPress() {
    clearLongPress();
    const wasLong = longPressed;
    const wasCancelled = movementCancelled;
    pointerOrigin = null;
    longPressed = false;
    movementCancelled = false;
    if (!wasLong && !wasCancelled) toggle();
  }

  if (window.PointerEvent) {
    toggleButton.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !event.isPrimary) return;
      beginPress(event.clientX, event.clientY);
    });
    toggleButton.addEventListener('pointermove', function (event) {
      movePress(event.clientX, event.clientY);
    });
    toggleButton.addEventListener('pointerup', function (event) {
      if (event.button !== 0 || !pointerOrigin) return;
      endPress();
    });
    toggleButton.addEventListener('pointercancel', function () {
      clearLongPress();
      pointerOrigin = null;
    });
    toggleButton.addEventListener('pointerleave', function () {
      clearLongPress();
      pointerOrigin = null;
    });
  } else {
    toggleButton.addEventListener('touchstart', function (event) {
      if (event.touches.length === 1) beginPress(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });
    toggleButton.addEventListener('touchmove', function (event) {
      if (event.touches.length) movePress(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });
    toggleButton.addEventListener('touchend', function () {
      if (pointerOrigin) endPress();
    });
    toggleButton.addEventListener('touchcancel', function () {
      clearLongPress();
      pointerOrigin = null;
    });
  }

  // Pointer/touch handlers own taps; click is retained only for keyboard accessibility.
  toggleButton.addEventListener('click', function (event) {
    if (event.detail === 0) toggle();
    else event.preventDefault();
  });
  toggleButton.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    clearLongPress();
    pointerOrigin = null;
    showGear();
  });

  document.addEventListener('pointerdown', function (event) {
    if (!host.contains(event.target) && !settings.contains(event.target)) closeSettings();
  }, true);

  function findPlacementAnchor() {
    const elements = document.querySelectorAll('button,[role="button"]');
    let best = null;
    let highScore = 0;
    for (const el of elements) {
      if (!isVisible(el) || host.contains(el)) continue;
      const label = [
        el.getAttribute('aria-label'), el.getAttribute('title'),
        el.getAttribute('data-testid'), el.textContent
      ].filter(Boolean).join(' ').trim();
      const icons = el.querySelector('svg');
      const iconText = icons
        ? [icons.getAttribute('data-lucide'), icons.getAttribute('class'), icons.getAttribute('aria-label')].filter(Boolean).join(' ')
        : '';
      const isSeed = /\bseed\b|시드/i.test(label);
      const isPin = /\bpin\b|고정/i.test(label) || /\blucide-pin\b/i.test(iconText);
      const isSeedLock = /\block\b/i.test(label) && /\bseed\b|시드/i.test(el.parentElement?.textContent || '');
      if (!isSeed && !isPin && !isSeedLock) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 250 || rect.height > 95) continue;
      const nearby = (el.parentElement?.textContent || '').slice(0, 350);
      const score = (isSeed ? 20 : 0) + (isPin ? 13 : 0) + (isSeedLock ? 8 : 0)
        + (/\bseed\b|시드/i.test(nearby) ? 8 : 0)
        + (/\bpin\b|고정/i.test(nearby) ? 4 : 0)
        + (rect.width < 90 ? 3 : 0);
      if (score > highScore) {
        highScore = score;
        best = el;
      }
    }
    return best;
  }

  function ensurePlacement() {
    if (!document.body || !/^\/image(?:\/|$)/.test(window.location.pathname)) return;
    const anchor = findPlacementAnchor();
    if (anchor && anchor.parentElement) {
      const parent = anchor.parentElement;
      if (host.parentElement !== parent || host.nextElementSibling !== anchor) {
        parent.insertBefore(host, anchor);
      }
      host.classList.remove('naig-floating');
    } else if (host.parentElement !== document.body || !host.classList.contains('naig-floating')) {
      document.body.appendChild(host);
      host.classList.add('naig-floating');
    }
  }

  function init() {
    if (!document.body) return;
    document.body.appendChild(settings);
    document.body.appendChild(host);
    render();
    ensurePlacement();
    window.setInterval(tick, POLL_MS);
    window.setInterval(ensurePlacement, 1400);
    window.addEventListener('pagehide', function () { stop(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
