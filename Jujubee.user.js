// ==UserScript==
// @name         주접이
// @namespace    https://github.com/shipidle/crack-stay-scripts/crack-dialogue-polisher/crack-mini-dot-commentator
// @version      0.1.1
// @description  냐냐냥!!!
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Jujubee.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Jujubee.user.js
// ==/UserScript==


(() => {
  'use strict';


  if (window.__CRACK_MINI_DOT_COMMENTATOR__) return;
  window.__CRACK_MINI_DOT_COMMENTATOR__ = true;


  const ID = 'cmdc';
  const STYLE_ID = `${ID}-style`;
  const ROOT_ID = `${ID}-root`;
  const PANEL_ID = `${ID}-panel`;
  const STORE_KEY = `${ID}:store:v1`;
  const POS_KEY = `${ID}:pos:v1`;
  const PANEL_POS_KEY = `${ID}:panel-pos:v1`;
  const TOKEN_COST_USD = {
    'gemini-2.5-flash-lite': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    'gemini-2.5-flash': { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    'gemini-3-flash-preview': { inputPerMillion: 0.50, outputPerMillion: 3.00 },
    'gemini-3-pro-preview': { inputPerMillion: 2.00, outputPerMillion: 12.00 },
  };
  const USD_TO_KRW = 1550;


  const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  const MODEL_OPTIONS = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
  ];
  const IDLE_SLEEP_MS = 1000 * 60 * 3;
  const STABLE_REPLY_MS = 2200;
  const MIN_REPLY_CHARS = 18;
  const MAX_REPLY_CHARS = 1300;
  const MAX_CONTEXT_CHARS = 650;
  const MAX_LOGS = 80;


  const TENDENCIES = {
    romance: { label: '완전야르다', words: /사랑|고백|질투|키스|입맞춤|연인|데이트|심장|눈빛|설렘|끌어안|품에|보고 싶|좋아해|사귀/i },
    spice: { label: '( ͡° ͜ʖ ͡°)', words: /벗|침대|허벅|가슴|허리|입술|뜨거|욕망|쾌락|애무|몸|나체|숨결|섹|야해/i },
    angst: { label: '상처수집가', words: /눈물|상처|버림|후회|미안|죽|고통|외로|절망|무너|울었|슬픔|불안|공포/i },
    power: { label: '권위처형인', words: /왕|황제|공작|상관|명령|권력|계급|귀족|복종|처벌|법|재판|군주|신하/i },
    chaos: { label: '혼돈중독', words: /ㅋㅋ|미친|돌았|난장|폭발|싸움|도망|사건|위험|비밀|배신|거짓|혼란|충격/i },
  };


  const apiCaptures = [];
  let summaryAccum = [];
  let summarySeen = {};
  let summaryChatId = null;


  function defaultStore() {
    return {
      apiKey: '',
      model: DEFAULT_MODEL,
      petName: '뽀뽀',
      personality: '재치, 막말, 풍자, 시적 비유, 권위 조롱, 자유분방한 로코 엔진',
      headerColor: '#8fbfd3',
      roomNotes: '',
      contextCount: 3,
      memoryCount: 3,
      sendUserNote: true,
      sendMemory: true,
      enabled: true,
      lastKey: '',
      lastActiveAt: Date.now(),
      level: 1,
      exp: 0,
      bond: 0,
      seen: 0,
      tendency: { romance: 0, spice: 0, angst: 0, power: 0, chaos: 0 },
      logs: [],
      usage: { input: 0, output: 0, count: 0 },
    };
  }


  function readStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const rooms = raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {};
      const legacyRoom = { ...raw };
