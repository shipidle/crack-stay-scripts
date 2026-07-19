// ==UserScript==
// @name         크랙 Risu 망가 채팅 테마
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.0.0
// @description  크랙 채팅을 Risu 망가 카드 스타일로 바꾸고 프로필 이미지 설정을 Supabase로 동기화합니다.
// @author       shipidle
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @match        https://crack.wrtn.ai/
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/agent/crack-risu-manga-theme-v1/Crack_Risu_Manga_Theme.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/agent/crack-risu-manga-theme-v1/Crack_Risu_Manga_Theme.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      supabase.co
// @run-at       document-idle
// ==/UserScript==

/* global GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_registerMenuCommand */

(() => {
  'use strict';

  const VERSION = '1.0.0';
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

  const MANGA_CSS = String.raw`
/* ============================================================================
    MANGA THEME
============================================================================ */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
@font-face {
font-family: 'KoPubWorld Dotum';
font-style: normal;
font-weight: 300;
src: local('KoPubWorldDotum'),
    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.woff2') format('woff2'),
    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.woff') format('woff'),
    url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Light.otf') format('opentype');
}
@font-face {
    font-family: 'KoPubWorld Dotum';
    font-style: normal;
    font-weight: 400;
    src: local('KoPubWorldDotum'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.woff2') format('woff2'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.woff') format('woff'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Medium.otf') format('opentype');
}
@font-face {
    font-family: 'KoPubWorld Dotum';
    font-style: normal;
    font-weight: 700;
    src: local('KoPubWorldDotum'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.woff2') format('woff2'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.woff') format('woff'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Dotum-Bold.otf') format('opentype');
}
@font-face {
    font-family: 'KoPubWorld Batang';
    font-style: normal;
    font-weight: 400;
    src: local('KoPubWorldBatang'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.woff2') format('woff2'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.woff') format('woff'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Medium.otf') format('opentype');
}
@font-face {
    font-family: 'KoPubWorld Batang';
    font-style: normal;
    font-weight: 700;
    src: local('KoPubWorldBatang'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.woff2') format('woff2'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.woff') format('woff'),
        url('https://cdn.jsdelivr.net/npm/font-kopubworld@1.0/fonts/KoPubWorld-Batang-Bold.otf') format('opentype');
}
@font-face {
    font-family: 'JoseonSolidGothic';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunBg.woff') format('woff');
    font-weight: normal;
    font-display: swap;
}
@font-face {
    font-family: 'PalchilmmDailyItalic';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201@1.0/87MMILSANG-Oblique.woff2') format('woff2');
    font-weight: normal;
    font-display: swap;
}
@font-face {
    font-family: 'JoseonBoldGothic';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunKg.woff') format('woff');
    font-weight: normal;
    font-display: swap;
}
@font-face {
    font-family: 'GyeonggiMillenniumTitle';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2410-3@1.0/Title_Light.woff') format('woff');
    font-weight: 300;
    font-display: swap;
}
/* ----------------------------------------------------------------------------
    ✦ 빠른 수정 영역 ✦
---------------------------------------------------------------------------- */
.mg {
    /* 색상 */
    --ink:        #1E1C1A;
    --ink-soft:    #4A4744;
    --ink-faint:   #8A8680;
    --paper:      #F1EEE8;
    --paper-deep: #E7E3DB;
    --line:       #1E1C1A;
    --line-soft:  rgba(30,28,26,0.18);
    --halftone:   #B7B2A8;
    --accent:     #1E1C1A;

    /* 폰트 패밀리 */
    --font-title-en: 'JoseonSolidGothic', 'Pretendard', sans-serif;
    --font-body-kr: 'KoPubWorld Dotum', 'Apple SD Gothic Neo', 'Noto Sans JP', sans-serif;
    --font-em-kr: 'PalchilmmDailyItalic', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;
    --font-strong-kr: 'JoseonBoldGothic', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;
    --font-quote-kr: 'GyeonggiMillenniumTitle', 'KoPubWorld Dotum', 'Noto Sans JP', sans-serif;
    --font-mono: 'JetBrains Mono', 'Courier New', monospace;
    --font-inner-kr: 'KoPubWorld Batang', 'Noto Sans JP', serif;

    /* ── 텍스트 크기 (데스크톱) ── */
    --size-title:        24px;
    --size-body:         15.5px;
    --size-body-line:    1.7;
    --size-h1:           22px;
    --size-h2:           20px;
    --size-h3:           18px;
    --size-tab-num:      13px;
    --size-bar:          10px;
    --size-quote:        18px;
}

/* ============================================================================
    기본 리셋
============================================================================ */
/* ============================================================================
    바깥 컨테이너
============================================================================ */
.mg {
    display: block;
    width: 1100px;
    max-width: 96vw;
    margin: 32px auto;
    box-sizing: border-box;
    font-family: var(--font-body-kr);
}

.mg__sheet {
    display: flex;
    flex-direction: row;
    width: 100%;
    background: var(--paper);
    border: 1.5px solid var(--line);
    box-shadow:
        5px 5px 0 rgba(30,28,26,0.06),
        0 1px 2px rgba(30,28,26,0.08);
    position: relative;
}

/* ============================================================================
    좌측 패널
============================================================================ */
.mg__panel-l {
    width: 320px;
    flex-shrink: 0;
    position: relative;
    background: var(--ink);
    overflow: hidden;
}

.mg__frame {
    width: 100%;
    height: 100%;
    min-height: 420px;
    position: relative;
    overflow: hidden;
}

.mg__frame > * {
    position: relative !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background-size: cover !important;
    background-position: center 22% !important;
    border-radius: 0 !important;
    transform: none !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: none !important;
    object-fit: cover !important;
}
.mg__frame > * img,
.mg__frame img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    object-position: center 22% !important;
    border-radius: 0 !important;
}

/* 넘버 탭 */
.mg__tab {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--paper);
    border: 1.5px solid var(--line);
    padding: 4px 10px 4px 8px;
}
.mg__tab-num {
    font-family: var(--font-mono);
    font-size: var(--size-tab-num);
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.02em;
}
.mg__tab-line {
    width: 14px;
    height: 1px;
    background: var(--ink);
    display: block;
}

/* ============================================================================
    거터
============================================================================ */
.mg__gutter {
    width: 10px;
    flex-shrink: 0;
    background: var(--ink);
    position: relative;
    background-image: linear-gradient(to right, transparent 0%, transparent 45%, var(--paper-deep) 45%, var(--paper-deep) 55%, transparent 55%);
}
.mg__gutter::before {
    content: '';
    position: absolute;
    top: 0;
    right: -26px;
    width: 26px;
    height: 100%;
    background-image: radial-gradient(var(--halftone) 1px, transparent 1.3px);
    background-size: 4px 4px;
    -webkit-mask-image: linear-gradient(to right, black, transparent);
    mask-image: linear-gradient(to right, black, transparent);
    opacity: 0.22;
    pointer-events: none;
}

/* ============================================================================
    우측 패널 — 본문
============================================================================ */
.mg__panel-r {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 22px 0px 5px 32px;
    position: relative;
    z-index: 0;
    isolation: isolate;
}

/* 종이 질감 노이즈 */
.mg__panel-r::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    opacity: 1;
    mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch' result='t'/%3E%3CfeColorMatrix in='t' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 160px 160px;
}

/* 디더링 오버레이 */
.mg__panel-r::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    opacity: 0.5;
    mix-blend-mode: multiply;
    background-image: radial-gradient(var(--ink) 0.55px, transparent 0.6px);
    background-size: 3px 3px;
    background-position: 0 0;
    -webkit-mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.45) 4%, transparent 9%);
    mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.45) 4%, transparent 9%);
}

.mg__head,
.mg__rule,
.mg__text,
.mg__bar {
    position: relative;
    z-index: 3;
}

/* ── 헤더 ── */
.mg__head {
    display: flex;
    flex-direction: column;
    margin-bottom: 8px;
    width: calc(100% - 32px);
    min-width: 0;
}
.mg__title-row {
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: baseline;
    gap: 9px;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
}
.mg__title {
    font-family: var(--font-title-en);
    font-size: var(--size-title);
    font-weight: 800;
    color: var(--ink);
    letter-spacing: 0.01em;
    text-transform: uppercase;
    line-height: 1.05;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 0;
    flex-shrink: 0;
    max-width: calc(100% - 50px);
}
.mg__connector {
    font-family: var(--font-body-kr);
    font-size: calc(var(--size-title) * 1.1);
    font-weight: 400;
    color: var(--ink-faint);
    line-height: 1;
    transform: translateY(-1px);
    flex-shrink: 0;
    margin-right: 2px;
    transform: translateY(1.4px);
}
.mg__costar {
    font-family: var(--font-body-kr);
    font-size: calc(var(--size-title) * 1.04);
    font-weight: 500;
    color: var(--ink-soft);
    letter-spacing: 0.02em;
    line-height: 1.1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
    flex-shrink: 1;
    min-width: 0;
}

/* ── 구분선 */
.mg__rule {
    height: 3px;
    width: calc(100% - 32px);
    background: var(--ink);
    margin-bottom: 2px;
    flex-shrink: 0;
}
.mg__head + .mg__rule {
    position: relative;
}
.mg__head + .mg__rule::before {
    content: '';
    position: absolute;
    top: 5px;
    left: 0;
    width: 100%;
    height: 1px;
    background: var(--ink);
}

.mg__rule--bottom {
    height: 1.5px;
    background: var(--line-soft);
    margin-bottom: 4px;
}

/* ============================================================================
    본문 텍스트 영역
============================================================================ */
.mg__text {
    width: 100%;
    flex: 1;
    color: var(--ink);
    font-family: var(--font-body-kr);
    font-size: var(--size-body);
    line-height: var(--size-body-line);
    font-weight: 400;
    letter-spacing: -0.01em;
    max-height: 500px;
    min-height: 360px;
    overflow-x: hidden !important;
    overflow-y: auto;
    padding-top: 14px; 
    padding-right: 27px;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    word-break: break-word !important;
}

/* 스크롤바 */
.mg__text::-webkit-scrollbar {
    width: 6px !important;
    height: 6px !important;
}

.mg__text::-webkit-scrollbar-track {
    background: transparent !important;
    border-radius: 0px !important;
    border: none !important;
    box-shadow: none !important;
}

.mg__text::-webkit-scrollbar-thumb {
    background-color: #D8D4CB !important;
    border-radius: 0px !important;
    border: none !important;
    box-shadow: none !important;
}

.mg__text::-webkit-scrollbar-thumb:hover {
    background-color: #C5C0B5 !important;
    border-radius: 0px !important;
}

.mg__text::-webkit-scrollbar-corner {
    background: transparent !important;
}

.mg__text > :first-child {
    margin-top: 0;
}
.mg__text * {
    max-width: 100% !important;
    overflow-wrap: break-word !important;
    word-break: break-word !important;
}

/* 폰트 사이즈 일괄 적용 */
.mg__text p,
.mg__text li,
.mg__text strong,
.mg__text em,
.mg__text span,
.mg__text mark {
    font-family: var(--font-body-kr) !important;
    font-size: var(--size-body) !important;
}

.mg__text p,
.mg__text li {
    font-family: var(--font-body-kr) !important;
    margin-bottom: 0.9em;
    color: var(--ink) !important;
    font-weight: 400;
    line-height: var(--size-body-line);
}
.mg__text p {
    text-indent: 0;
}

/* # 헤더 */
.mg__text h1,
.mg__text h2,
.mg__text h3 {
    font-family: var(--font-body-kr) !important;
    color: var(--ink) !important;
    font-weight: 800 !important;
    letter-spacing: 0.02em;
    margin-bottom: 0.7em !important;
    text-indent: 0;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--ink);
    display: block !important;
    width: 100% !important;
    clear: both;
}

.mg__text h1 {
    font-size: var(--size-h1);
    margin-top: 0;
}
.mg__text h2 {
    font-size: var(--size-h2);
    margin-top: 0;
}
.mg__text h3 {
    font-size: var(--size-h3);
    margin-top: 0;
}

/* **강조** */
.mg__text strong {
    font-family: var(--font-strong-kr);
    font-style: italic !important;
    color: var(--ink) !important;
    font-weight: 700 !important;
    background: linear-gradient( transparent 45%,  rgba(30,28,26,0.12) 45%, rgba(30,28,26,0.12) 88%, transparent 88% );
    padding: 0 1px;
    margin-right: 2.5px;
}

/* *기울임* */
.mg__text em {
    font-family: var(--font-em-kr);
    font-style: italic !important;
    font-weight: 400;
    color: var(--ink-soft) !important;
    -webkit-text-fill-color: var(--ink-soft) !important;
    text-decoration: none !important;
    display: inline-block !important;
    transform: scaleX(0.94);
    transform-origin: left center;
    white-space: inherit !important;
    margin-right: 1.5px;
}
.mg__text em::before,
.mg__text em::after {
    display: none !important;
    content: none !important;
}

/* "큰따옴표" quote2 */
.mg__text mark[risu-mark="quote2"] {
    font-family: var(--font-body-kr);
    display: inline !important;
    font-weight: 500 !important;
    font-style: normal !important;
    color: var(--ink) !important;
    -webkit-text-stroke: 0.2px var(--ink);
    -webkit-text-fill-color: var(--ink) !important;
    background: var(--paper) !important;
    background-image: none !important;
    background-clip: border-box !important;
    -webkit-background-clip: border-box !important;
    border: 1.5px solid var(--ink) !important;
    border-radius: 3px !important;
    padding: 1px 4px 0 !important;
    line-height: inherit !important;
    white-space: inherit !important;
    box-shadow: none !important;
}
.mg__text mark[risu-mark="quote2"]::before,
.mg__text mark[risu-mark="quote2"]::after {
    display: none !important;
    content: none !important;
}
.mg__text mark[risu-mark="quote2"] em {
    font-family: var(--font-em-kr);
    color: var(--ink-soft) !important;
    -webkit-text-fill-color: var(--ink-soft) !important;
    font-style: italic !important;
    font-size: 16.5px !important;
}

/* '작은따옴표' quote1 */
.mg__text mark[risu-mark="quote1"] {
    display: inline !important;
    font-family: var(--font-inner-kr) !important;
    font-weight: 400 !important;
    font-style: normal;
    color: var(--ink-soft) !important;
    -webkit-text-fill-color: var(--ink-soft) !important;
    background-clip: border-box !important;
    -webkit-background-clip: border-box !important;
    border: none !important;
    padding: 0;
    margin: 0;
    line-height: inherit !important;
    white-space: inherit !important;
}
.mg__text mark[risu-mark="quote1"] em {
    font-family: var(--font-inner-kr) !important;
    color: var(--ink-soft) !important;
    -webkit-text-fill-color: var(--ink-soft) !important;
    font-style: italic !important;
    font-size: 16.5px !important;
}
.mg__text mark[risu-mark="quote1"] mark[risu-mark="quote2"]::before,
.mg__text mark[risu-mark="quote1"] mark[risu-mark="quote2"]::after…9281 tokens truncated…xy;
  }

  function mountOptionProxy(group, card) {
    const target = card?.querySelector('.mg__buttons');
    if (!target || target.querySelector('.cmt-option-proxy')) return;
    const proxy = createOptionProxy(group);
    if (proxy) target.appendChild(proxy);
  }

  function clearThemeGroup(group) {
    const card = getDirectCard(group);
    card?.remove();
    group.classList.remove('cmt-theme-group', 'cmt-role-character', 'cmt-role-user');
    renderSignatures.delete(group);
  }

  function renderMessage(group, index) {
    const original = getOriginalRoot(group);
    const markdown = original?.querySelector('.wrtn-markdown');
    if (!original || !markdown) return;

    const role = isUserMessage(original) ? 'user' : 'character';
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
    return panel?.querySelector(`#${id}`)?.value?.trim() || '';
  }

  function checked(id) {
    return Boolean(panel?.querySelector(`#${id}`)?.checked);
  }

  function makeButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cmt-ui-btn ${className || ''}`.trim();
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
      setStatus(`❌ ${shortError(error)}`, 'error');
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
      ? `🟢 ${session?.user?.email || connection.email || '저장된 계정'}으로 로그인 중. 비밀번호는 저장하지 않음.`
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
    statusEl.className = `cmt-ui-status ${latestStatusTone}`.trim();
    statusEl.textContent = latestStatus || '로컬 테마는 바로 적용됨. 클라우드 동기화는 로그인 후 사용 가능.\n이번 동기화 0.00원 · 누적 0.00원';
    panel.appendChild(statusEl);
    const meta = document.createElement('div');
    meta.className = 'cmt-ui-meta';
    meta.textContent = `Theme v${VERSION} · 마지막 동기화: ${syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : '아직 없음'} · 요청 ${Number(syncState.totalRequests || 0)}회 · Supabase user_metadata에 AES-256-GCM 암호화 저장`;
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
    await loadState();
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('🎨 망가 테마 설정 열기', openPanel);
      GM_registerMenuCommand('🧯 망가 테마 긴급 끄기', () => { void emergencyDisable(); });
    }

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
  }

  initialize().catch(error => console.warn('[Crack Manga Theme] init failed:', error));
})();

