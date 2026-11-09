import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../Crack_Lore_Sync_Bridge.user.js', import.meta.url), 'utf8');
const summary = fs.readFileSync(new URL('../Crack_Personal_AI_Summary.user.js', import.meta.url), 'utf8');
const key = 'shipidle:crack-lore-sync-bridge:v1';
const apiKey = '__SHIPIDLE_CMM_TURN_SYNC__';
const config = { projectUrl: 'https://example.supabase.co', publishableKey: 'public', syncPassphrase: 'existing-passphrase' };
const store = new Map([
  [key + ':config', config],
  [key + ':session', { access_token: 'existing', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'owner' } }],
  [key + ':state', { lastHash: 'legacy-backup' }],
]);
const requests = [], intervals = [];
const page = {};
let release;
const gate = new Promise(resolve => { release = resolve; });
const context = vm.createContext({
  unsafeWindow: page, window: page, console,
  TextEncoder, TextDecoder, URLSearchParams, Uint8Array, Blob, Response,
  CompressionStream, DecompressionStream, crypto: webcrypto, btoa, atob,
  setTimeout, setInterval: fn => intervals.push(fn),
  location: { pathname: '/explore', hash: '' },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  GM_addStyle() {},
  GM_getValue: async (name, fallback) => { await gate; return store.get(name) ?? fallback; },
  GM_setValue: async (name, value) => store.set(name, value),
  GM_xmlhttpRequest: options => {
    requests.push(options);
    queueMicrotask(() => options.onload({ status: 200, responseText: '[]' }));
  },
});
vm.runInContext(source, context);
assert.equal(page[apiKey].getStatus().initializing, true);
release();
await new Promise(resolve => setTimeout(resolve, 0));
for (const name of [apiKey, '__SHIPIDLE_CHAT_BACKGROUND_SYNC__', '__SHIPIDLE_DIALOGUE_TRANSLATOR_SYNC__', '__SHIPIDLE_MESSENGER_SYNC__']) {
  assert.equal(page[name].getStatus().ready, true, name + ' must work without injector');
}
assert.equal(requests.length, 0, 'startup must not access lore backup tables');
context.location.pathname = '/characters/abc/chats/def';
intervals.forEach(fn => fn());
assert.equal(page[apiKey].getStatus().ready, true, 'SPA entry must retain API');
assert.equal(requests.length, 0, 'route changes must not trigger lore requests');
await page[apiKey].getCheckpoint('chat-1');
await page.__SHIPIDLE_DIALOGUE_TRANSLATOR_SYNC__.getSettings('/characters/abc/chats/def');
await page.__SHIPIDLE_MESSENGER_SYNC__.getSettings('/characters/abc/chats/def');
await page.__SHIPIDLE_CHAT_BACKGROUND_SYNC__.getManifest('/characters/abc/chats/def');
assert.equal(requests.length, 4);
assert.ok(requests.every(r => r.headers.Authorization === 'Bearer existing'));
assert.equal(store.get(key + ':state').lastHash, 'legacy-backup', 'legacy state must be preserved');
assert.doesNotMatch(source, /__LoreInj|lore_sync_state|exportFullBackup|importFullBackup/);
assert.match(source, /@match\s+https:\/\/crack\.wrtn\.ai\/\*/);

// Ciphertext created before the migration remains readable by the shared summary API.
const legacyCiphertext = "{\"v\":2,\"compression\":\"gzip\",\"salt\":\"ps88Vxqoc2BCjBFSWPCMpw\",\"iv\":\"RZfyObiy8csqEetl\",\"data\":\"MEJCVmZPVfqfY75ex76LFcLqN0nVgO8UI-9-ZuoAP966tw7Ft0w3bupxgF8a4DvGLo8f72SSz3lesLnr-GmrSwe2_J3hnq_LYq60nSCip63mTw\"}";
function encryptionFactory(text) {
  const code = text.slice(text.indexOf('  function bytesToBase64Url'), text.indexOf('  async function fingerprint') >= 0 ? text.indexOf('  async function fingerprint') : text.indexOf('  function summarySyncStatus'));
  return new Function('crypto', 'config', `const textEncoder=new TextEncoder(),textDecoder=new TextDecoder();${code};return {encryptBackup,decryptBackup};`)(webcrypto, config);
}
const newCrypto = encryptionFactory(source);
const payload = { items: [{ text: '기존 요약 내용' }] };
assert.deepEqual(await newCrypto.decryptBackup(legacyCiphertext), payload);
assert.deepEqual(await newCrypto.decryptBackup(await newCrypto.encryptBackup(payload)), payload);

const clientCode = summary.slice(summary.indexOf('  function turnSyncApi()'), summary.indexOf('  async function syncedTurnWindow'));
function client(host) { return new Function('window', 'TURN_SYNC_API_KEY', `${clientCode};return requireTurnSyncApi;`)(host, apiKey); }
const delayed = {};
const waiting = client(delayed)(1000);
setTimeout(() => { delayed[apiKey] = { version: 1, getStatus: () => ({ ready: false, initializing: true }) }; }, 20);
setTimeout(() => { delayed[apiKey].getStatus = () => ({ ready: true }); }, 150);
assert.equal(await waiting, delayed[apiKey], 'client waits for both installation and initialization');
await assert.rejects(client({})(0), /Supabase 브리지에 연결하지 못함/);
await assert.rejects(client({ [apiKey]: { version: 1, getStatus: () => ({ ready: false, reason: '로그인 필요' }) } })(0), /로그인 필요/);
console.log('supabase bridge migration and startup tests: PASS');
