// ==UserScript==
// @name         크랙 개인 요약 메모리 편집 & AI 자동 요약 추가
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      2.0.0
// @description  20턴 AI 장기기억 요약, 자동 장기기억 정리, 51→10 재요약, 편집 및 백업 통합 관리자
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-memory-manager-v2/Crack_Personal_AI_Summary.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-memory-manager-v2/Crack_Personal_AI_Summary.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '2.0.0';
  const API_BASE = 'https://crack-api.wrtn.ai/crack-gen/v3/chats';
  const STORAGE_KEY = 'shipidle:crack-memory-manager:v2';
  const CONFIG_KEY = `${STORAGE_KEY}:config`;
  const STATE_KEY = `${STORAGE_KEY}:state`;
  const BACKUP_KEY = `${STORAGE_KEY}:backups`;
  const LOCK_PREFIX = `${STORAGE_KEY}:lock:`;
  const AUTO_TURN_COUNT = 20;
  const AUTO_CHECK_MS = 60_000;
  const LOCK_TTL_MS = 10 * 60_000;
  const MAX_SUMMARY_LENGTH = 300;
  const MAX_TITLE_LENGTH = 20;
  const MAX_BACKUPS_PER_CHAT = 5;
  const KRW_PER_USD = 1500;

  const MODEL_OPTIONS = [
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
    ['gemini-3-flash-preview', 'Gemini 3 Flash Preview'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ];

  const MODEL_PRICES = {
    'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
    'gemini-3-flash-preview': { input: 0.5, output: 3 },
    'gemini-3.1-pro-preview': { input: 2, output: 12 },
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
  };

  const SUMMARY_SYSTEM_PROMPT = `당신은 캐릭터 채팅의 장기기억을 만드는 기록자입니다.
입력은 시간순으로 정렬된 정확히 20회의 유저-캐릭터 왕복 대화입니다.

[목표]
- 전체 흐름을 2~3개의 독립 사건으로 요약합니다.
- AI의 recall을 위해 사건, 관계 변화, 약속, 갈등, 핵심 대사, 고유명사, 물건, 장소와 현재 상태를 구체적으로 보존합니다.
- 로그에 없는 의도나 사실은 만들지 않습니다.
- 반복 일상은 구체적인 취향·약속·행동만 남기고, 장시간 성적 상황은 장소와 관계 변화 중심으로 압축합니다.

[형식]
- JSON 배열만 출력합니다. 각 원소는 title, summary 문자열을 가집니다.
- title: 공백 포함 20자 이하. 유저명은 제외하고 NPC명과 검색 가능한 핵심 사건어를 넣습니다. 대괄호와 번호는 넣지 않습니다.
- summary: 공백과 줄바꿈 포함 300자 이하, 권장 200~290자입니다.
- summary 첫 줄은 MM/DD 시간대 형식의 날짜이고 다음 줄은 "- "로 시작합니다.
- 요약체(~함, ~임) 또는 명사형으로 끝냅니다.
- 대명사 대신 정확한 이름을 사용합니다.
- 입력 순서를 지키고 뒤 사건 정보를 앞 사건에 섞지 않습니다.
- 제목과 내용 제한을 넘기면 실패입니다.`;

  const COMPACT_SYSTEM_PROMPT = `당신은 캐릭터 채팅의 기존 장기기억을 재정리하는 기록자입니다.
입력된 모든 장기기억을 시간순으로 통합하여 정확히 10개로 줄입니다.

[우선순위]
1. 사건과 인과관계
2. 인물 관계 변화, 감정선, 약속, 갈등, 비밀
3. 이름, 장소, 물건, 설정, 현재 상태
4. 반복되는 일상은 구체적 취향과 합의만 보존
5. 장시간 성적 상황은 장소, 상대, 관계 변화 정도로 압축

[형식]
- JSON 배열만 출력하며 정확히 10개여야 합니다.
- 각 원소는 title, summary 문자열을 가집니다.
- title은 "숫자. 제목" 형식이며 번호 포함 공백 기준 10~20자입니다.
- summary는 공백과 줄바꿈 포함 200~300자입니다.
- summary 첫 줄은 가능한 가장 대표적인 MM/DD 시간대이며 다음 줄은 "- "로 시작합니다.
- 요약체(~함, ~임) 또는 명사형으로 끝냅니다.
- 중복을 제거하되 중요한 사실을 누락하지 않습니다.
- 로그에 없는 사실과 해석을 만들지 않습니다.
- 입력에 번호가 있어도 새 번호 1~10으로 다시 작성합니다.`;

  const NORMAL_SCHEMA = {
    type: 'ARRAY', minItems: 2, maxItems: 3,
    items: {
      type: 'OBJECT',
      properties: { title: { type: 'STRING' }, summary: { type: 'STRING' } },
      required: ['title', 'summary'],
    },
  };

  const COMPACT_SCHEMA = {
    type: 'ARRAY', minItems: 10, maxItems: 10,
    items: {
      type: 'OBJECT',
      properties: { title: { type: 'STRING' }, summary: { type: 'STRING' } },
      required: ['title', 'summary'],
    },
  };

  const defaultConfig = {
    autoEnabled: true,
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    apiKey: '',
    firebaseScript: '',
    extraPrompt: '',
  };

  const storedConfig = loadJson(CONFIG_KEY, null);
  let config = storedConfig ? { ...defaultConfig, ...storedConfig } : migrateLegacyConfig();
  let states = loadJson(STATE_KEY, {});
  let panel = null;
  let activeTab = 'overview';
  let busy = false;
  let latestStatus = '준비됨.';
  let latestStatusTone = '';
  let dashboard = { progress: 0, userCount: 0, autoCount: 0, shortCount: 0 };
  let editorOriginal = [];
  let editorLoaded = false;
  const ownerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  window.__SHIPIDLE_MEMORY_MANAGER_V2__ = true;

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function migrateLegacyConfig() {
    const oldModel = localStorage.getItem('shipidle_crack_summary_gemini_model') || '';
    const validModel = MODEL_OPTIONS.some(([id]) => id === oldModel) ? oldModel : 'gemini-3.1-flash-lite';
    const next = {
      ...defaultConfig,
      provider: localStorage.getItem('shipidle_crack_summary_api_provider') || 'google',
      model: validModel,
      apiKey: localStorage.getItem('shipidle_crack_summary_gemini_key') || '',
      firebaseScript: localStorage.getItem('shipidle_crack_summary_firebase_script') || '',
    };
    saveJson(CONFIG_KEY, next);
    return next;
  }

  function stateFor(chatId) {
    if (!states[chatId]) {
      states[chatId] = {
        baselineTurnId: '',
        progress: 0,
        lastCostKrw: 0,
        totalCostKrw: 0,
        cleanupApproved: false,
        compactionApproved: false,
        pendingBatch: null,
        pendingCompaction: null,
        compactionTxn: null,
        lastRunAt: 0,
      };
      persistStates();
    }
    return states[chatId];
  }

  function persistConfig() {
    saveJson(CONFIG_KEY, config);
  }

  function persistStates() {
    saveJson(STATE_KEY, states);
  }

  function getChatId() {
    const patterns = [
      /\/episodes\/([a-f0-9]+)/i,
      /\/chats\/([a-f0-9]+)/i,
      /\/c\/([a-f0-9]+)/i,
    ];
    for (const pattern of patterns) {
      const match = location.pathname.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function getAccessToken() {
    const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function charCount(value) {
    return String(value || '').length;
  }

  function formatWon(value) {
    return Number(value || 0).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function shortError(error) {
    const raw = String(error?.message || error || '알 수 없는 오류').replace(/\s+/g, ' ').trim();
    if (/401|403|unauthor|forbidden/i.test(raw)) return '인증이 만료됐거나 해당 작업 권한이 없음.';
    if (/fetch|network|timeout/i.test(raw)) return '네트워크 요청 실패.';
    return raw.slice(0, 280);
  }

  function setStatus(message, tone = '') {
    latestStatus = message;
    latestStatusTone = tone;
    const el = panel?.querySelector('#cmm-status');
    if (el) {
      el.textContent = message;
      el.className = `cmm-status ${tone}`.trim();
    }
  }

  function showToast(message, tone = '') {
    document.getElementById('cmm-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'cmm-toast';
    toast.className = tone;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 4200);
  }

  async function apiRequest(method, path, body) {
    const chatId = getChatId();
    const token = getAccessToken();
    if (!chatId || !token) throw new Error('채팅 ID 또는 로그인 토큰을 찾을 수 없음.');
    const response = await fetch(`${API_BASE}/${chatId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : { result: 'SUCCESS' }; } catch (_) { parsed = { raw: text }; }
    if (!response.ok) throw new Error(parsed?.message || parsed?.error || parsed?.raw || `HTTP ${response.status}`);
    return parsed;
  }

  async function fetchSummaries(type = 'longTerm') {
    const items = [];
    let cursor = '';
    let meta = { totalCount: 0, userCreatedCount: 0, isCreatable: true };
    for (let page = 0; page < 100; page += 1) {
      const params = new URLSearchParams({ limit: '20', type, orderBy: 'oldest', filter: 'all' });
      if (cursor) params.set('cursor', cursor);
      const response = await apiRequest('GET', `/summaries?${params}`);
      const data = response?.data || {};
      if (page === 0) {
        meta = {
          totalCount: Number(data.totalCount || 0),
          userCreatedCount: Number(data.userCreatedCount || 0),
          isCreatable: data.isCreatable !== false,
        };
      }
      const pageItems = Array.isArray(data.summaries) ? data.summaries : [];
      items.push(...pageItems);
      cursor = data.nextCursor || '';
      if (!cursor || pageItems.length === 0) break;
    }
    return { items, ...meta };
  }

  async function createSummary(item) {
    const before = await fetchSummaries('longTerm');
    const beforeIds = new Set(before.items.map(entry => entry._id));
    const response = await apiRequest('POST', '/summaries', {
      type: 'longTerm',
      title: item.title,
      summary: item.summary,
      orderBy: 'oldest',
    });
    const data = response?.data;
    const responseId = data?._id || data?.summary?._id || data?.id || '';
    if (responseId) return responseId;

    const after = await fetchSummaries('longTerm');
    const recovered = after.items.filter(entry => (
      entry.createdBy === 'user'
      && !beforeIds.has(entry._id)
      && entry.title === item.title
      && entry.summary === item.summary
    ));
    if (recovered.length === 1) return recovered[0]._id;
    throw new Error('저장은 성공했을 수 있으나 신규 장기기억 ID를 안전하게 식별하지 못함. 기존 항목은 삭제하지 않음.');
  }

  async function updateSummary(id, item) {
    return apiRequest('PATCH', `/summaries/${id}`, { title: item.title, summary: item.summary });
  }

  async function deleteAssistantSummary(snapshot) {
    if (!snapshot?._id || snapshot.createdBy !== 'assistant') {
      throw new Error('보호된 사용자 장기기억은 자동 삭제할 수 없음.');
    }
    return apiRequest('DELETE', `/summaries/${snapshot._id}`);
  }

  async function deleteTrackedUserSummary(id, allowedIds) {
    if (!id || !allowedIds.has(id)) throw new Error('추적되지 않은 사용자 장기기억 삭제 차단됨.');
    return apiRequest('DELETE', `/summaries/${id}`);
  }

  function isCompletedAssistant(message) {
    return message?.role === 'assistant'
      && message.status === 'end'
      && message.isPrologue !== true;
  }

  async function fetchMessagesForPairs(baselineTurnId = '', desiredPairs = AUTO_TURN_COUNT) {
    const all = [];
    let cursor = '';
    let foundBaseline = !baselineTurnId;
    for (let page = 0; page < 100; page += 1) {
      let path = '/messages?limit=50';
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
      const response = await apiRequest('GET', path);
      const data = response?.data || {};
      const pageItems = Array.isArray(data.messages) ? data.messages : [];
      all.push(...pageItems);
      if (baselineTurnId && all.some(item => item.turnId === baselineTurnId)) foundBaseline = true;
      const completedCount = new Set(
        all.filter(isCompletedAssistant).map(item => item.parentTurnId).filter(Boolean)
      ).size;
      if ((baselineTurnId && foundBaseline) || (!baselineTurnId && completedCount >= desiredPairs + 2)) break;
      if (!data.hasNext || !data.nextCursor || pageItems.length === 0) break;
      cursor = data.nextCursor;
    }

    let scope = all;
    if (baselineTurnId) {
      const baselineIndex = all.findIndex(item => item.turnId === baselineTurnId);
      if (baselineIndex < 0) return { pairs: [], baselineFound: false, all };
      scope = all.slice(0, baselineIndex);
    }

    const byTurnId = new Map(all.filter(item => item?.turnId).map(item => [item.turnId, item]));
    const seenParents = new Set();
    const pairsNewestFirst = scope
      .filter(isCompletedAssistant)
      .filter(assistant => {
        if (!assistant.parentTurnId || seenParents.has(assistant.parentTurnId)) return false;
        seenParents.add(assistant.parentTurnId);
        return true;
      })
      .map(assistant => ({ assistant, user: byTurnId.get(assistant.parentTurnId) }))
      .filter(pair => pair.user?.role === 'user' && pair.user.status === 'end');

    return { pairs: pairsNewestFirst.reverse(), baselineFound: foundBaseline, all };
  }

  function pairsToChatLog(pairs) {
    return pairs.map((pair, index) => (
      `[왕복 ${index + 1}]\nUser: ${pair.user.content}\n\nCharacter: ${pair.assistant.content}`
    )).join('\n\n---\n\n');
  }

  function parseFirebaseConfig(scriptText) {
    const text = String(scriptText || '');
    const match = text.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;?/);
    if (!match) throw new Error('Firebase 스크립트에서 firebaseConfig 객체를 찾을 수 없음.');
    try {
      return Function(`"use strict"; return (${match[1]});`)();
    } catch (_) {
      throw new Error('Firebase 설정 객체 형식이 올바르지 않음.');
    }
  }

  function responseTextFromGemini(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.map(part => part?.text || '').join('').trim();
  }

  function estimateUsage(promptText, outputText) {
    return {
      promptTokenCount: Math.ceil(String(promptText || '').length / 2.2),
      candidatesTokenCount: Math.ceil(String(outputText || '').length / 2.2),
      thoughtsTokenCount: 0,
      estimated: true,
    };
  }

  function calculateCost(usage, model) {
    const price = MODEL_PRICES[model] || MODEL_PRICES['gemini-3.1-flash-lite'];
    const inputTokens = Number(usage?.promptTokenCount || 0);
    const outputTokens = Number(usage?.candidatesTokenCount || 0) + Number(usage?.thoughtsTokenCount || 0);
    return ((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * KRW_PER_USD;
  }

  function recordCost(chatId, usage, promptText, outputText) {
    const state = stateFor(chatId);
    const normalizedUsage = usage?.totalTokenCount ? usage : estimateUsage(promptText, outputText);
    const cost = calculateCost(normalizedUsage, config.model);
    state.lastCostKrw = cost;
    state.totalCostKrw = Number(state.totalCostKrw || 0) + cost;
    persistStates();
    return cost;
  }

  async function callGoogle(systemPrompt, userPrompt, schema) {
    if (!config.apiKey) throw new Error('Google API Key를 설정해줘.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    const text = responseTextFromGemini(data);
    if (!text) throw new Error('Gemini가 빈 응답을 반환함.');
    return { text, usage: data.usageMetadata || null };
  }

  async function callFirebase(systemPrompt, userPrompt, schema) {
    if (!config.firebaseScript) throw new Error('Firebase Vertex AI 스크립트를 설정해줘.');
    const firebaseConfig = parseFirebaseConfig(config.firebaseScript);
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js');
    const { getAI, getGenerativeModel, VertexAIBackend, HarmBlockThreshold, HarmCategory } = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js');
    const appName = 'shipidle-crack-memory-manager';
    const app = getApps().find(item => item.name === appName) || initializeApp(firebaseConfig, appName);
    const ai = getAI(app, { backend: new VertexAIBackend('global') });
    const model = getGenerativeModel(ai, {
      model: config.model,
      systemInstruction: systemPrompt,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text().trim();
    if (!text) throw new Error('Firebase AI가 빈 응답을 반환함.');
    return { text, usage: response.usageMetadata || null };
  }

  async function callModel(chatId, systemPrompt, userPrompt, schema) {
    const combinedSystem = `${systemPrompt}${config.extraPrompt ? `\n\n[사용자 추가 지침]\n${config.extraPrompt}` : ''}`;
    const result = config.provider === 'firebase'
      ? await callFirebase(combinedSystem, userPrompt, schema)
      : await callGoogle(combinedSystem, userPrompt, schema);
    recordCost(chatId, result.usage, `${combinedSystem}\n${userPrompt}`, result.text);
    return result.text;
  }

  function parseJsonOutput(text) {
    const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('AI 응답이 배열이 아님.');
    return parsed.map(item => ({
      title: String(item?.title || '').trim(),
      summary: String(item?.summary || '').trim(),
    }));
  }

  function validateItems(items, mode = 'normal') {
    const errors = [];
    const expected = mode === 'compact' ? 10 : null;
    if (!Array.isArray(items)) return ['결과가 배열이 아님.'];
    if (expected !== null && items.length !== expected) errors.push(`항목 수 ${items.length}/10`);
    if (mode === 'normal' && (items.length < 2 || items.length > 3)) errors.push(`항목 수 ${items.length}/2~3`);
    items.forEach((item, index) => {
      const titleLength = charCount(item.title);
      const summaryLength = charCount(item.summary);
      if (!titleLength || titleLength > MAX_TITLE_LENGTH) errors.push(`${index + 1}번 제목 ${titleLength}/20자`);
      if (!summaryLength || summaryLength > MAX_SUMMARY_LENGTH) errors.push(`${index + 1}번 내용 ${summaryLength}/300자`);
      if (mode === 'compact' && titleLength < 10) errors.push(`${index + 1}번 제목 ${titleLength}/최소 10자`);
      if (mode === 'compact' && summaryLength < 200) errors.push(`${index + 1}번 내용 ${summaryLength}/최소 200자`);
      if (mode === 'compact' && !new RegExp(`^${index + 1}\\.`).test(item.title)) errors.push(`${index + 1}번 제목 번호 형식 오류`);
    });
    return errors;
  }

  async function generateValidatedItems(chatId, mode, sourceText) {
    const compact = mode === 'compact';
    const systemPrompt = compact ? COMPACT_SYSTEM_PROMPT : SUMMARY_SYSTEM_PROMPT;
    const schema = compact ? COMPACT_SCHEMA : NORMAL_SCHEMA;
    let prompt = compact
      ? `[기존 장기기억 시작]\n${sourceText}\n[기존 장기기억 끝]`
      : `[20턴 채팅 시작]\n${sourceText}\n[20턴 채팅 끝]`;
    let lastErrors = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        prompt += `\n\n[재작성 지시]\n직전 출력 오류: ${lastErrors.join(', ')}\n전체를 처음부터 다시 작성하고 글자 수를 직접 센 뒤 JSON 배열만 출력하세요.`;
      }
      const text = await callModel(chatId, systemPrompt, prompt, schema);
      let items;
      try { items = parseJsonOutput(text); } catch (error) {
        lastErrors = [shortError(error)];
        continue;
      }
      lastErrors = validateItems(items, mode);
      if (lastErrors.length === 0) return items;
    }
    throw new Error(`AI 출력 검증 실패: ${lastErrors.join(', ')}`);
  }

  function backupsFor(chatId) {
    const all = loadJson(BACKUP_KEY, {});
    return Array.isArray(all[chatId]) ? all[chatId] : [];
  }

  function saveBackup(chatId, reason, entries) {
    const all = loadJson(BACKUP_KEY, {});
    const list = Array.isArray(all[chatId]) ? all[chatId] : [];
    list.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reason,
      createdAt: new Date().toISOString(),
      entries: entries.map(item => ({
        _id: item._id || '', title: item.title || '', summary: item.summary || '',
        createdBy: item.createdBy || '', createdAt: item.createdAt || '', updatedAt: item.updatedAt || '',
      })),
    });
    all[chatId] = list.slice(0, MAX_BACKUPS_PER_CHAT);
    saveJson(BACKUP_KEY, all);
    return all[chatId][0];
  }

  function acquireLock(chatId) {
    const key = `${LOCK_PREFIX}${chatId}`;
    const now = Date.now();
    const existing = loadJson(key, null);
    if (existing && existing.owner !== ownerId && Number(existing.expiresAt || 0) > now) return false;
    saveJson(key, { owner: ownerId, expiresAt: now + LOCK_TTL_MS });
    return loadJson(key, null)?.owner === ownerId;
  }

  function releaseLock(chatId) {
    const key = `${LOCK_PREFIX}${chatId}`;
    if (loadJson(key, null)?.owner === ownerId) localStorage.removeItem(key);
  }

  async function createPendingBatch(chatId, pairs) {
    const state = stateFor(chatId);
    const before = await fetchSummaries('longTerm');
    const items = await generateValidatedItems(chatId, 'normal', pairsToChatLog(pairs));
    state.pendingBatch = {
      firstTurnId: pairs[0].assistant.turnId,
      lastTurnId: pairs[pairs.length - 1].assistant.turnId,
      items,
      createdIds: [],
      preExistingIds: before.items.map(item => item._id),
      startedAt: Date.now(),
    };
    persistStates();
    return state.pendingBatch;
  }

  async function resumePendingBatch(chatId) {
    const state = stateFor(chatId);
    const job = state.pendingBatch;
    if (!job) return false;
    const currentBeforeCreate = await fetchSummaries('longTerm');
    const preExistingIds = new Set(job.preExistingIds || []);
    const alreadyTracked = new Set(job.createdIds);
    for (let index = job.createdIds.length; index < job.items.length; index += 1) {
      setStatus(`장기기억 저장 중 ${index + 1}/${job.items.length}...`);
      const expected = job.items[index];
      const recovered = currentBeforeCreate.items.find(item => (
        item.createdBy === 'user'
        && !preExistingIds.has(item._id)
        && !alreadyTracked.has(item._id)
        && item.title === expected.title
        && item.summary === expected.summary
      ));
      const id = recovered?._id || await createSummary(expected);
      if (!id) throw new Error(`${index + 1}번 장기기억 저장 응답에 ID가 없음.`);
      job.createdIds.push(id);
      alreadyTracked.add(id);
      persistStates();
    }
    const current = await fetchSummaries('longTerm');
    const byId = new Map(current.items.map(item => [item._id, item]));
    for (let index = 0; index < job.createdIds.length; index += 1) {
      const saved = byId.get(job.createdIds[index]);
      const expected = job.items[index];
      if (!saved || saved.createdBy !== 'user' || saved.title !== expected.title || saved.summary !== expected.summary) {
        throw new Error(`${index + 1}번 장기기억 저장 검증 실패. 기존 데이터는 삭제하지 않음.`);
      }
    }
    state.baselineTurnId = job.lastTurnId;
    state.lastRunAt = Date.now();
    state.pendingBatch = null;
    state.progress = 0;
    persistStates();
    showToast(`✅ ${job.items.length}개 장기기억 저장 완료`);
    return true;
  }

  async function cleanupAssistantLongTerms(chatId) {
    const state = stateFor(chatId);
    const current = await fetchSummaries('longTerm');
    const targets = current.items.filter(item => item.createdBy === 'assistant');
    const protectedItems = current.items.filter(item => item.createdBy === 'user');
    if (targets.length === 0) return;

    if (!state.cleanupApproved) {
      const approved = window.confirm(
        `자동 생성 장기기억 ${targets.length}개를 발견함.\n\n` +
        `보호되는 사용자 장기기억: ${protectedItems.length}개\n` +
        `단기기억은 건드리지 않음.\n\n` +
        `자동 생성 장기기억만 삭제할까? 최초 1회 확인이며 이후 같은 기준으로 자동 정리됨.`
      );
      if (!approved) {
        setStatus('자동 장기기억 삭제 승인이 보류됨. 사용자 장기기억은 그대로 보존됨.', 'warn');
        return;
      }
      state.cleanupApproved = true;
      persistStates();
    }

    saveBackup(chatId, '자동 장기기억 삭제 전', current.items);
    const protectedIds = new Set(protectedItems.map(item => item._id));
    let deleted = 0;
    for (const target of targets) {
      if (target.createdBy !== 'assistant' || protectedIds.has(target._id)) {
        throw new Error('삭제 대상 검증 실패. 남은 자동 삭제를 중단함.');
      }
      await deleteAssistantSummary(target);
      deleted += 1;
    }
    const after = await fetchSummaries('longTerm');
    const afterIds = new Set(after.items.map(item => item._id));
    const missingProtected = [...protectedIds].filter(id => !afterIds.has(id));
    if (missingProtected.length > 0) throw new Error('보호 대상 장기기억 검증 실패. 백업을 확인해줘.');
    showToast(`🧹 자동 장기기억 ${deleted}개 정리 완료`);
  }

  function sameIdSet(a, b) {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every(id => set.has(id));
  }

  async function prepareCompaction(chatId) {
    const state = stateFor(chatId);
    if (state.compactionTxn) return resumeCompactionTransaction(chatId);
    const current = await fetchSummaries('longTerm');
    const userEntries = current.items.filter(item => item.createdBy === 'user');
    if (current.userCreatedCount !== userEntries.length) {
      throw new Error(`사용자 장기기억 개수 불일치(${current.userCreatedCount}/${userEntries.length}). 재정리 중단.`);
    }
    if (userEntries.length < 51) return false;
    const sourceIds = userEntries.map(item => item._id);
    if (state.pendingCompaction && sameIdSet(state.pendingCompaction.sourceIds || [], sourceIds)) {
      if (state.compactionApproved) return applyCompaction(chatId);
      renderPanel();
      return true;
    }

    setStatus(`장기기억 ${userEntries.length}개를 10개로 재요약 중...`);
    const sourceText = JSON.stringify(userEntries.map((item, index) => ({
      order: index + 1, title: item.title, summary: item.summary,
    })), null, 2);
    const items = await generateValidatedItems(chatId, 'compact', sourceText);
    state.pendingCompaction = { sourceIds, items, createdAt: Date.now() };
    persistStates();
    if (state.compactionApproved) return applyCompaction(chatId);
    showToast('💾 51→10 재정리 초안 준비됨. 메모리 창에서 확인해줘.', 'warn');
    openPanel();
    renderPanel();
    return true;
  }

  async function applyCompaction(chatId) {
    const state = stateFor(chatId);
    const draft = state.pendingCompaction;
    if (!draft || validateItems(draft.items, 'compact').length > 0) throw new Error('유효한 재정리 초안이 없음.');
    const current = await fetchSummaries('longTerm');
    const currentUserEntries = current.items.filter(item => item.createdBy === 'user');
    const currentIds = currentUserEntries.map(item => item._id);
    if (!sameIdSet(draft.sourceIds, currentIds)) {
      state.pendingCompaction = null;
      persistStates();
      throw new Error('초안 생성 후 장기기억이 변경됨. 안전을 위해 초안을 폐기했으니 다시 생성해줘.');
    }

    saveBackup(chatId, '51→10 재정리 전', current.items);
    state.compactionTxn = { sourceIds: [...draft.sourceIds], newIds: [], items: draft.items, stage: 'create' };
    persistStates();
    return resumeCompactionTransaction(chatId);
  }

  async function resumeCompactionTransaction(chatId) {
    const state = stateFor(chatId);
    const txn = state.compactionTxn;
    if (!txn) return false;
    if (!Array.isArray(txn.items) || txn.items.length !== 10 || !Array.isArray(txn.sourceIds)) {
      throw new Error('재정리 작업 기록이 손상됨. 기존 장기기억은 삭제하지 않음.');
    }

    let current = await fetchSummaries('longTerm');
    const sourceSet = new Set(txn.sourceIds);
    if (txn.stage === 'create') {
      const currentById = new Map(current.items.map(item => [item._id, item]));
      const missingSource = txn.sourceIds.some(id => currentById.get(id)?.createdBy !== 'user');
      if (missingSource) throw new Error('기존 장기기억 구성이 바뀌어 신규 10개 생성을 중단함. 기존 항목은 더 삭제하지 않음.');

      const tracked = new Set(txn.newIds || []);
      for (let index = 0; index < txn.items.length; index += 1) {
        const expected = txn.items[index];
        const trackedId = txn.newIds[index];
        if (trackedId) {
          const saved = currentById.get(trackedId);
          if (!saved || saved.createdBy !== 'user' || saved.title !== expected.title || saved.summary !== expected.summary) {
            throw new Error(`${index + 1}번 신규 장기기억 기록이 달라 생성을 중단함. 기존 항목은 삭제하지 않음.`);
          }
          continue;
        }

        setStatus(`새 장기기억 생성 중 ${index + 1}/10...`);
        const recovered = current.items.find(item => (
          item.createdBy === 'user'
          && !sourceSet.has(item._id)
          && !tracked.has(item._id)
          && item.title === expected.title
          && item.summary === expected.summary
        ));
        const id = recovered?._id || await createSummary(expected);
        if (!id) throw new Error(`${index + 1}번 신규 장기기억 ID를 받지 못함. 기존 항목은 삭제하지 않음.`);
        txn.newIds.push(id);
        tracked.add(id);
        persistStates();
      }

      current = await fetchSummaries('longTerm');
      const verifiedMap = new Map(current.items.map(item => [item._id, item]));
      const uniqueNewIds = new Set(txn.newIds);
      if (txn.newIds.length !== 10 || uniqueNewIds.size !== 10) {
        throw new Error('신규 장기기억 10개 ID 검증 실패. 기존 항목은 삭제하지 않음.');
      }
      txn.newIds.forEach((id, index) => {
        const saved = verifiedMap.get(id);
        const expected = txn.items[index];
        if (!saved || saved.createdBy !== 'user' || sourceSet.has(id)
          || saved.title !== expected.title || saved.summary !== expected.summary) {
          throw new Error(`${index + 1}번 신규 장기기억 검증 실패. 기존 항목은 삭제하지 않음.`);
        }
      });
      txn.stage = 'delete-old';
      persistStates();
    }

    if (txn.stage !== 'delete-old') return false;
    current = await fetchSummaries('longTerm');
    const byId = new Map(current.items.map(item => [item._id, item]));
    const newIdSet = new Set(txn.newIds);
    if (txn.newIds.length !== 10 || newIdSet.size !== 10 || txn.newIds.some((id, index) => {
      const item = byId.get(id);
      const expected = txn.items[index];
      return item?.createdBy !== 'user' || sourceSet.has(id)
        || item.title !== expected.title || item.summary !== expected.summary;
    })) {
      throw new Error('신규 10개 검증에 실패하여 기존 장기기억 삭제를 중단함.');
    }
    let deleted = 0;
    for (const id of txn.sourceIds) {
      if (!byId.has(id)) continue;
      if (byId.get(id)?.createdBy !== 'user' || !sourceSet.has(id) || newIdSet.has(id)) {
        throw new Error('재정리 삭제 대상 검증 실패.');
      }
      setStatus(`기존 장기기억 정리 중 ${deleted + 1}/${txn.sourceIds.length}...`);
      await deleteTrackedUserSummary(id, sourceSet);
      deleted += 1;
    }
    state.compactionTxn = null;
    state.pendingCompaction = null;
    state.compactionApproved = true;
    persistStates();
    showToast('✅ 장기기억 51→10 재정리 완료');
    setStatus('장기기억을 안전하게 10개로 재정리함.');
    return true;
  }

  async function postBatchMaintenance(chatId) {
    try { await cleanupAssistantLongTerms(chatId); }
    catch (error) { setStatus(`자동 장기기억 정리 실패: ${shortError(error)}`, 'error'); return; }
    try { await prepareCompaction(chatId); }
    catch (error) { setStatus(`51→10 재정리 중단: ${shortError(error)}`, 'error'); }
  }

  async function initializeBaseline(chatId) {
    const state = stateFor(chatId);
    if (state.baselineTurnId) return;
    const recent = await fetchMessagesForPairs('', 1);
    const latestPair = recent.pairs.at(-1);
    state.baselineTurnId = latestPair?.assistant?.turnId || '__empty__';
    state.progress = 0;
    persistStates();
    setStatus('현재 시점을 기준으로 자동 20턴 카운트를 시작함.');
  }

  async function runAutoCheck(reason = 'timer') {
    const chatId = getChatId();
    if (!chatId || !config.autoEnabled || document.hidden) return;
    if (!acquireLock(chatId)) return;
    try {
      const state = stateFor(chatId);
      if (state.compactionTxn) await resumeCompactionTransaction(chatId);
      if (state.pendingBatch) {
        await resumePendingBatch(chatId);
        await postBatchMaintenance(chatId);
        return;
      }
      await initializeBaseline(chatId);
      const result = state.baselineTurnId === '__empty__'
        ? await fetchMessagesForPairs('', AUTO_TURN_COUNT)
        : await fetchMessagesForPairs(state.baselineTurnId, AUTO_TURN_COUNT);
      if (state.baselineTurnId !== '__empty__' && !result.baselineFound) {
        const latest = await fetchMessagesForPairs('', 1);
        state.baselineTurnId = latest.pairs.at(-1)?.assistant?.turnId || state.baselineTurnId;
        state.progress = 0;
        persistStates();
        setStatus('이전 기준 메시지를 찾지 못해 현재 시점부터 다시 셈. 과거 대화는 중복 요약하지 않음.', 'warn');
        return;
      }
      state.progress = result.pairs.length;
      persistStates();
      dashboard.progress = Math.min(result.pairs.length, AUTO_TURN_COUNT);
      if (result.pairs.length < AUTO_TURN_COUNT) {
        if (panel && activeTab === 'overview') renderPanel();
        return;
      }
      setStatus(`완료된 왕복 20턴을 ${config.model}로 요약 중...`);
      await createPendingBatch(chatId, result.pairs.slice(0, AUTO_TURN_COUNT));
      await resumePendingBatch(chatId);
      await postBatchMaintenance(chatId);
      if (result.pairs.length >= AUTO_TURN_COUNT * 2) setTimeout(() => runAutoCheck('backlog'), 5000);
    } catch (error) {
      console.error('[Crack Memory Manager]', reason, error);
      setStatus(`자동 처리 중단: ${shortError(error)}`, 'error');
      showToast(`⚠️ ${shortError(error)}`, 'error');
    } finally {
      releaseLock(chatId);
      if (panel && activeTab === 'overview') refreshDashboard().catch(() => {});
    }
  }

  async function summarizeRecentTwenty() {
    const chatId = getChatId();
    if (!chatId) throw new Error('채팅방에서 실행해줘.');
    if (!acquireLock(chatId)) throw new Error('다른 탭에서 메모리 작업 중임.');
    try {
      const result = await fetchMessagesForPairs('', AUTO_TURN_COUNT);
      const pairs = result.pairs.slice(-AUTO_TURN_COUNT);
      if (pairs.length < AUTO_TURN_COUNT) throw new Error(`완료된 왕복이 ${pairs.length}/20턴뿐임.`);
      const state = stateFor(chatId);
      if (state.pendingBatch) await resumePendingBatch(chatId);
      await createPendingBatch(chatId, pairs);
      await resumePendingBatch(chatId);
      await postBatchMaintenance(chatId);
    } finally {
      releaseLock(chatId);
    }
  }

  function parseEditorText(text) {
    return String(text || '').split(/\n\s*\n/).map(block => block.trim()).filter(Boolean).map(block => {
      const lines = block.split('\n');
      const header = lines.shift()?.trim() || '';
      const match = header.match(/^\[(.*?)\](?:\s*@([a-f0-9]+))?$/i);
      return {
        title: match ? match[1].trim() : header,
        id: match?.[2] || '',
        summary: lines.join('\n').trim(),
        validFormat: !!match,
      };
    });
  }

  function editorText(entries) {
    return entries.map(item => `[${item.title}] @${item._id}\n${item.summary}`).join('\n\n');
  }

  async function loadEditor() {
    const current = await fetchSummaries('longTerm');
    editorOriginal = current.items.filter(item => item.createdBy === 'user');
    editorLoaded = true;
    renderPanel();
  }

  function editorAnalysis(text) {
    const parsed = parseEditorText(text);
    const errors = [];
    const originalMap = new Map(editorOriginal.map(item => [item._id, item]));
    const ids = new Set();
    parsed.forEach((item, index) => {
      if (!item.validFormat) errors.push(`${index + 1}번 형식 오류`);
      if (!item.title || charCount(item.title) > MAX_TITLE_LENGTH) errors.push(`${index + 1}번 제목 ${charCount(item.title)}/20자`);
      if (!item.summary || charCount(item.summary) > MAX_SUMMARY_LENGTH) errors.push(`${index + 1}번 내용 ${charCount(item.summary)}/300자`);
      if (item.id) {
        if (!originalMap.has(item.id)) errors.push(`${index + 1}번 알 수 없는 ID`);
        if (ids.has(item.id)) errors.push(`${index + 1}번 중복 ID`);
        ids.add(item.id);
      }
    });
    const add = parsed.filter(item => !item.id).length;
    const update = parsed.filter(item => item.id && originalMap.has(item.id) && (
      originalMap.get(item.id).title !== item.title || originalMap.get(item.id).summary !== item.summary
    )).length;
    const remove = editorOriginal.filter(item => !ids.has(item._id)).length;
    return { parsed, errors, add, update, remove };
  }

  async function saveEditor() {
    const textarea = panel?.querySelector('#cmm-editor');
    if (!textarea) throw new Error('편집기를 찾을 수 없음.');
    const analysis = editorAnalysis(textarea.value);
    if (analysis.errors.length) throw new Error(analysis.errors.join(', '));
    if (!window.confirm(`추가 ${analysis.add} · 수정 ${analysis.update} · 삭제 ${analysis.remove}\n\n사용자 장기기억만 변경함. 저장할까?`)) return;

    const chatId = getChatId();
    const current = await fetchSummaries('longTerm');
    const currentUser = current.items.filter(item => item.createdBy === 'user');
    if (!sameIdSet(currentUser.map(item => item._id), editorOriginal.map(item => item._id))) {
      throw new Error('편집창을 연 뒤 장기기억이 변경됨. 다시 불러와줘.');
    }
    saveBackup(chatId, '수동 편집 전', current.items);
    const originalMap = new Map(editorOriginal.map(item => [item._id, item]));
    const parsedIds = new Set(analysis.parsed.map(item => item.id).filter(Boolean));

    for (const item of analysis.parsed.filter(item => !item.id)) await createSummary(item);
    for (const item of analysis.parsed.filter(item => item.id)) {
      const original = originalMap.get(item.id);
      if (original.title !== item.title || original.summary !== item.summary) await updateSummary(item.id, item);
    }
    const allowedDelete = new Set(editorOriginal.filter(item => !parsedIds.has(item._id)).map(item => item._id));
    for (const id of allowedDelete) await deleteTrackedUserSummary(id, allowedDelete);
    await loadEditor();
    showToast('✅ 사용자 장기기억 편집 저장 완료');
  }

  async function refreshDashboard() {
    const chatId = getChatId();
    if (!chatId) return;
    const state = stateFor(chatId);
    if (!state.baselineTurnId) await initializeBaseline(chatId);
    const [longTerms, shortTerms] = await Promise.all([
      fetchSummaries('longTerm'),
      fetchSummaries('shortTerm').catch(() => ({ items: [], totalCount: 0 })),
    ]);
    let progress = 0;
    if (state.baselineTurnId === '__empty__') {
      const result = await fetchMessagesForPairs('', AUTO_TURN_COUNT);
      progress = Math.min(result.pairs.length, AUTO_TURN_COUNT);
    } else if (state.baselineTurnId) {
      const result = await fetchMessagesForPairs(state.baselineTurnId, AUTO_TURN_COUNT);
      if (result.baselineFound) progress = Math.min(result.pairs.length, AUTO_TURN_COUNT);
    }
    dashboard = {
      progress,
      userCount: longTerms.items.filter(item => item.createdBy === 'user').length,
      autoCount: longTerms.items.filter(item => item.createdBy === 'assistant').length,
      shortCount: shortTerms.totalCount || shortTerms.items.length,
    };
    state.progress = progress;
    persistStates();
    if (panel && activeTab === 'overview') renderPanel();
  }

  const styles = `
    #cmm-header-button { width:32px; min-width:32px; height:32px; padding:0; display:inline-flex; align-items:center; justify-content:center; border:1px solid #c6c6c6; border-radius:8px; background:#dddddd; color:#303030; box-shadow:none; font:15px/1 Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif; cursor:pointer; }
    #cmm-header-button:hover { background:#d1d1d1; }
    #cmm-header-button:active { background:#c7c7c7; transform:translateY(1px); }
    #shipidle-summary-editor-editor-btn { display:none !important; }
    #cmm-overlay { position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(20,30,38,.36); font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif; }
    #cmm-panel { width:min(660px,100%); max-height:min(820px,92vh); overflow:hidden; display:flex; flex-direction:column; box-sizing:border-box; color:#25313a; background:#fff; border:1px solid #d8dde1; border-radius:16px; box-shadow:0 24px 70px rgba(32,49,61,.22); }
    #cmm-panel * { box-sizing:border-box; }
    .cmm-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px; border-bottom:1px solid #e8ecef; background:#fff; }
    .cmm-title { font-size:16px; font-weight:760; color:#26343e; }
    .cmm-close { width:30px; height:30px; border:0; border-radius:8px; background:#f2f3f4; color:#59656d; font-size:20px; line-height:1; cursor:pointer; }
    .cmm-tabs { display:flex; gap:6px; padding:10px 14px; border-bottom:1px solid #edf0f2; background:#fff; overflow-x:auto; }
    .cmm-tab { flex:0 0 auto; padding:7px 11px; border:1px solid #d9e1e6; border-radius:8px; background:#f7f8f9; color:#56636c; font:650 12px Pretendard,sans-serif; cursor:pointer; }
    .cmm-tab.active { border-color:#b9d8eb; background:#eaf6ff; color:#245a78; }
    .cmm-body { padding:16px; overflow:auto; background:#fff; }
    .cmm-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .cmm-card { padding:13px; border:1px solid #e0e5e8; border-radius:12px; background:#fff; }
    .cmm-card.accent { border-color:#cbdfea; background:#f8fcff; }
    .cmm-label { margin-bottom:5px; color:#73808a; font-size:11px; font-weight:650; }
    .cmm-value { color:#26343d; font-size:15px; font-weight:760; }
    .cmm-sub { margin-top:5px; color:#7a8790; font-size:10px; line-height:1.5; }
    .cmm-section { margin-top:12px; padding:13px; border:1px solid #e1e6e9; border-radius:12px; background:#fff; }
    .cmm-section h3 { margin:0 0 9px; color:#34434d; font-size:13px; }
    .cmm-row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .cmm-btn { padding:8px 11px; border:1px solid #bfd9e8; border-radius:8px; background:#eaf6ff; color:#285c78; font:650 12px Pretendard,sans-serif; cursor:pointer; }
    .cmm-btn:hover { background:#dceffc; }
    .cmm-btn.gray { border-color:#d5dadd; background:#f3f4f5; color:#536069; }
    .cmm-btn.danger { border-color:#e6c4c8; background:#fff5f5; color:#9b4650; }
    .cmm-btn:disabled { opacity:.5; cursor:not-allowed; }
    .cmm-status { margin-top:12px; padding:10px 11px; border-radius:9px; background:#eef6fb; color:#315d77; font-size:12px; line-height:1.5; white-space:pre-line; }
    .cmm-status.warn { background:#fff8e8; color:#7c622d; }
    .cmm-status.error { background:#fff1f1; color:#963f49; }
    .cmm-field { display:block; margin:10px 0; color:#596771; font-size:11px; font-weight:650; }
    .cmm-field input,.cmm-field select,.cmm-field textarea { width:100%; margin-top:5px; padding:9px 10px; border:1px solid #d2d9de; border-radius:8px; background:#fff; color:#26343d; font:13px/1.5 Pretendard,sans-serif; }
    .cmm-field input:focus,.cmm-field select:focus,.cmm-field textarea:focus { outline:2px solid #cfe8f7; border-color:#a9cfe5; }
    #cmm-editor { min-height:360px; resize:vertical; font-family:Pretendard,monospace; }
    .cmm-editor-meta { margin:8px 0; color:#697780; font-size:11px; white-space:pre-line; }
    .cmm-preview-item { margin:8px 0; padding:10px; border:1px solid #dce5ea; border-radius:9px; background:#fbfdfe; }
    .cmm-preview-title { display:flex; justify-content:space-between; gap:8px; color:#2b4454; font-size:12px; font-weight:700; }
    .cmm-preview-body { margin-top:6px; color:#4c5c66; font-size:11px; line-height:1.55; white-space:pre-wrap; }
    .cmm-error { color:#b44450 !important; font-weight:750; }
    .cmm-backup { margin:8px 0; padding:11px; border:1px solid #e0e5e8; border-radius:10px; background:#fff; }
    .cmm-check { display:flex; align-items:center; gap:7px; margin:10px 0; color:#45545e; font-size:12px; }
    #cmm-toast { position:fixed; top:18px; left:50%; z-index:2147483646; transform:translate(-50%,-10px); opacity:0; max-width:min(460px,90vw); padding:10px 15px; border-radius:10px; background:#28343c; color:#fff; box-shadow:0 8px 30px rgba(0,0,0,.2); font:650 12px/1.5 Pretendard,sans-serif; transition:.22s; }
    #cmm-toast.show { transform:translate(-50%,0); opacity:1; }
    #cmm-toast.warn { background:#775f2e; }
    #cmm-toast.error { background:#8f3d47; }
    @media (max-width:560px) { #cmm-overlay{padding:8px}.cmm-grid{grid-template-columns:1fr}#cmm-panel{max-height:96vh;border-radius:13px}.cmm-body{padding:12px} }
  `;

  function injectStyles() {
    if (document.getElementById('cmm-styles')) return;
    const style = document.createElement('style');
    style.id = 'cmm-styles';
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  function tabButton(id, label) {
    return `<button class="cmm-tab ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
  }

  function overviewHtml() {
    const chatId = getChatId();
    const state = chatId ? stateFor(chatId) : { lastCostKrw: 0, totalCostKrw: 0 };
    const pending = state.pendingCompaction;
    let html = `
      <div class="cmm-grid">
        <div class="cmm-card accent"><div class="cmm-label">자동 요약</div><div class="cmm-value">${config.autoEnabled ? '켜짐' : '꺼짐'}</div><div class="cmm-sub">완료된 유저+캐릭터 왕복 기준</div></div>
        <div class="cmm-card"><div class="cmm-label">진행도</div><div class="cmm-value">${dashboard.progress} / ${AUTO_TURN_COUNT}턴</div><div class="cmm-sub">답변 생성 중·프롤로그·리롤 제외</div></div>
        <div class="cmm-card"><div class="cmm-label">사용자 장기기억</div><div class="cmm-value">${dashboard.userCount} / 51개</div><div class="cmm-sub">직접 추가 + 이 스크립트 생성분</div></div>
        <div class="cmm-card"><div class="cmm-label">자동 메모리</div><div class="cmm-value">장기 ${dashboard.autoCount} · 단기 ${dashboard.shortCount}</div><div class="cmm-sub">자동 장기만 승인 후 삭제 · 단기는 제외</div></div>
        <div class="cmm-card"><div class="cmm-label">모델</div><div class="cmm-value" style="font-size:13px">${escapeHtml(MODEL_OPTIONS.find(([id]) => id === config.model)?.[1] || config.model)}</div><div class="cmm-sub">${config.provider === 'firebase' ? 'Firebase Vertex AI' : 'Google Gemini API'}</div></div>
        <div class="cmm-card accent"><div class="cmm-label">예상 비용</div><div class="cmm-value">이번 ${formatWon(state.lastCostKrw)}원</div><div class="cmm-sub">누적 ${formatWon(state.totalCostKrw)}원 · 환율 1,500원</div></div>
      </div>
      <div class="cmm-section"><h3>작업</h3><div class="cmm-row">
        <button class="cmm-btn" data-action="summarize-now">최근 20턴 지금 요약</button>
        <button class="cmm-btn gray" data-action="refresh">새로고침</button>
      </div></div>`;
    if (pending) {
      html += `<div class="cmm-section"><h3>51→10 재정리 미리보기</h3>
        <div class="cmm-sub">기존 ${pending.sourceIds.length}개는 신규 10개가 모두 저장·검증되기 전까지 삭제하지 않음.</div>
        ${pending.items.map(item => `<div class="cmm-preview-item"><div class="cmm-preview-title"><span>${escapeHtml(item.title)}</span><span>${charCount(item.title)}/20</span></div><div class="cmm-preview-body">${escapeHtml(item.summary)}</div><div class="cmm-sub">${charCount(item.summary)}/300자</div></div>`).join('')}
        <div class="cmm-row"><button class="cmm-btn" data-action="apply-compaction">검증 후 10개로 적용</button><button class="cmm-btn gray" data-action="discard-compaction">초안 폐기</button></div>
      </div>`;
    }
    html += `<div id="cmm-status" class="cmm-status ${latestStatusTone}">${escapeHtml(latestStatus)}</div>`;
    return html;
  }

  function editorHtml() {
    if (!editorLoaded) return `<div class="cmm-section"><h3>사용자 장기기억 편집</h3><p class="cmm-sub">createdBy:user 항목만 불러오며 자동 장기기억과 단기기억은 편집하지 않음.</p><button class="cmm-btn" data-action="load-editor">불러오기</button></div>`;
    const value = editorText(editorOriginal);
    return `<div class="cmm-section"><h3>사용자 장기기억 텍스트 편집</h3>
      <p class="cmm-sub">형식: [제목] @id 다음 줄에 내용. 블록 사이 빈 줄 1개. 제목 20자·내용 300자 제한.</p>
      <label class="cmm-field"><textarea id="cmm-editor" spellcheck="false">${escapeHtml(value)}</textarea></label>
      <div id="cmm-editor-meta" class="cmm-editor-meta">변경 내용을 입력하면 검사함.</div>
      <div class="cmm-row"><button class="cmm-btn gray" data-action="reload-editor">다시 불러오기</button><button class="cmm-btn" data-action="save-editor">검사 후 저장</button></div>
    </div>`;
  }

  function settingsHtml() {
    return `<div class="cmm-section"><h3>AI 설정</h3>
      <label class="cmm-check"><input id="cmm-auto" type="checkbox" ${config.autoEnabled ? 'checked' : ''}> 자동 20턴 요약 켜기</label>
      <label class="cmm-field">API 방식<select id="cmm-provider"><option value="google" ${config.provider === 'google' ? 'selected' : ''}>Google Gemini API</option><option value="firebase" ${config.provider === 'firebase' ? 'selected' : ''}>Firebase Vertex AI</option></select></label>
      <label class="cmm-field">모델<select id="cmm-model">${MODEL_OPTIONS.map(([id, label]) => `<option value="${id}" ${config.model === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="cmm-field">Google API Key<input id="cmm-api-key" type="password" value="${escapeHtml(config.apiKey)}" autocomplete="off"></label>
      <label class="cmm-field">Firebase 스크립트<textarea id="cmm-firebase" rows="4" placeholder="firebaseConfig = { ... };">${escapeHtml(config.firebaseScript)}</textarea></label>
      <label class="cmm-field">추가 지침<textarea id="cmm-extra" rows="5" placeholder="기본 300자·사실성 규칙 뒤에 추가할 개인 지침">${escapeHtml(config.extraPrompt)}</textarea></label>
      <div class="cmm-row"><button class="cmm-btn" data-action="save-settings">설정 저장</button><button class="cmm-btn gray" data-action="reset-baseline">지금부터 20턴 다시 세기</button></div>
    </div>`;
  }

  function backupsHtml() {
    const chatId = getChatId();
    const backups = chatId ? backupsFor(chatId) : [];
    if (!backups.length) return `<div class="cmm-section"><h3>자동 백업</h3><p class="cmm-sub">아직 백업이 없음. 자동 삭제·재정리·수동 편집 직전에 최대 5개를 저장함.</p></div>`;
    return `<div class="cmm-section"><h3>자동 백업</h3><p class="cmm-sub">복구는 현재 내용을 지우지 않고 누락된 항목만 추가함.</p>
      ${backups.map(item => `<div class="cmm-backup"><div class="cmm-preview-title"><span>${escapeHtml(item.reason)}</span><span>${item.entries.length}개</span></div><div class="cmm-sub">${new Date(item.createdAt).toLocaleString()}</div><div class="cmm-row" style="margin-top:8px"><button class="cmm-btn gray" data-action="copy-backup" data-id="${item.id}">JSON 복사</button><button class="cmm-btn" data-action="restore-backup" data-id="${item.id}">누락분 복구</button></div></div>`).join('')}
    </div>`;
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('.cmm-body');
    if (!body) return;
    panel.querySelectorAll('.cmm-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === activeTab));
    if (activeTab === 'overview') body.innerHTML = overviewHtml();
    else if (activeTab === 'editor') body.innerHTML = editorHtml();
    else if (activeTab === 'settings') body.innerHTML = settingsHtml();
    else body.innerHTML = backupsHtml();
    if (activeTab === 'editor' && editorLoaded) {
      const textarea = panel.querySelector('#cmm-editor');
      textarea?.addEventListener('input', updateEditorMeta);
      updateEditorMeta();
    }
  }

  function updateEditorMeta() {
    const textarea = panel?.querySelector('#cmm-editor');
    const meta = panel?.querySelector('#cmm-editor-meta');
    if (!textarea || !meta) return;
    const analysis = editorAnalysis(textarea.value);
    meta.textContent = analysis.errors.length
      ? `오류: ${analysis.errors.join(', ')}\n추가 ${analysis.add} · 수정 ${analysis.update} · 삭제 ${analysis.remove}`
      : `정상 · 추가 ${analysis.add} · 수정 ${analysis.update} · 삭제 ${analysis.remove}`;
    meta.classList.toggle('cmm-error', analysis.errors.length > 0);
  }

  async function restoreBackup(id) {
    const chatId = getChatId();
    const backup = backupsFor(chatId).find(item => item.id === id);
    if (!backup) throw new Error('백업을 찾을 수 없음.');
    if (!window.confirm('현재 장기기억은 삭제하지 않고, 제목과 내용이 모두 같은 항목이 없을 때만 백업 항목을 추가함. 계속할까?')) return;
    const current = await fetchSummaries('longTerm');
    const fingerprints = new Set(current.items.filter(item => item.createdBy === 'user').map(item => `${item.title}\u0000${item.summary}`));
    let restored = 0;
    for (const item of backup.entries.filter(entry => entry.createdBy === 'user')) {
      const fingerprint = `${item.title}\u0000${item.summary}`;
      if (fingerprints.has(fingerprint)) continue;
      await createSummary(item);
      fingerprints.add(fingerprint);
      restored += 1;
    }
    showToast(`✅ 백업 누락분 ${restored}개 복구 완료`);
  }

  async function handleAction(action, target) {
    const chatId = getChatId();
    if (action === 'refresh') return refreshDashboard();
    if (action === 'summarize-now') return summarizeRecentTwenty();
    if (action === 'load-editor' || action === 'reload-editor') return loadEditor();
    if (action === 'save-editor') return saveEditor();
    if (action === 'save-settings') {
      config.autoEnabled = !!panel.querySelector('#cmm-auto')?.checked;
      config.provider = panel.querySelector('#cmm-provider')?.value || 'google';
      config.model = panel.querySelector('#cmm-model')?.value || 'gemini-3.1-flash-lite';
      config.apiKey = panel.querySelector('#cmm-api-key')?.value.trim() || '';
      config.firebaseScript = panel.querySelector('#cmm-firebase')?.value.trim() || '';
      config.extraPrompt = panel.querySelector('#cmm-extra')?.value.trim() || '';
      persistConfig();
      showToast('✅ 설정 저장 완료');
      return renderPanel();
    }
    if (action === 'reset-baseline') {
      if (!window.confirm('과거 대화는 요약하지 않고 현재 최신 답변부터 20턴을 다시 셈. 계속할까?')) return;
      const recent = await fetchMessagesForPairs('', 1);
      const state = stateFor(chatId);
      state.baselineTurnId = recent.pairs.at(-1)?.assistant?.turnId || '__empty__';
      state.progress = 0;
      persistStates();
      showToast('✅ 현재 시점부터 다시 카운트함');
      return refreshDashboard();
    }
    if (action === 'apply-compaction') {
      if (!window.confirm('신규 10개를 먼저 저장·검증한 뒤 기존 사용자 장기기억을 삭제함. 자동 백업도 저장함. 적용할까?')) return;
      await applyCompaction(chatId);
      return refreshDashboard();
    }
    if (action === 'discard-compaction') {
      const state = stateFor(chatId);
      state.pendingCompaction = null;
      persistStates();
      return renderPanel();
    }
    if (action === 'copy-backup') {
      const backup = backupsFor(chatId).find(item => item.id === target.dataset.id);
      if (!backup) throw new Error('백업을 찾을 수 없음.');
      await navigator.clipboard.writeText(JSON.stringify(backup, null, 2));
      return showToast('✅ 백업 JSON 복사 완료');
    }
    if (action === 'restore-backup') return restoreBackup(target.dataset.id);
  }

  async function withBusy(task) {
    if (busy) return;
    busy = true;
    panel?.querySelectorAll('button').forEach(button => { if (!button.classList.contains('cmm-close')) button.disabled = true; });
    try {
      await task();
    } catch (error) {
      console.error('[Crack Memory Manager]', error);
      setStatus(shortError(error), 'error');
      showToast(`⚠️ ${shortError(error)}`, 'error');
    } finally {
      busy = false;
      panel?.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  }

  function openPanel() {
    if (panel) return;
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'cmm-overlay';
    overlay.innerHTML = `<div id="cmm-panel"><div class="cmm-head"><div class="cmm-title">💾 메모리 관리자</div><button class="cmm-close" aria-label="닫기">×</button></div><div class="cmm-tabs">${tabButton('overview', '현황')}${tabButton('editor', '장기기억 편집')}${tabButton('settings', '설정')}${tabButton('backups', '백업')}</div><div class="cmm-body"></div></div>`;
    document.body.appendChild(overlay);
    panel = overlay;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.cmm-close')) return closePanel();
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        activeTab = tab.dataset.tab;
        renderPanel();
        return;
      }
      const actionTarget = event.target.closest('[data-action]');
      if (actionTarget) withBusy(() => handleAction(actionTarget.dataset.action, actionTarget));
    });
    renderPanel();
    withBusy(() => refreshDashboard());
  }

  function isUsableHeader(el) {
    if (!el || !el.isConnected || el.closest('#cmm-overlay,[data-message-group-id],textarea,.ProseMirror')) return false;
    try { if (el.getBoundingClientRect().top > 180) return false; } catch (_) {}
    return el.querySelectorAll('button').length > 0;
  }

  function findHeaderHost() {
    const direct = [
      '.absolute.z-\\[5\\] .flex.gap-3.items-center',
      'header .flex.gap-3.items-center',
      '[class*="z-"] .flex.gap-3.items-center',
    ];
    for (const selector of direct) {
      const el = document.querySelector(selector);
      if (isUsableHeader(el)) return el;
    }
    const anchor = document.querySelector('button[aria-label*="엔딩"],button[aria-label*="공유"],button[aria-label*="설정"],#clsb-fab');
    const host = anchor?.closest('.flex.gap-3.items-center,.flex.items-center,[class*="items-center"]');
    return isUsableHeader(host) ? host : null;
  }

  function injectHeaderButton() {
    injectStyles();
    document.getElementById('shipidle-summary-editor-editor-btn')?.remove();
    const chatId = getChatId();
    const existing = document.getElementById('cmm-header-button');
    if (!chatId) {
      existing?.remove();
      return;
    }
    if (existing?.isConnected) return;
    const host = findHeaderHost();
    if (!host) return;
    const button = document.createElement('button');
    button.id = 'cmm-header-button';
    button.type = 'button';
    button.textContent = '💾';
    button.title = '메모리 관리자';
    button.setAttribute('aria-label', '메모리 관리자');
    button.dataset.ceAiSummary = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    });
    host.prepend(button);
  }

  function start() {
    injectStyles();
    injectHeaderButton();
    setInterval(injectHeaderButton, 4000);
    setInterval(() => runAutoCheck('timer'), AUTO_CHECK_MS);
    window.addEventListener('pageshow', () => { injectHeaderButton(); runAutoCheck('pageshow'); }, { passive: true });
    window.addEventListener('popstate', () => setTimeout(() => { injectHeaderButton(); runAutoCheck('popstate'); }, 150), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        injectHeaderButton();
        runAutoCheck('visible');
      }
    }, { passive: true });
    setTimeout(() => runAutoCheck('start'), 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
