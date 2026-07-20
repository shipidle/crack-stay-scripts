// ==UserScript==
// @name         윤문 헬퍼
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-dialogue-polisher
// @version      1.1.0
// @description  🧪 BETA · 크랙 채팅창의 대사/상황묘사를 Gemini로 번역·의역·윤문 후 미리보기하고 입력창만 대체
// @match        https://crack.wrtn.ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Rewriting_Helper.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Rewriting_Helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'https://crack-api.wrtn.ai/crack-gen';

  const LANGS = [
    ['en', '영어 English'],
    ['it', '이탈리아어 Italiano'],
    ['es', '스페인어 Español'],
    ['de', '독일어 Deutsch'],
    ['fr', '프랑스어 Français'],
    ['ja', '일본어 日本語'],
    ['zh', '중국어 中文'],
  ];
  const SLOT_COUNT = 10;
  const EXCHANGE_RATE_KRW = 1550;
  const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  const DEFAULT_MAX_OUTPUT_TOKENS = 1200;

  const GEMINI_MODELS = [
    ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite (최저가/기본)'],
    ['gemini-2.5-flash-lite-preview-09-2025', 'Gemini 2.5 Flash-Lite Preview'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash (균형)'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro (비쌈/고지능)'],
    ['gemini-3-flash-preview', 'Gemini 3.0 Flash Preview'],
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview (비쌈)'],
    ['gemini-3.5-flash', 'Gemini 3.5 Flash'],
  ];

  const MODEL_PRICES = {
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
    'gemini-2.5-flash-lite-preview-09-2025': { input: 0.10, output: 0.40 },
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
    'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
    'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
    'gemini-3.5-flash': { input: 1.50, output: 9.00 },
  };

  GM_addStyle(`
    #crack-helper-btn{
      pointer-events:auto;
    }
    #crack-helper-btn span{
      font-size:14px;display:inline-block;transform:translate(-1px,1.5px);filter:grayscale(100%);pointer-events:none;
    }
    #crack-helper-panel{
      position:fixed;right:18px;bottom:148px;z-index:2147483601;width:380px;max-width:90vw;
      max-height:78vh;overflow:auto;background:#F7F7F5;color:#1A1918;border:1px solid #C7C5BD;
      border-radius:10px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:none;
    }
    #crack-helper-panel *{box-sizing:border-box}
    .ch-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-weight:800}
    .ch-close{cursor:pointer;font-size:14px}
    .ch-label{display:block;margin:10px 0 4px;font-size:12px;font-weight:800;color:#555}
    .ch-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .ch-action-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
    .ch-action-row .ch-btn{width:100%;white-space:nowrap;padding-left:4px;padding-right:4px;text-align:center}
    .ch-input,.ch-select,.ch-textarea{
      width:100%;border:1px solid #C7C5BD;border-radius:6px;background:#fff;color:#111;
      padding:8px;font-size:13px;
    }
    .ch-textarea{resize:vertical;min-height:74px}
    .ch-small{font-size:11px;color:#777;line-height:1.35}
    .ch-chip{
      border:1px solid #C7C5BD;background:#fff;border-radius:999px;padding:5px 9px;font-size:12px;
      cursor:pointer;user-select:none;
    }
    .ch-chip.active{background:#6A3DE8;color:#fff;border-color:#6A3DE8;font-weight:800}
    .ch-btn{
      border:0;border-radius:6px;padding:10px 9px;color:#fff;font-weight:800;cursor:pointer;font-size:12px;
      background:#6A3DE8;
    }
    .ch-btn.gray{background:#555}
    .ch-btn.red{background:#FF4432}
    .ch-btn.orange{background:#FF8C00}
    .ch-btn:disabled{opacity:.55;cursor:not-allowed}
    .ch-section{
      margin-top:10px;padding:10px;border:1px solid #E5E5E1;border-radius:8px;background:#fff;
    }
    .ch-acc{margin-top:10px;background:#EDECEA;border-radius:6px;padding:8px;font-weight:800;font-size:12px;cursor:pointer}
    .ch-acc-body{display:none;margin-top:6px}
    .ch-acc-body.open{display:block}
    .ch-slot-name{margin:4px 0 4px 0}
    #ch-status{min-height:18px;margin-top:8px;text-align:center;font-size:12px;color:#555;word-break:break-word}
  `);

  const btn = document.createElement('button');
  btn.id = 'crack-helper-btn';
  btn.textContent = '💬';
  
  function isChatRoomPage() {
    return /\/stories\/[^/]+\/episodes\/[^/]+/.test(location.pathname);
  }
  
  function isVisibleEl(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function findBottomInput() {
    const nodes = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], div[role="textbox"]')]
      .filter(el => {
        if (!isVisibleEl(el)) return false;
        if (panel?.contains(el)) return false;
        if (el.id?.startsWith('ch-')) return false;
        if (el.closest('#crack-helper-panel')) return false;
        const r = el.getBoundingClientRect();
        return r.bottom > window.innerHeight * 0.35;
      });

    nodes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return nodes[0] || null;
  }

  function findToolbarNearInput(input) {
    if (!input) return null;

    const inputRect = input.getBoundingClientRect();
    let root = input;
    for (let i = 0; i < 8 && root.parentElement; i++) {
      root = root.parentElement;
      const rr = root.getBoundingClientRect();
      if (!isVisibleEl(root)) continue;
      if (rr.bottom < window.innerHeight * 0.35) continue;

      const exact = root.querySelector('.flex.items-center.space-x-2');
      if (exact && isVisibleEl(exact)) return exact;

      const candidates = [...root.querySelectorAll('div, section, footer')]
        .filter(el => {
          if (!isVisibleEl(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.height > 80 || r.width < 40) return false;
          if (Math.abs(r.bottom - inputRect.bottom) > 140 && r.top < inputRect.bottom - 180) return false;
          const buttons = [...el.querySelectorAll('button')].filter(isVisibleEl);
          if (!buttons.length) return false;
          const cls = el.className ? String(el.className) : '';
          return buttons.length >= 1 && (/flex|items-center|gap|space-x/.test(cls) || buttons.length >= 2);
        });

      if (candidates.length) {
        candidates.sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return Math.abs(ar.bottom - inputRect.bottom) - Math.abs(br.bottom - inputRect.bottom);
        });
        return candidates[0];
      }
    }

    return null;
  }

  function injectHelperButton() {
    if (!isChatRoomPage()) {
      if (btn.parentElement) btn.remove();
      if (panel.style.display !== 'none') panel.style.display = 'none';
      return;
    }

    if (btn.parentElement && btn.isConnected && isVisibleEl(btn.parentElement)) return;
    if (btn.parentElement) btn.remove();

    let btnContainer = null;
    let referenceNode = null;

    const customRpTools = document.getElementById('custom-rp-tools');
    if (customRpTools && isVisibleEl(customRpTools.parentElement)) {
      btnContainer = customRpTools.parentElement;
      referenceNode = customRpTools;
    } else {
      const buttons = Array.from(document.querySelectorAll('button')).filter(isVisibleEl);
      const recommendBtn = buttons.find(b => b.textContent && b.textContent.includes('추천답변'));
      if (recommendBtn) {
        btnContainer = recommendBtn.parentElement;
        referenceNode = recommendBtn;
      }
    }

    if (!btnContainer) {
      const input = findBottomInput();
      btnContainer = findToolbarNearInput(input);
      if (btnContainer) {
        const toolButtons = [...btnContainer.querySelectorAll('button')].filter(isVisibleEl);
        referenceNode = toolButtons.find(b => ['*', '/', '／'].includes((b.textContent || '').trim())) || toolButtons[0] || null;
      }
    }

    if (!btnContainer) return;

    btn.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';
    btn.style.pointerEvents = 'auto';
    btn.style.width = '28px';
    btn.style.height = '28px';
    btn.style.minWidth = '28px';
    btn.style.borderRadius = '9999px';
    btn.title = '윤문헬퍼';
    btn.innerHTML = '<span>💬</span>';

    if (referenceNode && referenceNode.parentElement === btnContainer && referenceNode.nextSibling) {
      btnContainer.insertBefore(btn, referenceNode.nextSibling);
    } else if (referenceNode && referenceNode.parentElement === btnContainer) {
      btnContainer.appendChild(btn);
    } else {
      btnContainer.insertBefore(btn, btnContainer.firstChild);
    }
  }
  let profileHTML = '', loreHTML = '';
  for (let i = 1; i <= SLOT_COUNT; i++) {
    profileHTML += `
      <label class="ch-label"><input type="checkbox" id="ch-profile-on-${i}"> 프로필 ${i}</label>
      <input class="ch-input ch-slot-name" id="ch-profile-name-${i}" placeholder="프로필 이름 예: 레나 / 루 / 마고">
      <textarea class="ch-textarea" id="ch-profile-${i}" rows="2" placeholder="내 페르소나 정보/말투/금지사항"></textarea>
    `;
    loreHTML += `
      <label class="ch-label"><input type="checkbox" id="ch-lore-on-${i}"> 세계관 ${i}</label>
      <input class="ch-input ch-slot-name" id="ch-lore-name-${i}" placeholder="세계관 이름 예: THEMIS / 샌브렌트 / 마피아AU">
      <textarea class="ch-textarea" id="ch-lore-${i}" rows="2" placeholder="세계관/관계/용어/절대규칙"></textarea>
    `;
  }

  const panel = document.createElement('div');
  panel.id = 'crack-helper-panel';
  panel.innerHTML = `
    <div class="ch-head">
      <span>크랙 대사&묘사 헬퍼</span>
      <span class="ch-close" id="ch-close">✕</span>
    </div>

    <div class="ch-small">
      채팅창에 쓴 내용 + 최근 대화 맥락을 읽어와서 변환함. 결과는 아래 미리보기에서 수정 가능. “채팅창으로 보내기”는 입력창 내용만 대체하고 전송하지 않음.
    </div>

    <label class="ch-label">작업 대상</label>
    <div class="ch-row">
      <span class="ch-chip active" data-work="all">전체</span>
      <span class="ch-chip" data-work="dialogue">“대사”만</span>
      <span class="ch-chip" data-work="narration">*묘사*만</span>
      <span class="ch-chip" data-work="polish">전체 윤문</span>
    </div>

    <label class="ch-label">대사 처리</label>
    <select id="ch-dialogue-mode" class="ch-select">
      <option value="translate_both">페르소나 말투 번역/의역 + 한국어병기</option>
      <option value="translate_only">페르소나 말투 번역/의역만</option>
      <option value="fix_same_lang">원문 언어 유지, 문법/말투만 정리</option>
      <option value="keep">대사 건드리지 않음</option>
    </select>

    <label class="ch-label">번역 언어</label>
    <select id="ch-lang" class="ch-select"></select>

    <label class="ch-label">묘사 처리</label>
    <select id="ch-narration-mode" class="ch-select">
      <option value="enrich">내가 쓴 행동/상황만 기반으로 감각적·세련되게 확장</option>
      <option value="polish">내용 추가 거의 없이 문장만 윤문</option>
      <option value="keep">묘사 건드리지 않음</option>
    </select>

    <label class="ch-label">분위기/문체</label>
    <div class="ch-row" id="ch-tone-wrap">
      <span class="ch-chip active" data-tone="한국 현대문학풍의 섬세하고 절제된 감각문">📖 현대문학</span>
      <span class="ch-chip active" data-tone="퇴폐적이고 섹시한">💋 퇴폐/섹시</span>
      <span class="ch-chip" data-tone="하이틴스럽고 발랄한">🎀 하이틴</span>
      <span class="ch-chip" data-tone="귀엽고 장난스럽고 센스있는 티키타카와 생활개그, MZ식 가벼운 현대유머가 자연스럽게 섞인">😏 위트</span>
      <span class="ch-chip" data-tone="전투·액션·이능력을 화려하고 멋지게 강조한">💥 액션</span>
      <span class="ch-chip" data-tone="건조하고 시니컬한">🖤 시니컬</span>
      <span class="ch-chip" data-tone="서정적이고 감각적인">✨ 서정/감각</span>
      <span class="ch-chip" data-tone="거칠고 직설적인">🔥 직설/거침</span>
    </div>
    
    <label class="ch-label">대사 스타일</label>
    <div class="ch-row" id="ch-speech-wrap">
      <span class="ch-chip active" data-speech="flirty sexy confident">💋 핫걸/플러팅</span>
      <span class="ch-chip active" data-speech="bratty teasing playful">🖤 능청/브랫</span>
      <span class="ch-chip" data-speech="slangy modern witty">🤣 MZ/슬랭</span>
      <span class="ch-chip" data-speech="sweet clingy affectionate loverlike">💕 연인/애교</span>
      <span class="ch-chip" data-speech="natural casual native">💬 자연/원어민</span>
      <span class="ch-chip" data-speech="innocent pure soft">🐰 순진/순수</span>
      <span class="ch-chip" data-speech="elegant refined classy">🥂 우아/고상</span>
      <span class="ch-chip" data-speech="dry cynical cold">🙄 시니컬/냉정</span>
      <span class="ch-chip" data-speech="kind warm gentle">🤍 다정/친절</span>
    </div>

    <label class="ch-label">🥷 스텔스 유도</label>
    <textarea id="ch-stealth" class="ch-textarea" rows="2" placeholder="예: 자연스럽게 대학교 캠퍼스에 가게 만들기 / 상대가 먼저 데이트를 제안하게 유도"></textarea>
    <div class="ch-small">
      직접 말하지 않고, 내 페르소나의 행동·묘사·대사 뉘앙스 안에 자연스러운 떡밥으로만 숨김.
    </div>

    <label class="ch-label">원문</label>
    <textarea id="ch-source" class="ch-textarea" rows="5" placeholder="버튼을 누르면 현재 채팅창 내용이 들어옴. 직접 수정해도 됨."></textarea>

    <div class="ch-action-row">
      <button class="ch-btn gray" id="ch-load">채팅창 읽기</button>
      <button class="ch-btn" id="ch-run">실행</button>
      <button class="ch-btn orange" id="ch-reroll">리롤</button>
    </div>

    <div id="ch-status"></div><div class="ch-small" id="ch-cost" style="text-align:center;margin-top:4px">비용: 아직 없음</div>

    <label class="ch-label">미리보기 / 편집 가능</label>
    <textarea id="ch-result" class="ch-textarea" rows="8" placeholder="결과가 여기에 표시됨"></textarea>

    <button class="ch-btn red" id="ch-apply" style="width:100%;margin-top:8px">채팅창으로 보내기 / 전송 안 함</button>

    <div class="ch-acc" data-target="ch-settings">▶ ⚙️ 설정 / 프로필 / 세계관 / API</div>
    <div id="ch-settings" class="ch-acc-body">
      <div class="ch-section">
        <label class="ch-label">📝 최근 대화 맥락 읽기</label>
        <div class="ch-small">많이 읽을수록 비용 오름. 0~2 권장.</div>
        <input type="range" id="ch-memory" min="0" max="6" value="2" style="width:100%;margin-top:8px">
        <div class="ch-small" style="text-align:center">현재 <b id="ch-memory-val">2</b>개 읽음</div>

        <label class="ch-label">Gemini API Key</label>
        <input id="ch-api" class="ch-input" placeholder="Google AI Studio API Key">

        <label class="ch-label">Gemini 모델</label>
        <select id="ch-model" class="ch-select"></select><div class="ch-small" id="ch-model-cost"></div>
      </div>

      <div class="ch-acc" data-target="ch-profile-box">▶ 👤 프로필</div>
      <div id="ch-profile-box" class="ch-acc-body">
        <div class="ch-section">${profileHTML}</div>
      </div>

      <div class="ch-acc" data-target="ch-lore-box">▶ 🌍 세계관</div>
      <div id="ch-lore-box" class="ch-acc-body">
        <div class="ch-section">${loreHTML}</div>
      </div>

      <button class="ch-btn" id="ch-save" style="width:100%;margin-top:8px">설정 저장</button>
    </div>
  `;
  document.body.appendChild(panel);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const langSel = $('#ch-lang');
  LANGS.forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    langSel.appendChild(o);
  });

  const modelSel = $('#ch-model');
  GEMINI_MODELS.forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    modelSel.appendChild(o);
  });

  $('#ch-api').value = GM_getValue('ch_api', '');
  modelSel.value = GM_getValue('ch_model', DEFAULT_MODEL);
  langSel.value = GM_getValue('ch_lang', 'en');
  $('#ch-dialogue-mode').value = GM_getValue('ch_dialogue_mode', 'translate_both');
  $('#ch-narration-mode').value = GM_getValue('ch_narration_mode', 'enrich');

  const savedMemory = GM_getValue('ch_memory', 2);
  $('#ch-memory').value = savedMemory;
  $('#ch-memory-val').textContent = savedMemory;
  $('#ch-memory').addEventListener('input', () => {
    $('#ch-memory-val').textContent = $('#ch-memory').value;
  });

  for (let i = 1; i <= SLOT_COUNT; i++) {
    $(`#ch-profile-on-${i}`).checked = GM_getValue(`ch_profile_on_${i}`, false);
    $(`#ch-profile-name-${i}`).value = GM_getValue(`ch_profile_name_${i}`, '');
    $(`#ch-profile-${i}`).value = GM_getValue(`ch_profile_${i}`, '');

    $(`#ch-lore-on-${i}`).checked = GM_getValue(`ch_lore_on_${i}`, false);
    $(`#ch-lore-name-${i}`).value = GM_getValue(`ch_lore_name_${i}`, '');
    $(`#ch-lore-${i}`).value = GM_getValue(`ch_lore_${i}`, '');
  }

  function setStatus(msg, color = '#555') {
    $('#ch-status').textContent = msg;
    $('#ch-status').style.color = color;
  }

  function getActiveWork() {
    return $('.ch-chip[data-work].active')?.dataset.work || 'all';
  }

  function getActiveTones() {
    return $$('.ch-chip[data-tone].active').map(x => x.dataset.tone).join(', ');
  }
  
  function getActiveSpeech() {
    return $$('.ch-chip[data-speech].active')
      .map(x => x.dataset.speech)
      .join(', ');
  }
  function compactText(text, max = 260) {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function getProfiles() {
    const arr = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const on = $(`#ch-profile-on-${i}`).checked;
      const name = compactText($(`#ch-profile-name-${i}`).value, 24) || `프로필 ${i}`;
      const txt = compactText($(`#ch-profile-${i}`).value, 220);
      if (on && txt) arr.push(`${name}: ${txt}`);
    }
    return arr.join('\n');
  }

  function getLores() {
    const arr = [];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      const on = $(`#ch-lore-on-${i}`).checked;
      const name = compactText($(`#ch-lore-name-${i}`).value, 24) || `세계관 ${i}`;
      const txt = compactText($(`#ch-lore-${i}`).value, 220);
      if (on && txt) arr.push(`${name}: ${txt}`);
    }
    return arr.join('\n');
  }

  function getBillableOutputTokens(usage = {}) {
    const candidates = usage.candidatesTokenCount || 0;
    const thoughts = usage.thoughtsTokenCount || 0;
    const prompt = usage.promptTokenCount || 0;
    const total = usage.totalTokenCount || 0;
    const outputByTotal = Math.max(0, total - prompt);
    const outputWithThinking = candidates + thoughts;
    return Math.max(outputWithThinking, outputByTotal, candidates, thoughts);
  }

  function estimateCostKrw(model, inputTokens = 0, outputTokens = 0) {
    const price = MODEL_PRICES[model] || MODEL_PRICES[DEFAULT_MODEL];
    const usd = ((inputTokens * price.input) + (outputTokens * price.output)) / 1000000;
    return usd * EXCHANGE_RATE_KRW;
  }

  function estimateCostFromUsageKrw(model, usage = {}) {
    return estimateCostKrw(
      model,
      usage.promptTokenCount || 0,
      getBillableOutputTokens(usage)
    );
  }

  function getTotalCostKrw() {
    return Number(GM_getValue('ch_total_cost_krw', 0)) || 0;
  }

  function formatKrw(n) {
    return `${n.toFixed(2)}원`;
  }

  function setCostDisplay(lastCost = null, usage = null) {
    const total = getTotalCostKrw();
    const usageText = usage
      ? ` / 입력 ${usage.promptTokenCount || 0}, 출력 ${usage.candidatesTokenCount || 0}, 생각 ${usage.thoughtsTokenCount || 0}, 과금출력 ${getBillableOutputTokens(usage)}, 총 ${usage.totalTokenCount || 0}토큰`
      : '';
    $('#ch-cost').textContent = lastCost === null
      ? `비용: 누적 ${formatKrw(total)}`
      : `비용: 1회 ${formatKrw(lastCost)} / 누적 ${formatKrw(total)}${usageText}`;
  }

  function updateModelCostHint() {
    const model = $('#ch-model').value || DEFAULT_MODEL;
    const sample = estimateCostKrw(model, 1200, 500);
    $('#ch-model-cost').textContent = `예상: 입력 1200 + 과금출력 500토큰 기준 약 ${formatKrw(sample)} / 환율 ${EXCHANGE_RATE_KRW}원`;
  }

  function buildHeaders() {
    const token = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('access_token='))
      ?.slice(13) || null;

    const wrtnId = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('__w_id='))
      ?.slice(7) || '';

    const h = {
      'Content-Type': 'application/json',
      'platform': 'web',
      'wrtn-locale': 'ko-KR'
    };

    if (token) h.Authorization = `Bearer ${token}`;
    if (wrtnId) h['x-wrtn-id'] = wrtnId;
    return h;
  }

  function parsePath() {
    const m = location.pathname.match(/\/stories\/([^/]+)\/episodes\/([^/]+)/);
    return m ? { storyId: m[1], chatId: m[2] } : null;
  }

  async function fetchChatHistory(chatId, limitStr) {
    try {
      const limit = Math.max(0, Math.min(parseInt(limitStr, 10) || 0, 6));
      if (limit === 0) return '(최근 대화 맥락 없음)';
      const res = await fetch(`${API_BASE}/v3/chats/${chatId}/messages?limit=${limit}`, {
        headers: buildHeaders(),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`history ${res.status}`);

      const json = await res.json();
      const msgs = (json.data ?? json).messages ?? [];

      return msgs
        .slice(0, limit)
        .reverse()
        .map(m => {
          const role = m.role === 'assistant' ? '상대/AI' : '나/사용자';
          const content = typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);
          return `[${role}]: ${compactText(content, 320)}`;
        })
        .join('\n\n') || '(최근 대화 없음)';
    } catch (e) {
      return '(최근 대화 맥락을 불러오지 못함)';
    }
  }

    function findChatInput() {
    const candidates = [
      ...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')
    ].filter(el => {
      if (!isVisible(el)) return false;
      if (panel.contains(el)) return false;
      if (el.id?.startsWith('ch-')) return false;
      if (el.closest('#crack-helper-panel')) return false;

      const text = (el.placeholder || el.getAttribute('aria-label') || '').toLowerCase();
      const rect = el.getBoundingClientRect();

      return rect.top > window.innerHeight * 0.35
        || text.includes('메시지')
        || text.includes('입력');
    });

    return candidates[candidates.length - 1] || null;
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getInputText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  function setInputText(el, text) {
    if (!el) return false;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
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

  function loadChatInput() {
    const input = findChatInput();
    if (!input) {
      setStatus('❌ 채팅 입력창을 못 찾음. 원문 칸에 직접 붙여넣으면 실행 가능.', 'red');
      return;
    }
    $('#ch-source').value = getInputText(input);
    setStatus('채팅창 내용을 읽어왔음.', 'green');
  }

  function stripFence(s) {
    return (s || '').replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/m, '$1').trim();
  }

  function callGemini(prompt) {
    return new Promise((resolve, reject) => {
      const apiKey = $('#ch-api').value.trim();
      const model = $('#ch-model').value || DEFAULT_MODEL;

      if (!apiKey) {
        reject(new Error('Gemini API Key를 설정에 입력해야 함.'));
        return;
      }

      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.55,
            topP: 0.85,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
          }
        }),
        onload(res) {
          try {
            console.log('Gemini status:', res.status);

            let data;
            try {
              data = JSON.parse(res.responseText);
            } catch (e) {
              throw new Error(`Gemini 응답 JSON 파싱 실패 / HTTP ${res.status}`);
            }

            if (data.error) {
              throw new Error(`Gemini API 오류: ${data.error.message || JSON.stringify(data.error)}`);
            }

            if (data.promptFeedback?.blockReason) {
              throw new Error(
                `프롬프트 차단됨: ${data.promptFeedback.blockReason}\n` +
                `${JSON.stringify(data.promptFeedback.safetyRatings || [], null, 2)}`
              );
            }
 
            const candidate = data.candidates?.[0];

            if (!candidate) {
              throw new Error(
                `candidate 없음. 보통 프롬프트 차단/모델명 문제/응답 생성 실패임.\n` +
                `raw: ${JSON.stringify(data).slice(0, 800)}`
              );
            }

            if (candidate.finishReason && candidate.finishReason !== 'STOP') {
              throw new Error(
                `생성 중단됨: ${candidate.finishReason}\n` +
                `${JSON.stringify(candidate.safetyRatings || [], null, 2)}`
              );
            }

            const parts = candidate.content?.parts || [];
            const text = parts.map(p => p.text || '').join('\n').trim();

            if (!text) {
              throw new Error(
                `빈 응답. finishReason=${candidate.finishReason || 'UNKNOWN'}\n` +
                `raw: ${JSON.stringify(data).slice(0, 800)}`
              );
            }

            const usage = data.usageMetadata || {};
            const costKrw = estimateCostFromUsageKrw(model, usage);
            GM_setValue('ch_total_cost_krw', getTotalCostKrw() + costKrw);
            resolve({ text: stripFence(text), usage, costKrw });
          } catch (e) {
            reject(e);
          }
        },
        onerror() {
          reject(new Error('네트워크 오류'));
        }
      });
    });
  }
  function buildPrompt(source, chatHistory) {
    const work = getActiveWork();
    const dialogueMode = $('#ch-dialogue-mode').value;
    const narrationMode = $('#ch-narration-mode').value;
    const langText = $('#ch-lang').selectedOptions[0].textContent;
    const tones = getActiveTones() || '기본';
    const speech = getActiveSpeech() || 'natural';
    const profiles = getProfiles();
    const lores = getLores();
    const stealth = compactText($('#ch-stealth').value, 180);

    return `
RP 문장 변환. 결과 본문만 출력. 설명/OOC/HUD/메타 금지.

작업=${work}
대사=${dialogueMode}, 목표언어=${langText}
묘사=${narrationMode}
문체=${tones}
대사스타일=${speech}
프로필=${profiles || '없음'}
세계관=${lores || '없음'}
최근맥락=${chatHistory}

규칙:
- 원문 형식(*묘사*, "대사", 줄바꿈) 유지.
- "대사"는 문맥 참고 자연스러운 의역 우선. 번역투 금지.
- 대사 형식: "의역된 대사" *(한국어 의미문)*
- *묘사*는 한국어로 윤문/보강. 없는 사건, 감정, 결과 추가 금지.
- 관계/호칭/상황은 최근맥락 참고만.
- 반복 표현, 같은 비유, 같은 문장 구조 줄이기.
${stealth ? `- 스텔스 목표: ${stealth}. 직접 지시 말고 뉘앙스로만 유도.` : ''}

원문:
${source}
`.trim();
  }

  async function runAI() {
    const source = $('#ch-source').value.trim();
    if (!source) {
      setStatus('❌ 원문이 비어 있음.', 'red');
      return;
    }

    $('#ch-run').disabled = true;
    $('#ch-reroll').disabled = true;

    try {
      let historyStr = '(최근 대화 맥락 없음)';
      const pathInfo = parsePath();

      if (pathInfo?.chatId) {
        setStatus('🔍 최근 대화 맥락 읽는 중...');
        historyStr = await fetchChatHistory(pathInfo.chatId, $('#ch-memory').value);
      } else {
        setStatus('⚠️ 채팅방 ID를 못 찾아서 맥락 없이 처리함.', 'orange');
      }

      setStatus('Gemini 처리 중...');
      const result = await callGemini(buildPrompt(source, historyStr));
      $('#ch-result').value = result.text;
      setCostDisplay(result.costKrw, result.usage);
      setStatus('완료. 비용 계산까지 반영됨.', 'green');
    } catch (e) {
      setStatus(`❌ ${e.message}`, 'red');
    } finally {
      $('#ch-run').disabled = false;
      $('#ch-reroll').disabled = false;
    }
  }

  function saveSettings() {
    GM_setValue('ch_api', $('#ch-api').value.trim());
    GM_setValue('ch_model', $('#ch-model').value || DEFAULT_MODEL);
    GM_setValue('ch_lang', $('#ch-lang').value);
    GM_setValue('ch_dialogue_mode', $('#ch-dialogue-mode').value);
    GM_setValue('ch_narration_mode', $('#ch-narration-mode').value);
    GM_setValue('ch_memory', $('#ch-memory').value);

    for (let i = 1; i <= SLOT_COUNT; i++) {
      GM_setValue(`ch_profile_on_${i}`, $(`#ch-profile-on-${i}`).checked);
      GM_setValue(`ch_profile_name_${i}`, $(`#ch-profile-name-${i}`).value.trim());
      GM_setValue(`ch_profile_${i}`, $(`#ch-profile-${i}`).value.trim());

      GM_setValue(`ch_lore_on_${i}`, $(`#ch-lore-on-${i}`).checked);
      GM_setValue(`ch_lore_name_${i}`, $(`#ch-lore-name-${i}`).value.trim());
      GM_setValue(`ch_lore_${i}`, $(`#ch-lore-${i}`).value.trim());
    }

    updateModelCostHint();
    setCostDisplay();
    setStatus('설정 저장 완료.', 'green');
  }

  $$('.ch-chip[data-work]').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.ch-chip[data-work]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  $$('.ch-chip[data-tone]').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
  
  $$('.ch-chip[data-speech]').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });

  $$('.ch-acc').forEach(acc => {
    acc.addEventListener('click', () => {
      const body = document.getElementById(acc.dataset.target);
      body.classList.toggle('open');
      acc.textContent = body.classList.contains('open')
        ? acc.textContent.replace('▶', '▼')
        : acc.textContent.replace('▼', '▶');
    });
  });

  $('#ch-close').addEventListener('click', () => panel.style.display = 'none');
  $('#ch-load').addEventListener('click', loadChatInput);
  $('#ch-run').addEventListener('click', runAI);
  $('#ch-reroll').addEventListener('click', runAI);
    $('#ch-save').addEventListener('click', saveSettings);
  $('#ch-model').addEventListener('change', updateModelCostHint);
  updateModelCostHint();
  setCostDisplay();
  $('#ch-apply').addEventListener('click', () => {
    const text = $('#ch-result').value.trim();
    if (!text) {
      setStatus('❌ 보낼 결과가 없음.', 'red');
      return;
    }

    const input = findChatInput();
    if (!input) {
      navigator.clipboard?.writeText(text).catch(() => {});
      setStatus('❌ 입력창을 못 찾아서 클립보드에 복사함.', 'red');
      return;
    }

    setInputText(input, text);
    setStatus('채팅창 내용 대체 완료. 전송은 안 했음.', 'blue');
    panel.style.display = 'none';
  });

  function toggleHelperPanel(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';

    if (panel.style.display === 'block') {
      loadChatInput();
    }
  }

  btn.addEventListener('click', toggleHelperPanel, true);
  btn.addEventListener('mousedown', (e) => { e.stopPropagation(); }, true);
  btn.addEventListener('touchstart', toggleHelperPanel, { passive: false, capture: true });

  let helperInjectTimer = null;

  function scheduleHelperInject() {
    clearTimeout(helperInjectTimer);
    helperInjectTimer = setTimeout(injectHelperButton, 150);
  }

  injectHelperButton();

  const helperObserver = new MutationObserver(scheduleHelperInject);

  helperObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  setInterval(injectHelperButton, 1500);
  
  
})();













