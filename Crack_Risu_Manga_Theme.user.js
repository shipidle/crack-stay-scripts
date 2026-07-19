// ==UserScript==
// @name         크랙 Risu 망가 채팅 테마
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.1.1
// @description  크랙 채팅을 Risu 망가 카드 스타일로 바꾸고 프로필 이미지 설정을 Supabase로 동기화합니다.
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-risu-manga-theme-v1/Crack_Risu_Manga_Theme.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/refs/heads/agent/crack-risu-manga-theme-v1/Crack_Risu_Manga_Theme.user.js
// @grant        none
// @sandbox      DOM
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.1.1';
  const APP_KEY = 'shipidle:crack-risu-manga-theme:v1';
  const REMOTE_METADATA_KEY = 'crack_manga_theme_v1';
  const AUTH_REDIRECT = 'https://crack.wrtn.ai/';
  const AUTO_SYNC_MS = 60_000;

  const defaultTheme = {
    enabled: true,
    userAvatarUrl: '',
    characterFallbackUrl: '',
    updatedAt: '',
  };
  const defaultConnection = {
    projectUrl: '',
    publishableKey: '',
    email: '',
    syncPassphrase: '',
    deviceLabel: '',
  };
  const defaultSyncState = {
    lastRemoteUpdatedAt: '',
    lastSyncedLocalUpdatedAt: '',
    lastSyncAt: 0,
    totalRequests: 0,
  };

  let theme = { ...defaultTheme };
  let connection = { ...defaultConnection };
  let syncState = { ...defaultSyncState };
  let session = null;
  let panel = null;
  let statusEl = null;
  let latestStatus = '';
  let latestStatusTone = '';
  let busy = false;
  let renderTimer = 0;
  let cachedCharacterName = 'CHARACTER';

  const renderSignatures = new WeakMap();
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  const MANGA_CSS = "/* ============================================================================\r\n    MANGA THEME\r\n============================================================================ */\r\n@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');\r\n@font-face {\r\nfont-family: 'KoPubWorld Dotum';\r\nfont-style: normal;\r\nfont-weight: 300;\r\nsrc: local('KoPubWorldDotum'),\r\n    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.woff2') format('woff2'),\r\n    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.woff') format('woff'),\r\n    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.otf') format('opentype');\r\n}\r\n@font-face {\r\n    font-family: 'KoPubWorld Dotum';\r\n    font-style: normal;\r\n    font-weight: 400;\r\n    src: local('KoPubWorldDotum'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.woff2') format('woff2'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.woff') format('woff'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.otf') format('opentype');\r\n}\r\n@font-face {\r\n    font-family: 'KoPubWorld Dotum';\r\n    font-style: normal;\r\n    font-weight: 700;\r\n    src: local('KoPubWorldDotum'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.woff2') format('woff2'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.woff') format('woff'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.otf') format('opentype');\r\n}\r\n@font-face {\r\n    font-family: 'KoPubWorld Batang';\r\n    font-style: normal;\r\n    font-weight: 400;\r\n    src: local('KoPubWorldBatang'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.woff2') format('woff2'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.woff') format('woff'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.otf') format('opentype');\r\n}\r\n@font-face {\r\n    font-family: 'KoPubWorld Batang';\r\n    font-style: normal;\r\n    font-weight: 700;\r\n    src: local('KoPubWorldBatang'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.woff2') format('woff2'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.woff') format('woff'),\r\n        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.otf') format('opentype');\r\n}\r\n@font-face {\r\n    font-family: 'JoseonSolidGothic';\r\n    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunBg.woff') format('woff');\r\n    font-weight: normal;\r\n    font-display: swap;\r\n}\r\n@font-face {\r\n    font-family: 'PalchilmmDailyItalic';\r\n    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201@1.0/87MMILSANG-Oblique.woff2') format('woff2');\r\n    font-weight: normal;\r\n    font-display: swap;\r\n}\r\n@font-face {\r\n    font-family: 'JoseonBoldGothic';\r\n    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunKg.woff') format('woff');\r\n    font-weight: normal;\r\n    font-display: swap;\r\n}\r\n@font-face {\r\n    font-family: 'GyeonggiMillenniumTitle';\r\n    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2410-3@1.0/Title_Light.woff') format('woff');\r\n    font-weight: 300;\r\n    font-display: swap;\r\n}\r\n/* ----------------------------------------------------------------------------\r\n    ✦ 빠른 수정 영역 ✦\r\n---------------------------------------------------------------------------- */\r\n.mg {\r\n    /* 색상 */\r\n    --ink:        #1E1C1A;\r\n    --ink-soft:    #4A4744;\r\n    --ink-faint:   #8A8680;\r\n    --paper:      #F1EEE8;\r\n    --paper-deep: #E7E3DB;\r\n    --line:       #1E1C1A;\r\n    --line-soft:  rgba(30,28,26,0.18);\r\n    --halftone:   #B7B2A8;\r\n    --accent:     #1E1C1A;\r\n\r\n    /* 폰트 패밀리 */\r\n    --font-title-en: 'JoseonSolidGothic', 'Pretendard', sans-serif;\r\n    --font-body-kr: 'KoPubWorld Dotum', 'Apple SD Gothic Neo', 'Noto Sans JP', sans-serif;\r\n    --font-em-kr: 'PalchilmmDailyItalic', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;\r\n    --font-strong-kr: 'JoseonBoldGothic', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;\r\n    --font-quote-kr: 'GyeonggiMillenniumTitle', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;\r\n    --font-mono: 'JetBrains Mono', 'Courier New', monospace;\r\n    --font-inner-kr: 'KoPubWorld Batang', 'Noto Sans JP', serif;\r\n\r\n    /* ── 텍스트 크기 (데스크톱) ── */\r\n    --size-title:        24px;\r\n    --size-body:         15.5px;\r\n    --size-body-line:    1.7;\r\n    --size-h1:           22px;\r\n    --size-h2:           20px;\r\n    --size-h3:           18px;\r\n    --size-tab-num:      13px;\r\n    --size-bar:          10px;\r\n    --size-quote:        18px;\r\n}\r\n\r\n/* ============================================================================\r\n    기본 리셋\r\n============================================================================ */\r\n/* ============================================================================\r\n    바깥 컨테이너\r\n============================================================================ */\r\n.mg {\r\n    display: block;\r\n    width: 1100px;\r\n    max-width: 96vw;\r\n    margin: 32px auto;\r\n    box-sizing: border-box;\r\n    font-family: var(--font-body-kr);\r\n}\r\n\r\n.mg__sheet {\r\n    display: flex;\r\n    flex-direction: row;\r\n    width: 100%;\r\n    background: var(--paper);\r\n    border: 1.5px solid var(--line);\r\n    box-shadow:\r\n        5px 5px 0 rgba(30,28,26,0.06),\r\n        0 1px 2px rgba(30,28,26,0.08);\r\n    position: relative;\r\n}\r\n\r\n/* ============================================================================\r\n    좌측 패널\r\n============================================================================ */\r\n.mg__panel-l {\r\n    width: 320px;\r\n    flex-shrink: 0;\r\n    position: relative;\r\n    background: var(--ink);\r\n    overflow: hidden;\r\n}\r\n\r\n.mg__frame {\r\n    width: 100%;\r\n    height: 100%;\r\n    min-height: 420px;\r\n    position: relative;\r\n    overflow: hidden;\r\n}\r\n\r\n.mg__frame > * {\r\n    position: relative !important;\r\n    top: 0 !important;\r\n    left: 0 !important;\r\n    width: 100% !important;\r\n    height: 100% !important;\r\n    background-size: cover !important;\r\n    background-position: center 22% !important;\r\n    border-radius: 0 !important;\r\n    transform: none !important;\r\n    margin: 0 !important;\r\n    padding: 0 !important;\r\n    box-shadow: none !important;\r\n    border: none !important;\r\n    object-fit: cover !important;\r\n}\r\n.mg__frame > * img,\r\n.mg__frame img {\r\n    width: 100% !important;\r\n    height: 100% !important;\r\n    object-fit: cover !important;\r\n    object-position: center 22% !important;\r\n    border-radius: 0 !important;\r\n}\r\n\r\n/* 넘버 탭 */\r\n.mg__tab {\r\n    position: absolute;\r\n    top: 14px;\r\n    left: 14px;\r\n    z-index: 3;\r\n    display: flex;\r\n    align-items: center;\r\n    gap: 8px;\r\n    background: var(--paper);\r\n    border: 1.5px solid var(--line);\r\n    padding: 4px 10px 4px 8px;\r\n}\r\n.mg__tab-num {\r\n    font-family: var(--font-mono);\r\n    font-size: var(--size-tab-num);\r\n    font-weight: 700;\r\n    color: var(--ink);\r\n    letter-spacing: 0.02em;\r\n}\r\n.mg__tab-line {\r\n    width: 14px;\r\n    height: 1px;\r\n    background: var(--ink);\r\n    display: block;\r\n}\r\n\r\n/* ============================================================================\r\n    거터\r\n============================================================================ */\r\n.mg__gutter {\r\n    width: 10px;\r\n    flex-shrink: 0;\r\n    background: var(--ink);\r\n    position: relative;\r\n    background-image: linear-gradient(to right, transparent 0%, transparent 45%, var(--paper-deep) 45%, var(--paper-deep) 55%, transparent 55%);\r\n}\r\n.mg__gutter::before {\r\n    content: '';\r\n    position: absolute;\r\n    top: 0;\r\n    right: -26px;\r\n    width: 26px;\r\n    height: 100%;\r\n    background-image: radial-gradient(var(--halftone) 1px, transparent 1.3px);\r\n    background-size: 4px 4px;\r\n    -webkit-mask-image: linear-gradient(to right, black, transparent);\r\n    mask-image: linear-gradient(to right, black, transparent);\r\n    opacity: 0.22;\r\n    pointer-events: none;\r\n}\r\n\r\n/* ============================================================================\r\n    우측 패널 — 본문\r\n============================================================================ */\r\n.mg__panel-r {\r\n    flex: 1;\r\n    min-width: 0;\r\n    display: flex;\r\n    flex-direction: column;\r\n    padding: 22px 0px 5px 32px;\r\n    position: relative;\r\n    z-index: 0;\r\n    isolation: isolate;\r\n}\r\n\r\n/* 종이 질감 노이즈 */\r\n.mg__panel-r::before {\r\n    content: '';\r\n    position: absolute;\r\n    inset: 0;\r\n    pointer-events: none;\r\n    z-index: 1;\r\n    opacity: 1;\r\n    mix-blend-mode: multiply;\r\n    background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch' result='t'/%3E%3CfeColorMatrix in='t' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\");\r\n    background-size: 160px 160px;\r\n}\r\n\r\n/* 디더링 오버레이 */\r\n.mg__panel-r::after {\r\n    content: '';\r\n    position: absolute;\r\n    inset: 0;\r\n    pointer-events: none;\r\n    z-index: 2;\r\n    opacity: 0.5;\r\n    mix-blend-mode: multiply;\r\n    background-image: radial-gradient(var(--ink) 0.55px, transparent 0.6px);\r\n    background-size: 3px 3px;\r\n    background-position: 0 0;\r\n    -webkit-mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.45) 4%, transparent 9%);\r\n    mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.45) 4%, transparent 9%);\r\n}\r\n\r\n.mg__head,\r\n.mg__rule,\r\n.mg__text,\r\n.mg__bar {\r\n    position: relative;\r\n    z-index: 3;\r\n}\r\n\r\n/* ── 헤더 ── */\r\n.mg__head {\r\n    display: flex;\r\n    flex-direction: column;\r\n    margin-bottom: 8px;\r\n    width: calc(100% - 32px);\r\n    min-width: 0;\r\n}\r\n.mg__title-row {\r\n    display: flex !important;\r\n    flex-wrap: nowrap !important;\r\n    align-items: baseline;\r\n    gap: 9px;\r\n    width: 100%;\r\n    min-width: 0;\r\n    overflow: hidden;\r\n    white-space: nowrap;\r\n}\r\n.mg__title {\r\n    font-family: var(--font-title-en);\r\n    font-size: var(--size-title);\r\n    font-weight: 800;\r\n    color: var(--ink);\r\n    letter-spacing: 0.01em;\r\n    text-transform: uppercase;\r\n    line-height: 1.05;\r\n    overflow: hidden;\r\n    text-overflow: ellipsis;\r\n    white-space: nowrap;\r\n    flex-grow: 0;\r\n    flex-shrink: 0;\r\n    max-width: calc(100% - 50px);\r\n}\r\n.mg__connector {\r\n    font-family: var(--font-body-kr);\r\n    font-size: calc(var(--size-title) * 1.1);\r\n    font-weight: 400;\r\n    color: var(--ink-faint);\r\n    line-height: 1;\r\n    transform: translateY(-1px);\r\n    flex-shrink: 0;\r\n    margin-right: 2px;\r\n    transform: translateY(1.4px);\r\n}\r\n.mg__costar {\r\n    font-family: var(--font-body-kr);\r\n    font-size: calc(var(--size-title) * 1.04);\r\n    font-weight: 500;\r\n    color: var(--ink-soft);\r\n    letter-spacing: 0.02em;\r\n    line-height: 1.1;\r\n    overflow: hidden;\r\n    text-overflow: ellipsis;\r\n    white-space: nowrap;\r\n    flex-grow: 1;\r\n    flex-shrink: 1;\r\n    min-width: 0;\r\n}\r\n\r\n/* ── 구분선 */\r\n.mg__rule {\r\n    height: 3px;\r\n    width: calc(100% - 32px);\r\n    background: var(--ink);\r\n    margin-bottom: 2px;\r\n    flex-shrink: 0;\r\n}\r\n.mg__head + .mg__rule {\r\n    position: relative;\r\n}\r\n.mg__head + .mg__rule::before {\r\n    content: '';\r\n    position: absolute;\r\n    top: 5px;\r\n    left: 0;\r\n    width: 100%;\r\n    height: 1px;\r\n    background: var(--ink);\r\n}\r\n\r\n.mg__rule--bottom {\r\n    height: 1.5px;\r\n    background: var(--line-soft);\r\n    margin-bottom: 4px;\r\n}\r\n\r\n/* ============================================================================\r\n    본문 텍스트 영역\r\n============================================================================ */\r\n.mg__text {\r\n    width: 100%;\r\n    flex: 1;\r\n    color: var(--ink);\r\n    font-family: var(--font-body-kr);\r\n    font-size: var(--size-body);\r\n    line-height: var(--size-body-line);\r\n    font-weight: 400;\r\n    letter-spacing: -0.01em;\r\n    max-height: 500px;\r\n    min-height: 360px;\r\n    overflow-x: hidden !important;\r\n    overflow-y: auto;\r\n    padding-top: 14px; \r\n    padding-right: 27px;\r\n    word-wrap: break-word !important;\r\n    overflow-wrap: break-word !important;\r\n    word-break: break-word !important;\r\n}\r\n\r\n/* 스크롤바 */\r\n.mg__text::-webkit-scrollbar {\r\n    width: 6px !important;\r\n    height: 6px !important;\r\n}\r\n\r\n.mg__text::-webkit-scrollbar-track {\r\n    background: transparent !important;\r\n    border-radius: 0px !important;\r\n    border: none !important;\r\n    box-shadow: none !important;\r\n}\r\n\r\n.mg__text::-webkit-scrollbar-thumb {\r\n    background-color: #D8D4CB !important;\r\n    border-radius: 0px !important;\r\n    border: none !important;\r\n    box-shadow: none !important;\r\n}\r\n\r\n.mg__text::-webkit-scrollbar-thumb:hover {\r\n    background-color: #C5C0B5 !important;\r\n    border-radius: 0px !important;\r\n}\r\n\r\n.mg__text::-webkit-scrollbar-corner {\r\n    background: transparent !important;\r\n}\r\n\r\n.mg__text > :first-child {\r\n    margin-top: 0;\r\n}\r\n.mg__text * {\r\n    max-width: 100% !important;\r\n    overflow-wrap: break-word !important;\r\n    word-break: break-word !important;\r\n}\r\n\r\n/* 폰트 사이즈 일괄 적용 */\r\n.mg__text p,\r\n.mg__text li,\r\n.mg__text strong,\r\n.mg__text em,\r\n.mg__text span,\r\n.mg__text mark {\r\n    font-family: var(--font-body-kr) !important;\r\n    font-size: var(--size-body) !important;\r\n}\r\n\r\n.mg__text p,\r\n.mg__text li {\r\n    font-family: var(--font-body-kr) !important;\r\n    margin-bottom: 0.9em;\r\n    color: var(--ink) !important;\r\n    font-weight: 400;\r\n    line-height: var(--size-body-line);\r\n}\r\n.mg__text p {\r\n    text-indent: 0;\r\n}\r\n\r\n/* # 헤더 */\r\n.mg__text h1,\r\n.mg__text h2,\r\n.mg__text h3 {\r\n    font-family: var(--font-body-kr) !important;\r\n    color: var(--ink) !important;\r\n    font-weight: 800 !important;\r\n    letter-spacing: 0.02em;\r\n    margin-bottom: 0.7em !important;\r\n    text-indent: 0;\r\n    padding-bottom: 6px;\r\n    border-bottom: 2px solid var(--ink);\r\n    display: block !important;\r\n    width: 100% !important;\r\n    clear: both;\r\n}\r\n\r\n.mg__text h1 {\r\n    font-size: var(--size-h1);\r\n    margin-top: 0;\r\n}\r\n.mg__text h2 {\r\n    font-size: var(--size-h2);\r\n    margin-top: 0;\r\n}\r\n.mg__text h3 {\r\n    font-size: var(--size-h3);\r\n    margin-top: 0;\r\n}\r\n\r\n/* **강조** */\r\n.mg__text strong {\r\n    font-family: var(--font-strong-kr);\r\n    font-style: italic !important;\r\n    color: var(--ink) !important;\r\n    font-weight: 700 !important;\r\n    background: linear-gradient( transparent 45%,  rgba(30,28,26,0.12) 45%, rgba(30,28,26,0.12) 88%, transparent 88% );\r\n    padding: 0 1px;\r\n    margin-right: 2.5px;\r\n}\r\n\r\n/* *기울임* */\r\n.mg__text em {\r\n    font-family: var(--font-em-kr);\r\n    font-style: italic !important;\r\n    font-weight: 400;\r\n    color: var(--ink-soft) !important;\r\n    -webkit-text-fill-color: var(--ink-soft) !important;\r\n    text-decoration: none !important;\r\n    display: inline-block !important;\r\n    transform: scaleX(0.94);\r\n    transform-origin: left center;\r\n    white-space: inherit !important;\r\n    margin-right: 1.5px;\r\n}\r\n.mg__text em::before,\r\n.mg__text em::after {\r\n    display: none !important;\r\n    content: none !important;\r\n}\r\n\r\n/* \"큰따옴표\" quote2 */\r\n.mg__text mark[risu-mark=\"quote2\"] {\r\n    font-family: var(--font-body-kr);\r\n    display: inline !important;\r\n    font-weight: 500 !important;\r\n    font-style: normal !important;\r\n    color: var(--ink) !important;\r\n    -webkit-text-stroke: 0.2px var(--ink);\r\n    -webkit-text-fill-color: var(--ink) !important;\r\n    background: var(--paper) !important;\r\n    background-image: none !important;\r\n    background-clip: border-box !important;\r\n    -webkit-background-clip: border-box !important;\r\n    border: 1.5px solid var(--ink) !important;\r\n    border-radius: 3px !important;\r\n    padding: 1px 4px 0 !important;\r\n    line-height: inherit !important;\r\n    white-space: inherit !important;\r\n    box-shadow: none !important;\r\n}\r\n.mg__text mark[risu-mark=\"quote2\"]::before,\r\n.mg__text mark[risu-mark=\"quote2\"]::after {\r\n    display: none !important;\r\n    content: none !important;\r\n}\r\n.mg__text mark[risu-mark=\"quote2\"] em {\r\n    font-family: var(--font-em-kr);\r\n    color: var(--ink-soft) !important;\r\n    -webkit-text-fill-color: var(--ink-soft) !important;\r\n    font-style: italic !important;\r\n    font-size: 16.5px !important;\r\n}\r\n\r\n/* '작은따옴표' quote1 */\r\n.mg__text mark[risu-mark=\"quote1\"] {\r\n    display: inline !important;\r\n    font-family: var(--font-inner-kr) !important;\r\n    font-weight: 400 !important;\r\n    font-style: normal;\r\n    color: var(-…10063 tokens truncated…    const role = isUserMessage(original) ? 'user' : 'character';
    const detectedName = role === 'character' ? extractCharacterName(markdown) : '';
    if (detectedName) cachedCharacterName = detectedName;
    const characterName = cachedCharacterName || 'CHARACTER';
    const mainTitle = role === 'character' ? characterName : 'YOU';
    const costar = role === 'character' ? 'YOU' : characterName;
    const firstImageUrl = role === 'character' ? String(markdown.querySelector('img[src]')?.src || '') : '';
    const signature = JSON.stringify([
      role,
      markdown.innerHTML,
      theme.userAvatarUrl,
      theme.characterFallbackUrl,
      characterName,
    ]);

    const existingCard = getDirectCard(group);
    if (existingCard && renderSignatures.get(group) === signature) {
      mountOptionProxy(group, existingCard);
      return;
    }

    existingCard?.remove();

    const card = document.createElement('div');
    card.className = 'mg cmt-card';
    const sheet = document.createElement('div');
    sheet.className = 'mg__sheet';

    const left = document.createElement('div');
    left.className = 'mg__panel-l';
    const frame = document.createElement('div');
    frame.className = 'mg__frame';
    if (role === 'character') {
      addPortrait(frame, firstImageUrl, theme.characterFallbackUrl, characterName.toUpperCase());
    } else {
      addPortrait(frame, theme.userAvatarUrl, '', 'YOU');
    }
    const tab = document.createElement('div');
    tab.className = 'mg__tab';
    const tabNumber = document.createElement('span');
    tabNumber.className = 'mg__tab-num';
    tabNumber.textContent = String((index % 99) + 1).padStart(2, '0');
    const tabLine = document.createElement('span');
    tabLine.className = 'mg__tab-line';
    tab.append(tabNumber, tabLine);
    left.append(frame, tab);

    const gutter = document.createElement('div');
    gutter.className = 'mg__gutter';
    gutter.setAttribute('aria-hidden', 'true');

    const right = document.createElement('div');
    right.className = 'mg__panel-r';
    const head = document.createElement('div');
    head.className = 'mg__head';
    const titleRow = document.createElement('div');
    titleRow.className = 'mg__title-row';
    const title = document.createElement('span');
    title.className = 'mg__title';
    title.textContent = mainTitle;
    const connector = document.createElement('span');
    connector.className = 'mg__connector';
    connector.textContent = '×';
    const costarEl = document.createElement('span');
    costarEl.className = 'mg__costar';
    costarEl.textContent = costar;
    titleRow.append(title, connector, costarEl);
    head.appendChild(titleRow);

    const ruleTop = document.createElement('div');
    ruleTop.className = 'mg__rule';
    const text = document.createElement('div');
    text.className = 'mg__text';
    text.appendChild(prepareMarkdownClone(markdown, role));
    const ruleBottom = document.createElement('div');
    ruleBottom.className = 'mg__rule mg__rule--bottom';
    const bar = document.createElement('div');
    bar.className = 'mg__bar';
    const plugin = document.createElement('div');
    plugin.className = 'mg__plugin';
    const pluginText = document.createElement('span');
    pluginText.textContent = role === 'character' ? 'CHARACTER MESSAGE' : 'USER MESSAGE';
    plugin.appendChild(pluginText);
    const mark = document.createElement('span');
    mark.className = 'mg__bar-mark';
    mark.textContent = '※';
    const buttons = document.createElement('div');
    buttons.className = 'mg__buttons';
    const optionProxy = createOptionProxy(group);
    if (optionProxy) buttons.appendChild(optionProxy);
    bar.append(plugin, mark, buttons);
    right.append(head, ruleTop, text, ruleBottom, bar);
    sheet.append(left, gutter, right);
    card.appendChild(sheet);

    group.insertBefore(card, original);
    group.classList.add('cmt-theme-group', role === 'character' ? 'cmt-role-character' : 'cmt-role-user');
    group.classList.remove(role === 'character' ? 'cmt-role-user' : 'cmt-role-character');
    renderSignatures.set(group, signature);
  }

  function renderAllMessages() {
    if (!isChatRoute()) return;
    const groups = Array.from(document.querySelectorAll('[data-message-group-id]'));
    if (!theme.enabled) {
      groups.forEach(clearThemeGroup);
      return;
    }

    for (const group of groups) {
      const original = getOriginalRoot(group);
      if (!original || isUserMessage(original)) continue;
      const name = extractCharacterName(original.querySelector('.wrtn-markdown'));
      if (name) {
        cachedCharacterName = name;
        break;
      }
    }
    groups.forEach((group, index) => renderMessage(group, index));
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderAllMessages, 120);
  }

  function applyTheme() {
    renderAllMessages();
    scheduleRender();
  }

  function findHeaderHost() {
    const aiSummaryButton = document.querySelector('button[data-ce-ai-summary="true"]');
    if (aiSummaryButton?.parentElement) return aiSummaryButton.parentElement;
    const header = Array.from(document.querySelectorAll('div.absolute')).find(element => (
      element.classList.contains('z-[5]')
      && element.classList.contains('h-12')
      && element.classList.contains('justify-between')
    ));
    if (!header) return null;
    return Array.from(header.children).find(element => (
      element instanceof HTMLElement
      && element.classList.contains('flex')
      && element.classList.contains('items-center')
      && element.querySelector('button')
    )) || header.querySelector('div.flex.items-center');
  }

  function mountSettingsButton() {
    const existing = document.getElementById('cmt-settings-button');
    if (!isChatRoute()) {
      existing?.remove();
      return;
    }
    const host = findHeaderHost();
    if (!host) {
      existing?.remove();
      return;
    }
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = 'cmt-settings-button';
      button.type = 'button';
      button.title = 'Risu 망가 테마 설정';
      button.setAttribute('aria-label', 'Risu 망가 테마 설정');
      button.textContent = '🎨';
      button.addEventListener('click', openPanel);
    }
    if (button.parentElement !== host) host.insertBefore(button, host.firstChild);
  }

  function value(id) {
    return panel?.querySelector('#' + id)?.value?.trim() || '';
  }

  function checked(id) {
    return Boolean(panel?.querySelector('#' + id)?.checked);
  }

  function makeButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ('cmt-ui-btn ' + (className || '')).trim();
    button.textContent = label;
    button.addEventListener('click', () => withBusy(handler));
    return button;
  }

  function addField(host, id, label, type, current, placeholder, disabled = false) {
    const wrap = document.createElement('label');
    wrap.className = 'cmt-ui-field';
    wrap.textContent = label;
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.value = current || '';
    input.placeholder = placeholder || '';
    input.autocomplete = type === 'password' ? 'new-password' : 'off';
    input.disabled = disabled;
    wrap.appendChild(input);
    host.appendChild(wrap);
  }

  async function withBusy(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } catch (error) {
      setStatus('❌ ' + shortError(error), 'error');
    } finally {
      busy = false;
      renderPanel();
    }
  }

  async function saveThemeFromPanel() {
    theme = {
      enabled: checked('cmt-enabled'),
      userAvatarUrl: cleanImageUrl(value('cmt-user-avatar')),
      characterFallbackUrl: cleanImageUrl(value('cmt-character-fallback')),
      updatedAt: new Date().toISOString(),
    };
    await persistTheme();
    applyTheme();
    setStatus('✅ 이 기기에 테마 설정 저장함.');
    if (cloudReady()) await uploadTheme();
  }

  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cmt-ui-head';
    const title = document.createElement('div');
    title.className = 'cmt-ui-title';
    title.textContent = '🎨 Risu 망가 테마';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cmt-ui-close';
    close.textContent = '×';
    close.addEventListener('click', closePanel);
    head.append(title, close);
    panel.appendChild(head);

    const appearance = document.createElement('div');
    appearance.className = 'cmt-ui-card';
    appearance.innerHTML = '<h3>프로필 이미지</h3><p class="cmt-ui-note">캐릭터는 응답 본문의 첫 이미지를 우선 사용하고 본문에서는 그 이미지를 숨김. 이미지가 없을 때만 기본 URL을 사용함.</p>';
    const toggle = document.createElement('label');
    toggle.className = 'cmt-ui-check';
    const checkbox = document.createElement('input');
    checkbox.id = 'cmt-enabled';
    checkbox.type = 'checkbox';
    checkbox.checked = theme.enabled !== false;
    toggle.append(checkbox, document.createTextNode('망가 테마 사용'));
    appearance.appendChild(toggle);
    addField(appearance, 'cmt-user-avatar', '내 프사 URL', 'url', theme.userAvatarUrl, 'https://...');
    addField(appearance, 'cmt-character-fallback', '캐릭터 기본 이미지 URL', 'url', theme.characterFallbackUrl, '응답에 이미지가 없을 때 사용');
    const appearanceRow = document.createElement('div');
    appearanceRow.className = 'cmt-ui-row';
    appearanceRow.append(
      makeButton('저장 및 적용', 'primary', saveThemeFromPanel),
      makeButton('이미지 URL 비우기', '', async () => {
        theme = { ...theme, userAvatarUrl: '', characterFallbackUrl: '', updatedAt: new Date().toISOString() };
        await persistTheme();
        applyTheme();
        setStatus('이미지 URL을 비웠음.');
        if (cloudReady()) await uploadTheme();
      }),
    );
    appearance.appendChild(appearanceRow);
    panel.appendChild(appearance);

    const supabase = document.createElement('div');
    supabase.className = 'cmt-ui-card';
    supabase.innerHTML = '<h3>Supabase 연결</h3><p class="cmt-ui-note">기존 로어 동기화와 같은 Project URL·Publishable key·계정을 쓰면 됨. 별도 테이블은 필요 없음.</p>';
    addField(supabase, 'cmt-project-url', 'Project URL', 'url', connection.projectUrl, 'https://...supabase.co');
    addField(supabase, 'cmt-publishable-key', 'Publishable / anon key', 'password', connection.publishableKey, 'sb_publishable_... 또는 eyJ...');
    addField(supabase, 'cmt-device-label', '이 기기 이름', 'text', connection.deviceLabel, '예: 아이폰 / 내 컴퓨터');
    const saveConnectionButton = makeButton('연결 정보 저장', '', async () => {
      connection.projectUrl = value('cmt-project-url');
      connection.publishableKey = value('cmt-publishable-key');
      connection.deviceLabel = value('cmt-device-label') || '내 기기';
      validateConnection();
      await persistConnection();
      setStatus('✅ Supabase 연결 정보를 이 기기에 저장함.');
    });
    supabase.appendChild(saveConnectionButton);
    panel.appendChild(supabase);

    const account = document.createElement('div');
    account.className = 'cmt-ui-card';
    account.innerHTML = '<h3>동기화 계정</h3>';
    const loggedIn = Boolean(session?.access_token);
    const accountNote = document.createElement('p');
    accountNote.className = 'cmt-ui-note';
    accountNote.textContent = loggedIn
      ? '🟢 ' + (session?.user?.email || connection.email || '저장된 계정') + '으로 로그인 중. 비밀번호는 저장하지 않음.'
      : '기존 로어 동기화와 같은 Supabase 이메일·비밀번호를 입력하면 됨.';
    account.appendChild(accountNote);
    addField(account, 'cmt-email', '이메일', 'email', connection.email, '내 이메일', loggedIn);
    addField(account, 'cmt-password', '계정 비밀번호', 'password', '', 'Supabase 계정 비밀번호', loggedIn);
    const accountRow = document.createElement('div');
    accountRow.className = 'cmt-ui-row';
    if (loggedIn) {
      accountRow.appendChild(makeButton('로그아웃', 'danger', async () => {
        await persistSession(null);
        setStatus('로그아웃됨.');
      }));
    } else {
      accountRow.append(
        makeButton('가입', '', async () => {
          connection.projectUrl = value('cmt-project-url') || connection.projectUrl;
          connection.publishableKey = value('cmt-publishable-key') || connection.publishableKey;
          connection.deviceLabel = value('cmt-device-label') || connection.deviceLabel || '내 기기';
          const email = value('cmt-email');
          const password = value('cmt-password');
          if (!email || !password) throw new Error('이메일과 비밀번호를 입력해줘.');
          await persistConnection();
          const active = await signUp(email, password);
          setStatus(active ? '✅ 가입과 로그인 완료.' : '✅ 가입됨. 인증 메일을 누른 뒤 로그인해줘.');
        }),
        makeButton('로그인', 'primary', async () => {
          connection.projectUrl = value('cmt-project-url') || connection.projectUrl;
          connection.publishableKey = value('cmt-publishable-key') || connection.publishableKey;
          connection.deviceLabel = value('cmt-device-label') || connection.deviceLabel || '내 기기';
          const email = value('cmt-email');
          const password = value('cmt-password');
          if (!email || !password) throw new Error('이메일과 비밀번호를 입력해줘.');
          await persistConnection();
          await signIn(email, password);
          setStatus('✅ 로그인 완료. 동기화 암호를 저장한 뒤 클라우드 설정 받기를 눌러줘.');
        }),
      );
    }
    account.appendChild(accountRow);
    panel.appendChild(account);

    const sync = document.createElement('div');
    sync.className = 'cmt-ui-card';
    sync.innerHTML = '<h3>암호화 설정 동기화</h3><p class="cmt-ui-note">동기화 암호는 Supabase로 보내지지 않음. 폰과 컴퓨터에서 대소문자·띄어쓰기까지 같은 암호를 넣어야 함.</p>';
    addField(sync, 'cmt-passphrase', '동기화 암호', 'password', connection.syncPassphrase, '8자 이상, 양쪽 기기에서 동일하게');
    const syncRow = document.createElement('div');
    syncRow.className = 'cmt-ui-row';
    syncRow.append(
      makeButton('암호 저장', '', async () => {
        connection.syncPassphrase = value('cmt-passphrase');
        if (connection.syncPassphrase.length < 8) throw new Error('동기화 암호는 8자 이상이어야 함.');
        await persistConnection();
        setStatus('✅ 동기화 암호를 이 기기에 저장함.');
      }),
      makeButton('클라우드 설정 받기', 'primary', async () => {
        connection.syncPassphrase = value('cmt-passphrase') || connection.syncPassphrase;
        await persistConnection();
        await downloadTheme();
      }),
      makeButton('이 기기 설정 업로드', '', async () => {
        connection.syncPassphrase = value('cmt-passphrase') || connection.syncPassphrase;
        await persistConnection();
        await uploadTheme();
      }),
      makeButton('강제 복원', 'danger', async () => {
        if (!confirm('이 기기의 프사 설정을 클라우드 값으로 덮어씀. 계속할까?')) return;
        connection.syncPassphrase = value('cmt-passphrase') || connection.syncPassphrase;
        await persistConnection();
        await downloadTheme({ force: true });
      }),
      makeButton('강제 업로드', 'danger', async () => {
        if (!confirm('클라우드의 프사 설정을 이 기기 값으로 덮어씀. 계속할까?')) return;
        connection.syncPassphrase = value('cmt-passphrase') || connection.syncPassphrase;
        await persistConnection();
        await uploadTheme({ force: true });
      }),
    );
    sync.appendChild(syncRow);
    panel.appendChild(sync);

    statusEl = document.createElement('div');
    statusEl.className = ('cmt-ui-status ' + latestStatusTone).trim();
    statusEl.textContent = latestStatus || '로컬 테마는 바로 적용됨. 클라우드 동기화는 로그인 후 사용 가능.\n이번 동기화 0.00원 · 누적 0.00원';
    panel.appendChild(statusEl);
    const meta = document.createElement('div');
    meta.className = 'cmt-ui-meta';
    meta.textContent = 'Theme v' + VERSION
      + ' · 마지막 동기화: ' + (syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : '아직 없음')
      + ' · 요청 ' + Number(syncState.totalRequests || 0) + '회 · Supabase user_metadata에 AES-256-GCM 암호화 저장';
    panel.appendChild(meta);
  }

  function openPanel() {
    if (document.getElementById('cmt-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cmt-overlay';
    panel = document.createElement('div');
    panel.id = 'cmt-panel';
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) closePanel(); });
    document.body.appendChild(overlay);
    renderPanel();
  }

  function closePanel() {
    document.getElementById('cmt-overlay')?.remove();
    panel = null;
    statusEl = null;
  }

  function routeTick() {
    if (!isChatRoute()) {
      document.getElementById('cmt-settings-button')?.remove();
      document.querySelectorAll('[data-message-group-id].cmt-theme-group').forEach(clearThemeGroup);
      return;
    }
    mountSettingsButton();
    scheduleRender();
  }

  async function emergencyDisable() {
    theme = { ...theme, enabled: false, updatedAt: new Date().toISOString() };
    await persistTheme();
    applyTheme();
    alert('망가 테마를 껐음. 다시 켜려면 채팅방의 🎨 버튼을 누르면 됨.');
  }

  async function initialize() {
    if (window.CrackRisuMangaTheme?.started) return;
    injectStyle();
    document.documentElement.setAttribute('data-cmt-version', VERSION);
    console.info('[Crack Manga Theme] v' + VERSION + ' started');
    await loadState();

    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return !element?.closest('#cmt-overlay, .cmt-card');
      });
      if (relevant) scheduleRender();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'class'],
    });

    routeTick();
    applyTheme();
    window.setInterval(routeTick, 1000);
    window.setInterval(autoSync, AUTO_SYNC_MS);
    if (cloudReady()) void autoSync();

    window.CrackRisuMangaTheme = {
      started: true,
      version: VERSION,
      refresh: applyTheme,
      openSettings: openPanel,
      disable: emergencyDisable,
      getState: () => ({
        path: location.pathname,
        enabled: theme.enabled !== false,
        cards: document.querySelectorAll('.cmt-card').length,
        settingsButton: Boolean(document.getElementById('cmt-settings-button')),
      }),
    };
  }

  function startDelayed() {
    window.setTimeout(() => {
      initialize().catch(error => console.warn('[Crack Manga Theme] init failed:', error));
    }, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDelayed, { once: true });
  } else {
    startDelayed();
  }
})();

