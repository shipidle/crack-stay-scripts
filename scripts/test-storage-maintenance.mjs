import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const background = read('Crack_Chat_Background.user.js');
const userNote = read('Crack_UserNote_DB.user.js');
const memory = read('Crack_Personal_AI_Summary.user.js');

for (const [name, src] of [['Background', background], ['UserNote', userNote], ['Memory', memory]]) {
  new Script(src, { filename: name });
  console.log('Parsed:', name);
}

function section(src, from, until) {
  const first = src.indexOf(from);
  const end = src.indexOf(until, first);
  assert.ok(first >= 0 && end > first, 'Source section missing: ' + from);
  return src.slice(first, end);
}
function fakeStorage(entries) {
  const values = new Map(entries);
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

// Background: another room may still use an image; never delete those or unrelated keys.
{
  const prefix = 'crackChatBackground:v1:';
  const hash = letter => letter.repeat(64);
  const room = slots => JSON.stringify({ slots });
  const local = new Map([
    [prefix + 'room:one', room([{ hash: hash('a') }])],
    [prefix + 'room:two', room([{ hash: hash('a') }, { hash: hash('b') }])],
    [prefix + 'image:' + hash('a'), 'data:image/webp;base64,AA=='],
    [prefix + 'image:' + hash('b'), 'data:image/webp;base64,BB=='],
    [prefix + 'image:' + hash('c'), 'data:image/webp;base64,CC=='],
    ['other-script-data', 'preserve'],
  ]);
  const cache = new Map();
  const ctx = {
    Blob, Map, Set, JSON, Array, Error, String, Number,
    STORAGE_PREFIX: prefix, IMAGE_PREFIX: prefix + 'image:',
    imageCache: cache,
    GM_listValues: () => [...local.keys()],
    GM_getValue: key => local.get(key) ?? null,
    GM_deleteValue: key => local.delete(key),
    parseSaved: JSON.parse,
    normalizeState: value => value,
    setStatus: () => {},
    window: { confirm: () => true },
    defaultState: () => ({ slots: [] }),
    renderStage: async () => {},
    updateHeaderButton: () => {},
    openSettings: async () => {},
  };
  const functions = section(background, '  async function backgroundStorageKeys()', '  function applyCrop(');
  runInNewContext('let state = {slots: []};\n' + functions
    + '\nglobalThis.exposed = { inspectBackgroundStorage, cleanUnusedBackgrounds, clearAllBackgroundStorage };', ctx);
  const before = await ctx.exposed.inspectBackgroundStorage();
  assert.equal(before.roomCount, 2);
  assert.equal(before.imageCount, 3);
  assert.equal(before.unusedImages.length, 1);
  assert.equal(before.unusedImages[0].hash, hash('c'));
  await ctx.exposed.cleanUnusedBackgrounds();
  assert.equal(local.has(prefix + 'image:' + hash('c')), false);
  assert.equal(local.has(prefix + 'image:' + hash('a')), true);
  assert.equal(local.has(prefix + 'image:' + hash('b')), true);
  await ctx.exposed.clearAllBackgroundStorage();
  assert.deepEqual([...local.keys()], ['other-script-data']);
}

// UserNote: the current database survives retention pruning; full reset is opt-in.
{
  const db = 'crackUserNoteDB:v1';
  const backups = 'crackUserNoteDB:localBackups:v1';
  const retention = 'crackUserNoteDB:backupRetention:v1';
  const local = new Map([
    [db, '{"rules":{"text":"important"}}'],
    [backups, JSON.stringify([{ id: 'new' }, { id: 'mid' }, { id: 'old' }])],
    ['different-plugin', 'keep'],
  ]);
  const fields = {
    '#undb-backup-retention': { value: '2' },
    '#undb-storage-usage': { textContent: '' },
  };
  const ctx = {
    Blob, Math, Number, JSON, Array, String, Error, Date,
    STORAGE_KEY: db, LOCAL_BACKUP_KEY: backups, BACKUP_RETENTION_KEY: retention,
    DEFAULT_LOCAL_BACKUP_LIMIT: 3, LOCAL_BACKUP_LIMIT: 30,
    GM_getValue: (key, fallback) => local.get(key) ?? fallback,
    GM_setValue: (key, value) => local.set(key, value),
    GM_deleteValue: key => local.delete(key),
    $: selector => fields[selector] ?? null,
    window: { confirm: () => true },
    doubleConfirm: () => true,
    refreshLocalBackupSelect: () => {},
    renderSlotPanels: () => {},
    renderOrderPanel: () => {},
    refreshPanelValues: () => {},
    emptyState: () => ({}),
    setStatus: () => {},
    clearTimeout: () => {},
  };
  const body = section(userNote, '  function getLocalBackupLimit()', '  function createLocalBackup()');
  runInNewContext('let autoSaveTimer = null; let state = {};\n' + body
    + '\nglobalThis.exposed = { getLocalBackupLimit, getLocalBackups, saveBackupRetention, clearAllLocalDB };', ctx);
  assert.equal(ctx.exposed.getLocalBackupLimit(), 3);
  ctx.exposed.saveBackupRetention();
  assert.equal(ctx.exposed.getLocalBackupLimit(), 2);
  assert.equal(ctx.exposed.getLocalBackups().length, 2);
  assert.equal(local.has(db), true);
  await ctx.exposed.clearAllLocalDB();
  assert.equal(local.has(db), false);
  assert.equal(local.has(backups), false);
  assert.equal(local.has(retention), false);
  assert.equal(local.get('different-plugin'), 'keep');
}

// Memory Manager: archive cleanup never changes current memory progress, credentials or other apps.
{
  const backupsKey = 'shipidle:crack-memory-manager:v2:backups';
  const configKey = 'shipidle:crack-memory-manager:v2:config';
  const stateKey = 'shipidle:crack-memory-manager:v2:state';
  const makeItem = (id, date) => ({ id, createdAt: date, entries: [{ title: id, summary: 'stored', createdBy: 'user' }] });
  const store = fakeStorage([
    [backupsKey, JSON.stringify({
      room1: [makeItem('new', '2026-10-19'), makeItem('middle', '2026-10-18'), makeItem('old', '2026-10-17')],
      room2: [makeItem('other', '2026-10-16')],
    })],
    [stateKey, '{"progress":40}'],
    [configKey, '{"apiKey":"placeholder"}'],
    ['another-app', 'keep'],
  ]);
  const config = { backupRetention: 5, apiKey: 'placeholder' };
  const ctx = {
    Blob, Map, Set, URL, JSON, Object, Array, Number, String, Date, Error,
    localStorage: store, STORAGE_KEY: 'shipidle:crack-memory-manager:v2',
    BACKUP_KEY: backupsKey, MAX_BACKUPS_PER_CHAT: 5, config,
    window: { confirm: () => true },
    getChatId: () => 'room1',
    localBackupRetention: () => Number(config.backupRetention),
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
    backupsFor: roomId => {
      const all = JSON.parse(store.getItem(backupsKey) || '{}');
      return Array.isArray(all[roomId]) ? all[roomId] : [];
    },
    showToast: () => {}, renderPanel: () => {},
    loadJson: (key, fallback) => {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    },
    saveJson: (key, value) => store.setItem(key, JSON.stringify(value)),
    persistConfig: () => store.setItem(configKey, JSON.stringify(config)),
  };
  const code = section(memory, '  function formatLocalBytes(bytes) {', '  function renderPanel() {');
  runInNewContext(code + '\nglobalThis.exposed = { localStorageUsage, pruneLocalBackups, clearAllLocalBackups, importLocalBackups, backupsHtml };', ctx);
  const ui = ctx.exposed.backupsHtml();
  assert.match(ui, /전체 방 과거 백업/);
  assert.match(ui, /data-room="room1"/);
  assert.match(ui, /data-room="room2"/);
  assert.match(ui, /data-action="delete-room-backups"/, 'Room-level bulk delete should be available');
  assert.match(ui, /data-action="clear-other-room-backups"/, 'Cross-room bulk cleanup should be available');
  assert.match(ui, /localStorage 사용량 상위 항목 확인/, 'Largest localStorage keys should be visible');
  assert.match(ui, /현재 방/);
  assert.match(ui, /복원하려면 이 채팅방을 먼저 열어야 함/);
  assert.equal((ui.match(/data-action="restore-backup"/g) || []).length, 3, 'Only the current room should offer restore controls');

  const restoreCode = section(memory, '  async function restoreBackup(roomId, id) {', '  async function handleAction(');
  const actionCode = section(memory, '  async function handleAction(action, target) {', '  async function withBusy(');
  let apiReads = 0;
  ctx.fetchSummaries = async () => { apiReads++; return { items: [] }; };
  runInNewContext(restoreCode + actionCode
    + '\nglobalThis.exposed.restoreBackup = restoreBackup; globalThis.exposed.handleAction = handleAction;', ctx);
  await assert.rejects(() => ctx.exposed.restoreBackup('room2', 'other'), /다른 채팅방/);
  assert.equal(apiReads, 0, 'Cross-room restore must not reach the remote API');

  assert.equal(ctx.exposed.localStorageUsage().snapshots, 4);
  assert.ok(ctx.exposed.localStorageUsage().largestKeys.some(item => item.label === 'another-app'));
  assert.ok(ctx.exposed.localStorageUsage().otherBytes > 0);
  ctx.exposed.pruneLocalBackups(2);
  let result = JSON.parse(store.getItem(backupsKey));
  assert.equal(result.room1.length, 2);
  assert.equal(result.room1[0].id, 'new');
  assert.equal(result.room2.length, 1);
  assert.equal(config.backupRetention, 2);
  await ctx.exposed.handleAction('delete-backup', { dataset: { room: 'room2', id: 'other' } });
  result = JSON.parse(store.getItem(backupsKey));
  assert.equal(Object.hasOwn(result, 'room2'), false, 'A different room archive should be removable');
  assert.equal(result.room1.length, 2, 'Removing another room archive must not affect this room');

  // Remove every backup in one other room without opening that chat.
  store.setItem(backupsKey, JSON.stringify({ ...result, room2: [makeItem('other', '2026-10-16')] }));
  await ctx.exposed.handleAction('delete-room-backups', { dataset: { room: 'room2' } });
  result = JSON.parse(store.getItem(backupsKey));
  assert.equal(Object.hasOwn(result, 'room2'), false);
  assert.equal(result.room1.length, 2);

  // Clear all *other* rooms; preserve current room, config, progress, and other apps.
  store.setItem(backupsKey, JSON.stringify({
    ...result, room2: [makeItem('other', '2026-10-16')], room3: [makeItem('third', '2026-10-15')],
  }));
  await ctx.exposed.handleAction('clear-other-room-backups', { dataset: {} });
  result = JSON.parse(store.getItem(backupsKey));
  assert.deepEqual(Object.keys(result), ['room1']);
  assert.equal(result.room1.length, 2);
  assert.equal(store.getItem(stateKey), '{"progress":40}');
  assert.equal(store.getItem('another-app'), 'keep');

  // Declining a deletion prompt must leave archives untouched.
  store.setItem(backupsKey, JSON.stringify({ ...result, room2: [makeItem('other', '2026-10-16')] }));
  ctx.window.confirm = () => false;
  await ctx.exposed.handleAction('clear-other-room-backups', { dataset: {} });
  assert.equal(JSON.parse(store.getItem(backupsKey)).room2.length, 1);
  ctx.window.confirm = () => true;
  store.setItem(backupsKey, JSON.stringify(result));

  const archived = { kind: 'crack-memory-manager-backups', version: 1, backups: {
    room1: [makeItem('old', '2026-10-17'), makeItem('new', '2026-10-19')],
  } };
  await ctx.exposed.importLocalBackups({ text: async () => JSON.stringify(archived) });
  result = JSON.parse(store.getItem(backupsKey));
  assert.equal(result.room1.length, 3);
  await ctx.exposed.importLocalBackups({ text: async () => JSON.stringify(archived) });
  result = JSON.parse(store.getItem(backupsKey));
  assert.equal(result.room1.length, 3, 're-import must not duplicate IDs');
  ctx.exposed.clearAllLocalBackups();
  assert.equal(store.getItem(backupsKey), null, 'Clearing archives must free the storage entry entirely');
  assert.equal(store.getItem(stateKey), '{"progress":40}');
  assert.equal(JSON.parse(store.getItem(configKey)).apiKey, 'placeholder', 'API settings must survive cleanup');
  assert.equal(store.getItem('another-app'), 'keep');
}

console.log('Storage maintenance tests passed');
