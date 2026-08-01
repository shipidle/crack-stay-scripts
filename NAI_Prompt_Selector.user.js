// ==UserScript==
// @name         🧩 NAI 프롬프트 셀렉터
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      0.1.3
// @description  🧪 BETA · NovelAI Prompt Chunks를 슬롯·칩·가상 캐릭터로 관리하고 반복 생성을 돕습니다.
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @match        https://novelai.net/image*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @sandbox      DOM
// @noframes
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/NAI_Prompt_Selector.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/NAI_Prompt_Selector.user.js
// ==/UserScript==

(function naiPromptSelector(global) {
  'use strict';

  const APP_NAME = 'NAI Prompt Selector';
  const APP_VERSION = '0.1.3';
  const STORAGE_KEY = 'crackNaiPromptSelector.state.v1';
  const BACKUP_KEY = 'crackNaiPromptSelector.backups.v1';
  const MAX_ACTIVE_CHARACTERS = 6;
  const BACKUP_LIMIT = 20;
  const POLL_MS = 120;
  const NATIVE_ACTION = Object.freeze({
    addCategory: 'Add Category',
    addChunk: 'Add Prompt Chunk',
    editChunk: 'Edit Chunk',
  });

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clone = value => JSON.parse(JSON.stringify(value));

  function createId(prefix = 'id') {
    const randomId = global.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${randomId}`;
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
  }

  function uniqueName(base, usedNames) {
    const cleanBase = normalizeText(base) || 'Chunk';
    if (!usedNames.has(cleanBase)) {
      usedNames.add(cleanBase);
      return cleanBase;
    }
    let suffix = 2;
    while (usedNames.has(`${cleanBase} (${suffix})`)) suffix += 1;
    const next = `${cleanBase} (${suffix})`;
    usedNames.add(next);
    return next;
  }

  function inferChunkName(content, index, usedNames = new Set()) {
    const clean = normalizeText(content);
    const readable = clean.length <= 32 && !/[,\n]/.test(clean) ? clean : `Chunk ${index + 1}`;
    return uniqueName(readable, usedNames);
  }

  function createRow(name = '', content = '', enabled = true) {
    return {
      id: createId('row'),
      name: normalizeText(name),
      content: normalizeText(content),
      enabled: enabled !== false,
    };
  }

  function createSlot(type = 'main', name = '') {
    return {
      id: createId('slot'),
      type,
      name: normalizeText(name) || (type === 'negative' ? '기본 네거' : '베이스'),
      quickPrompt: '',
      rows: [],
    };
  }

  function createCharacter(name = '') {
    return {
      id: createId('character'),
      name: normalizeText(name) || '새 캐릭터',
      active: false,
      gender: 'Female',
      main: { quickPrompt: '', rows: [] },
      negative: { quickPrompt: '', rows: [] },
    };
  }

  function createDefaultState() {
    return {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      slots: [createSlot('main', '베이스'), createSlot('negative', '기본 네거')],
      characters: [],
      auto: { intervalSeconds: 3, count: '' },
    };
  }

  function sanitizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row, index) => ({
      id: normalizeText(row?.id) || createId('row'),
      name: normalizeText(row?.name) || inferChunkName(row?.content, index),
      content: normalizeText(row?.content),
      enabled: row?.enabled !== false,
    })).filter(row => row.name || row.content);
  }

  function sanitizeState(value) {
    const fallback = createDefaultState();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const slots = Array.isArray(value.slots) ? value.slots.map(slot => ({
      id: normalizeText(slot?.id) || createId('slot'),
      type: slot?.type === 'negative' ? 'negative' : 'main',
      name: normalizeText(slot?.name) || (slot?.type === 'negative' ? '기본 네거' : '베이스'),
      quickPrompt: normalizeText(slot?.quickPrompt),
      rows: sanitizeRows(slot?.rows),
    })) : [];
    if (!slots.some(slot => slot.type === 'main')) slots.push(createSlot('main', '베이스'));
    if (!slots.some(slot => slot.type === 'negative')) slots.push(createSlot('negative', '기본 네거'));

    const characters = Array.isArray(value.characters) ? value.characters.map(character => ({
      id: normalizeText(character?.id) || createId('character'),
      name: normalizeText(character?.name) || '새 캐릭터',
      active: character?.active === true,
      gender: character?.gender === 'Male' ? 'Male' : 'Female',
      main: {
        quickPrompt: normalizeText(character?.main?.quickPrompt),
        rows: sanitizeRows(character?.main?.rows),
      },
      negative: {
        quickPrompt: normalizeText(character?.negative?.quickPrompt),
        rows: sanitizeRows(character?.negative?.rows),
      },
    })) : [];

    let activeCount = 0;
    for (const character of characters) {
      if (!character.active) continue;
      activeCount += 1;
      if (activeCount > MAX_ACTIVE_CHARACTERS) character.active = false;
    }

    return {
      schemaVersion: 1,
      savedAt: normalizeText(value.savedAt) || new Date().toISOString(),
      slots,
      characters,
      auto: {
        intervalSeconds: Math.max(0.1, Number(value.auto?.intervalSeconds) || 3),
        count: Number.parseInt(value.auto?.count, 10) > 0 ? Number.parseInt(value.auto.count, 10) : '',
      },
    };
  }

  function parseNamedBulkLine(line) {
    const match = String(line ?? '').match(/^(.{1,60}?)\s*(?:=>|=)\s*(.+)$/);
    if (!match) return null;
    const name = normalizeText(match[1]);
    const content = normalizeText(match[2]);
    return name && content ? { name, content } : null;
  }

  function parseBulkText(text, type = 'main', fallbackName = '새 슬롯') {
    const sections = [];
    let current = null;
    const ensureSection = name => {
      current = { name: normalizeText(name) || fallbackName, rows: [] };
      sections.push(current);
      return current;
    };

    for (const rawLine of String(text ?? '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const header = line.match(/^\[(.+?)]\s*$/);
      if (header) {
        ensureSection(header[1]);
        continue;
      }
      if (!current) ensureSection(fallbackName);
      const named = parseNamedBulkLine(line);
      const content = named?.content || normalizeText(line);
      const usedNames = new Set(current.rows.map(row => row.name));
      const name = named
        ? uniqueName(named.name, usedNames)
        : inferChunkName(content, current.rows.length, usedNames);
      current.rows.push(createRow(name, content, true));
    }

    return sections.map(section => ({
      id: createId('slot'),
      type,
      name: section.name,
      quickPrompt: '',
      rows: section.rows,
    }));
  }

  function parseBulkRows(text, type = 'main', fallbackName = 'Chunk', existingRows = []) {
    const usedNames = new Set(existingRows.map(row => normalizeText(row?.name)).filter(Boolean));
    const rows = [];
    let headerName = '';
    for (const rawLine of String(text ?? '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const header = line.match(/^\[(.+?)]\s*$/);
      if (header) {
        headerName = normalizeText(header[1]);
        continue;
      }
      const named = parseNamedBulkLine(line);
      const content = named?.content || normalizeText(line);
      const name = named
        ? uniqueName(named.name, usedNames)
        : headerName
          ? uniqueName(headerName, usedNames)
          : inferChunkName(content, rows.length, usedNames);
      rows.push(createRow(name, content, true));
    }
    return rows;
  }

  function categoryForSlot(slot) {
    return slot.type === 'negative' ? `[네거] ${slot.name}` : `[메인] ${slot.name}`;
  }

  function categoryForCharacter(character, kind) {
    return kind === 'negative'
      ? `[캐릭터-네거] ${character.name}`
      : `[캐릭터-메인] ${character.name}`;
  }

  function nativeCharacterChunkName(character, chunkName) {
    return `${normalizeText(character?.name) || '새 캐릭터'}/${normalizeText(chunkName) || 'Chunk'}`;
  }

  function selectedRows(rows) {
    return sanitizeRows(rows).filter(row => row.enabled && row.name && row.content);
  }

  function buildExpandedPreview(slots) {
    const pieces = [];
    for (const slot of slots) {
      pieces.push(...selectedRows(slot.rows).map(row => row.content));
      if (normalizeText(slot.quickPrompt)) pieces.push(normalizeText(slot.quickPrompt));
    }
    return pieces.join(',\n');
  }

  function countActiveCharacters(stateValue) {
    return stateValue.characters.filter(character => character.active).length;
  }

  function getManagedSpecs(stateValue) {
    const specs = [];
    for (const slot of stateValue.slots) {
      const category = categoryForSlot(slot);
      for (const row of slot.rows) {
        if (!row.name || !row.content) continue;
        specs.push({ key: `${category}\u0000${row.name}`, category, name: row.name, content: row.content });
      }
    }
    for (const character of stateValue.characters) {
      for (const kind of ['main', 'negative']) {
        const category = categoryForCharacter(character, kind);
        for (const row of character[kind].rows) {
          if (!row.name || !row.content) continue;
          const name = nativeCharacterChunkName(character, row.name);
          specs.push({ key: `${category}\u0000${name}`, category, name, content: row.content });
        }
      }
    }
    return specs;
  }

  function prepareImportMerge(currentValue, importedValue) {
    const merged = sanitizeState(clone(currentValue));
    const incoming = sanitizeState(importedValue);
    const conflicts = [];

    function mergeRows(targetRows, incomingRows, ownerLabel) {
      for (const incomingRow of incomingRows) {
        const existing = targetRows.find(row => row.name === incomingRow.name);
        if (!existing) {
          targetRows.push(clone(incomingRow));
          continue;
        }
        if (normalizeText(existing.content) === normalizeText(incomingRow.content)) continue;
        conflicts.push({
          id: createId('conflict'),
          kind: 'row',
          ownerLabel,
          name: incomingRow.name,
          current: existing.content,
          incoming: incomingRow.content,
          targetId: existing.id,
          incomingRow: clone(incomingRow),
        });
      }
    }

    for (const incomingSlot of incoming.slots) {
      const target = merged.slots.find(slot => slot.type === incomingSlot.type && slot.name === incomingSlot.name);
      if (!target) {
        merged.slots.push(clone(incomingSlot));
        continue;
      }
      mergeRows(target.rows, incomingSlot.rows, `${incomingSlot.type === 'negative' ? '네거' : '메인'} · ${incomingSlot.name}`);
      if (!target.quickPrompt && incomingSlot.quickPrompt) target.quickPrompt = incomingSlot.quickPrompt;
    }

    for (const incomingCharacter of incoming.characters) {
      const target = merged.characters.find(character => character.name === incomingCharacter.name);
      if (!target) {
        incomingCharacter.active = false;
        merged.characters.push(clone(incomingCharacter));
        continue;
      }
      mergeRows(target.main.rows, incomingCharacter.main.rows, `캐릭터 메인 · ${incomingCharacter.name}`);
      mergeRows(target.negative.rows, incomingCharacter.negative.rows, `캐릭터 네거 · ${incomingCharacter.name}`);
      if (!target.main.quickPrompt && incomingCharacter.main.quickPrompt) target.main.quickPrompt = incomingCharacter.main.quickPrompt;
      if (!target.negative.quickPrompt && incomingCharacter.negative.quickPrompt) target.negative.quickPrompt = incomingCharacter.negative.quickPrompt;
    }

    return { merged, conflicts };
  }

  const testApi = {
    MAX_ACTIVE_CHARACTERS,
    buildExpandedPreview,
    categoryForCharacter,
    categoryForSlot,
    countActiveCharacters,
    createDefaultState,
    getManagedSpecs,
    nativeCharacterChunkName,
    parseBulkRows,
    parseBulkText,
    prepareImportMerge,
    renderRows,
    sanitizeState,
  };
  global.__NAI_PROMPT_SELECTOR_TEST__ = testApi;
  if (global.__NPS_DISABLE_BOOT__) return;

  let state = loadState();
  let shadow = null;
  let app = null;
  let importFileInput = null;
  let statusTimer = null;
  let dirty = false;
  const runtime = {
    panelOpen: true,
    tab: 'main',
    selectedSlotId: state.slots.find(slot => slot.type === 'main')?.id || null,
    selectedCharacterId: state.characters[0]?.id || null,
    characterKind: 'main',
    busy: false,
    status: { text: '로컬 데이터 준비됨', tone: 'ok' },
    nativeConflicts: null,
    importContext: null,
    auto: {
      active: false,
      submitted: 0,
      completed: 0,
      target: 0,
      unitCost: 0,
      timer: null,
      nextTimer: null,
      sawDisabled: false,
    },
  };

  function loadState() {
    try {
      const stored = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, null) : null;
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      return sanitizeState(parsed);
    } catch (error) {
      return createDefaultState();
    }
  }

  function persistState({ immediate = false } = {}) {
    dirty = true;
    state.savedAt = new Date().toISOString();
    clearTimeout(statusTimer);
    const save = () => {
      try {
        GM_setValue(STORAGE_KEY, JSON.stringify(state));
        dirty = false;
        setStatus('로컬 저장됨 · NAI 동기화 필요', 'ok');
      } catch (error) {
        setStatus(`로컬 저장 실패: ${error.message}`, 'error');
      }
    };
    if (immediate) save();
    else statusTimer = setTimeout(save, 220);
  }

  function backupState(reason) {
    try {
      const stored = GM_getValue(BACKUP_KEY, '[]');
      const backups = Array.isArray(stored) ? stored : JSON.parse(stored || '[]');
      backups.unshift({ createdAt: new Date().toISOString(), reason, state: clone(state) });
      GM_setValue(BACKUP_KEY, JSON.stringify(backups.slice(0, BACKUP_LIMIT)));
    } catch (error) {
      setStatus(`백업 저장 실패: ${error.message}`, 'error');
      throw error;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function exactButton(root, text) {
    return Array.from(root?.querySelectorAll?.('button') || [])
      .find(button => isVisible(button) && normalizeText(button.textContent) === text) || null;
  }

  async function waitFor(check, timeoutMs = 3500, intervalMs = POLL_MS) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = check();
      if (result) return result;
      await delay(intervalMs);
    }
    return null;
  }

  function setNativeValue(control, value) {
    if (!control) throw new Error('입력 칸을 찾지 못했습니다.');
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(control, String(value ?? ''));
    else control.value = String(value ?? '');
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findNativePanel() {
    const panel = document.querySelector('#promptChunkContainer');
    return panel && isVisible(panel) ? panel : null;
  }

  function findPromptChunkLauncher() {
    const root = Array.from(document.querySelectorAll('.image-gen-prompt-main')).find(isVisible);
    if (!root) return null;
    const header = Array.from(root.children).find(child => (
      normalizeText(child.textContent).startsWith('Base Prompt')
      && child.querySelectorAll('button').length >= 2
    ));
    if (!header) return null;
    const candidates = Array.from(header.querySelectorAll('button'))
      .filter(button => isVisible(button) && !normalizeText(button.textContent));
    return candidates.find(button => button.style.left !== '-5px') || candidates.at(-1) || null;
  }

  function findPromptChunksTab(panel) {
    return Array.from(panel.querySelectorAll('*')).find(element => (
      isVisible(element)
      && normalizeText(element.textContent) === 'Prompt Chunks'
      && getComputedStyle(element).cursor === 'pointer'
    )) || null;
  }

  async function ensurePromptChunksTab(panel) {
    if (nativeAction(panel, NATIVE_ACTION.addChunk)) return panel;
    const tab = findPromptChunksTab(panel);
    if (!tab) throw new Error('NAI Prompt Chunks 탭을 찾지 못했습니다.');
    tab.click();
    const ready = await waitFor(() => nativeAction(panel, NATIVE_ACTION.addChunk), 3500);
    if (!ready) throw new Error('NAI Prompt Chunks 탭이 열리지 않았습니다.');
    return panel;
  }

  async function ensureNativePanel() {
    let panel = findNativePanel();
    if (!panel) {
      const launcher = findPromptChunkLauncher();
      if (!launcher) throw new Error('NAI Base Prompt 설정 버튼을 찾지 못했습니다.');
      launcher.click();
      panel = await waitFor(findNativePanel, 4500);
      if (!panel) throw new Error('NAI Prompt Settings 창이 열리지 않았습니다.');
    }
    return ensurePromptChunksTab(panel);
  }

  function nativeAction(panel, title) {
    return Array.from(panel.querySelectorAll('button'))
      .find(button => isVisible(button) && button.getAttribute('title') === title) || null;
  }

  function formRootFor(control) {
    let node = control;
    while (node && node !== document.body) {
      if (exactButton(node, 'Save') && exactButton(node, 'Cancel')) return node;
      node = node.parentElement;
    }
    return null;
  }

  async function openNativeForm(actionTitle, placeholder) {
    const panel = await ensureNativePanel();
    const action = nativeAction(panel, actionTitle);
    if (!action) throw new Error(`${actionTitle} 버튼을 찾지 못했습니다.`);
    action.click();
    const control = await waitFor(() => Array.from(document.querySelectorAll(`[placeholder="${placeholder}"]`)).find(isVisible), 3500);
    if (!control) throw new Error('NAI 편집 창이 열리지 않았습니다.');
    const form = formRootFor(control);
    if (!form) throw new Error('NAI 편집 창 구조를 확인하지 못했습니다.');
    return { form, control };
  }

  function cancelNativeForm(form) {
    const cancel = exactButton(form, 'Cancel');
    if (cancel) cancel.click();
  }

  async function readNativeCategories() {
    const { form } = await openNativeForm(NATIVE_ACTION.addChunk, 'e.g., My Style Tags');
    try {
      const select = form.querySelector('select');
      if (!select) throw new Error('NAI Category 선택 칸을 찾지 못했습니다.');
      return Array.from(select.options).map(option => normalizeText(option.textContent)).filter(Boolean);
    } finally {
      cancelNativeForm(form);
      await delay(120);
    }
  }

  async function createNativeCategory(name) {
    const { form, control } = await openNativeForm(NATIVE_ACTION.addCategory, 'Category name...');
    setNativeValue(control, name);
    const save = exactButton(form, 'Save');
    if (!save || save.disabled) {
      cancelNativeForm(form);
      throw new Error(`폴더 저장 버튼이 비활성화됐습니다: ${name}`);
    }
    save.click();
    const closed = await waitFor(() => !control.isConnected || !isVisible(control), 3500);
    if (!closed) throw new Error(`폴더 저장 완료를 확인하지 못했습니다: ${name}`);
  }

  function chooseCategory(form, category) {
    const select = form.querySelector('select');
    if (!select) throw new Error('NAI Category 선택 칸을 찾지 못했습니다.');
    const option = Array.from(select.options).find(item => normalizeText(item.textContent) === category);
    if (!option) throw new Error(`NAI 폴더를 찾지 못했습니다: ${category}`);
    setNativeValue(select, option.value);
  }

  async function createNativeChunk(spec) {
    const { form, control: nameInput } = await openNativeForm(NATIVE_ACTION.addChunk, 'e.g., My Style Tags');
    const contentInput = form.querySelector('[placeholder="Enter the tags/content this chunk will expand to..."]');
    try {
      setNativeValue(nameInput, spec.name);
      setNativeValue(contentInput, spec.content);
      chooseCategory(form, spec.category);
      const save = exactButton(form, 'Save');
      if (!save || save.disabled) throw new Error(`Chunk 저장 버튼이 비활성화됐습니다: ${spec.name}`);
      save.click();
      const closed = await waitFor(() => !nameInput.isConnected || !isVisible(nameInput), 3500);
      if (!closed) throw new Error(`Chunk 저장 완료를 확인하지 못했습니다: ${spec.name}`);
    } catch (error) {
      cancelNativeForm(form);
      throw error;
    }
  }

  function cleanNativeChunkTitle(title) {
    return String(title ?? '').replace(/\n\s*\nClick to insert[\s\S]*$/i, '').trim();
  }

  function readNativeChunks() {
    const panel = findNativePanel();
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('[draggable="true"]')).map(item => {
      const editButton = Array.from(item.querySelectorAll('button'))
        .find(button => button.getAttribute('title') === NATIVE_ACTION.editChunk);
      const nameNode = Array.from(item.children).find(child => child.tagName === 'SPAN');
      if (!editButton || !nameNode) return null;
      return {
        item,
        editButton,
        name: normalizeText(nameNode.textContent),
        content: cleanNativeChunkTitle(item.getAttribute('title')),
      };
    }).filter(Boolean);
  }

  async function updateNativeChunk(nativeChunk, spec) {
    nativeChunk.editButton.click();
    const nameInput = await waitFor(() => Array.from(document.querySelectorAll('input'))
      .find(input => isVisible(input) && input.value === nativeChunk.name), 3500);
    if (!nameInput) throw new Error(`Chunk 편집 창이 열리지 않았습니다: ${nativeChunk.name}`);
    const form = formRootFor(nameInput);
    const contentInput = form?.querySelector('textarea, [placeholder="Enter the tags/content this chunk will expand to..."]');
    try {
      setNativeValue(nameInput, spec.name);
      setNativeValue(contentInput, spec.content);
      chooseCategory(form, spec.category);
      const save = exactButton(form, 'Save');
      if (!save || save.disabled) throw new Error(`Chunk 수정 버튼이 비활성화됐습니다: ${spec.name}`);
      save.click();
      const closed = await waitFor(() => !nameInput.isConnected || !isVisible(nameInput), 3500);
      if (!closed) throw new Error(`Chunk 수정 완료를 확인하지 못했습니다: ${spec.name}`);
    } catch (error) {
      cancelNativeForm(form);
      throw error;
    }
  }

  function findDuplicateManagedNames(specs) {
    const counts = new Map();
    for (const spec of specs) counts.set(spec.name, (counts.get(spec.name) || 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  }

  async function syncNative(decisions = new Map()) {
    if (runtime.busy) return;
    runtime.busy = true;
    runtime.nativeConflicts = null;
    render();
    try {
      backupState('before-native-sync');
      setStatus('NAI Prompt Chunks를 확인하는 중…', 'working');
      const panel = await ensureNativePanel();
      const specs = getManagedSpecs(state);
      const duplicateNames = findDuplicateManagedNames(specs);
      if (duplicateNames.length) {
        throw new Error(`Chunk 이름은 NAI 전체에서 고유해야 합니다: ${duplicateNames.slice(0, 4).join(', ')}`);
      }

      const categories = new Set(await readNativeCategories());
      const nativeChunks = readNativeChunks();
      const conflicts = [];
      for (const spec of specs) {
        const matches = nativeChunks.filter(chunk => chunk.name === spec.name);
        if (matches.length === 1 && normalizeText(matches[0].content) !== normalizeText(spec.content)) {
          conflicts.push({ spec, nativeChunk: matches[0], reason: '같은 이름·다른 내용' });
        } else if (matches.length > 1) {
          conflicts.push({ spec, nativeChunk: null, reason: 'NAI에 같은 이름이 여러 개 있음' });
        }
      }

      const undecided = conflicts.filter(conflict => !decisions.has(conflict.spec.key));
      if (undecided.length) {
        runtime.nativeConflicts = conflicts.map(conflict => ({
          key: conflict.spec.key,
          category: conflict.spec.category,
          name: conflict.spec.name,
          current: conflict.nativeChunk?.content || '(중복 항목)',
          incoming: conflict.spec.content,
          reason: conflict.reason,
        }));
        setStatus(`${undecided.length}개 충돌을 확인해야 합니다. 아직 NAI 데이터는 수정하지 않았습니다.`, 'warn');
        return;
      }

      for (const category of new Set(specs.map(spec => spec.category))) {
        if (categories.has(category)) continue;
        setStatus(`NAI 폴더 생성 중: ${category}`, 'working');
        await createNativeCategory(category);
        categories.add(category);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const spec of specs) {
        const currentChunks = readNativeChunks().filter(chunk => chunk.name === spec.name);
        if (currentChunks.length === 1 && normalizeText(currentChunks[0].content) === normalizeText(spec.content)) {
          skipped += 1;
          continue;
        }
        if (currentChunks.length) {
          if (decisions.get(spec.key) !== 'overwrite' || currentChunks.length !== 1) {
            skipped += 1;
            continue;
          }
          setStatus(`NAI Chunk 수정 중: ${spec.name}`, 'working');
          await updateNativeChunk(currentChunks[0], spec);
          updated += 1;
          continue;
        }
        setStatus(`NAI Chunk 생성 중: ${spec.name}`, 'working');
        await createNativeChunk(spec);
        created += 1;
      }
      dirty = false;
      setStatus(`NAI 동기화 완료 · 생성 ${created} · 수정 ${updated} · 유지 ${skipped}`, 'ok');
    } catch (error) {
      setStatus(`NAI 동기화 중단 · ${error.message}`, 'error');
    } finally {
      runtime.busy = false;
      render();
    }
  }

  function findButtonByText(root, matcher) {
    return Array.from(root?.querySelectorAll?.('button') || [])
      .find(button => isVisible(button) && matcher(normalizeText(button.textContent))) || null;
  }

  function getMainEditor(kind) {
    const root = document.querySelector('.image-gen-prompt-main');
    if (!root) return null;
    const editors = Array.from(root.querySelectorAll('[contenteditable="true"]')).filter(isVisible);
    for (const editor of editors) {
      const wrapper = editor.closest('.prompt-input-box-base-prompt, .prompt-input-box-prompt, .prompt-input-box-undesired-content');
      const className = String(wrapper?.className || '');
      if (kind === 'negative' && className.includes('undesired-content')) return editor;
      if (kind === 'main' && !className.includes('undesired-content')) return editor;
    }
    return kind === 'main' ? editors[0] || null : editors[1] || null;
  }

  async function resolveMainEditor(kind) {
    let editor = getMainEditor(kind);
    if (editor) return editor;
    const root = document.querySelector('.image-gen-prompt-main');
    const tab = kind === 'negative'
      ? findButtonByText(root, text => /^Undesired Content$/i.test(text))
      : findButtonByText(root, text => /^(Base\s+)?Prompt$/i.test(text));
    tab?.click();
    editor = await waitFor(() => getMainEditor(kind), 2500);
    return editor;
  }

  function scanCharacterBlocks() {
    return Array.from(document.querySelectorAll('.character-prompt-input'))
      .filter(isVisible)
      .map(root => {
        const match = String(root.className).match(/character-prompt-input-(\d+)/);
        return match ? { index: Number(match[1]), root } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.index - right.index);
  }

  function characterBodyToggle(root) {
    return Array.from(root.querySelectorAll('[role="button"], [tabindex]'))
      .filter(element => element.tagName !== 'BUTTON' && isVisible(element))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      })[0] || null;
  }

  async function resolveCharacterEditor(index, kind) {
    let block = scanCharacterBlocks().find(entry => entry.index === index);
    if (!block) return null;
    let targetTab = findButtonByText(block.root, text => kind === 'negative' ? /^Undesired Content$/i.test(text) : /^Prompt$/i.test(text));
    if (!targetTab) {
      (characterBodyToggle(block.root) || block.root).click();
      await delay(180);
      block = scanCharacterBlocks().find(entry => entry.index === index);
      targetTab = findButtonByText(block?.root, text => kind === 'negative' ? /^Undesired Content$/i.test(text) : /^Prompt$/i.test(text));
    }
    targetTab?.click();
    await delay(120);
    block = scanCharacterBlocks().find(entry => entry.index === index);
    return Array.from(block?.root.querySelectorAll('[contenteditable="true"]') || []).find(isVisible) || null;
  }

  async function ensureCharacterCount(activeCharacters) {
    while (scanCharacterBlocks().length < activeCharacters.length) {
      const beforeCount = scanCharacterBlocks().length;
      const add = findButtonByText(document, text => /^Add Character$/i.test(text));
      if (!add || add.disabled) throw new Error('NAI 캐릭터 슬롯이 가득 차서 더 추가할 수 없습니다.');
      const nextCharacter = activeCharacters[beforeCount];
      add.click();
      await delay(150);
      const choice = findButtonByText(document, text => text.toLowerCase() === nextCharacter.gender.toLowerCase());
      if (!choice) throw new Error(`${nextCharacter.gender} 캐릭터 선택 버튼을 찾지 못했습니다.`);
      choice.click();
      const expected = beforeCount + 1;
      const created = await waitFor(() => scanCharacterBlocks().length >= expected, 3500);
      if (!created) throw new Error('NAI 캐릭터 슬롯 추가를 확인하지 못했습니다.');
    }
  }

  function characterToggleButton(root) {
    const header = root?.children?.[0] || root;
    return Array.from(header?.querySelectorAll?.('button') || []).filter(isVisible)[2] || null;
  }

  function readCharacterEnabled(root, button = characterToggleButton(root)) {
    if (!root) return false;
    const opacity = Number.parseFloat(getComputedStyle(root).opacity);
    if (Number.isFinite(opacity) && opacity < 0.99) return opacity >= 0.75;
    const pressed = button?.getAttribute('aria-pressed') || button?.getAttribute('aria-checked');
    if (/^(true|false)$/i.test(String(pressed || ''))) return pressed === 'true';
    const metadata = [button?.getAttribute('title'), button?.getAttribute('aria-label'), button?.className]
      .join(' ').toLowerCase();
    if (/disable character|enabled|active|checked/.test(metadata)) return true;
    if (/enable character|disabled|inactive|unchecked/.test(metadata)) return false;
    return true;
  }

  async function setPhysicalCharacterEnabled(index, desired) {
    const block = scanCharacterBlocks().find(entry => entry.index === index);
    if (!block) return;
    const button = characterToggleButton(block.root);
    const current = readCharacterEnabled(block.root, button);
    if (current === desired) return;
    if (!button || button.disabled) throw new Error(`Character ${index} 활성화 버튼을 찾지 못했습니다.`);
    button.click();
    await delay(180);
  }

  function dispatchEditorInput(editor, inputType, data = null) {
    try {
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType, data }));
    } catch (error) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function placeCaretAtEnd(editor) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function clearEditor(editor) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete', false);
    dispatchEditorInput(editor, 'deleteContentBackward');
    await delay(80);
    if (normalizeText(editor.textContent)) {
      editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
      dispatchEditorInput(editor, 'deleteContentBackward');
      await delay(80);
    }
  }

  function insertEditorText(editor, text) {
    if (!text) return;
    placeCaretAtEnd(editor);
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      const selection = getSelection();
      const range = selection.rangeCount ? selection.getRangeAt(0) : document.createRange();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
    dispatchEditorInput(editor, 'insertText', text);
  }

  async function insertNativeChunk(editor, spec) {
    const nativeChunk = readNativeChunks().find(chunk => (
      chunk.name === spec.name && normalizeText(chunk.content) === normalizeText(spec.content)
    ));
    if (!nativeChunk) throw new Error(`NAI에 동기화된 Chunk가 없습니다: ${spec.name}`);
    placeCaretAtEnd(editor);
    const before = editor.innerHTML;
    nativeChunk.item.click();
    const changed = await waitFor(() => editor.innerHTML !== before, 1800, 80);
    if (!changed) throw new Error(`네이티브 Chunk 삽입을 확인하지 못했습니다: ${spec.name}`);
    insertEditorText(editor, /[,]\s*$/.test(spec.content) ? ' ' : ', ');
  }

  async function applyTarget(editor, specs, quickPrompt, label) {
    if (!editor) throw new Error(`${label} 입력 칸을 찾지 못했습니다.`);
    await clearEditor(editor);
    for (const spec of specs) await insertNativeChunk(editor, spec);
    if (normalizeText(quickPrompt)) insertEditorText(editor, normalizeText(quickPrompt));
  }

  function specsForSlots(slots) {
    return slots.flatMap(slot => selectedRows(slot.rows).map(row => ({
      category: categoryForSlot(slot), name: row.name, content: row.content,
    })));
  }

  function specsForCharacter(character, kind) {
    return selectedRows(character[kind].rows).map(row => ({
      category: categoryForCharacter(character, kind),
      name: nativeCharacterChunkName(character, row.name),
      content: row.content,
    }));
  }

  async function applyAllPrompts({ silent = false } = {}) {
    if (runtime.busy) return false;
    runtime.busy = true;
    render();
    try {
      backupState('before-apply');
      setStatus('네이티브 Chunk 적용 준비 중…', 'working');
      await ensureNativePanel();
      const activeCharacters = state.characters.filter(character => character.active);
      if (activeCharacters.length > MAX_ACTIVE_CHARACTERS) throw new Error('활성 캐릭터는 최대 6명입니다.');
      await ensureCharacterCount(activeCharacters);

      const mainSlots = state.slots.filter(slot => slot.type === 'main');
      const negativeSlots = state.slots.filter(slot => slot.type === 'negative');
      await applyTarget(await resolveMainEditor('main'), specsForSlots(mainSlots), mainSlots.map(slot => slot.quickPrompt).filter(Boolean).join(',\n'), '메인 프롬프트');
      await applyTarget(await resolveMainEditor('negative'), specsForSlots(negativeSlots), negativeSlots.map(slot => slot.quickPrompt).filter(Boolean).join(',\n'), '네거티브 프롬프트');

      const physicalBlocks = scanCharacterBlocks();
      for (let index = 1; index <= physicalBlocks.length; index += 1) {
        await setPhysicalCharacterEnabled(index, index <= activeCharacters.length);
      }
      for (let position = 0; position < activeCharacters.length; position += 1) {
        const character = activeCharacters[position];
        const physicalIndex = position + 1;
        await applyTarget(
          await resolveCharacterEditor(physicalIndex, 'main'),
          specsForCharacter(character, 'main'),
          character.main.quickPrompt,
          `${character.name} 메인`,
        );
        await applyTarget(
          await resolveCharacterEditor(physicalIndex, 'negative'),
          specsForCharacter(character, 'negative'),
          character.negative.quickPrompt,
          `${character.name} 네거`,
        );
      }
      setStatus(`적용 완료 · 메인 ${mainSlots.length}슬롯 · 네거 ${negativeSlots.length}슬롯 · 캐릭터 ${activeCharacters.length}명`, 'ok');
      return true;
    } catch (error) {
      if (!silent) setStatus(`적용 중단 · ${error.message}`, 'error');
      return false;
    } finally {
      runtime.busy = false;
      render();
    }
  }

  function findGenerateButton() {
    return Array.from(document.querySelectorAll('button'))
      .find(button => isVisible(button) && /Generate\s+\d+\s+Image(s)?/i.test(button.textContent || '')) || null;
  }

  function readGenerationCost() {
    const text = findGenerateButton()?.textContent || '';
    const match = text.match(/(\d+)\s*Anlas/i);
    return Number.parseInt(match?.[1], 10) || 0;
  }

  function clearAutoTimers() {
    if (runtime.auto.timer) clearInterval(runtime.auto.timer);
    if (runtime.auto.nextTimer) clearTimeout(runtime.auto.nextTimer);
    runtime.auto.timer = null;
    runtime.auto.nextTimer = null;
  }

  function stopAuto(message = '자동 생성을 중지했습니다.') {
    clearAutoTimers();
    runtime.auto.active = false;
    runtime.auto.sawDisabled = false;
    setStatus(message, 'warn');
    render();
  }

  function clickNextGeneration() {
    if (!runtime.auto.active) return;
    const button = findGenerateButton();
    if (!button || button.disabled) return;
    button.click();
    runtime.auto.submitted += 1;
    runtime.auto.sawDisabled = false;
    setStatus(`자동 생성 진행 · 완료 ${runtime.auto.completed} / ${runtime.auto.target || '∞'} · 누적 ${runtime.auto.unitCost * runtime.auto.submitted} Anlas`, 'working');
    render();
  }

  function watchAutoProgress() {
    const button = findGenerateButton();
    if (!button || !runtime.auto.active) return;
    if (button.disabled) {
      runtime.auto.sawDisabled = true;
      return;
    }
    if (!runtime.auto.sawDisabled || runtime.auto.completed >= runtime.auto.submitted) return;
    runtime.auto.completed += 1;
    runtime.auto.sawDisabled = false;
    if (runtime.auto.target > 0 && runtime.auto.completed >= runtime.auto.target) {
      clearAutoTimers();
      runtime.auto.active = false;
      setStatus(`자동 생성 완료 · ${runtime.auto.completed}회 · 총 ${runtime.auto.unitCost * runtime.auto.submitted} Anlas`, 'ok');
      render();
      return;
    }
    runtime.auto.nextTimer = setTimeout(clickNextGeneration, state.auto.intervalSeconds * 1000);
    render();
  }

  async function startAuto() {
    if (runtime.auto.active || runtime.busy) return;
    const cost = readGenerationCost();
    if (cost > 0 && !global.confirm(`현재 1회 생성 비용은 ${cost} Anlas입니다. 자동 생성을 시작할까요?`)) {
      setStatus('자동 생성을 취소했습니다.', 'warn');
      return;
    }
    const applied = await applyAllPrompts();
    if (!applied) return;
    const button = findGenerateButton();
    if (!button) {
      setStatus('NAI 생성 버튼을 찾지 못했습니다.', 'error');
      return;
    }
    runtime.auto.active = true;
    runtime.auto.submitted = 0;
    runtime.auto.completed = 0;
    runtime.auto.target = Number.parseInt(state.auto.count, 10) || 0;
    runtime.auto.unitCost = cost;
    runtime.auto.sawDisabled = button.disabled;
    runtime.auto.timer = setInterval(watchAutoProgress, 500);
    if (!button.disabled) clickNextGeneration();
    else setStatus('현재 생성 완료 후 자동 생성을 이어갑니다.', 'working');
    render();
  }

  function downloadJson() {
    const envelope = { app: APP_NAME, version: APP_VERSION, exportedAt: new Date().toISOString(), state: clone(state) };
    const blob = new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nai-prompt-selector-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.documentElement.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('JSON 백업을 내보냈습니다.', 'ok');
  }

  async function importJsonFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== APP_NAME || !parsed?.state) throw new Error('지원하지 않는 JSON 형식입니다.');
      const prepared = prepareImportMerge(state, parsed.state);
      runtime.importContext = prepared;
      if (!prepared.conflicts.length) {
        backupState('before-json-import');
        state = prepared.merged;
        persistState({ immediate: true });
        runtime.importContext = null;
        render();
        setStatus('JSON을 병합했습니다. 기존 항목은 삭제하지 않았습니다.', 'ok');
      } else {
        setStatus(`${prepared.conflicts.length}개 가져오기 충돌을 건별로 확인해야 합니다.`, 'warn');
        render();
      }
    } catch (error) {
      setStatus(`JSON 불러오기 실패 · ${error.message}`, 'error');
    }
  }

  function selectedSlot(type) {
    const available = state.slots.filter(slot => slot.type === type);
    let selected = available.find(slot => slot.id === runtime.selectedSlotId);
    if (!selected) {
      selected = available[0];
      runtime.selectedSlotId = selected?.id || null;
    }
    return selected;
  }

  function selectedCharacter() {
    let character = state.characters.find(item => item.id === runtime.selectedCharacterId);
    if (!character) {
      character = state.characters[0] || null;
      runtime.selectedCharacterId = character?.id || null;
    }
    return character;
  }

  function moveArrayItem(items, index, direction) {
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return false;
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    return true;
  }

  function setStatus(text, tone = 'neutral') {
    runtime.status = { text, tone };
    const status = shadow?.querySelector('.nps-status');
    if (status) {
      status.textContent = text;
      status.dataset.tone = tone;
    }
  }

  function renderRows(owner, rows, ownerType) {
    if (!rows.length) return '<div class="nps-empty">아직 Chunk가 없음. 줄 추가 또는 일괄 붙여넣기를 사용하면 됨.</div>';
    return rows.map((row, index) => `
      <article class="nps-row ${row.enabled ? 'is-enabled' : ''}">
        <button type="button" class="nps-line-toggle" data-action="toggle-row" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" title="선택/해제">${index + 1}</button>
        <details class="nps-row-details">
          <summary><span class="nps-row-title">${escapeHtml(row.name || '이름 없는 Chunk')}</span><span class="nps-row-enabled">${row.enabled ? '사용' : '꺼짐'}</span></summary>
          <div class="nps-row-expanded">
            <div class="nps-row-fields">
              <input data-field="row-name" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" value="${escapeHtml(row.name)}" placeholder="Chunk 이름">
              <textarea data-field="row-content" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" rows="2" placeholder="NAI에 저장할 내용">${escapeHtml(row.content)}</textarea>
            </div>
            <div class="nps-row-actions">
              <button type="button" data-action="move-row" data-direction="-1" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" aria-label="위로">↑ 위로</button>
              <button type="button" data-action="move-row" data-direction="1" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" aria-label="아래로">↓ 아래로</button>
              <button type="button" data-action="remove-row" data-owner="${owner.id}" data-owner-type="${ownerType}" data-row="${row.id}" aria-label="제거">× 제거</button>
            </div>
          </div>
        </details>
      </article>`).join('');
  }

  function slotEditor(type) {
    const slot = selectedSlot(type);
    const slots = state.slots.filter(item => item.type === type);
    if (!slot) return '<div class="nps-empty">슬롯이 없음</div>';
    const preview = buildExpandedPreview(slots);
    return `
      <div class="nps-library">
        <aside class="nps-slot-list">
          <div class="nps-list-title">${type === 'negative' ? '네거 슬롯' : '메인 슬롯'}</div>
          ${slots.map((item, index) => `
            <div class="nps-slot-item ${item.id === slot.id ? 'is-active' : ''}">
              <button type="button" data-action="select-slot" data-slot="${item.id}">${escapeHtml(item.name)}</button>
              <span>
                <button type="button" data-action="move-slot" data-slot="${item.id}" data-direction="-1">↑</button>
                <button type="button" data-action="move-slot" data-slot="${item.id}" data-direction="1">↓</button>
              </span>
            </div>`).join('')}
          <button type="button" class="nps-soft-btn" data-action="add-slot" data-type="${type}">＋ 슬롯 추가</button>
        </aside>
        <section class="nps-editor-pane">
          <div class="nps-card nps-slot-head">
            <label>슬롯명 <input data-field="slot-name" data-slot="${slot.id}" value="${escapeHtml(slot.name)}" maxlength="60"></label>
            <div class="nps-folder-name">NAI 폴더 · ${escapeHtml(categoryForSlot(slot))}</div>
            <button type="button" class="nps-danger-ghost" data-action="remove-slot" data-slot="${slot.id}">목록에서 제거</button>
          </div>
          <div class="nps-card">
            <div class="nps-card-head"><strong>Chunk 줄</strong><button type="button" class="nps-soft-btn" data-action="add-row" data-owner="${slot.id}" data-owner-type="slot">＋ 줄 추가</button></div>
            <div class="nps-rows">${renderRows(slot, slot.rows, 'slot')}</div>
          </div>
          <details class="nps-card">
            <summary>여러 줄 일괄 붙여넣기</summary>
            <p class="nps-help"><code>[프로필]</code> 아래에 <code>흰배경 = white background</code>처럼 입력 가능. 이름 없이 내용만 넣은 뒤 줄별 이름을 수정해도 됨.</p>
            <textarea class="nps-bulk" data-bulk-type="${type}" placeholder="[프로필]\n흰배경 = white background\nportrait\n나보기 = looking at viewer"></textarea>
            <button type="button" class="nps-primary" data-action="apply-bulk" data-type="${type}">줄 반영</button>
          </details>
          <div class="nps-card">
            <label>빠른 프롬프트<textarea data-field="slot-quick" data-slot="${slot.id}" rows="3" placeholder="선택 Chunk 뒤에 추가할 직접 입력 프롬프트">${escapeHtml(slot.quickPrompt)}</textarea></label>
          </div>
          <div class="nps-card"><div class="nps-card-head"><strong>확장 미리보기</strong><span>${preview.length}자</span></div><pre class="nps-preview">${escapeHtml(preview || '선택한 Chunk가 없음')}</pre></div>
        </section>
      </div>`;
  }

  function characterEditor() {
    const character = selectedCharacter();
    if (!character) {
      return `<div class="nps-card nps-empty">저장된 캐릭터가 없음.<br><button type="button" class="nps-primary" data-action="add-character">＋ 캐릭터 추가</button></div>`;
    }
    const kind = runtime.characterKind;
    const target = character[kind];
    const preview = buildExpandedPreview([{ ...target, type: kind }]);
    return `
      <div class="nps-library">
        <aside class="nps-slot-list">
          <div class="nps-list-title">캐릭터 · 활성 ${countActiveCharacters(state)} / 6</div>
          ${state.characters.map((item, index) => `
            <div class="nps-character-item ${item.id === character.id ? 'is-active' : ''}">
              <button type="button" class="nps-active-check ${item.active ? 'is-on' : ''}" data-action="toggle-character" data-character="${item.id}" title="NAI 슬롯 활성화">${item.active ? '✓' : '○'}</button>
              <button type="button" data-action="select-character" data-character="${item.id}">${escapeHtml(item.name)}</button>
              <span><button type="button" data-action="move-character" data-character="${item.id}" data-direction="-1">↑</button><button type="button" data-action="move-character" data-character="${item.id}" data-direction="1">↓</button></span>
            </div>`).join('')}
          <button type="button" class="nps-soft-btn" data-action="add-character">＋ 캐릭터 추가</button>
        </aside>
        <section class="nps-editor-pane">
          <div class="nps-card nps-slot-head">
            <label>캐릭터명 <input data-field="character-name" data-character="${character.id}" value="${escapeHtml(character.name)}" maxlength="60"></label>
            <label>NAI 성별 <select data-field="character-gender" data-character="${character.id}"><option value="Female" ${character.gender === 'Female' ? 'selected' : ''}>Female</option><option value="Male" ${character.gender === 'Male' ? 'selected' : ''}>Male</option></select></label>
            <button type="button" class="nps-danger-ghost" data-action="remove-character" data-character="${character.id}">목록에서 제거</button>
          </div>
          <div class="nps-segments"><button type="button" data-action="character-kind" data-kind="main" class="${kind === 'main' ? 'is-active' : ''}">메인</button><button type="button" data-action="character-kind" data-kind="negative" class="${kind === 'negative' ? 'is-active' : ''}">네거</button></div>
          <div class="nps-card"><div class="nps-folder-name">NAI 폴더 · ${escapeHtml(categoryForCharacter(character, kind))} · 저장 이름 ${escapeHtml(character.name)}/Chunk명</div><div class="nps-card-head"><strong>Chunk 줄</strong><button type="button" class="nps-soft-btn" data-action="add-row" data-owner="${character.id}" data-owner-type="character-${kind}">＋ 줄 추가</button></div><div class="nps-rows">${renderRows(character, target.rows, `character-${kind}`)}</div></div>
          <details class="nps-card">
            <summary>여러 줄 일괄 붙여넣기</summary>
            <p class="nps-help">한 줄마다 Chunk 하나로 추가함. <code>[베이스]</code> 다음 이름 없는 줄은 <code>베이스 = 내용</code>으로 인식함. <code>눈=blue eyes</code>처럼 직접 이름을 지정해도 됨.</p>
            <textarea class="nps-bulk" data-bulk-character="${character.id}" data-bulk-kind="${kind}" placeholder="[베이스]\n1 man, adult male, tall\n[눈]\ngolden eyes\n[의상]\n블랙탑=black tank top"></textarea>
            <button type="button" class="nps-primary" data-action="apply-character-bulk" data-character="${character.id}" data-kind="${kind}">줄 반영</button>
          </details>
          <div class="nps-card"><label>빠른 프롬프트<textarea data-field="character-quick" data-character="${character.id}" data-kind="${kind}" rows="3">${escapeHtml(target.quickPrompt)}</textarea></label></div>
          <div class="nps-card"><div class="nps-card-head"><strong>확장 미리보기</strong><span>${preview.length}자</span></div><pre class="nps-preview">${escapeHtml(preview || '선택한 Chunk가 없음')}</pre></div>
        </section>
      </div>`;
  }

  function autoView() {
    const target = Number.parseInt(state.auto.count, 10) || 0;
    return `
      <div class="nps-grid-two">
        <section class="nps-card">
          <div class="nps-card-head"><strong>자동 생성</strong><span>${runtime.auto.completed} / ${runtime.auto.active ? (runtime.auto.target || '∞') : (target || '∞')}</span></div>
          <label>주기(초)<input type="number" min="0.1" step="0.1" data-field="auto-interval" value="${escapeHtml(state.auto.intervalSeconds)}"></label>
          <label>횟수<input type="number" min="0" step="1" data-field="auto-count" value="${escapeHtml(state.auto.count)}" placeholder="0 또는 빈칸 = 무한"></label>
          <div class="nps-presets">${[5, 10, 20, 30, 50].map(count => `<button type="button" data-action="auto-preset" data-count="${count}">${count}</button>`).join('')}<button type="button" data-action="auto-preset" data-count="">∞</button></div>
          <button type="button" class="${runtime.auto.active ? 'nps-stop' : 'nps-primary'}" data-action="${runtime.auto.active ? 'stop-auto' : 'start-auto'}">${runtime.auto.active ? '■ 자동 생성 중지' : '▶ 적용 후 자동 생성'}</button>
          <p class="nps-help">NAI가 표시하는 Anlas만 합산함. 원화 고정 환율이 없어 임의 환산하지 않음.</p>
        </section>
        <section class="nps-card">
          <div class="nps-card-head"><strong>안전 적용</strong><span>네이티브 Chunk 전용</span></div>
          <button type="button" class="nps-primary" data-action="sync-native" ${runtime.busy ? 'disabled' : ''}>☁ NAI에 저장·동기화</button>
          <button type="button" class="nps-soft-btn" data-action="apply-all" ${runtime.busy ? 'disabled' : ''}>↗ NAI 모든 칸에 적용</button>
          <p class="nps-help">적용 버튼을 누를 때만 NAI 메인·네거·활성 캐릭터 칸을 교체함. 비활성 캐릭터 슬롯은 꺼둠.</p>
        </section>
        <section class="nps-card">
          <div class="nps-card-head"><strong>JSON 백업</strong><span>삭제 없는 병합</span></div>
          <button type="button" class="nps-soft-btn" data-action="export-json">내보내기</button>
          <button type="button" class="nps-soft-btn" data-action="import-json">불러오기</button>
          <p class="nps-help">같은 이름·다른 내용은 목록에서 건별로 덮어쓸 항목만 선택함.</p>
        </section>
        <section class="nps-card nps-safety-card">
          <div class="nps-card-head"><strong>원격 데이터 보호</strong><span>안전 모드</span></div>
          <ul><li>NAI 전체 삭제 기능을 호출하지 않음</li><li>관리 폴더만 추가·수정함</li><li>로그인·폼 구조 오류 시 즉시 중단함</li><li>동기화·적용 전 로컬 자동 백업함</li></ul>
        </section>
      </div>`;
  }

  function conflictOverlay() {
    if (runtime.nativeConflicts) {
      return `<div class="nps-overlay"><div class="nps-dialog"><h3>NAI Chunk 충돌</h3><p>체크한 항목만 이번 내용으로 덮어씀. 체크하지 않은 항목은 유지함.</p><div class="nps-conflicts">${runtime.nativeConflicts.map(conflict => `
        <label class="nps-conflict"><input type="checkbox" data-native-conflict="${escapeHtml(conflict.key)}"><span><strong>${escapeHtml(conflict.category)} · ${escapeHtml(conflict.name)}</strong><small>${escapeHtml(conflict.reason)}</small><del>${escapeHtml(conflict.current)}</del><ins>${escapeHtml(conflict.incoming)}</ins></span></label>`).join('')}</div><div class="nps-dialog-actions"><button type="button" data-action="cancel-native-conflicts">취소</button><button type="button" class="nps-primary" data-action="apply-native-conflicts">선택대로 동기화</button></div></div></div>`;
    }
    if (runtime.importContext?.conflicts?.length) {
      return `<div class="nps-overlay"><div class="nps-dialog"><h3>JSON 가져오기 충돌</h3><p>체크한 항목만 가져온 내용으로 덮어씀. 나머지는 현재 값을 유지함.</p><div class="nps-conflicts">${runtime.importContext.conflicts.map(conflict => `
        <label class="nps-conflict"><input type="checkbox" data-import-conflict="${conflict.id}"><span><strong>${escapeHtml(conflict.ownerLabel)} · ${escapeHtml(conflict.name)}</strong><del>${escapeHtml(conflict.current)}</del><ins>${escapeHtml(conflict.incoming)}</ins></span></label>`).join('')}</div><div class="nps-dialog-actions"><button type="button" data-action="cancel-import-conflicts">취소</button><button type="button" class="nps-primary" data-action="apply-import-conflicts">선택대로 병합</button></div></div></div>`;
    }
    return '';
  }

  function render() {
    if (!app) return;
    const view = runtime.tab === 'main'
      ? slotEditor('main')
      : runtime.tab === 'negative'
        ? slotEditor('negative')
        : runtime.tab === 'characters'
          ? characterEditor()
          : autoView();
    app.innerHTML = `
      <button type="button" class="nps-launcher" data-action="toggle-panel" title="NAI 프롬프트 셀렉터">🧩</button>
      <section class="nps-panel ${runtime.panelOpen ? 'is-open' : ''}">
        <header class="nps-header"><div><strong>NAI Prompt Selector</strong><span>v${APP_VERSION} · Native Chunks</span></div><div><button type="button" data-action="sync-native" title="NAI 동기화">☁</button><button type="button" data-action="apply-all" title="모든 칸 적용">↗</button><button type="button" data-action="toggle-panel" title="닫기">×</button></div></header>
        <nav class="nps-tabs">${[['main', '메인'], ['negative', '네거'], ['characters', `캐릭터 ${countActiveCharacters(state)}/6`], ['auto', '자동·백업']].map(([id, label]) => `<button type="button" data-action="tab" data-tab="${id}" class="${runtime.tab === id ? 'is-active' : ''}">${label}</button>`).join('')}</nav>
        <div class="nps-status" data-tone="${runtime.status.tone}">${escapeHtml(runtime.status.text)}</div>
        <main class="nps-content">${view}</main>
      </section>${conflictOverlay()}`;
  }

  function findRowOwner(ownerId, ownerType) {
    if (ownerType === 'slot') return state.slots.find(slot => slot.id === ownerId) || null;
    if (ownerType?.startsWith('character-')) {
      const character = state.characters.find(item => item.id === ownerId);
      const kind = ownerType.endsWith('negative') ? 'negative' : 'main';
      return character ? { id: character.id, rows: character[kind].rows, character, kind } : null;
    }
    return null;
  }

  function updatePreviewOnly() {
    const preview = shadow?.querySelector('.nps-preview');
    if (!preview) return;
    if (runtime.tab === 'main' || runtime.tab === 'negative') {
      preview.textContent = buildExpandedPreview(state.slots.filter(slot => slot.type === runtime.tab)) || '선택한 Chunk가 없음';
    } else if (runtime.tab === 'characters') {
      const character = selectedCharacter();
      preview.textContent = character
        ? buildExpandedPreview([{ ...character[runtime.characterKind], type: runtime.characterKind }]) || '선택한 Chunk가 없음'
        : '선택한 Chunk가 없음';
    }
  }

  function handleFieldInput(target) {
    const field = target.dataset.field;
    if (!field) return;
    if (field === 'slot-name' || field === 'slot-quick') {
      const slot = state.slots.find(item => item.id === target.dataset.slot);
      if (!slot) return;
      if (field === 'slot-name') slot.name = target.value;
      else slot.quickPrompt = target.value;
    } else if (field === 'row-name' || field === 'row-content') {
      const owner = findRowOwner(target.dataset.owner, target.dataset.ownerType);
      const row = owner?.rows.find(item => item.id === target.dataset.row);
      if (!row) return;
      if (field === 'row-name') {
        row.name = target.value;
        const title = target.closest('.nps-row')?.querySelector('.nps-row-title');
        if (title) title.textContent = normalizeText(target.value) || '이름 없는 Chunk';
      } else row.content = target.value;
    } else if (field === 'character-name' || field === 'character-gender') {
      const character = state.characters.find(item => item.id === target.dataset.character);
      if (!character) return;
      if (field === 'character-name') character.name = target.value;
      else character.gender = target.value === 'Male' ? 'Male' : 'Female';
    } else if (field === 'character-quick') {
      const character = state.characters.find(item => item.id === target.dataset.character);
      if (character) character[target.dataset.kind === 'negative' ? 'negative' : 'main'].quickPrompt = target.value;
    } else if (field === 'auto-interval') {
      state.auto.intervalSeconds = Math.max(0.1, Number(target.value) || 3);
    } else if (field === 'auto-count') {
      state.auto.count = Number.parseInt(target.value, 10) > 0 ? Number.parseInt(target.value, 10) : '';
    }
    persistState();
    updatePreviewOnly();
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    if (!action) return;
    if (action === 'toggle-panel') {
      runtime.panelOpen = !runtime.panelOpen;
      render();
    } else if (action === 'tab') {
      runtime.tab = button.dataset.tab;
      render();
    } else if (action === 'select-slot') {
      runtime.selectedSlotId = button.dataset.slot;
      render();
    } else if (action === 'add-slot') {
      const slot = createSlot(button.dataset.type, `새 ${button.dataset.type === 'negative' ? '네거' : '메인'} 슬롯 ${state.slots.filter(item => item.type === button.dataset.type).length + 1}`);
      state.slots.push(slot);
      runtime.selectedSlotId = slot.id;
      persistState({ immediate: true });
      render();
    } else if (action === 'remove-slot') {
      const slot = state.slots.find(item => item.id === button.dataset.slot);
      const sameType = state.slots.filter(item => item.type === slot?.type);
      if (!slot || sameType.length <= 1) return setStatus('메인·네거 슬롯은 각각 최소 1개 필요합니다.', 'warn');
      if (!global.confirm(`${slot.name}을 로컬 목록에서 제거할까요? NAI 폴더와 Chunk는 삭제하지 않습니다.`)) return;
      state.slots = state.slots.filter(item => item.id !== slot.id);
      runtime.selectedSlotId = state.slots.find(item => item.type === slot.type)?.id || null;
      persistState({ immediate: true });
      render();
    } else if (action === 'move-slot') {
      const visibleSlots = state.slots.filter(item => item.type === state.slots.find(slot => slot.id === button.dataset.slot)?.type);
      const item = visibleSlots.find(slot => slot.id === button.dataset.slot);
      const from = state.slots.indexOf(item);
      const direction = Number(button.dataset.direction);
      let to = from + direction;
      while (state.slots[to] && state.slots[to].type !== item.type) to += direction;
      if (from >= 0 && to >= 0 && to < state.slots.length) [state.slots[from], state.slots[to]] = [state.slots[to], state.slots[from]];
      persistState({ immediate: true });
      render();
    } else if (action === 'add-row') {
      const owner = findRowOwner(button.dataset.owner, button.dataset.ownerType);
      owner?.rows.push(createRow(`Chunk ${(owner?.rows.length || 0) + 1}`, '', true));
      persistState({ immediate: true });
      render();
    } else if (action === 'toggle-row') {
      const owner = findRowOwner(button.dataset.owner, button.dataset.ownerType);
      const row = owner?.rows.find(item => item.id === button.dataset.row);
      if (row) row.enabled = !row.enabled;
      persistState({ immediate: true });
      render();
    } else if (action === 'move-row') {
      const owner = findRowOwner(button.dataset.owner, button.dataset.ownerType);
      const index = owner?.rows.findIndex(item => item.id === button.dataset.row) ?? -1;
      moveArrayItem(owner?.rows || [], index, Number(button.dataset.direction));
      persistState({ immediate: true });
      render();
    } else if (action === 'remove-row') {
      const owner = findRowOwner(button.dataset.owner, button.dataset.ownerType);
      if (owner) owner.rows = owner.rows.filter(item => item.id !== button.dataset.row);
      if (owner?.character) owner.character[owner.kind].rows = owner.rows;
      else if (owner) {
        const slot = state.slots.find(item => item.id === owner.id);
        if (slot) slot.rows = owner.rows;
      }
      persistState({ immediate: true });
      render();
    } else if (action === 'apply-bulk') {
      const textarea = shadow.querySelector(`.nps-bulk[data-bulk-type="${button.dataset.type}"]`);
      const parsed = parseBulkText(textarea?.value, button.dataset.type, selectedSlot(button.dataset.type)?.name || '새 슬롯');
      if (!parsed.length) return setStatus('반영할 줄이 없습니다.', 'warn');
      for (const incoming of parsed) {
        const existing = state.slots.find(slot => slot.type === incoming.type && slot.name === incoming.name);
        if (existing) existing.rows.push(...incoming.rows);
        else state.slots.push(incoming);
      }
      runtime.selectedSlotId = (state.slots.find(slot => slot.type === button.dataset.type && slot.name === parsed[0].name) || parsed[0]).id;
      persistState({ immediate: true });
      render();
      setStatus(`${parsed.length}개 슬롯에 줄을 반영했습니다.`, 'ok');
    } else if (action === 'apply-character-bulk') {
      const character = state.characters.find(item => item.id === button.dataset.character);
      const kind = button.dataset.kind === 'negative' ? 'negative' : 'main';
      if (!character) return setStatus('캐릭터를 찾지 못했습니다.', 'error');
      const textarea = Array.from(shadow.querySelectorAll('.nps-bulk[data-bulk-character]')).find(input => (
        input.dataset.bulkCharacter === character.id && input.dataset.bulkKind === kind
      ));
      const incomingRows = parseBulkRows(textarea?.value, kind, character.name, character[kind].rows);
      if (!incomingRows.length) return setStatus('반영할 줄이 없습니다.', 'warn');
      character[kind].rows.push(...incomingRows);
      persistState({ immediate: true });
      render();
      setStatus(`${character.name} ${kind === 'negative' ? '네거' : '메인'}에 ${incomingRows.length}줄을 반영했습니다.`, 'ok');
    } else if (action === 'add-character') {
      const character = createCharacter(`캐릭터 ${state.characters.length + 1}`);
      state.characters.push(character);
      runtime.selectedCharacterId = character.id;
      persistState({ immediate: true });
      render();
    } else if (action === 'select-character') {
      runtime.selectedCharacterId = button.dataset.character;
      render();
    } else if (action === 'toggle-character') {
      const character = state.characters.find(item => item.id === button.dataset.character);
      if (!character) return;
      if (!character.active && countActiveCharacters(state) >= MAX_ACTIVE_CHARACTERS) {
        setStatus('NAI 캐릭터 슬롯이 모두 찼습니다. 활성 캐릭터는 최대 6명입니다.', 'error');
        return;
      }
      character.active = !character.active;
      persistState({ immediate: true });
      render();
    } else if (action === 'move-character') {
      const index = state.characters.findIndex(item => item.id === button.dataset.character);
      moveArrayItem(state.characters, index, Number(button.dataset.direction));
      persistState({ immediate: true });
      render();
    } else if (action === 'remove-character') {
      const character = state.characters.find(item => item.id === button.dataset.character);
      if (!character || !global.confirm(`${character.name}을 로컬 목록에서 제거할까요? NAI 폴더와 Chunk는 삭제하지 않습니다.`)) return;
      state.characters = state.characters.filter(item => item.id !== character.id);
      runtime.selectedCharacterId = state.characters[0]?.id || null;
      persistState({ immediate: true });
      render();
    } else if (action === 'character-kind') {
      runtime.characterKind = button.dataset.kind === 'negative' ? 'negative' : 'main';
      render();
    } else if (action === 'sync-native') {
      await syncNative();
    } else if (action === 'apply-all') {
      await applyAllPrompts();
    } else if (action === 'start-auto') {
      await startAuto();
    } else if (action === 'stop-auto') {
      stopAuto();
    } else if (action === 'auto-preset') {
      state.auto.count = button.dataset.count ? Number(button.dataset.count) : '';
      persistState({ immediate: true });
      render();
    } else if (action === 'export-json') {
      downloadJson();
    } else if (action === 'import-json') {
      importFileInput.click();
    } else if (action === 'cancel-native-conflicts') {
      runtime.nativeConflicts = null;
      render();
      setStatus('NAI 동기화를 취소했습니다. 기존 데이터는 변경하지 않았습니다.', 'warn');
    } else if (action === 'apply-native-conflicts') {
      const decisions = new Map(runtime.nativeConflicts.map(conflict => [conflict.key, 'skip']));
      shadow.querySelectorAll('[data-native-conflict]:checked').forEach(input => decisions.set(input.dataset.nativeConflict, 'overwrite'));
      runtime.nativeConflicts = null;
      await syncNative(decisions);
    } else if (action === 'cancel-import-conflicts') {
      runtime.importContext = null;
      render();
      setStatus('JSON 가져오기를 취소했습니다.', 'warn');
    } else if (action === 'apply-import-conflicts') {
      backupState('before-json-conflict-merge');
      const context = runtime.importContext;
      const selectedIds = new Set(Array.from(shadow.querySelectorAll('[data-import-conflict]:checked')).map(input => input.dataset.importConflict));
      for (const conflict of context.conflicts) {
        if (!selectedIds.has(conflict.id)) continue;
        const row = context.merged.slots.flatMap(slot => slot.rows).find(item => item.id === conflict.targetId)
          || context.merged.characters.flatMap(character => [...character.main.rows, ...character.negative.rows]).find(item => item.id === conflict.targetId);
        if (row) Object.assign(row, clone(conflict.incomingRow), { id: row.id });
      }
      state = sanitizeState(context.merged);
      runtime.importContext = null;
      persistState({ immediate: true });
      render();
      setStatus('선택한 충돌만 덮어쓰고 JSON을 병합했습니다.', 'ok');
    }
  }

  function installUi() {
    if (document.querySelector('#crack-nai-prompt-selector-host')) return;
    const host = document.createElement('div');
    host.id = 'crack-nai-prompt-selector-host';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial;position:fixed;z-index:2147483000;right:18px;bottom:18px;color:#17202a;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:13px;line-height:1.45}
      *{box-sizing:border-box}button,input,textarea,select{font:inherit}button{cursor:pointer}.nps-launcher{width:48px;height:48px;border:1px solid #CEDEF2;border-radius:18px;background:#EAF6FF;color:#315a78;font-size:22px;box-shadow:0 12px 34px rgba(43,77,102,.2)}
      .nps-panel{display:none;position:absolute;right:0;bottom:58px;width:min(760px,calc(100vw - 28px));height:min(760px,calc(100vh - 96px));overflow:hidden;border:1px solid #CEDEF2;border-radius:24px;background:#F8FBFD;box-shadow:0 24px 70px rgba(28,54,74,.24)}.nps-panel.is-open{display:flex;flex-direction:column}
      .nps-header{min-height:66px;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#EEF6FB;border-bottom:1px solid #D9E7F1}.nps-header strong{display:block;font-size:16px}.nps-header span{display:block;color:#6c8394;font-size:11px}.nps-header>div:last-child{display:flex;gap:6px}.nps-header button{width:34px;height:34px;border:1px solid #CEDEF2;border-radius:11px;background:#fff;color:#41657d;font-size:17px}
      .nps-tabs{display:grid;grid-template-columns:repeat(4,1fr);padding:8px;background:#fff;border-bottom:1px solid #e2ecf2}.nps-tabs button{border:0;border-radius:11px;background:transparent;color:#617a8d;padding:9px 6px;font-weight:700}.nps-tabs button.is-active{background:#EAF6FF;color:#254e6a}
      .nps-status{padding:7px 14px;background:#f4f8fb;color:#647b8c;border-bottom:1px solid #e2ecf2;font-size:12px}.nps-status[data-tone="ok"]{color:#287057}.nps-status[data-tone="working"]{color:#326d9a}.nps-status[data-tone="warn"]{color:#9a6a22}.nps-status[data-tone="error"]{color:#b54747;background:#fff4f4}
      .nps-content{min-height:0;flex:1;overflow:auto;padding:12px}.nps-library{min-height:100%;display:grid;grid-template-columns:190px minmax(0,1fr);gap:10px}.nps-slot-list{min-height:0;padding:10px;border:1px solid #dce8f0;border-radius:16px;background:#fff;overflow:auto}.nps-list-title{margin-bottom:8px;color:#6b8293;font-size:11px;font-weight:800}.nps-slot-item,.nps-character-item{display:flex;align-items:center;gap:4px;margin-bottom:5px;padding:4px;border-radius:10px}.nps-slot-item.is-active,.nps-character-item.is-active{background:#EAF6FF}.nps-slot-item>button,.nps-character-item>button:nth-child(2){min-width:0;flex:1;overflow:hidden;border:0;background:transparent;color:#344f63;padding:6px;text-align:left;text-overflow:ellipsis;white-space:nowrap}.nps-slot-item span,.nps-character-item span{display:flex}.nps-slot-item span button,.nps-character-item span button{width:22px;border:0;background:transparent;color:#7b91a1}.nps-active-check{width:28px;height:28px;border:1px solid #d6e3ec;border-radius:9px;background:#fff;color:#8da0ad}.nps-active-check.is-on{border-color:#8fb7d2;background:#CEDEF2;color:#244c67;font-weight:900}
      .nps-editor-pane{min-width:0;display:flex;flex-direction:column;gap:9px}.nps-card{padding:12px;border:1px solid #dce8f0;border-radius:16px;background:#fff}.nps-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.nps-card-head span,.nps-folder-name,.nps-help{color:#708698;font-size:11px}.nps-slot-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.nps-slot-head .nps-folder-name{grid-column:1/-1}.nps-slot-head label{margin:0}.nps-slot-head .nps-danger-ghost{grid-column:2;grid-row:1}
      label{display:grid;gap:5px;color:#536d80;font-size:11px;font-weight:700}input,textarea,select{width:100%;border:1px solid #cedde8;border-radius:10px;background:#fbfdff;color:#17202a;padding:8px 10px;outline:none}input:focus,textarea:focus,select:focus{border-color:#91bad6;box-shadow:0 0 0 3px rgba(145,186,214,.18)}textarea{resize:vertical}.nps-rows{display:flex;flex-direction:column;gap:5px}.nps-row{display:grid;grid-template-columns:32px minmax(0,1fr);gap:6px;align-items:start;padding:5px;border:1px solid #e1eaf0;border-radius:12px;background:#fafcfd}.nps-row.is-enabled{border-color:#b9d3e5;background:#F4FAFE}.nps-line-toggle{width:32px;height:30px;border:1px solid #d2e0e9;border-radius:9px;background:#fff;color:#7c92a2;font-weight:900}.nps-row.is-enabled .nps-line-toggle{border-color:#91b9d4;background:#CEDEF2;color:#284e67}.nps-row-details{min-width:0}.nps-row-details>summary{min-height:30px;display:flex;align-items:center;gap:7px;overflow:hidden;list-style:none;color:#38566b;font-weight:800;cursor:pointer}.nps-row-details>summary::-webkit-details-marker{display:none}.nps-row-details>summary::after{content:'⌄';margin-left:2px;color:#7a91a2;transition:transform .15s ease}.nps-row-details[open]>summary::after{transform:rotate(180deg)}.nps-row-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nps-row-enabled{flex:0 0 auto;color:#8095a4;font-size:10px;font-weight:700}.nps-row-expanded{display:grid;gap:7px;margin-top:5px;padding-top:7px;border-top:1px solid #dce7ee}.nps-row-fields{display:grid;gap:5px}.nps-row-actions{display:flex;justify-content:flex-end;gap:4px}.nps-row-actions button{border:0;border-radius:7px;background:#edf4f8;color:#577185;padding:6px 9px;font-size:11px}
      .nps-primary,.nps-soft-btn,.nps-stop,.nps-danger-ghost{border-radius:11px;padding:9px 12px;font-weight:800}.nps-primary{border:1px solid #8fb8d3;background:#CEDEF2;color:#244d68}.nps-soft-btn{border:1px solid #d3e1ea;background:#F4F8FB;color:#4c6c83}.nps-stop{border:1px solid #e8a6a6;background:#fff0f0;color:#a53e3e}.nps-danger-ghost{border:1px solid #efd5d5;background:#fff;color:#a25d5d;font-size:11px}.nps-empty{padding:22px;color:#7890a2;text-align:center}.nps-preview{max-height:150px;overflow:auto;margin:0;padding:10px;border-radius:11px;background:#f4f8fb;color:#39556a;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.nps-segments{display:grid;grid-template-columns:1fr 1fr;gap:6px}.nps-segments button{border:1px solid #d6e3eb;border-radius:11px;background:#fff;color:#6b8292;padding:8px}.nps-segments button.is-active{border-color:#99bed6;background:#EAF6FF;color:#315c77;font-weight:800}.nps-grid-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.nps-grid-two .nps-card{display:flex;flex-direction:column;gap:9px}.nps-presets{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.nps-presets button{border:1px solid #d7e4ec;border-radius:8px;background:#f6fafc;color:#5b7587;padding:5px}.nps-safety-card ul{margin:0;padding-left:18px;color:#60798b;font-size:12px}
      details summary{cursor:pointer;font-weight:800;color:#4c687c}.nps-bulk{min-height:100px;margin:8px 0}.nps-overlay{position:fixed;inset:0;z-index:2147483640;display:grid;place-items:center;padding:18px;background:rgba(13,30,43,.42)}.nps-dialog{width:min(640px,100%);max-height:min(720px,90vh);overflow:auto;padding:18px;border-radius:20px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.28)}.nps-dialog h3{margin:0 0 6px}.nps-dialog>p{margin:0 0 12px;color:#60798b}.nps-conflicts{display:grid;gap:8px}.nps-conflict{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:10px;border:1px solid #dce7ee;border-radius:12px}.nps-conflict input{width:auto}.nps-conflict span{display:grid;gap:4px}.nps-conflict small{color:#9b6c25}.nps-conflict del,.nps-conflict ins{padding:6px;border-radius:8px;text-decoration:none;white-space:pre-wrap}.nps-conflict del{background:#fff1f1;color:#9e5151}.nps-conflict ins{background:#eef9f4;color:#34735d}.nps-dialog-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:14px}.nps-dialog-actions button{border:1px solid #d4e1e9;border-radius:10px;background:#fff;padding:8px 12px}
      @media(max-width:720px){:host{right:8px;bottom:8px}.nps-panel{width:calc(100vw - 16px);height:calc(100vh - 74px);border-radius:18px}.nps-library{grid-template-columns:1fr}.nps-slot-list{max-height:170px}.nps-grid-two{grid-template-columns:1fr}.nps-slot-head{grid-template-columns:1fr}.nps-slot-head .nps-danger-ghost{grid-column:1;grid-row:auto}.nps-row{grid-template-columns:32px minmax(0,1fr)}}
    </style><div id="nps-app"></div>`;
    app = shadow.querySelector('#nps-app');
    importFileInput = document.createElement('input');
    importFileInput.type = 'file';
    importFileInput.accept = 'application/json,.json';
    importFileInput.hidden = true;
    importFileInput.addEventListener('change', () => {
      const file = importFileInput.files?.[0] || null;
      importFileInput.value = '';
      void importJsonFile(file);
    });
    host.append(importFileInput);
    shadow.addEventListener('click', event => {
      const button = event.target.closest?.('button[data-action]');
      if (button) void handleAction(button);
    });
    shadow.addEventListener('input', event => handleFieldInput(event.target));
    shadow.addEventListener('change', event => handleFieldInput(event.target));
    document.documentElement.append(host);
    render();
  }

  function bootstrap() {
    installUi();
    const observer = new MutationObserver(() => {
      if (!document.querySelector('#crack-nai-prompt-selector-host')) installUi();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    global.addEventListener('beforeunload', () => {
      clearAutoTimers();
      if (dirty) persistState({ immediate: true });
    });
  }

  bootstrap();
})(typeof globalThis !== 'undefined' ? globalThis : window);
