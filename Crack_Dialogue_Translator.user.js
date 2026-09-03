// ==UserScript==
// @name         🌐 대사 영문 번역기
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-dialogue-translator
// @version      0.3.1
// @description  🧪 BETA · 크랙 채팅 입력문의 한국어 대사를 영문으로 번역하거나 *지문*을 한국 현대문학풍으로 윤문합니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      generativelanguage.googleapis.com
// @connect      open.er-api.com
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Dialogue_Translator.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Dialogue_Translator.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.3.1';
  const MODEL = 'gemini-3.5-flash-lite';
  const INPUT_USD_PER_M = 0.30;
  const OUTPUT_USD_PER_M = 2.50;
  const MAX_TARGETS = 24;
  const CONTEXT_TURNS = 5;
  const CONTEXT_MESSAGES = CONTEXT_TURNS * 2;
  const HISTORY_CHAR_BUDGET = 20000;
  const CURRENT_DRAFT_CHAR_BUDGET = 24000;
  const API_BASE = 'https://crack-api.wrtn.ai/crack-gen';
  const KEY = 'shipidle:dialogue-translator:v1';
  const CLOUD_API_KEY = '__SHIPIDLE_DIALOGUE_TRANSLATOR_SYNC__';
  const BRIDGE = unsafeWindow || window;

  let busy = false;
  let cloudBusy = false;
  let exchangeRate = null;
  let loadedRoomPath = '';
  let roomSettings = { guidance: '', cloudRevision: 0 };

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
    .cdt-input,.cdt-textarea,.cdt-select{
      width:100%;border:1px solid #CEDEF2;border-radius:10px;background:#fff;color:#172B3A;
      padding:10px 11px;font:inherit;font-size:13px;outline:none;
    }
    .cdt-input:focus,.cdt-textarea:focus,.cdt-select:focus{border-color:#8FB9D9;box-shadow:0 0 0 3px rgba(143,185,217,.18)}
    .cdt-select{appearance:auto;cursor:pointer}
    .cdt-textarea{min-height:86px;resize:vertical;line-height:1.5}
    .cdt-meta{font-size:11px;line-height:1.45;color:#74899A;margin-top:6px}
    .cdt-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:12px}
    .cdt-cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
    .cdt-btn{
      border:0;border-radius:12px;padding:12px 14px;background:#CEDEF2;color:#29445B;
      font-weight:800;font-size:13px;cursor:pointer;
    }
    .cdt-btn.primary{background:#9FC7E3;color:#173247}
    .cdt-btn:disabled{opacity:.55;cursor:not-allowed}
    #cdt-status{min-height:20px;margin-top:10px;font-size:12px;line-height:1.5;color:#526C80;text-align:center;word-break:break-word;white-space:pre-wrap}
    #cdt-cost{margin-top:4px;font-size:11px;color:#74899A;text-align:center}
    @media(max-width:640px){
      #cdt-panel{left:12px;right:12px;bottom:118px;width:auto;max-width:none;padding:14px;border-radius:16px}
    }
  `);

  const panel = document.createElement('section');
  panel.id = 'cdt-panel';
  panel.innerHTML = `
    <div class="cdt-head">
      <div class="cdt-title"><span class="cdt-emoji">🌐</span> 대사 번역 · 지문 윤문</div>
      <button class="cdt-close" id="cdt-close" type="button" aria-label="닫기">×</button>
    </div>
    <div class="cdt-desc">따옴표 대사는 <b>"English" (한국어 원문)</b>으로, <b>*지문*</b>은 의미를 유지한 세련된 한국어 문장으로 바꿈.</div>

    <div class="cdt-card">
      <label class="cdt-label" for="cdt-mode">작업 선택</label>
      <select class="cdt-select" id="cdt-mode">
        <option value="dialogue">1. 대사만 교체</option>
        <option value="narration">2. 지문만 윤문</option>
        <option value="both">3. 대사 + 윤문</option>
      </select>
      <div class="cdt-meta">지문은 별표 한 쌍 안의 한국어만 처리함. 대사+윤문도 Gemini 호출은 1회임.</div>
    </div>

    <div class="cdt-card">
      <label class="cdt-label" for="cdt-guidance">방별 캐릭터 설정·작업 노트</label>
      <textarea class="cdt-textarea" id="cdt-guidance" maxlength="3000" placeholder="예: Felix는 펠릭스. Till은 틸. 펠릭스가 틸을 돌보고 요리해주는 관계. 틸은 짧고 무뚝뚝하게 말함."></textarea>
      <div class="cdt-meta">성격·관계·말투·고유명사·호칭을 참고함. 대사 번역 시 현재 작성 중인 답장 전체 + 최근 5턴을 읽고, 최신 대화를 우선 보존함.</div>
    </div>

    <div class="cdt-card">
      <label class="cdt-label" for="cdt-api-key">Gemini API Key</label>
      <input class="cdt-input" id="cdt-api-key" type="password" autocomplete="off" placeholder="AIza...">
      <div class="cdt-meta">모델: Gemini 3.5 Flash-Lite · 추론 Low · 입력 $0.30/1M · 출력 $2.50/1M</div>
    </div>

    <div class="cdt-actions">
      <button class="cdt-btn primary" id="cdt-run" type="button">대사만 교체</button>
      <button class="cdt-btn" id="cdt-save" type="button">설정 저장</button>
    </div>
    <div class="cdt-card">
      <label class="cdt-label">☁️ Lore Sync 계정으로 방 설정 보관</label>
      <div class="cdt-meta" id="cdt-cloud-status">Lore Sync 연결 상태 확인 전</div>
      <div class="cdt-cloud-actions">
        <button class="cdt-btn primary" id="cdt-cloud-upload" type="button">클라우드에 올리기</button>
        <button class="cdt-btn" id="cdt-cloud-download" type="button">클라우드에서 받기</button>
      </div>
      <div class="cdt-meta">자동 동기화 없음 · Gemini API 키는 업로드하지 않음</div>
    </div>
    <div id="cdt-status">v${VERSION} · 입력창을 읽을 준비됨</div>
    <div id="cdt-cost">이번 요청 - · 누적 0.00원</div>
  `;
  document.body.appendChild(panel);

  const toolbarButton = document.createElement('button');
  toolbarButton.id = 'cdt-toolbar-btn';

  const $ = selector => panel.querySelector(selector);

  function roomStorageKey(path = location.pathname) {
    return `${KEY}:room:${encodeURIComponent(path)}`;
  }

  function normalizeRoomSettings(value) {
    let saved = value;
    if (typeof saved === 'string') {
      try { saved = JSON.parse(saved); } catch { saved = null; }
    }
    const legacyGuidance = [saved?.voice, saved?.notes].map(item => String(item || '').trim()).filter(Boolean).join('\n');
    return {
      guidance: String(saved?.guidance || legacyGuidance).slice(0, 3000),
      cloudRevision: Math.max(0, Number(saved?.cloudRevision) || 0),
    };
  }

  function loadRoomSettings(force = false) {
    if (!isChatRoomPage()) return;
    if (!force && loadedRoomPath === location.pathname) return;
    loadedRoomPath = location.pathname;
    const stored = GM_getValue(roomStorageKey(), null);
    roomSettings = normalizeRoomSettings(stored);
    if (!stored && !GM_getValue(`${KEY}:voiceMigrated`, false)) {
      roomSettings.guidance = String(GM_getValue(`${KEY}:voice`, '') || '').slice(0, 3000);
      GM_setValue(`${KEY}:voiceMigrated`, true);
      if (roomSettings.guidance) GM_setValue(roomStorageKey(), JSON.stringify(roomSettings));
    }
    $('#cdt-guidance').value = roomSettings.guidance;
  }

  function saveRoomSettings(showStatus = true) {
    roomSettings.guidance = $('#cdt-guidance').value.trim().slice(0, 3000);
    GM_setValue(roomStorageKey(), JSON.stringify(roomSettings));
    if (showStatus) $('#cdt-status').textContent = '이 방의 설정을 저장했음.';
  }

  function sharedCloudApi() {
    return BRIDGE[CLOUD_API_KEY] || null;
  }

  function sharedCloudStatus() {
    const api = sharedCloudApi();
    if (!api) return { ready: false, reason: 'Lore Sync 확장프로그램을 최신 beta로 업데이트해주셈.' };
    try { return api.getStatus(); } catch (error) { return { ready: false, reason: error?.message || 'Lore Sync 상태 확인 실패.' }; }
  }

  function refreshCloudStatus() {
    const status = sharedCloudStatus();
    $('#cdt-cloud-status').textContent = status.ready
      ? `🟢 ${status.email || '저장된 계정'} 로그인됨`
      : status.reason;
    $('#cdt-cloud-upload').disabled = cloudBusy || !status.ready;
    $('#cdt-cloud-download').disabled = cloudBusy || !status.ready;
  }

  function cloudErrorMessage(error, fallback) {
    const raw = String(error?.message || error || '');
    if (/dialogue_translator_sync|PGRST205|schema cache/i.test(raw)) return 'Supabase에서 supabase/dialogue_translator_sync.sql을 먼저 Run해주셈.';
    return raw || fallback;
  }

  async function uploadRoomSettings() {
    if (cloudBusy) return;
    cloudBusy = true;
    refreshCloudStatus();
    $('#cdt-status').textContent = '클라우드 저장본 확인 중…';
    try {
      saveRoomSettings(false);
      const api = sharedCloudApi();
      const status = sharedCloudStatus();
      if (!api || !status.ready) throw new Error(status.reason);
      const remote = await api.getSettings(location.pathname);
      if (remote && Number(remote.revision) > roomSettings.cloudRevision
        && !confirm(`다른 기기의 더 최신 번역 설정(rev ${remote.revision})이 있음. 현재 설정으로 덮어쓸까요?`)) return;
      const revision = Math.max(roomSettings.cloudRevision, Number(remote?.revision) || 0) + 1;
      const saved = await api.saveSettings({
        roomKey: location.pathname,
        settings: { guidance: roomSettings.guidance },
        revision,
        deviceLabel: status.deviceLabel || '내 기기',
      });
      roomSettings.cloudRevision = Number(saved?.revision) || revision;
      GM_setValue(roomStorageKey(), JSON.stringify(roomSettings));
      $('#cdt-status').textContent = `클라우드 저장 완료 · rev ${roomSettings.cloudRevision}`;
    } catch (error) {
      console.warn('[CDT] cloud upload failed:', error);
      $('#cdt-status').textContent = `오류: ${cloudErrorMessage(error, '클라우드 저장 실패')}`;
    } finally {
      cloudBusy = false;
      refreshCloudStatus();
    }
  }

  async function downloadRoomSettings() {
    if (cloudBusy) return;
    cloudBusy = true;
    refreshCloudStatus();
    $('#cdt-status').textContent = '클라우드 번역 설정 확인 중…';
    try {
      const api = sharedCloudApi();
      const status = sharedCloudStatus();
      if (!api || !status.ready) throw new Error(status.reason);
      const remote = await api.getSettings(location.pathname);
      if (!remote) throw new Error('이 채팅방의 클라우드 저장본이 없음.');
      const next = normalizeRoomSettings({ ...remote.settings, cloudRevision: remote.revision });
      const localHasContent = $('#cdt-guidance').value.trim();
      const differs = next.guidance !== localHasContent;
      if (localHasContent && differs
        && !confirm(`${remote.device_label || '다른 기기'}의 rev ${remote.revision} 설정으로 현재 입력을 바꿀까요?`)) return;
      roomSettings = next;
      $('#cdt-guidance').value = next.guidance;
      GM_setValue(roomStorageKey(), JSON.stringify(roomSettings));
      $('#cdt-status').textContent = `클라우드 설정 받기 완료 · rev ${roomSettings.cloudRevision}`;
    } catch (error) {
      console.warn('[CDT] cloud download failed:', error);
      $('#cdt-status').textContent = `오류: ${cloudErrorMessage(error, '클라우드 받기 실패')}`;
    } finally {
      cloudBusy = false;
      refreshCloudStatus();
    }
  }

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
    toolbarButton.title = '대사 번역 · 지문 윤문';
    toolbarButton.setAttribute('aria-label', '대사 번역 · 지문 윤문');
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
        type: 'dialogue',
        start: match.index,
        end: re.lastIndex,
        open: match[1] !== undefined ? '"' : match[2],
        close: match[1] !== undefined ? '"' : match[4],
        original,
      });
    }
    return spans;
  }

  function findNarrationSpans(source) {
    const spans = [];
    const re = /(^|[^\\*])\*([^*\r\n]+)\*(?!\*)/g;
    let match;
    while ((match = re.exec(source))) {
      const original = match[2];
      if (!/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(original)) continue;
      const start = match.index + match[1].length;
      spans.push({
        type: 'narration',
        start,
        end: start + original.length + 2,
        open: '*',
        close: '*',
        original,
      });
    }
    return spans;
  }

  function findTargets(source, mode) {
    const dialogues = mode === 'narration' ? [] : findDialogueSpans(source);
    const narrations = mode === 'dialogue' ? [] : findNarrationSpans(source);
    const targets = [...dialogues, ...narrations].sort((a, b) => a.start - b.start);
    for (let i = 1; i < targets.length; i++) {
      if (targets[i].start < targets[i - 1].end) {
        throw new Error('따옴표 대사와 *지문* 표시가 겹침. 대사와 지문을 분리해서 입력해줘.');
      }
    }
    return targets;
  }

  function cleanTranslation(text) {
    return String(text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
      .replace(/^["“](.*)["”]$/s, '$1').trim();
  }

  function cleanPolishing(text) {
    const cleaned = String(text || '').trim()
      .replace(/^```(?:text|markdown)?\s*/i, '').replace(/```$/i, '').trim();
    return cleaned.startsWith('*') && cleaned.endsWith('*')
      ? cleaned.slice(1, -1).trim()
      : cleaned;
  }

  function applyTransformations(source, targets, transformations) {
    if (targets.length !== transformations.length) {
      throw new Error(`결과 개수 불일치: 원문 ${targets.length}개 / Gemini ${transformations.length}개.`);
    }
    let output = source;
    for (let i = targets.length - 1; i >= 0; i--) {
      const target = targets[i];
      const transformed = target.type === 'narration'
        ? cleanPolishing(transformations[i])
        : cleanTranslation(transformations[i]);
      if (!transformed) throw new Error(`${i + 1}번째 ${target.type === 'narration' ? '지문 윤문' : '대사 번역'} 결과가 비어 있음.`);
      const replacement = target.type === 'narration'
        ? `${target.open}${transformed}${target.close}`
        : `${target.open}${transformed}${target.close} (${target.original})`;
      output = output.slice(0, target.start) + replacement + output.slice(target.end);
    }
    return output;
  }

  function applyTranslations(source, spans, translations) {
    if (spans.length !== translations.length) {
      throw new Error(`번역 개수 불일치: 원문 ${spans.length}개 / Gemini ${translations.length}개.`);
    }
    return applyTransformations(source, spans.map(span => ({ ...span, type: 'dialogue' })), translations);
  }

  function compactText(text, limit) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  }

  function normalizeContextText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function clipTextEdges(text, limit) {
    const normalized = normalizeContextText(text);
    if (!limit || normalized.length <= limit) return normalized;
    if (limit < 220) return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
    const marker = '\n…[중간 생략]…\n';
    const usable = Math.max(0, limit - marker.length);
    const head = Math.ceil(usable * 0.55);
    const tail = Math.max(0, usable - head);
    return `${normalized.slice(0, head)}${marker}${normalized.slice(-tail)}`;
  }

  function describeFinishReason(reason) {
    const descriptions = {
      MAX_TOKENS: '출력 토큰 한도에 걸려 응답이 중간에 잘림.',
      SAFETY: 'Gemini 안전 필터가 응답 생성을 중단함.',
      RECITATION: '인용·재현 감지로 응답 생성이 중단됨.',
      BLOCKLIST: '차단 목록 감지로 응답 생성이 중단됨.',
      PROHIBITED_CONTENT: '금지 콘텐츠 감지로 응답 생성이 중단됨.',
      SPII: '민감한 개인정보 감지로 응답 생성이 중단됨.',
      MALFORMED_FUNCTION_CALL: 'Gemini가 잘못된 함수 호출 형식을 생성함.',
      OTHER: 'Gemini가 분류되지 않은 이유로 응답 생성을 중단함.',
    };
    return descriptions[reason] || 'Gemini가 정상 종료(STOP)하지 않음.';
  }

  function responsePreview(raw) {
    return compactText(raw || '(빈 응답)', 320);
  }

  function parseTranslationPayload(raw, status, finishReason) {
    const cleaned = String(raw || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    if (!cleaned) {
      throw new Error(`Gemini 최종 응답이 비어 있음.\nHTTP ${status} · finishReason=${finishReason || '없음'}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      console.error('[CDT] Gemini JSON parse failed', { status, finishReason, raw, error });
      throw new Error(
        `Gemini 응답 JSON 파싱 실패.\n` +
        `HTTP ${status} · finishReason=${finishReason || '없음'}\n` +
        `JSON 오류=${error.message}\n` +
        `응답 앞부분=${responsePreview(raw)}`
      );
    }

    const translations = Array.isArray(parsed) ? parsed : parsed?.translations;
    if (!Array.isArray(translations)) {
      throw new Error(
        `Gemini 응답 JSON이 번역 배열이 아님.\n` +
        `HTTP ${status} · finishReason=${finishReason || '없음'}\n` +
        `응답 앞부분=${responsePreview(raw)}`
      );
    }
    return translations;
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
    if (!chatId) return { text: '(최근 맥락 없음)', chars: 0, messageCount: 0, fetchedCount: 0 };
    try {
      const response = await fetch(`${API_BASE}/v3/chats/${chatId}/messages?limit=${CONTEXT_MESSAGES}`, {
        headers: buildHeaders(), credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const messages = ((json.data || json).messages || []).slice(0, CONTEXT_MESSAGES);
      const keptNewestFirst = [];
      let remaining = HISTORY_CHAR_BUDGET;

      for (const message of messages) {
        if (remaining <= 120) break;
        const role = message.role === 'assistant' ? '상대' : '나';
        const rawContent = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content || '');
        const content = normalizeContextText(rawContent);
        if (!content) continue;
        const prefix = `${role}: `;
        const available = Math.max(0, remaining - prefix.length - 2);
        if (available < 80) break;
        const clipped = clipTextEdges(content, available);
        const line = `${prefix}${clipped}`;
        keptNewestFirst.push({ role, line });
        remaining -= line.length + 2;
        if (clipped.length < content.length) break;
      }

      const chronological = keptNewestFirst.reverse();
      const turns = [];
      let currentTurn = [];
      chronological.forEach(item => {
        if (item.role === '나' && currentTurn.length) {
          turns.push(currentTurn);
          currentTurn = [];
        }
        currentTurn.push(item.line);
        if (item.role === '상대' && currentTurn.some(line => line.startsWith('나: '))) {
          turns.push(currentTurn);
          currentTurn = [];
        }
      });
      if (currentTurn.length) turns.push(currentTurn);

      const text = turns.slice(-CONTEXT_TURNS).map((turn, index) => (
        `[Turn ${index + 1}]\n${turn.join('\n\n')}`
      )).join('\n\n') || '(최근 맥락 없음)';

      return {
        text,
        chars: text === '(최근 맥락 없음)' ? 0 : text.length,
        messageCount: chronological.length,
        fetchedCount: messages.length,
      };
    } catch (error) {
      console.warn('[CDT] recent context fetch failed:', error);
      return { text: '(최근 맥락을 불러오지 못함)', chars: 0, messageCount: 0, fetchedCount: 0 };
    }
  }

  function buildPrompt(targets, contextInfo, guidance, source) {
    const hasDialogue = targets.some(target => target.type === 'dialogue');
    const hasNarration = targets.some(target => target.type === 'narration');
    const lines = targets.map((target, index) => (
      `${index + 1}. [${target.type === 'narration' ? 'NARRATION' : 'DIALOGUE'}] ${target.original}`
    )).join('\n');
    const currentDraft = clipTextEdges(source, CURRENT_DRAFT_CHAR_BUDGET) || '(empty)';
    const instructions = [
      'This is a constrained transformation task using fictional roleplay text between consenting adult characters.',
      'Transform only the explicitly numbered items. Every unnumbered passage is reference material only.',
      'Never repeat, summarize, evaluate, answer, or continue unnumbered material.',
      'Do not censor, euphemize, moralize, add, or continue sexual content.',
    ];

    if (hasDialogue) instructions.push(
      'For each [DIALOGUE] item, translate the Korean dialogue into natural English.',
      'Preserve explicit adult anatomical and sexual vocabulary accurately and literally when it appears in the numbered source dialogue.',
      'The Korean dialogue being translated is spoken by 나 (the user character) to 상대 (the AI character).',
      'Before translating each item, silently resolve: speaker, listener, omitted subject, omitted object or beneficiary, action owner, possessor, and the referent of pronouns or demonstratives.',
      'Use evidence in this priority order: (1) the full Current draft and its adjacent narration/dialogue, (2) the most recent 상대 message in Recent conversation, (3) earlier Recent conversation, (4) Room guidance.',
      'Do not assume an omitted Korean subject or action owner is the current speaker. Never reverse actor/recipient, giver/receiver, caregiver/beneficiary, possessor/possessed, or speaker/listener relationships.',
      'Use adjacent narration in the Current draft to resolve deictic expressions, implied actions, sarcasm, teasing, flirting, refusal, hesitation, and other subtext.',
      'If the context still does not establish one interpretation, choose the least assumptive natural English wording rather than inventing a relationship, intention, emotion, or action owner.',
      'Use context to preserve established tone, register, pronouns, idioms, names, titles, nicknames, and forms of address. Prefer established address terms over inventing a new variant.',
      'Preserve meaning. Do not add actions, narration, explanations, quotation marks, parentheses, or Korean to a [DIALOGUE] result.',
    );

    if (hasNarration) instructions.push(
      'For each [NARRATION] item, rewrite only that Korean prose in polished Korean contemporary literary-fiction prose.',
      'Keep every fact, subject, action owner, event order, point of view, tense, intensity, and boundary unchanged.',
      'Use the full Current draft to understand who is acting on whom and how adjacent sentences connect, but never transform or continue unnumbered text.',
      'Never invent or confirm new touch, action, dialogue, thought, psychology, emotion, reaction, relationship, consent, or bodily state for either 나 or 상대.',
      'Use restrained lyricism and precise sensory texture. Prefer air, humidity, light, fabric, body heat, scent, and fingertips only when the original meaning naturally supports them.',
      'Avoid expository explanation and direct emotion labels. Use metaphor, personification, or synesthesia sparingly and organically rather than forcing them into every sentence.',
      'When the source already contains affection, jealousy, protectiveness, embarrassment, or possessiveness, keep it implicit using only gaze, silence, distance, tone, or fingertip details already present in that source; never introduce a new cue or emotion.',
      'Keep the result concise and close to the original length. Do not imitate or mention any specific author.',
      'Return bare Korean prose for a [NARRATION] item without surrounding asterisks, labels, commentary, or alternatives.',
    );

    instructions.push(
      'Return one transformed string per numbered item in exactly the same order as a JSON array.',
      '',
      `[Current draft — highest-priority reference only; do not transform unnumbered text]\n${currentDraft}`,
    );
    if (hasDialogue) instructions.push(
      `[Recent conversation — newest messages were preserved first]\n${contextInfo?.text || '(최근 맥락 없음)'}`,
    );
    instructions.push(
      `[Room guidance — lowest-priority reference]\n${guidance || '(not provided)'}`,
      `[Items to transform]\n${lines}`,
    );
    return instructions.join('\n\n');
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

  function callGemini(prompt) {
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
            maxOutputTokens: 4096,
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
            if (!candidate) {
              throw new Error(
                `Gemini candidate 없음.\n` +
                `HTTP ${response.status} · blockReason=${data.promptFeedback?.blockReason || '없음'}`
              );
            }
            const finishReason = candidate.finishReason || '';
            const raw = (candidate.content?.parts || [])
              .filter(part => !part.thought)
              .map(part => part.text || '')
              .join('')
              .trim();
            if (finishReason && finishReason !== 'STOP') {
              console.error('[CDT] Gemini generation stopped', { status: response.status, finishReason, raw, data });
              throw new Error(
                `${describeFinishReason(finishReason)}\n` +
                `HTTP ${response.status} · finishReason=${finishReason}\n` +
                `응답 앞부분=${responsePreview(raw)}`
              );
            }
            const translations = parseTranslationPayload(raw, response.status, finishReason);
            resolve({ translations, usage: data.usageMetadata || {} });
          } catch (error) { reject(error); }
        },
        onerror() { reject(new Error('Gemini 네트워크 연결 실패.')); },
        ontimeout() { reject(new Error('Gemini 요청 시간이 초과됨.')); },
      });
    });
  }

  function selectedMode() {
    const mode = $('#cdt-mode').value;
    return ['dialogue', 'narration', 'both'].includes(mode) ? mode : 'dialogue';
  }

  function targetSummary(targets) {
    const dialogues = targets.filter(target => target.type === 'dialogue').length;
    const narrations = targets.length - dialogues;
    return [dialogues && `대사 ${dialogues}개`, narrations && `지문 ${narrations}개`].filter(Boolean).join(' · ');
  }

  function updateModeUi() {
    const labels = {
      dialogue: '대사만 교체',
      narration: '지문만 윤문',
      both: '대사 + 윤문 실행',
    };
    $('#cdt-run').textContent = labels[selectedMode()];
  }

  function saveSettings(showStatus = true) {
    GM_setValue(`${KEY}:apiKey`, $('#cdt-api-key').value.trim());
    GM_setValue(`${KEY}:mode`, selectedMode());
    saveRoomSettings(showStatus);
  }

  async function transformInput() {
    if (busy) return;
    const input = findChatInput();
    if (!input) { $('#cdt-status').textContent = '입력창을 찾지 못함.'; return; }
    const source = getInputText(input);
    const mode = selectedMode();
    if (!source.trim()) { $('#cdt-status').textContent = '입력창이 비어 있음.'; return; }
    let targets;
    try { targets = findTargets(source, mode); } catch (error) {
      $('#cdt-status').textContent = `오류: ${error?.message || error}`;
      return;
    }
    if (!targets.length) {
      $('#cdt-status').textContent = mode === 'dialogue'
        ? '따옴표 안 한국어 대사가 없음.'
        : mode === 'narration'
          ? '별표 한 쌍 안의 한국어 지문이 없음.'
          : '처리할 한국어 대사나 *지문*이 없음.';
      return;
    }
    if (targets.length > MAX_TARGETS) {
      $('#cdt-status').textContent = `한 번에 대사와 지문을 합쳐 ${MAX_TARGETS}개까지만 처리 가능함.`;
      return;
    }

    busy = true;
    $('#cdt-run').disabled = true;
    $('#cdt-save').disabled = true;
    $('#cdt-mode').disabled = true;
    saveSettings(false);
    try {
      const needsContext = targets.some(target => target.type === 'dialogue');
      let contextInfo = { text: '', chars: 0, messageCount: 0, fetchedCount: 0 };
      if (needsContext) {
        $('#cdt-status').textContent = `최근 대화 ${CONTEXT_TURNS}턴 읽는 중…`;
        contextInfo = await fetchRecentContext();
      }
      const draftChars = clipTextEdges(source, CURRENT_DRAFT_CHAR_BUDGET).length;
      const contextStatus = needsContext
        ? ` · 최근맥락 ${contextInfo.chars.toLocaleString()}자/${contextInfo.messageCount}메시지`
        : '';
      $('#cdt-status').textContent = `${targetSummary(targets)} 처리 중… · 현재초안 ${draftChars.toLocaleString()}자${contextStatus}`;
      const result = await callGemini(buildPrompt(
        targets,
        contextInfo,
        compactText($('#cdt-guidance').value, 3000),
        source,
      ));
      const replaced = applyTransformations(source, targets, result.translations);
      setInputText(input, replaced);

      const cost = calculateCostKrw(result.usage);
      if (cost == null) {
        $('#cdt-cost').textContent = '환율 확인 실패 · 비용 계산 안 함';
      } else {
        GM_setValue(`${KEY}:totalCostKrw`, (Number(GM_getValue(`${KEY}:totalCostKrw`, 0)) || 0) + cost);
        updateCost(cost);
      }
      $('#cdt-status').textContent = `완료. ${targetSummary(targets)}만 교체함. · 현재초안 ${draftChars.toLocaleString()}자${contextStatus}`;
      setTimeout(() => { panel.style.display = 'none'; }, 900);
    } catch (error) {
      $('#cdt-status').textContent = `오류: ${error?.message || error}`;
    } finally {
      busy = false;
      $('#cdt-run').disabled = false;
      $('#cdt-save').disabled = false;
      $('#cdt-mode').disabled = false;
    }
  }

  function togglePanel(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    if (panel.style.display === 'block') {
      loadRoomSettings();
      refreshCloudStatus();
      const input = findChatInput();
      try {
        const targets = findTargets(getInputText(input), selectedMode());
        $('#cdt-status').textContent = targets.length
          ? `${targetSummary(targets)} 감지됨.`
          : '선택한 작업에 맞는 한국어 대사나 *지문*을 입력해줘.';
      } catch (error) {
        $('#cdt-status').textContent = `오류: ${error?.message || error}`;
      }
    }
  }

  $('#cdt-api-key').value = GM_getValue(`${KEY}:apiKey`, '');
  const savedMode = GM_getValue(`${KEY}:mode`, 'dialogue');
  $('#cdt-mode').value = ['dialogue', 'narration', 'both'].includes(savedMode) ? savedMode : 'dialogue';
  updateModeUi();
  loadRoomSettings(true);
  updateCost();
  fetchExchangeRate();

  $('#cdt-close').addEventListener('click', () => { panel.style.display = 'none'; });
  $('#cdt-save').addEventListener('click', () => saveSettings(true));
  $('#cdt-cloud-upload').addEventListener('click', uploadRoomSettings);
  $('#cdt-cloud-download').addEventListener('click', downloadRoomSettings);
  $('#cdt-mode').addEventListener('change', () => {
    GM_setValue(`${KEY}:mode`, selectedMode());
    updateModeUi();
  });
  $('#cdt-run').addEventListener('click', transformInput);
  toolbarButton.addEventListener('click', togglePanel, true);
  toolbarButton.addEventListener('mousedown', event => event.stopPropagation(), true);
  toolbarButton.addEventListener('touchstart', togglePanel, { passive: false, capture: true });

  let injectTimer = null;
  const observer = new MutationObserver(() => {
    if (loadedRoomPath && loadedRoomPath !== location.pathname && isChatRoomPage()) loadRoomSettings(true);
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectToolbarButton, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  injectToolbarButton();
})();
