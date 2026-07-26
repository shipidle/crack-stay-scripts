// ==UserScript==
// @name         🌐 대사 영문 번역기
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-dialogue-translator
// @version      0.1.2
// @description  🧪 BETA · 크랙 채팅 입력문의 한국어 대사만 영문으로 번역하고 원문 대사를 함께 보존합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      open.er-api.com
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Dialogue_Translator.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Dialogue_Translator.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.1.2';
  const MODEL = 'gemini-3.1-flash-lite';
  const INPUT_USD_PER_M = 0.25;
  const OUTPUT_USD_PER_M = 1.50;
  const MAX_DIALOGUES = 24;
  const CONTEXT_TURNS = 5;
  const CONTEXT_MESSAGES = CONTEXT_TURNS * 2;
  const API_BASE = 'https://crack-api.wrtn.ai/crack-gen';
  const KEY = 'shipidle:dialogue-translator:v1';

  let busy = false;
  let exchangeRate = null;

  GM_addStyle(`
    #cdt-toolbar-btn{pointer-events:auto}
    #cdt-toolbar-btn .cdt-emoji{
      font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
      font-size:15px;line-height:1;pointer-events:none;
    }
    #cdt-panel{
      position:fixed;right:16px;bottom:146px;z-index:2147483602;width:360px;max-width:calc(100vw - 24px);
      max-height:min(76vh,620px);overflow:auto;display:none;padding:16px;
      color:#243447;background:#EEF6FB;border:1px solid #CEDEF2;border-radius:18px;
      box-shadow:0 14px 42px rgba(53,86,113,.22);
      font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    #cdt-panel *{box-sizing:border-box}
    .cdt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px}
    .cdt-title{font-size:16px;font-weight:800;letter-spacing:-.02em}
    .cdt-close{border:0;background:transparent;color:#62778A;font-size:18px;cursor:pointer;padding:4px}
    .cdt-desc{font-size:12px;line-height:1.55;color:#62778A;margin-bottom:13px}
    .cdt-card{padding:12px;background:rgba(255,255,255,.82);border:1px solid #D9E7F1;border-radius:13px;margin-top:10px}
    .cdt-label{display:block;margin:0 0 6px;font-size:12px;font-weight:750;color:#425B70}
    .cdt-input,.cdt-textarea{
      width:100%;border:1px solid #CEDEF2;border-radius:10px;background:#fff;color:#172B3A;
      padding:10px 11px;font:inherit;font-size:13px;outline:none;
    }
    .cdt-input:focus,.cdt-textarea:focus{border-color:#8FB9D9;box-shadow:0 0 0 3px rgba(143,185,217,.18)}
    .cdt-textarea{min-height:86px;resize:vertical;line-height:1.5}
    .cdt-meta{font-size:11px;line-height:1.45;color:#74899A;margin-top:6px}
    .cdt-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:12px}
    .cdt-btn{
      border:0;border-radius:12px;padding:12px 14px;background:#CEDEF2;color:#29445B;
      font-weight:800;font-size:13px;cursor:pointer;
    }
    .cdt-btn.primary{background:#9FC7E3;color:#173247}
    .cdt-btn:disabled{opacity:.55;cursor:not-allowed}
    #cdt-status{min-height:20px;margin-top:10px;font-size:12px;line-height:1.5;color:#526C80;text-align:center;word-break:keep-all}
    #cdt-cost{margin-top:4px;font-size:11px;color:#74899A;text-align:center}
    @media(max-width:640px){
      #cdt-panel{left:12px;right:12px;bottom:118px;width:auto;max-width:none;padding:14px;border-radius:16px}
    }
  `);

  const panel = document.createElement('section');
  panel.id = 'cdt-panel';
  panel.innerHTML = `
    <div class="cdt-head">
      <div class="cdt-title"><span class="cdt-emoji">🌐</span> 대사 영문 번역</div>
      <button class="cdt-close" id="cdt-close" type="button" aria-label="닫기">×</button>
    </div>
    <div class="cdt-desc">따옴표 안 한국어 대사만 <b>"English" (한국어 원문)</b>으로 바꿈. 지문·줄바꿈은 그대로 둠.</div>

    <div class="cdt-card">
      <label class="cdt-label" for="cdt-voice">내 캐릭터 성격·말투</label>
      <textarea class="cdt-textarea" id="cdt-voice" maxlength="1200" placeholder="예: 무뚝뚝한 20대 용병. 짧게 말하고 냉소적이지만 동료에게는 은근히 다정함. 영국식 영어."></textarea>
      <div class="cdt-meta">나+상대 한 쌍을 1턴으로 묶어 최근 5턴을 참고함. 호칭·이름 번역을 우선 통일함.</div>
    </div>

    <div class="cdt-card">
      <label class="cdt-label" for="cdt-api-key">Gemini API Key</label>
      <input class="cdt-input" id="cdt-api-key" type="password" autocomplete="off" placeholder="AIza...">
      <div class="cdt-meta">모델: Gemini 3.1 Flash-Lite · 입력 $0.25/1M · 출력 $1.50/1M</div>
    </div>

    <div class="cdt-actions">
      <button class="cdt-btn primary" id="cdt-run" type="button">대사만 번역해서 교체</button>
      <button class="cdt-btn" id="cdt-save" type="button">설정 저장</button>
    </div>
    <div id="cdt-status">v${VERSION} · 입력창을 읽을 준비됨</div>
    <div id="cdt-cost">이번 요청 - · 누적 0.00원</div>
  `;
  document.body.appendChild(panel);

  const toolbarButton = document.createElement('button');
  toolbarButton.id = 'cdt-toolbar-btn';

  const $ = selector => panel.querySelector(selector);

  function isChatRoomPage() {
    return /\/stories\/[^/]+\/episodes\/[^/]+/.test(location.pathname)
      || /\/characters\/[^/]+\/chats\/[^/]+/.test(location.pathname)
      || /\/u\/[^/]+\/c\/[^/]+/.test(location.pathname);
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }

  function findChatInput() {
    const nodes = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], div[role="textbox"]')]
      .filter(el => {
        if (!isVisible(el) || panel.contains(el)) return false;
        const r = el.getBoundingClientRect();
        const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`;
        return r.bottom > innerHeight * .45 || /메시지|입력/.test(label);
      });
    nodes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return nodes[0] || null;
  }

  function getInputText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  function setInputText(el, text) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
      return true;
    }
    el.focus();
    el.innerText = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function findToolbarNearInput(input) {
    if (!input) return null;
    const inputRect = input.getBoundingClientRect();
    let root = input;
    for (let depth = 0; depth < 8 && root.parentElement; depth++) {
      root = root.parentElement;
      const exact = root.querySelector('.flex.items-center.space-x-2');
      if (isVisible(exact)) return exact;
      const rows = [...root.querySelectorAll('div,section,footer')].filter(el => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.height > 80 || r.width < 40 || Math.abs(r.bottom - inputRect.bottom) > 160) return false;
        const buttons = [...el.querySelectorAll('button')].filter(isVisible);
        return buttons.length && (/flex|items-center|gap|space-x/.test(String(el.className)) || buttons.length > 1);
      });
      if (rows.length) {
        rows.sort((a, b) => Math.abs(a.getBoundingClientRect().bottom - inputRect.bottom)
          - Math.abs(b.getBoundingClientRect().bottom - inputRect.bottom));
        return rows[0];
      }
    }
    return null;
  }

  function injectToolbarButton() {
    if (!isChatRoomPage()) {
      toolbarButton.remove();
      panel.style.display = 'none';
      return;
    }
    if (toolbarButton.isConnected && isVisible(toolbarButton.parentElement)) return;
    toolbarButton.remove();

    let container = null;
    let reference = null;
    const rpTools = document.getElementById('custom-rp-tools');
    if (rpTools && isVisible(rpTools.parentElement)) {
      container = rpTools.parentElement;
      reference = rpTools;
    } else {
      const recommend = [...document.querySelectorAll('button')]
        .filter(isVisible).find(el => (el.textContent || '').includes('추천답변'));
      if (recommend) { container = recommend.parentElement; reference = recommend; }
    }
    if (!container) {
      container = findToolbarNearInput(findChatInput());
      if (container) {
        const buttons = [...container.querySelectorAll('button')].filter(isVisible);
        reference = buttons.find(el => ['*', '/', '／'].includes((el.textContent || '').trim())) || buttons[0] || null;
      }
    }
    if (!container) return;

    toolbarButton.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';
    toolbarButton.type = 'button';
    toolbarButton.title = '대사 영문 번역';
    toolbarButton.setAttribute('aria-label', '대사 영문 번역');
    toolbarButton.style.cssText = 'pointer-events:auto;width:28px;height:28px;min-width:28px;border-radius:9999px';
    toolbarButton.innerHTML = '<span class="cdt-emoji">🌐</span>';
    if (reference?.parentElement === container && reference.nextSibling) container.insertBefore(toolbarButton, reference.nextSibling);
    else if (reference?.parentElement === container) container.appendChild(toolbarButton);
    else container.insertBefore(toolbarButton, container.firstChild);
  }

  function findDialogueSpans(source) {
    const spans = [];
    const re = /"((?:\\.|[^"\\\r\n])*)"|([“”])([^“”\r\n]*)([“”])/g;
    let match;
    while ((match = re.exec(source))) {
      const original = match[1] !== undefined ? match[1] : match[3];
      if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(original)) continue;
      spans.push({
        start: match.index,
        end: re.lastIndex,
        open: match[1] !== undefined ? '"' : match[2],
        close: match[1] !== undefined ? '"' : match[4],
        original,
      });
    }
    return spans;
  }

  function cleanTranslation(text) {
    return String(text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
      .replace(/^["“](.*)["”]$/s, '$1').trim();
  }

  function applyTranslations(source, spans, translations) {
    if (spans.length !== translations.length) throw new Error('번역 개수가 원문 대사 개수와 다름. 다시 시도해줘.');
    let output = source;
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      const translated = cleanTranslation(translations[i]);
      if (!translated) throw new Error(`${i + 1}번째 대사 번역이 비어 있음.`);
      const replacement = `${span.open}${translated}${span.close} (${span.original})`;
      output = output.slice(0, span.start) + replacement + output.slice(span.end);
    }
    return output;
  }

  function compactText(text, limit) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  }

  function getChatId() {
    const patterns = [
      /\/stories\/[^/]+\/episodes\/([^/?#]+)/,
      /\/characters\/[^/]+\/chats\/([^/?#]+)/,
      /\/u\/[^/]+\/c\/([^/?#]+)/,
    ];
    for (const pattern of patterns) {
      const match = location.pathname.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function buildHeaders() {
    const headers = { 'Content-Type': 'application/json', platform: 'web', 'wrtn-locale': 'ko-KR' };
    const cookies = Object.fromEntries(document.cookie.split(';').map(item => {
      const index = item.indexOf('=');
      return index < 0 ? [item.trim(), ''] : [item.slice(0, index).trim(), item.slice(index + 1)];
    }));
    if (cookies.access_token) headers.Authorization = `Bearer ${cookies.access_token}`;
    if (cookies.__w_id) headers['x-wrtn-id'] = cookies.__w_id;
    return headers;
  }

  async function fetchRecentContext() {
    const chatId = getChatId();
    if (!chatId) return '(최근 맥락 없음)';
    try {
      const response = await fetch(`${API_BASE}/v3/chats/${chatId}/messages?limit=${CONTEXT_MESSAGES}`, {
        headers: buildHeaders(), credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const messages = (json.data || json).messages || [];
      const chronological = messages.slice(0, CONTEXT_MESSAGES).reverse();
      const turns = [];
      let currentTurn = [];
      chronological.forEach(message => {
        const role = message.role === 'assistant' ? '상대' : '나';
        if (role === '나' && currentTurn.length) {
          turns.push(currentTurn);
          currentTurn = [];
        }
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '');
        currentTurn.push(`${role}: ${compactText(content, 360)}`);
        if (role === '상대' && currentTurn.some(line => line.startsWith('나: '))) {
          turns.push(currentTurn);
          currentTurn = [];
        }
      });
      if (currentTurn.length) turns.push(currentTurn);
      return turns.slice(-CONTEXT_TURNS).map((turn, index) => (
        `[Turn ${index + 1}]\n${turn.join('\n')}`
      )).join('\n') || '(최근 맥락 없음)';
    } catch (_) {
      return '(최근 맥락을 불러오지 못함)';
    }
  }

  function buildPrompt(spans, context, voice) {
    const lines = spans.map((span, index) => `${index + 1}. ${span.original}`).join('\n');
    return [
      'Translate only the numbered Korean roleplay dialogue into natural English.',
      'Use the character voice and recent context only to choose tone, register, pronouns, and idioms.',
      'Keep names, titles, nicknames, and forms of address consistent with their established English rendering in recent turns.',
      'Treat each [Turn] block as one user-and-character exchange. Prefer established address terms over inventing a new variant.',
      'The Korean dialogue being translated is spoken by 나 (the user character) to 상대 (the AI character).',
      'Resolve every omitted Korean subject, object, beneficiary, and action owner from the full sentence and recent relationship context. Never default an omitted action owner to the current speaker.',
      'Example: for "결혼하고, 요리해 주고. 그게 네가 원하는 거야?", if context establishes 상대 as the devoted caregiver, preserve the meaning that 상대 wants to marry 나 and cook for 나; do not reverse it into 나 cooking for 상대.',
      'Preserve meaning. Do not add actions, narration, explanations, quotation marks, parentheses, or Korean.',
      'Return one English translation per item in exactly the same order.',
      '',
      `[Character voice]\n${voice || '(not provided)'}`,
      `[Last ${CONTEXT_TURNS} conversation turns]\n${context}`,
      `[Korean dialogue]\n${lines}`,
    ].join('\n');
  }

  function billableOutputTokens(usage) {
    const prompt = Number(usage.promptTokenCount || 0);
    const total = Number(usage.totalTokenCount || 0);
    return Math.max(Number(usage.candidatesTokenCount || 0) + Number(usage.thoughtsTokenCount || 0), total - prompt, 0);
  }

  function calculateCostKrw(usage) {
    if (!exchangeRate) return null;
    const usd = Number(usage.promptTokenCount || 0) / 1e6 * INPUT_USD_PER_M
      + billableOutputTokens(usage) / 1e6 * OUTPUT_USD_PER_M;
    return usd * exchangeRate;
  }

  function formatKrw(value) {
    return `${Number(value || 0).toFixed(2)}원`;
  }

  function updateCost(lastCost = null) {
    const total = Number(GM_getValue(`${KEY}:totalCostKrw`, 0)) || 0;
    $('#cdt-cost').textContent = lastCost == null
      ? `이번 요청 - · 누적 ${formatKrw(total)}`
      : `이번 요청 ${formatKrw(lastCost)} · 누적 ${formatKrw(total)}`;
  }

  function fetchExchangeRate() {
    const cached = GM_getValue(`${KEY}:exchangeRate`, null);
    if (cached?.rate > 0 && Date.now() - Number(cached.time || 0) < 60 * 60 * 1000) {
      exchangeRate = cached.rate;
      return;
    }
    GM_xmlhttpRequest({
      method: 'GET', url: 'https://open.er-api.com/v6/latest/USD', timeout: 15000,
      onload(response) {
        try {
          const rate = JSON.parse(response.responseText)?.rates?.KRW;
          if (rate > 0) {
            exchangeRate = rate;
            GM_setValue(`${KEY}:exchangeRate`, { rate, time: Date.now() });
          }
        } catch (_) {}
      },
      onerror() {}, ontimeout() {},
    });
  }

  function callGemini(prompt, dialogueCount) {
    return new Promise((resolve, reject) => {
      const apiKey = $('#cdt-api-key').value.trim();
      if (!apiKey) { reject(new Error('Gemini API Key를 먼저 입력해줘.')); return; }
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        headers: { 'Content-Type': 'application/json' }, timeout: 60000,
        data: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: Math.min(720, Math.max(96, dialogueCount * 64)),
            thinkingConfig: { thinkingLevel: 'low' },
            responseMimeType: 'application/json',
            responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          safetySettings: [
            'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
          ].map(category => ({ category, threshold: 'BLOCK_NONE' })),
        }),
        onload(response) {
          try {
            const data = JSON.parse(response.responseText);
            if (response.status < 200 || response.status >= 300 || data.error) {
              throw new Error(data.error?.message || `Gemini HTTP ${response.status}`);
            }
            const candidate = data.candidates?.[0];
            if (!candidate) throw new Error(data.promptFeedback?.blockReason || 'Gemini 번역 결과가 없음.');
            const raw = (candidate.content?.parts || []).map(part => part.text || '').join('').trim();
            let translations;
            try { translations = JSON.parse(raw); }
            catch (_) { throw new Error('Gemini 번역 형식이 올바르지 않음. 다시 시도해줘.'); }
            if (!Array.isArray(translations)) translations = translations?.translations;
            if (!Array.isArray(translations)) throw new Error('Gemini가 번역 목록을 반환하지 않음.');
            resolve({ translations, usage: data.usageMetadata || {} });
          } catch (error) { reject(error); }
        },
        onerror() { reject(new Error('Gemini 네트워크 연결 실패.')); },
        ontimeout() { reject(new Error('Gemini 요청 시간이 초과됨.')); },
      });
    });
  }

  function saveSettings(showStatus = true) {
    GM_setValue(`${KEY}:apiKey`, $('#cdt-api-key').value.trim());
    GM_setValue(`${KEY}:voice`, $('#cdt-voice').value.trim());
    if (showStatus) $('#cdt-status').textContent = '설정 저장 완료.';
  }

  async function translateInput() {
    if (busy) return;
    const input = findChatInput();
    if (!input) { $('#cdt-status').textContent = '입력창을 찾지 못함.'; return; }
    const source = getInputText(input);
    const spans = findDialogueSpans(source);
    if (!source.trim()) { $('#cdt-status').textContent = '입력창이 비어 있음.'; return; }
    if (!spans.length) { $('#cdt-status').textContent = '따옴표 안 한국어 대사가 없음.'; return; }
    if (spans.length > MAX_DIALOGUES) { $('#cdt-status').textContent = `한 번에 대사는 ${MAX_DIALOGUES}개까지만 번역 가능함.`; return; }

    busy = true;
    $('#cdt-run').disabled = true;
    $('#cdt-save').disabled = true;
    saveSettings(false);
    try {
      $('#cdt-status').textContent = `최근 대화 ${CONTEXT_TURNS}턴 읽는 중…`;
      const context = await fetchRecentContext();
      $('#cdt-status').textContent = `대사 ${spans.length}개 번역 중…`;
      const result = await callGemini(buildPrompt(spans, context, compactText($('#cdt-voice').value, 1200)), spans.length);
      const replaced = applyTranslations(source, spans, result.translations);
      setInputText(input, replaced);

      const cost = calculateCostKrw(result.usage);
      if (cost == null) {
        $('#cdt-cost').textContent = '환율 확인 실패 · 비용 계산 안 함';
      } else {
        GM_setValue(`${KEY}:totalCostKrw`, (Number(GM_getValue(`${KEY}:totalCostKrw`, 0)) || 0) + cost);
        updateCost(cost);
      }
      $('#cdt-status').textContent = `완료. 대사 ${spans.length}개만 교체함. 이제 전송 누르면 됨.`;
      setTimeout(() => { panel.style.display = 'none'; }, 550);
    } catch (error) {
      $('#cdt-status').textContent = `오류: ${error?.message || error}`;
    } finally {
      busy = false;
      $('#cdt-run').disabled = false;
      $('#cdt-save').disabled = false;
    }
  }

  function togglePanel(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    if (panel.style.display === 'block') {
      const input = findChatInput();
      const count = findDialogueSpans(getInputText(input)).length;
      $('#cdt-status').textContent = count ? `한국어 대사 ${count}개 감지됨.` : '따옴표 안 한국어 대사를 입력해줘.';
    }
  }

  $('#cdt-api-key').value = GM_getValue(`${KEY}:apiKey`, '');
  $('#cdt-voice').value = GM_getValue(`${KEY}:voice`, '');
  updateCost();
  fetchExchangeRate();

  $('#cdt-close').addEventListener('click', () => { panel.style.display = 'none'; });
  $('#cdt-save').addEventListener('click', () => saveSettings(true));
  $('#cdt-run').addEventListener('click', translateInput);
  toolbarButton.addEventListener('click', togglePanel, true);
  toolbarButton.addEventListener('mousedown', event => event.stopPropagation(), true);
  toolbarButton.addEventListener('touchstart', togglePanel, { passive: false, capture: true });

  let injectTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectToolbarButton, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  injectToolbarButton();
})();
