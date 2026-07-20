// ==UserScript==
// @name         🗂️ 크랙 유저노트 DB
// @namespace    crack-usernote-db
// @version      1.0.5
// @description  🧪 BETA · 크랙 유저노트에 저장해둔 범용지침/옵션/페르소나를 마커 기반으로 자동 적용
// @match        https://crack.wrtn.ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_UserNote_DB.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_UserNote_DB.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'crackUserNoteDB:v1';
  const LOCAL_BACKUP_KEY = 'crackUserNoteDB:localBackups:v1';
  const NOTE_LIMIT = 2000;
  const SLOT_COUNT = 10;
  const LOCAL_BACKUP_LIMIT = 30;
  const MARK = {
    rules: ['[r]', '[/r]'],
    option: (n) => [`[o${n}]`, `[/o${n}]`],
    persona: (n) => [`[p${n}]`, `[/p${n}]`],
  };
  const LEGACY_MARK = {
    rules: ['[U:r]', '[/U:r]'],
    option: (n) => [`[U:o${n}]`, `[/U:o${n}]`],
    persona: (n) => [`[U:p${n}]`, `[/U:p${n}]`],
  };

  const emptyState = () => ({
    rules: { enabled: true, text: '' },
    options: Array.from({ length: SLOT_COUNT }, (_, i) => ({
      id: i + 1,
      enabled: false,
      name: `옵션${i + 1}`,
      text: '',
    })),
    personas: Array.from({ length: SLOT_COUNT }, (_, i) => ({
      id: i + 1,
      enabled: false,
      name: `페르소나${i + 1}`,
      text: '',
    })),
  });

  let state = loadState();
  let panel;
  let autoSaveTimer = null;
  let draggedOrderItem = null;
  let pointerOrderDrag = null;
  let lastNoteLength = null;

  GM_addStyle(`
    #undb-btn{pointer-events:auto}
    #undb-btn span{font-size:14px;display:inline-block;transform:translateY(1px);pointer-events:none}
    #undb-panel{
      position:fixed;right:18px;bottom:148px;z-index:2147483602;width:410px;max-width:92vw;
      max-height:80vh;overflow:auto;background:#EEF6FB;color:#18212b;border:1px solid #CEDEF2;
      border-radius:10px;padding:14px;box-shadow:0 10px 30px rgba(43,72,102,.24);
      font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:none;
    }
    #undb-panel *{box-sizing:border-box}
    .undb-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-weight:800;cursor:move;user-select:none}
    .undb-head-actions{display:flex;align-items:center;gap:6px}
    .undb-icon{
      width:28px;height:28px;border:1px solid #CEDEF2;border-radius:999px;background:#fff;color:#243547;
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;
    }
    .undb-mini-icon{
      width:26px;height:26px;border:1px solid #CEDEF2;border-radius:999px;background:#fff;color:#243547;
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;
    }
    .undb-close{cursor:pointer;font-size:14px;color:#516171}
    .undb-small{font-size:11px;color:#607181;line-height:1.4}
    .undb-section{margin-top:10px;border:1px solid #CEDEF2;border-radius:8px;background:#fff;padding:10px}
    .undb-acc{display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:13px;font-weight:800}
    .undb-body{display:none;margin-top:8px}
    .undb-body.open{display:block}
    .undb-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .undb-line{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;margin:6px 0}
    .undb-name{width:100%;border:1px solid #CEDEF2;border-radius:6px;background:#F8FCFF;color:#18212b;padding:7px;font-size:12px}
    .undb-text-wrap{position:relative;margin-top:5px}
    .undb-text{
      width:100%;min-height:76px;resize:vertical;border:1px solid #CEDEF2;border-radius:6px;
      background:#fff;color:#18212b;padding:9px 9px 20px;font-size:12px;line-height:1.45;
    }
    .undb-count{position:absolute;right:8px;bottom:5px;font-size:10px;color:#7b8a99;background:rgba(255,255,255,.86)}
    .undb-count.warn{color:#d53535;font-weight:800}
    .undb-btn{
      border:0;border-radius:7px;padding:9px 10px;background:#7398c8;color:#fff;font-size:12px;
      font-weight:800;cursor:pointer;white-space:nowrap;
    }
    .undb-btn.light{background:#CEDEF2;color:#243547}
    .undb-btn.gray{background:#718093}
    .undb-btn.red{background:#d9534f}
    .undb-btn:disabled{opacity:.55;cursor:not-allowed}
    .undb-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:10px}
    .undb-actions.three{grid-template-columns:repeat(3,1fr)}
    .undb-actions .wide{grid-column:1/-1}
    .undb-btn.main{font-size:13px;padding:12px 10px}
    .undb-inline-tools{display:flex;justify-content:flex-start;margin-top:6px}
    .undb-status{min-height:18px;margin-top:8px;font-size:12px;text-align:center;color:#516171;word-break:break-word}
    .undb-slot{border-top:1px dashed #DCEAF7;margin-top:9px;padding-top:9px}
    .undb-hidden-input{display:none}
    .undb-manage{
      display:none;position:absolute;left:12px;right:12px;top:50px;z-index:2;
      max-height:min(62vh,520px);overflow:auto;
      border:1px solid #CEDEF2;border-radius:8px;background:#F8FCFF;padding:10px;
      box-shadow:0 10px 24px rgba(43,72,102,.20);
    }
    .undb-manage.open{display:block}
    .undb-manage-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;font-weight:800;color:#374b5f}
    .undb-manage-close{border:0;background:#fff;border:1px solid #CEDEF2;border-radius:999px;width:24px;height:24px;color:#516171;cursor:pointer}
    .undb-select{width:100%;border:1px solid #CEDEF2;border-radius:6px;background:#fff;color:#18212b;padding:8px;font-size:12px}
    .undb-order-title{margin:10px 0 6px;font-size:12px;font-weight:800;color:#374b5f}
    .undb-order-list{display:flex;flex-direction:column;gap:5px}
    .undb-order-item{
      display:flex;align-items:center;gap:7px;border:1px solid #CEDEF2;border-radius:7px;background:#fff;
      padding:8px;font-size:12px;cursor:grab;touch-action:none;user-select:none;-webkit-user-drag:none;
    }
    .undb-order-item.dragging{opacity:.45}
    .undb-grip{color:#8194a6;font-weight:800}
    .undb-silent-dialog{
      opacity:0!important;pointer-events:none!important;transform:scale(.985)!important;
      transition:none!important;
    }
  `);

  const btn = document.createElement('button');
  btn.id = 'undb-btn';
  btn.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';
  btn.style.width = '28px';
  btn.style.height = '28px';
  btn.style.minWidth = '28px';
  btn.style.borderRadius = '9999px';
  btn.title = '유저노트 DB';
  btn.innerHTML = '<span>🗒️</span>';
  btn.addEventListener('click', () => togglePanel());

  buildPanel();
  setInterval(injectButton, 1200);
  setTimeout(injectButton, 800);

  function loadState() {
    const saved = GM_getValue(STORAGE_KEY, null);
    if (!saved) return emptyState();
    try {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
      return normalizeState(parsed);
    } catch {
      return emptyState();
    }
  }

  function normalizeState(value) {
    const base = emptyState();
    const optionFallback = new Map(base.options.map((slot) => [slot.id, slot]));
    const personaFallback = new Map(base.personas.map((slot) => [slot.id, slot]));
    const usedOptions = new Set();
    const usedPersonas = new Set();
    const options = (value?.options || []).map((slot) => {
      const id = Number(slot?.id) || 0;
      usedOptions.add(id);
      return { ...(optionFallback.get(id) || { id }), ...slot, id };
    }).filter((slot) => slot.id >= 1 && slot.id <= SLOT_COUNT);
    const personas = (value?.personas || []).map((slot) => {
      const id = Number(slot?.id) || 0;
      usedPersonas.add(id);
      return { ...(personaFallback.get(id) || { id }), ...slot, id };
    }).filter((slot) => slot.id >= 1 && slot.id <= SLOT_COUNT);
    base.options.forEach((slot) => { if (!usedOptions.has(slot.id)) options.push(slot); });
    base.personas.forEach((slot) => { if (!usedPersonas.has(slot.id)) personas.push(slot); });
    return {
      rules: { ...base.rules, ...(value?.rules || {}) },
      options: options.slice(0, SLOT_COUNT),
      personas: personas.slice(0, SLOT_COUNT),
    };
  }

  function saveState() {
    collectPanelState();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    setStatus('DB 저장됨');
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'undb-panel';
    panel.innerHTML = `
      <div class="undb-head">
        <span>유저노트 DB</span>
        <span class="undb-head-actions">
          <button class="undb-icon" id="undb-manage-order-btn" type="button" title="순서 변경">☰</button>
          <button class="undb-icon" id="undb-manage-backup-btn" type="button" title="백업/불러오기">📦</button>
          <button class="undb-icon" id="undb-manage-delete-btn" type="button" title="삭제">🗑️</button>
          <span class="undb-close" id="undb-close">✕</span>
        </span>
      </div>
      <div class="undb-small">DB 입력 시 자동 저장 | 유저노트 적용 시 2,000자 초과 저장 불가.</div>
      <div class="undb-small" id="undb-length-info">현재 유저노트 글자수: -/2000 | 체크 항목 글자수: 0/2000</div>

      <div class="undb-manage" id="undb-manage-backup">
        <div class="undb-manage-head"><span>백업/불러오기</span><button class="undb-manage-close" type="button" data-manage-close>✕</button></div>
        <div class="undb-small">백업/불러오기 대상 선택</div>
        <select class="undb-select" id="undb-backup-target">${targetOptionsHTML()}</select>
        <div class="undb-actions three">
          <button class="undb-btn light" id="undb-copy-selected">복사</button>
          <button class="undb-btn light" id="undb-export-selected">백업</button>
          <button class="undb-btn light" id="undb-import-selected">불러오기</button>
        </div>
        <div class="undb-order-title">로컬 백업</div>
        <select class="undb-select" id="undb-local-backup-target">${localBackupOptionsHTML()}</select>
        <div class="undb-actions three">
          <button class="undb-btn light" id="undb-local-backup-save">스냅샷 저장</button>
          <button class="undb-btn light" id="undb-local-backup-restore">복원</button>
          <button class="undb-btn red" id="undb-local-backup-delete">삭제</button>
        </div>
      </div>

      <div class="undb-manage" id="undb-manage-order">
        <div class="undb-manage-head"><span>순서 변경</span><button class="undb-manage-close" type="button" data-manage-close>✕</button></div>
        <div class="undb-small">드래그해서 옵션/페르소나 순서 변경</div>
        <div class="undb-order-title">옵션</div>
        <div class="undb-order-list" id="undb-order-options">${orderItemsHTML('options')}</div>
        <div class="undb-order-title">페르소나</div>
        <div class="undb-order-list" id="undb-order-personas">${orderItemsHTML('personas')}</div>
      </div>

      <div class="undb-manage" id="undb-manage-delete">
        <div class="undb-manage-head"><span>삭제</span><button class="undb-manage-close" type="button" data-manage-close>✕</button></div>
        <div class="undb-small">삭제 대상 선택. 삭제는 이중 확인 뜸.</div>
        <select class="undb-select" id="undb-delete-target">${targetOptionsHTML()}</select>
        <div class="undb-actions">
          <button class="undb-btn red" id="undb-delete-selected">선택 삭제</button>
        </div>
      </div>

      ${rulesHTML()}
      ${optionsHTML()}
      ${personasHTML()}

      <div class="undb-section">
        <div class="undb-actions">
          <button class="undb-btn main wide" id="undb-apply-room">💾 현재 유저노트에 적용</button>
          <button class="undb-btn red main wide" id="undb-clear-room">🧹 현재 유저노트 초기화</button>
        </div>
        <div class="undb-status" id="undb-status"></div>
      </div>
      <input class="undb-hidden-input" id="undb-file" type="file" accept=".json,.txt,text/plain,application/json">
    `;
    document.documentElement.appendChild(panel);
    bindPanel();
    makePanelDraggable();
    updateLengthInfo();
  }

  function targetOptionsHTML() {
    let html = `
      <option value="all">전체</option>
      <option value="rules">범용지침</option>
      <option value="options">옵션 전체</option>
      <option value="personas">페르소나 전체</option>
    `;
    for (let i = 1; i <= SLOT_COUNT; i++) html += `<option value="option:${i}">옵션${i}</option>`;
    for (let i = 1; i <= SLOT_COUNT; i++) html += `<option value="persona:${i}">페르소나${i}</option>`;
    return html;
  }

  function localBackupOptionsHTML() {
    const backups = getLocalBackups();
    if (!backups.length) return '<option value="">저장된 로컬 백업 없음</option>';
    return backups.map((backup) => `<option value="${escapeAttr(backup.id)}">${escapeHTML(backup.label)}</option>`).join('');
  }

  function orderItemsHTML(group) {
    return state[group].map((slot) => `
      <div class="undb-order-item" draggable="true" data-order-group="${group}" data-order-id="${slot.id}">
        <span class="undb-grip">☰</span>
        <span>${escapeHTML(slot.name || (group === 'options' ? `옵션${slot.id}` : `페르소나${slot.id}`))}</span>
      </div>
    `).join('');
  }

  function rulesHTML() {
    return `
      <div class="undb-section">
        <div class="undb-acc" data-acc="rules"><span>범용지침</span><span class="undb-arrow">▼</span></div>
        <div class="undb-body open" id="undb-body-rules">
          <label class="undb-line"><input type="checkbox" id="undb-rules-on" ${state.rules.enabled ? 'checked' : ''}> <span></span></label>
          <div class="undb-text-wrap">
            <textarea class="undb-text" id="undb-rules-text" maxlength="${NOTE_LIMIT}" placeholder="범용지침 내용">${escapeHTML(state.rules.text)}</textarea>
            <span class="undb-count" data-count-for="undb-rules-text"></span>
          </div>
        </div>
      </div>
    `;
  }

  function optionsHTML() {
    return `
      <div class="undb-section">
        <div class="undb-acc" data-acc="options"><span>옵션</span><span class="undb-arrow">▶</span></div>
        <div class="undb-body" id="undb-body-options">
          ${optionSlotsHTML()}
        </div>
      </div>
    `;
  }

  function optionSlotsHTML() {
    return state.options.map((slot) => `
      <div class="undb-slot">
        <label class="undb-line"><input type="checkbox" id="undb-o${slot.id}-on" ${slot.enabled ? 'checked' : ''}> <input class="undb-name" id="undb-o${slot.id}-name" value="${escapeAttr(slot.name)}"></label>
        <div class="undb-text-wrap">
          <textarea class="undb-text" id="undb-o${slot.id}-text" maxlength="${NOTE_LIMIT}" placeholder="옵션${slot.id} 내용">${escapeHTML(slot.text)}</textarea>
          <span class="undb-count" data-count-for="undb-o${slot.id}-text"></span>
        </div>
      </div>
    `).join('');
  }

  function personasHTML() {
    return `
      <div class="undb-section">
        <div class="undb-acc" data-acc="personas"><span>페르소나</span><span class="undb-arrow">▶</span></div>
        <div class="undb-body" id="undb-body-personas">
          ${personaSlotsHTML()}
        </div>
      </div>
    `;
  }

  function personaSlotsHTML() {
    return state.personas.map((slot) => `
      <div class="undb-slot">
        <label class="undb-line"><input type="radio" name="undb-persona" id="undb-p${slot.id}-on" ${slot.enabled ? 'checked' : ''}> <input class="undb-name" id="undb-p${slot.id}-name" value="${escapeAttr(slot.name)}"></label>
        <div class="undb-text-wrap">
          <textarea class="undb-text" id="undb-p${slot.id}-text" maxlength="${NOTE_LIMIT}" placeholder="페르소나${slot.id} 내용">${escapeHTML(slot.text)}</textarea>
          <span class="undb-count" data-count-for="undb-p${slot.id}-text"></span>
        </div>
      </div>
    `).join('');
  }

  function bindPanel() {
    $('#undb-close').addEventListener('click', () => panel.style.display = 'none');
    bindAutoSaveControls();
    $$('.undb-acc').forEach((el) => el.addEventListener('click', () => {
      const body = $(`#undb-body-${el.dataset.acc}`);
      if (!body) return;
      body.classList.toggle('open');
      const arrow = el.querySelector('.undb-arrow');
      if (arrow) arrow.textContent = body.classList.contains('open') ? '▼' : '▶';
    }));
    $('#undb-manage-order-btn').addEventListener('click', () => {
      collectPanelState();
      renderOrderPanel();
      toggleManage('order');
    });
    $('#undb-manage-backup-btn').addEventListener('click', () => toggleManage('backup'));
    $('#undb-manage-delete-btn').addEventListener('click', () => toggleManage('delete'));
    $$('[data-manage-close]').forEach((el) => el.addEventListener('click', closeManagePanels));
    $('#undb-copy-selected').addEventListener('click', () => copyTarget($('#undb-backup-target').value));
    $('#undb-export-selected').addEventListener('click', () => exportTarget($('#undb-backup-target').value));
    $('#undb-import-selected').addEventListener('click', () => importFile($('#undb-backup-target').value));
    $('#undb-local-backup-save').addEventListener('click', createLocalBackup);
    $('#undb-local-backup-restore').addEventListener('click', restoreLocalBackup);
    $('#undb-local-backup-delete').addEventListener('click', deleteLocalBackup);
    $('#undb-delete-selected').addEventListener('click', () => clearTarget($('#undb-delete-target').value));
    $('#undb-apply-room').addEventListener('click', () => applyToNote('room'));
    $('#undb-clear-room').addEventListener('click', () => clearNote('room'));
    $$('[data-export-one]').forEach((el) => el.addEventListener('click', () => exportOne(el.dataset.exportOne)));
    $$('[data-import-one]').forEach((el) => el.addEventListener('click', () => importFile(el.dataset.importOne)));
    $$('[data-clear-one]').forEach((el) => el.addEventListener('click', () => clearOne(el.dataset.clearOne)));
    $$('[data-export-group]').forEach((el) => el.addEventListener('click', () => exportGroup(el.dataset.exportGroup)));
    $$('[data-import-group]').forEach((el) => el.addEventListener('click', () => importFile(el.dataset.importGroup)));
    $$('[data-clear-group]').forEach((el) => el.addEventListener('click', () => clearGroup(el.dataset.clearGroup)));
    bindOrderDrag();
  }

  function bindAutoSaveControls() {
    $$('#undb-panel textarea').forEach((el) => updateCounter(el.id));
    panel.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches('textarea')) updateCounter(target.id);
      updateLengthInfo();
      if (target.matches('textarea, .undb-name')) scheduleAutoSave();
      if (target.matches('.undb-name')) renderOrderPanel();
    });
    panel.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches('input[type="checkbox"], input[type="radio"]')) {
        updateLengthInfo();
        scheduleAutoSave();
      }
    });
  }

  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      collectPanelState();
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      updateLengthInfo();
      setStatus('자동 저장됨');
    }, 200);
  }

  function makePanelDraggable() {
    const head = panel.querySelector('.undb-head');
    if (!head) return;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    head.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, .undb-close')) return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragging) return;
      const rect = panel.getBoundingClientRect();
      const nextLeft = clamp(startLeft + event.clientX - startX, 8, Math.max(8, window.innerWidth - rect.width - 8));
      const nextTop = clamp(startTop + event.clientY - startY, 8, Math.max(8, window.innerHeight - rect.height - 8));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function collectPanelState() {
    state.rules.enabled = $('#undb-rules-on').checked;
    state.rules.text = $('#undb-rules-text').value;
    state.options.forEach((slot) => {
      const id = slot.id;
      slot.enabled = $(`#undb-o${id}-on`)?.checked || false;
      slot.name = $(`#undb-o${id}-name`)?.value || `옵션${id}`;
      slot.text = $(`#undb-o${id}-text`)?.value || '';
    });
    state.personas.forEach((slot) => {
      const id = slot.id;
      slot.enabled = $(`#undb-p${id}-on`)?.checked || false;
      slot.name = $(`#undb-p${id}-name`)?.value || `페르소나${id}`;
      slot.text = $(`#undb-p${id}-text`)?.value || '';
    });
  }

  function refreshPanelValues() {
    $('#undb-rules-on').checked = state.rules.enabled;
    $('#undb-rules-text').value = state.rules.text;
    updateCounter('undb-rules-text');
    state.options.forEach((option) => {
      const id = option.id;
      if ($(`#undb-o${id}-on`)) $(`#undb-o${id}-on`).checked = option.enabled;
      if ($(`#undb-o${id}-name`)) $(`#undb-o${id}-name`).value = option.name;
      if ($(`#undb-o${id}-text`)) $(`#undb-o${id}-text`).value = option.text;
      updateCounter(`undb-o${id}-text`);
    });
    state.personas.forEach((persona) => {
      const id = persona.id;
      if ($(`#undb-p${id}-on`)) $(`#undb-p${id}-on`).checked = persona.enabled;
      if ($(`#undb-p${id}-name`)) $(`#undb-p${id}-name`).value = persona.name;
      if ($(`#undb-p${id}-text`)) $(`#undb-p${id}-text`).value = persona.text;
      updateCounter(`undb-p${id}-text`);
    });
  }

  function buildBlocks(mode) {
    collectPanelState();
    const blocks = [];
    if ((mode === 'default' || state.rules.enabled) && state.rules.text.trim()) {
      blocks.push(wrapBlock(MARK.rules, state.rules.text));
    }
    if (mode === 'room') {
      state.options.forEach((slot) => {
        if (slot.enabled && slot.text.trim()) blocks.push(wrapBlock(MARK.option(slot.id), slot.text));
      });
      const persona = state.personas.find((slot) => slot.enabled && slot.text.trim());
      if (persona) blocks.push(wrapBlock(MARK.persona(persona.id), persona.text));
    }
    return blocks.join('\n\n');
  }

  function getCheckedBlocksLength() {
    collectPanelState();
    const blocks = buildBlocks('room');
    return blocks.trim().length;
  }

  function updateLengthInfo() {
    const el = $('#undb-length-info');
    if (!el) return;
    const checkedLength = getCheckedBlocksLength();
    const noteLength = Number.isFinite(lastNoteLength) ? lastNoteLength : null;
    el.textContent = `현재 유저노트 글자수: ${noteLength === null ? '-' : noteLength}/2000 | 체크 항목 글자수: ${checkedLength}/2000`;
    el.style.color = checkedLength > NOTE_LIMIT || (noteLength !== null && noteLength > NOTE_LIMIT) ? '#d53535' : '#607181';
  }

  async function applyToNote(kind) {
    try {
      collectPanelState();
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      const blocks = buildBlocks(kind);
      if (!blocks.trim()) {
        setStatus(kind === 'default' ? '실패: 범용지침 내용 없음' : '실패: 적용할 내용 없음', true);
        return;
      }
      const note = await openNote(kind);
      lastNoteLength = note.textarea.value.length;
      updateLengthInfo();
      const cleaned = stripManagedBlocks(note.textarea.value);
      const next = kind === 'default' ? blocks.trim() : joinNote(cleaned, blocks);
      if (next.length > NOTE_LIMIT) {
        setStatus(`실패: 유저노트가 2,000자를 초과함. 현재 ${next.length}자`, true);
        closeDialog(note.dialog);
        return;
      }
      const saveResult = await saveTextarea(note, next);
      if (saveResult?.unchanged) {
        setStatus('수정사항 없음');
        return;
      }
      lastNoteLength = next.length;
      updateLengthInfo();
      setStatus(`${kind === 'default' ? '기본' : '방'} 유저노트 저장 완료 ${next.length}/2,000`);
    } catch (err) {
      setStatus(`실패: ${err.message || err}`, true);
    }
  }

  async function removeBlocksFromNote(kind) {
    try {
      const note = await openNote(kind);
      lastNoteLength = note.textarea.value.length;
      updateLengthInfo();
      const next = stripManagedBlocks(note.textarea.value).trim();
      const saveResult = await saveTextarea(note, next);
      if (!saveResult?.unchanged) {
        lastNoteLength = next.length;
        updateLengthInfo();
      }
      setStatus(saveResult?.unchanged ? '수정사항 없음' : `${kind === 'default' ? '기본' : '방'} DB블록 제거 완료 ${next.length}/2,000`);
    } catch (err) {
      setStatus(`실패: ${err.message || err}`, true);
    }
  }

  async function clearNote(kind) {
    if (!doubleConfirm('현재 방 유저노트 전체를 삭제할 거임. 계속?', '진짜 삭제함? 저장된 DB 말고 사이트 유저노트 내용이 비워짐.')) return;
    try {
      const note = await openNote(kind);
      lastNoteLength = note.textarea.value.length;
      updateLengthInfo();
      const saveResult = await saveTextarea(note, '');
      if (!saveResult?.unchanged) {
        lastNoteLength = 0;
        updateLengthInfo();
      }
      setStatus(saveResult?.unchanged ? '수정사항 없음' : '방 유저노트 전체 삭제 완료');
    } catch (err) {
      setStatus(`실패: ${err.message || err}`, true);
    }
  }

  async function openNote(kind) {
    const button = findUserNoteButton(kind);
    if (!button) throw new Error(`${kind === 'default' ? '기본' : '방'} 유저노트 버튼을 못 찾음`);
    const beforeDialogs = new Set($$('[role="dialog"]').filter(isVisibleEl));
    const stopWatching = watchAutoDialog(beforeDialogs);
    button.click();
    let textarea;
    try {
      textarea = await waitFor(() => {
        const dialogs = $$('#undb-panel ~ [role="dialog"], [role="dialog"]').filter(isVisibleEl);
        for (const dialog of dialogs) {
          if (beforeDialogs.has(dialog)) continue;
          dialog.classList.add('undb-silent-dialog');
          const ta = $$('textarea[maxlength="2000"], textarea', dialog).find((el) => !panel.contains(el));
          if (ta) return ta;
        }
        return null;
      }, 2200, 25);
    } finally {
      stopWatching();
    }
    const dialog = textarea.closest('[role="dialog"]');
    if (dialog) dialog.classList.add('undb-silent-dialog');
    return { textarea, dialog };
  }

  function findUserNoteButton(kind) {
    const candidates = $$('[role="button"]').filter((el) => {
      if (!isVisibleEl(el)) return false;
      if (!/유저\s*노트/.test(el.textContent || '')) return false;
      return true;
    });
    if (!candidates.length) return null;

    const defaults = candidates.filter((el) => el.querySelector('button[aria-hidden="true"]'));
    const rooms = candidates.filter((el) => !el.querySelector('button[aria-hidden="true"]') && el.querySelector('svg'));
    if (kind === 'default') return defaults[0] || candidates[0] || null;
    return rooms[0] || candidates.find((el) => !defaults.includes(el)) || candidates[candidates.length - 1] || null;
  }

  function watchAutoDialog(beforeDialogs) {
    const hideNewDialog = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const dialogs = [];
      if (node.matches?.('[role="dialog"]')) dialogs.push(node);
      dialogs.push(...$$('[role="dialog"]', node));
      dialogs.forEach((dialog) => {
        if (!beforeDialogs.has(dialog) && !panel.contains(dialog)) {
          dialog.classList.add('undb-silent-dialog');
        }
      });
    };
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach(hideNewDialog));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  async function saveTextarea(note, value) {
    if (note.dialog) note.dialog.classList.add('undb-silent-dialog');
    await ensureExpandedLimit(note.dialog);
    setNativeValue(note.textarea, value);
    note.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    note.textarea.dispatchEvent(new Event('change', { bubbles: true }));
    const firstClick = await clickNoteSaveButton(note.dialog);
    if (firstClick === 'disabled') {
      closeDialog(note.dialog);
      await sleep(40);
      const continueButton = findContinueWritingButton();
      if (!continueButton) return { unchanged: true };
      continueButton.click();
      await sleep(50);
      const retryClick = await clickNoteSaveButton(note.dialog);
      if (retryClick === 'disabled') return { unchanged: true };
    }
    await waitForDialogClose(note.dialog, 700);
    if (note.dialog && note.dialog.isConnected && /500자 이하로 입력해주세요/.test(note.dialog.textContent || '')) {
      await ensureExpandedLimit(note.dialog);
      note.textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const limitRetry = await clickNoteSaveButton(note.dialog);
      if (limitRetry === 'disabled') return { unchanged: true };
      await waitForDialogClose(note.dialog, 700);
    }
    if (note.dialog && note.dialog.isConnected && isVisibleEl(note.dialog) && findSaveButton(note.dialog)) {
      throw new Error('등록 후에도 유저노트 창이 닫히지 않음');
    }
    const continueButton = findContinueWritingButton();
    if (continueButton) {
      continueButton.click();
      await sleep(50);
      const retryClick = await clickNoteSaveButton(note.dialog);
      if (retryClick === 'disabled') return { unchanged: true };
      await waitForDialogClose(note.dialog, 700);
    }
    if (note.dialog && note.dialog.isConnected) closeDialog(note.dialog);
    await sleep(40);
    const continueAfterClose = findContinueWritingButton();
    if (continueAfterClose) {
      continueAfterClose.click();
      await sleep(50);
      const retryClick = await clickNoteSaveButton(note.dialog);
      if (retryClick === 'disabled') return { unchanged: true };
      await waitForDialogClose(note.dialog, 700);
      if (note.dialog && note.dialog.isConnected) closeDialog(note.dialog);
    }
    return { unchanged: false };
  }

  async function clickNoteSaveButton(dialog) {
    const saveButton = await waitFor(() => findSaveButton(dialog), 900, 25).catch(() => null);
    if (!saveButton) throw new Error('등록 버튼을 못 찾음');
    if (saveButton.disabled) return 'disabled';
    saveButton.click();
    return 'clicked';
  }

  function findSaveButton(dialog) {
    if (!dialog) return null;
    const buttons = $$('button', dialog).filter((el) => isVisibleEl(el) && el.getAttribute('aria-label') !== '닫기');
    return buttons.find((el) => /^(등록|수정)$/.test((el.textContent || '').trim()))
      || buttons.find((el) => /등록|수정/.test((el.textContent || '').trim()))
      || null;
  }

  async function ensureExpandedLimit(dialog) {
    if (!dialog) return;
    const switchButton = $$('button[role="switch"]', dialog).find((el) => isVisibleEl(el));
    if (!switchButton) return;
    if (switchButton.getAttribute('aria-checked') === 'true' || switchButton.dataset.state === 'checked') return;
    switchButton.click();
    await sleep(35);
    const confirmButton = findDialogButtonByText('확인');
    if (confirmButton) {
      confirmButton.click();
      await sleep(50);
    }
    await waitFor(() => {
      const current = $$('button[role="switch"]', dialog).find((el) => isVisibleEl(el));
      return current && (current.getAttribute('aria-checked') === 'true' || current.dataset.state === 'checked');
    }, 700, 25).catch(() => null);
  }

  function findContinueWritingButton() {
    return findDialogButtonByText('계속 작성');
  }

  function findDialogButtonByText(text) {
    const dialogs = $$('[role="dialog"]').filter(isVisibleEl);
    for (const dialog of dialogs) {
      const button = $$('button', dialog).find((el) => isVisibleEl(el) && (el.textContent || '').trim() === text);
      if (button) return button;
    }
    return null;
  }

  async function waitForDialogClose(dialog, timeout = 1500) {
    if (!dialog) return;
    await waitFor(() => !dialog.isConnected || !isVisibleEl(dialog), timeout, 25).catch(() => null);
  }

  function closeDialog(dialog) {
    if (!dialog || !dialog.isConnected) return;
    const close = $$('button', dialog).find((el) => {
      const label = el.getAttribute('aria-label') || '';
      return /닫기|close/i.test(label);
    });
    if (close) close.click();
  }

  function stripManagedBlocks(text) {
    let next = text || '';
    const pairs = allMarkPairs();
    pairs.forEach(([start, end]) => {
      next = next.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n*`, 'g'), '');
    });
    return next.trim();
  }

  function allMarkPairs() {
    const pairs = [MARK.rules, LEGACY_MARK.rules];
    for (let i = 1; i <= SLOT_COUNT; i++) {
      pairs.push(MARK.option(i), MARK.persona(i), LEGACY_MARK.option(i), LEGACY_MARK.persona(i));
    }
    return pairs;
  }

  function joinNote(existing, blocks) {
    return [existing.trim(), blocks.trim()].filter(Boolean).join('\n\n');
  }

  function wrapBlock([start, end], text) {
    return `${start}\n${text.trim()}\n${end}`;
  }

  function toggleManage(kind) {
    const backup = $('#undb-manage-backup');
    const del = $('#undb-manage-delete');
    const order = $('#undb-manage-order');
    if (kind === 'backup') {
      backup.classList.toggle('open');
      del.classList.remove('open');
      order.classList.remove('open');
      return;
    }
    if (kind === 'order') {
      order.classList.toggle('open');
      backup.classList.remove('open');
      del.classList.remove('open');
      return;
    }
    del.classList.toggle('open');
    backup.classList.remove('open');
    order.classList.remove('open');
  }

  function closeManagePanels() {
    $$('.undb-manage').forEach((el) => el.classList.remove('open'));
  }

  function renderOrderPanel() {
    const options = $('#undb-order-options');
    const personas = $('#undb-order-personas');
    if (options) options.innerHTML = orderItemsHTML('options');
    if (personas) personas.innerHTML = orderItemsHTML('personas');
    bindOrderDrag();
  }

  function renderSlotPanels() {
    const optionsBody = $('#undb-body-options');
    const personasBody = $('#undb-body-personas');
    if (optionsBody) optionsBody.innerHTML = optionSlotsHTML();
    if (personasBody) personasBody.innerHTML = personaSlotsHTML();
    refreshPanelValues();
    updateLengthInfo();
  }

  function bindOrderDrag() {
    $$('.undb-order-item').forEach((item) => {
      if (item.dataset.bound === 'true') return;
      item.dataset.bound = 'true';
      item.addEventListener('pointerdown', startPointerOrderDrag);
      item.addEventListener('touchstart', startTouchOrderDrag, { passive: false });
      item.addEventListener('dragstart', () => {
        draggedOrderItem = { group: item.dataset.orderGroup, id: Number(item.dataset.orderId) };
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedOrderItem = null;
      });
      item.addEventListener('dragover', (event) => event.preventDefault());
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        if (!draggedOrderItem) return;
        const group = item.dataset.orderGroup;
        const targetId = Number(item.dataset.orderId);
        if (draggedOrderItem.group !== group || draggedOrderItem.id === targetId) return;
        moveSlot(group, draggedOrderItem.id, targetId);
      });
    });
  }

  function startPointerOrderDrag(event) {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    if (!beginOrderDrag(event.currentTarget, event.pointerId)) return;
    event.preventDefault();
    window.addEventListener('pointermove', movePointerOrderDrag, { passive: false });
    window.addEventListener('pointerup', finishPointerOrderDrag);
    window.addEventListener('pointercancel', cancelPointerOrderDrag);
  }

  function startTouchOrderDrag(event) {
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch || !beginOrderDrag(event.currentTarget, touch.identifier)) return;
    event.preventDefault();
    window.addEventListener('touchmove', moveTouchOrderDrag, { passive: false });
    window.addEventListener('touchend', finishTouchOrderDrag);
    window.addEventListener('touchcancel', cancelTouchOrderDrag);
  }

  function beginOrderDrag(item, pointerId) {
    if (pointerOrderDrag) return false;
    const list = item.closest('.undb-order-list');
    if (!list) return false;
    pointerOrderDrag = {
      pointerId,
      group: item.dataset.orderGroup,
      item,
      list,
      wasDraggable: item.draggable,
    };
    item.draggable = false;
    item.classList.add('dragging');
    if (item.setPointerCapture && typeof pointerId === 'number') {
      try {
        item.setPointerCapture(pointerId);
      } catch {}
    }
    return true;
  }

  function movePointerOrderDrag(event) {
    if (!pointerOrderDrag || event.pointerId !== pointerOrderDrag.pointerId) return;
    event.preventDefault();
    moveOrderDragAt(event.clientX, event.clientY);
  }

  function moveTouchOrderDrag(event) {
    if (!pointerOrderDrag) return;
    const touch = Array.from(event.changedTouches || []).find((item) => item.identifier === pointerOrderDrag.pointerId);
    if (!touch) return;
    event.preventDefault();
    moveOrderDragAt(touch.clientX, touch.clientY);
  }

  function moveOrderDragAt(clientX, clientY) {
    if (!pointerOrderDrag) return;
    const { item, list, group } = pointerOrderDrag;
    item.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY)?.closest?.('.undb-order-item');
    item.style.pointerEvents = '';
    if (!target || target === item || target.closest('.undb-order-list') !== list || target.dataset.orderGroup !== group) return;
    const rect = target.getBoundingClientRect();
    const shouldInsertAfter = clientY > rect.top + rect.height / 2;
    list.insertBefore(item, shouldInsertAfter ? target.nextSibling : target);
  }

  function finishPointerOrderDrag(event) {
    if (!pointerOrderDrag || event.pointerId !== pointerOrderDrag.pointerId) return;
    finishOrderDrag(event);
  }

  function finishTouchOrderDrag(event) {
    if (!pointerOrderDrag) return;
    const touch = Array.from(event.changedTouches || []).find((item) => item.identifier === pointerOrderDrag.pointerId);
    if (!touch) return;
    finishOrderDrag(event);
  }

  function finishOrderDrag(event) {
    if (!pointerOrderDrag) return;
    const { group, item, list } = pointerOrderDrag;
    const orderedIds = $$('.undb-order-item', list).map((el) => Number(el.dataset.orderId));
    clearPointerOrderDrag(event);
    collectPanelState();
    const byId = new Map(state[group].map((slot) => [slot.id, slot]));
    state[group] = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    renderSlotPanels();
    renderOrderPanel();
    item.classList.remove('dragging');
    setStatus('순서 저장됨');
  }

  function cancelPointerOrderDrag(event) {
    if (!pointerOrderDrag || event.pointerId !== pointerOrderDrag.pointerId) return;
    clearPointerOrderDrag(event);
    renderOrderPanel();
  }

  function cancelTouchOrderDrag(event) {
    if (!pointerOrderDrag) return;
    const touch = Array.from(event.changedTouches || []).find((item) => item.identifier === pointerOrderDrag.pointerId);
    if (!touch) return;
    clearPointerOrderDrag(event);
    renderOrderPanel();
  }

  function clearPointerOrderDrag(event) {
    if (!pointerOrderDrag) return;
    const item = pointerOrderDrag.item;
    item.classList.remove('dragging');
    item.draggable = pointerOrderDrag.wasDraggable;
    window.removeEventListener('pointermove', movePointerOrderDrag);
    window.removeEventListener('pointerup', finishPointerOrderDrag);
    window.removeEventListener('pointercancel', cancelPointerOrderDrag);
    window.removeEventListener('touchmove', moveTouchOrderDrag);
    window.removeEventListener('touchend', finishTouchOrderDrag);
    window.removeEventListener('touchcancel', cancelTouchOrderDrag);
    if (event.pointerId != null && item.releasePointerCapture) {
      try {
        item.releasePointerCapture(event.pointerId);
      } catch {}
    }
    pointerOrderDrag = null;
  }

  function moveSlot(group, draggedId, targetId) {
    collectPanelState();
    const list = state[group];
    const from = list.findIndex((slot) => slot.id === draggedId);
    const to = list.findIndex((slot) => slot.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    renderSlotPanels();
    renderOrderPanel();
    setStatus('순서 저장됨');
  }

  function exportTarget(target) {
    collectPanelState();
    if (target === 'all') {
      downloadText('crack-usernote-db-backup.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2));
      setStatus('전체 백업 생성됨');
      return;
    }
    if (target === 'options' || target === 'personas') {
      exportGroup(target);
      return;
    }
    exportOne(target);
  }

  async function copyTarget(target) {
    collectPanelState();
    const text = buildCopyText(target);
    if (!text.trim()) {
      setStatus('복사할 내용 없음', true);
      return;
    }
    try {
      await copyTextToClipboard(text);
      setStatus('클립보드에 복사됨');
    } catch (err) {
      setStatus(`복사 실패: ${err.message || err}`, true);
    }
  }

  function buildCopyText(target) {
    if (target === 'all') {
      return [
        buildCopyText('rules'),
        buildCopyText('options'),
        buildCopyText('personas'),
      ].filter(Boolean).join('\n\n');
    }
    if (target === 'rules') return copySectionText('범용지침', state.rules.text);
    if (target === 'options') {
      return state.options.map((slot) => copySectionText(slot.name || `옵션${slot.id}`, slot.text)).filter(Boolean).join('\n\n');
    }
    if (target === 'personas') {
      return state.personas.map((slot) => copySectionText(slot.name || `페르소나${slot.id}`, slot.text)).filter(Boolean).join('\n\n');
    }
    const [type, rawId] = target.split(':');
    const id = Number(rawId);
    if (type === 'option') {
      const slot = state.options.find((item) => item.id === id);
      return slot ? copySectionText(slot.name || `옵션${id}`, slot.text) : '';
    }
    if (type === 'persona') {
      const slot = state.personas.find((item) => item.id === id);
      return slot ? copySectionText(slot.name || `페르소나${id}`, slot.text) : '';
    }
    return '';
  }

  function copySectionText(title, text) {
    const body = String(text || '').trim();
    if (!body) return '';
    return `${title}\n${body}`;
  }

  function clearTarget(target) {
    if (target === 'all') {
      clearAllDB();
      return;
    }
    if (target === 'options' || target === 'personas') {
      clearGroup(target);
      return;
    }
    clearOne(target);
  }

  function exportOne(key) {
    collectPanelState();
    let filename = 'crack-usernote-db.txt';
    let content = '';
    if (key === 'rules') {
      filename = 'crack-usernote-rules.txt';
      content = wrapBlock(MARK.rules, state.rules.text);
    } else {
      const [type, rawId] = key.split(':');
      const id = Number(rawId);
      if (type === 'option') {
        filename = `crack-usernote-option-${id}.txt`;
        content = wrapBlock(MARK.option(id), state.options[id - 1].text);
      } else {
        filename = `crack-usernote-persona-${id}.txt`;
        content = wrapBlock(MARK.persona(id), state.personas[id - 1].text);
      }
    }
    downloadText(filename, content);
    setStatus('백업 생성됨');
  }

  function exportGroup(group) {
    collectPanelState();
    if (group === 'options') {
      downloadText('crack-usernote-options-backup.json', JSON.stringify({ version: 1, type: 'options', options: state.options }, null, 2));
      setStatus('옵션 전체 백업 생성됨');
      return;
    }
    if (group === 'personas') {
      downloadText('crack-usernote-personas-backup.json', JSON.stringify({ version: 1, type: 'personas', personas: state.personas }, null, 2));
      setStatus('페르소나 전체 백업 생성됨');
    }
  }

  function importFile(target) {
    const input = $('#undb-file');
    input.value = '';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importText(target, String(reader.result || ''));
        } catch (err) {
          setStatus(`불러오기 실패: ${err.message || err}`, true);
        }
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }

  function getLocalBackups() {
    try {
      const raw = GM_getValue(LOCAL_BACKUP_KEY, '[]');
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setLocalBackups(backups) {
    GM_setValue(LOCAL_BACKUP_KEY, JSON.stringify(backups.slice(0, LOCAL_BACKUP_LIMIT)));
    refreshLocalBackupSelect();
  }

  function createLocalBackup() {
    collectPanelState();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    const now = new Date();
    const label = `로컬백업 ${formatDateTime(now)}`;
    const backups = getLocalBackups();
    backups.unshift({
      id: `lb-${now.getTime()}`,
      label,
      createdAt: now.toISOString(),
      data: JSON.parse(JSON.stringify(state)),
    });
    setLocalBackups(backups);
    setStatus(`${label} 저장됨`);
  }

  function restoreLocalBackup() {
    const id = $('#undb-local-backup-target').value;
    if (!id) {
      setStatus('복원할 로컬 백업 없음', true);
      return;
    }
    const backup = getLocalBackups().find((item) => item.id === id);
    if (!backup) {
      setStatus('로컬 백업을 못 찾음', true);
      return;
    }
    if (!window.confirm(`${backup.label} 상태로 DB를 복원함. 계속?`)) return;
    state = normalizeState(backup.data);
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    renderSlotPanels();
    renderOrderPanel();
    refreshPanelValues();
    updateLengthInfo();
    setStatus(`${backup.label} 복원됨`);
  }

  function deleteLocalBackup() {
    const id = $('#undb-local-backup-target').value;
    if (!id) {
      setStatus('삭제할 로컬 백업 없음', true);
      return;
    }
    const backups = getLocalBackups();
    const backup = backups.find((item) => item.id === id);
    if (!backup) return;
    if (!window.confirm(`${backup.label} 삭제함. 계속?`)) return;
    setLocalBackups(backups.filter((item) => item.id !== id));
    setStatus('로컬 백업 삭제됨');
  }

  function refreshLocalBackupSelect() {
    const select = $('#undb-local-backup-target');
    if (select) select.innerHTML = localBackupOptionsHTML();
  }

  function importText(target, text) {
    if (target === 'all') {
      const parsed = JSON.parse(text);
      state = normalizeState(parsed.data || parsed);
      renderSlotPanels();
      renderOrderPanel();
      refreshPanelValues();
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      setStatus('전체 불러오기 완료');
      return;
    }

    if (target === 'options' || target === 'personas') {
      const parsed = JSON.parse(text);
      if (target === 'options') {
        state.options = normalizeState({ options: parsed.options || parsed.data?.options || [] }).options;
        setStatus('옵션 전체 불러오기 완료');
      } else {
        state.personas = normalizeState({ personas: parsed.personas || parsed.data?.personas || [] }).personas;
        setStatus('페르소나 전체 불러오기 완료');
      }
      renderSlotPanels();
      renderOrderPanel();
      refreshPanelValues();
      GM_setValue(STORAGE_KEY, JSON.stringify(state));
      return;
    }

    const clean = unwrapImportedText(text);
    if (clean.length > NOTE_LIMIT) throw new Error(`2,000자 초과. 현재 ${clean.length}자`);
    if (target === 'rules') {
      state.rules.text = clean;
    } else {
      const [type, rawId] = target.split(':');
      const id = Number(rawId);
      if (type === 'option') state.options[id - 1].text = clean;
      if (type === 'persona') state.personas[id - 1].text = clean;
    }
    refreshPanelValues();
    renderOrderPanel();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    setStatus('불러오기 완료');
  }

  function unwrapImportedText(text) {
    const trimmed = String(text || '').trim();
    const pairs = allMarkPairs();
    for (const [start, end] of pairs) {
      if (trimmed.startsWith(start) && trimmed.endsWith(end)) {
        return trimmed.slice(start.length, -end.length).trim();
      }
    }
    return trimmed;
  }

  function clearOne(key) {
    const label = key === 'rules' ? '범용지침' : key.startsWith('option') ? `옵션${key.split(':')[1]}` : `페르소나${key.split(':')[1]}`;
    if (!doubleConfirm(`${label} 저장내용 삭제할 거임. 계속?`, '진짜 삭제함? 복구하려면 백업 필요함.')) return;
    if (key === 'rules') {
      state.rules.text = '';
      state.rules.enabled = false;
    } else {
      const [type, rawId] = key.split(':');
      const id = Number(rawId);
      if (type === 'option') {
        state.options[id - 1].text = '';
        state.options[id - 1].enabled = false;
      }
      if (type === 'persona') {
        state.personas[id - 1].text = '';
        state.personas[id - 1].enabled = false;
      }
    }
    refreshPanelValues();
    renderOrderPanel();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    setStatus(`${label} 삭제됨`);
  }

  function clearAllDB() {
    if (!doubleConfirm('DB 전체 삭제할 거임. 계속?', '진짜 전체 삭제함? 백업 없으면 복구 못 함.')) return;
    state = emptyState();
    renderSlotPanels();
    renderOrderPanel();
    refreshPanelValues();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    setStatus('DB 전체 삭제됨');
  }

  function clearGroup(group) {
    const label = group === 'options' ? '옵션 전체' : '페르소나 전체';
    if (!doubleConfirm(`${label} 저장내용 삭제할 거임. 계속?`, '진짜 삭제함? 백업 없으면 복구 못 함.')) return;
    if (group === 'options') state.options = emptyState().options;
    if (group === 'personas') state.personas = emptyState().personas;
    renderSlotPanels();
    renderOrderPanel();
    refreshPanelValues();
    GM_setValue(STORAGE_KEY, JSON.stringify(state));
    setStatus(`${label} 삭제됨`);
  }

  function injectButton() {
    if (!/\/stories\/[^/]+\/episodes\/[^/]+/.test(location.pathname)) {
      if (btn.parentElement) btn.remove();
      return;
    }
    if (btn.parentElement && btn.isConnected && isVisibleEl(btn.parentElement)) return;
    if (btn.parentElement) btn.remove();

    let container = null;
    let reference = null;
    const currentToolbar = findCurrentInputToolbar();
    if (currentToolbar) {
      container = currentToolbar.container;
      reference = currentToolbar.reference;
    }

    const customTools = document.getElementById('custom-rp-tools');
    if (!container && customTools && isVisibleEl(customTools.parentElement)) {
      container = customTools.parentElement;
      reference = customTools;
    } else if (!container) {
      const input = findBottomInput();
      container = findToolbarNearInput(input);
      if (container) {
        const buttons = $$('button', container).filter(isVisibleEl);
        reference = buttons[buttons.length - 1] || null;
      }
    }
    if (!container) return;
    if (reference && reference.parentElement === container && reference.nextSibling) {
      container.insertBefore(btn, reference.nextSibling);
    } else {
      container.appendChild(btn);
    }
  }

  function findCurrentInputToolbar() {
    const shortcut = $$('button[aria-label="단축어 패널 열기"]').find(isVisibleEl);
    if (shortcut && shortcut.parentElement && isVisibleEl(shortcut.parentElement)) {
      return { container: shortcut.parentElement, reference: shortcut };
    }

    const slashButtons = $$('button').filter((button) => {
      if (!isVisibleEl(button)) return false;
      if ((button.textContent || '').trim() !== '/') return false;
      const rect = button.getBoundingClientRect();
      return rect.bottom > window.innerHeight * 0.45;
    });
    for (const slash of slashButtons) {
      const parent = slash.parentElement;
      if (!parent || !isVisibleEl(parent)) continue;
      const buttons = $$('button', parent).filter(isVisibleEl);
      if (buttons.length >= 2) return { container: parent, reference: slash };
    }

    const toolbars = $$('div').filter((el) => {
      if (!isVisibleEl(el)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < window.innerHeight * 0.45) return false;
      const buttons = $$('button', el).filter(isVisibleEl);
      const hasShortcut = buttons.some((button) => (button.textContent || '').trim() === '/' || button.getAttribute('aria-label') === '단축어 패널 열기');
      const cls = String(el.className || '');
      return buttons.length >= 2 && hasShortcut && /items-center/.test(cls);
    });
    if (!toolbars.length) return null;
    toolbars.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (a.querySelectorAll('button').length - b.querySelectorAll('button').length);
    });
    const container = toolbars[0];
    const reference = $$('button', container).find((button) => button.getAttribute('aria-label') === '단축어 패널 열기')
      || $$('button', container).find((button) => (button.textContent || '').trim() === '/')
      || $$('button', container).filter(isVisibleEl).pop();
    return { container, reference };
  }

  function findBottomInput() {
    const nodes = $$('textarea, input[type="text"], [contenteditable="true"], div[role="textbox"]')
      .filter((el) => {
        if (!isVisibleEl(el)) return false;
        if (panel.contains(el)) return false;
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
      if (!isVisibleEl(root)) continue;
      const exact = root.querySelector('.flex.items-center.space-x-2');
      if (exact && isVisibleEl(exact)) return exact;
      const candidates = $$('div, section, footer', root).filter((el) => {
        if (!isVisibleEl(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.height > 84 || r.width < 40) return false;
        if (Math.abs(r.bottom - inputRect.bottom) > 150 && r.top < inputRect.bottom - 180) return false;
        const buttons = $$('button', el).filter(isVisibleEl);
        return buttons.length >= 1 && /flex|items-center|gap|space-x/.test(String(el.className || ''));
      });
      if (candidates.length) {
        candidates.sort((a, b) => Math.abs(a.getBoundingClientRect().bottom - inputRect.bottom) - Math.abs(b.getBoundingClientRect().bottom - inputRect.bottom));
        return candidates[0];
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function updateCounter(id) {
    const el = $(`#${id}`);
    const count = $(`[data-count-for="${id}"]`);
    if (!el || !count) return;
    count.textContent = `${el.value.length}/2000`;
    count.classList.toggle('warn', el.value.length > NOTE_LIMIT);
  }

  function setStatus(message, isError = false) {
    const el = $('#undb-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#d53535' : '#516171';
  }

  function togglePanel() {
    panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
  }

  function isVisibleEl(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function waitFor(fn, timeout = 3000, interval = 80) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const value = fn();
        if (value) return resolve(value);
        if (Date.now() - start >= timeout) return reject(new Error('대상 대기 시간 초과'));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatDateTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand && document.execCommand('copy');
    textarea.remove();
    if (!ok) throw new Error('클립보드 권한 없음');
  }

  function doubleConfirm(first, second) {
    return window.confirm(first) && window.confirm(second);
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#96;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }
})();
