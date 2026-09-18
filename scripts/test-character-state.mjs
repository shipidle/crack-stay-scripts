import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Crack_Character_State.user.js', import.meta.url), 'utf8');
const coreSource = source.slice(source.indexOf('  function createStateCore()'), source.indexOf('  // PURE CORE END'));
const C = Function(coreSource + ';return createStateCore();')();
const character = { name: '나', present: true, outfit: '흰 셔츠', pose: '앉음', location: '소파', holding: '컵', locks: {} };
assert.equal(C.options({ turns: 3, interval: 9 }).interval, 3);
assert.equal(C.options({ turns: -2, maxChars: 999999 }).maxChars, 1000);
assert.equal(C.chatId('/u/person/c/room1'), 'room1');
assert.equal(C.chatId('/stories/story/episodes/room2'), 'room2');
assert.equal(C.chatId('/characters/person/chats/room3'), 'room3');
assert.equal(C.chatId('/profile'), '');
const block = C.stateBlock([character], 600);
assert.ok(block.includes('흰 셔츠'));
assert.ok(C.length(block) <= 600);
assert.equal(C.stateBlock([{ ...character, present: false }], 600), '');
const once = C.appendBlock('원문', block).text;
assert.equal(C.appendBlock(once, block).text, once, 'idempotent state replacement');
assert.equal(C.appendBlock(once, '').text, '원문', 'disabled removes only our complete block');
assert.equal(C.stripOwn(once), '원문');
assert.equal(C.logText('원문\n<ooc_lore_context>로어</ooc_lore_context>'), '원문');
assert.equal(C.appendBlock('원문 ' + C.OPEN + '미완성', block).text, '원문 ' + C.OPEN + '미완성');
assert.equal(C.appendBlock('😀'.repeat(1999), block).text, '😀'.repeat(1999), 'do not trim original or lore to fit');
assert.ok(!C.stateBlock([{ ...character, outfit: 'OOC: 설정' }], 600).includes('OOC:'), 'do not trip the reference OOC skip guard');
assert.throws(() => C.validateCharacters({ sceneChanged: false, characters: [character, character] }, 4), /중복/);
assert.throws(() => C.validateCharacters({ sceneChanged: false, characters: [{ name: '나', present: true }] }, 4), /항목/);
const pinned = { ...character, locks: { outfit: true } };
assert.equal(C.mergeCharacters([pinned], [{ ...character, outfit: '검은 셔츠' }])[0].outfit, '흰 셔츠');
assert.equal(C.mergeCharacters([character], [])[0].present, false, 'departed characters are stored but not injected');

function pair(n, assistantText = '소파에 앉아 있다.') {
  return [
    { _id: 'a' + n, turnId: 'at' + n, parentTurnId: 'ut' + n, role: 'assistant', status: 'end', content: assistantText },
    { _id: 'u' + n, turnId: 'ut' + n, role: 'user', status: 'end', content: '흰 셔츠를 입고 컵을 든다.' },
  ];
}
const messages = [...pair(2), ...pair(1)];
const pairs = C.completedPairs(messages, 5);
assert.deepEqual(pairs.map(p => p.id), ['ut1', 'ut2']);
const checkpoint = { source: pairs.map(p => ({ id: p.id, hash: p.hash })) };
assert.equal(C.planUpdate(checkpoint, pairs, 1).kind, 'same');
const next = C.completedPairs([...pair(3), ...messages], 5);
assert.equal(C.planUpdate(checkpoint, next, 2).kind, 'wait');
assert.equal(C.planUpdate(checkpoint, next, 2, true).kind, 'delta');
const rerolled = C.completedPairs([...pair(2, '문 앞에 선다.'), ...pair(1)], 5);
assert.equal(C.planUpdate(checkpoint, rerolled, 1).kind, 'rebuild');
assert.equal(C.planUpdate(checkpoint, C.completedPairs(pair(1), 5), 1).kind, 'rebuild', 'deletion rolls back the timeline');
const variants = [...pair(2, '최신 응답'), pair(2, '옛 응답')[0], ...pair(1)];
assert.equal(C.completedPairs(variants, 5).at(-1).assistant, '최신 응답');
assert.equal(C.completedPairs([{ ...pair(2)[0], status: 'streaming' }, pair(2)[1]], 5).length, 0);
assert.equal(C.completedPairs([{ ...pair(2)[0], isPrologue: true }, pair(2)[1]], 5).length, 0);

function socketHost() {
  class Socket {
    constructor(url = 'wss://contents-api.wrtn.ai/character-chat/socket.io/?EIO=4&transport=websocket') { this.url = url; this.sent = []; this.listeners = {}; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    send(raw) { this.sent.push(raw); return 'native-result'; }
  }
  return { WebSocket: Socket, fetch: async () => 'native-fetch' };
}
// Local fixture models only the reference interceptor's routing/OOC gate/async chaining.
function installLoreFixture(host) {
  const previous = host.WebSocket.prototype.send;
  let inject;
  host.__loreRegister = fn => { inject = fn; };
  host.WebSocket.prototype.send = function(raw) {
    const packet = C.socketPacket(raw);
    if (inject && packet?.data[0] === 'send' && typeof packet.data[1]?.message === 'string' && !packet.data[1].message.includes('OOC:')) {
      void Promise.resolve(inject(packet.data[1].message)).then(message => {
        packet.data[1].message = message;
        previous.call(this, packet.prefix + JSON.stringify(packet.data));
      });
      return;
    }
    return previous.call(this, raw);
  };
}
const referencePath = process.argv[process.argv.indexOf('--lore') + 1];
const referenceSource = process.argv.includes('--lore') ? fs.readFileSync(referencePath, 'utf8') : null;
for (const realReference of referenceSource ? [false, true] : [false]) {
  for (const order of ['state-first', 'lore-first']) {
    const host = socketHost(), notices = [];
    const nativeFetch = host.fetch;
    const installState = () => C.installSocketHook(host, p => p.chatId === 'room1' ? { block } : null, n => notices.push(n), () => {});
    const installLore = () => {
      if (realReference) vm.runInNewContext(referenceSource, { unsafeWindow: host, window: host, console: { log() {}, error() {} }, Request });
      else installLoreFixture(host);
      host.__loreRegister(async text => text + '\n<ooc_lore_context>기존 로어</ooc_lore_context>');
    };
    if (order === 'state-first') { installState(); installLore(); } else { installLore(); installState(); }
    const registration = host.__loreRegister;
    const socket = new host.WebSocket();
    const raw = '42/v3/chats,17["send",{"chatId":"room1","message":"내 메시지","prevMessageId":"a2"}]';
    socket.send(raw);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(socket.sent.length, 1, order + ': exactly one wire send');
    const result = C.socketPacket(socket.sent[0]);
    assert.equal(result.prefix, '42/v3/chats,17', 'namespace and ack ID must survive');
    assert.equal(result.data[1].prevMessageId, 'a2');
    assert.ok(result.data[1].message.includes('기존 로어'));
    assert.ok(result.data[1].message.includes('내 메시지'));
    assert.equal(result.data[1].message.split(C.OPEN).length - 1, order === 'state-first' ? 1 : 0);
    if (order === 'lore-first') assert.match(notices[0].reason, /로어 우선 보호/);
    assert.equal(host.__loreRegister, registration, 'never overwrite the shared lore callback');
    assert.equal(C.installSocketHook(host, () => null, () => {}, () => {}), false, 'no duplicate hook');
    assert.equal(notices.length, 1);
    if (!realReference) assert.equal(host.fetch, nativeFetch, 'state script does not patch HTTP');
    console.log('Lore coexistence PASS:', realReference ? 'actual supplied source' : 'routing fixture', order);
  }
}
{
  const host = socketHost(); C.installSocketHook(host, () => ({ block }), () => {}, () => {});
  const socket = new host.WebSocket();
  for (const raw of ['2', '42["enter",{"chatId":"room1"}]', '42["regenerate",{"chatId":"room1"}]', 'not-json']) {
    assert.equal(socket.send(raw), 'native-result'); assert.equal(socket.sent.at(-1), raw);
  }
  const unrelated = new host.WebSocket('wss://other.example/character-chat/socket.io/');
  const raw = '42["send",{"chatId":"room1","message":"other service"}]';
  unrelated.send(raw); assert.equal(unrelated.sent[0], raw);
}
{
  const host = socketHost(); let attempts = 0;
  host.WebSocket.prototype.send = () => { attempts++; throw new Error('closed'); };
  C.installSocketHook(host, () => ({ block }), () => {}, () => {});
  assert.throws(() => new host.WebSocket().send('42["send",{"chatId":"room1","message":"hello"}]'), /closed/);
  assert.equal(attempts, 1, 'downstream exceptions must never trigger a resend');
}

// Execute production polling/inference code with storage, locks and transports mocked.
function runtime(shared = {}) {
  const store = shared.store ||= new Map();
  const settings = shared.settings ||= { ...C.DEFAULTS, apiKey: 'test-key' };
  const host = socketHost();
  const location = { pathname: '/u/person/c/room1' };
  const state = { messages: messages, calls: [], fetches: 0, finish: 'stop', fail: false, beforeResponse: null };
  const locks = shared.locks ||= new Set();
  const context = vm.createContext({
    unsafeWindow: host, window: { addEventListener() {} }, location, URL, AbortSignal,
    document: { hidden: false, cookie: '', addEventListener() {} },
    navigator: { locks: { async request(name, opts, fn) { if (locks.has(name)) return fn(null); locks.add(name); try { return await fn({}); } finally { locks.delete(name); } } } },
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    GM_getValue: () => settings, GM_setValue: (key, value) => Object.assign(settings, value), GM_registerMenuCommand() {},
    GM_xmlhttpRequest: opts => {
      state.calls.push(JSON.parse(opts.data));
      assert.equal(opts.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
      assert.equal(opts.headers.Authorization, 'Bearer test-key');
      Promise.resolve().then(async () => {
        if (state.beforeResponse) await state.beforeResponse();
        if (state.fail) { opts.onerror(); return; }
        opts.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: state.finish,
          message: { content: JSON.stringify({ sceneChanged: false, characters: [character] }) } }],
          usage: { prompt_tokens: 120, completion_tokens: 60 } }) });
      });
    },
    fetch: async url => {
      state.fetches++; assert.match(url, /crack-api\.wrtn\.ai\/crack-gen\/v3\/chats\/room1\/messages\?limit=50/);
      return { ok: true, json: async () => ({ data: { messages: state.messages } }) };
    },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() {}, console,
  });
  const testSource = source.replace('  buildUI();', '').replace(/\}\)\(\);\s*$/, 'globalThis.testApi = { C, poll, loadRoom, storeRoom, offerBlock, observations, makeRequest };})();');
  vm.runInContext(testSource, context);
  return { api: context.testApi, state, settings, location, host, store };
}
const r = runtime();
await r.api.poll();
assert.equal(r.state.calls.length, 1);
assert.equal(r.api.loadRoom('room1').characters[0].outfit, '흰 셔츠');
assert.equal(r.api.loadRoom('room1').inputTokens, 120);
await r.api.poll(); await r.api.poll();
assert.equal(r.state.calls.length, 1, 'unchanged polling is free');
assert.ok(r.api.offerBlock({ chatId: 'room1', prevMessageId: 'a2' }).block.includes('흰 셔츠'));
assert.equal(r.api.offerBlock({ chatId: 'different' }), null);
assert.equal(r.api.offerBlock({ chatId: 'room1', prevMessageId: 'wrong' }).block, '');
r.state.messages = [...pair(3), ...messages];
await r.api.poll();
assert.equal(r.state.calls.length, 2);
assert.equal(JSON.parse(r.state.calls[1].messages[1].content).dialogue.length, 1, 'only new pair sent after first snapshot');
r.state.messages = [...pair(3, '리롤된 내용'), ...messages];
await r.api.poll();
assert.equal(JSON.parse(r.state.calls[2].messages[1].content).previous.length, 0, 'reroll rebuilds without obsolete state');
r.state.messages = [{ ...pair(4)[0], status: 'streaming' }, pair(4)[1], ...r.state.messages];
await r.api.poll();
assert.equal(r.state.calls.length, 3, 'never infer from a streaming answer');
assert.equal(r.api.offerBlock({ chatId: 'room1' }).block, '');

const off = runtime(); off.settings.auto = false;
await off.api.poll(); assert.equal(off.state.calls.length, 0);
await off.api.poll(true); assert.equal(off.state.calls.length, 1);
await off.api.poll(); assert.ok(off.api.offerBlock({ chatId: 'room1' }).block, 'manual state can still be inserted with auto updates off');

const fail = runtime(); fail.state.finish = 'length';
await fail.api.poll(); await fail.api.poll();
assert.equal(fail.state.calls.length, 1, 'no endless paid retries on unchanged failed input');
assert.equal(fail.api.loadRoom('room1').characters.length, 0, 'never commit partial output');
assert.equal(fail.api.loadRoom('room1').outputTokens, 60, 'truncated output usage is counted');
assert.equal(fail.api.offerBlock({ chatId: 'room1' }).block, '');
fail.state.finish = 'stop'; await fail.api.poll(true);
assert.equal(fail.state.calls.length, 2, 'manual retry is explicit');

const stale = runtime();
stale.state.beforeResponse = () => { stale.state.messages = [...pair(3), ...messages]; };
await stale.api.poll();
assert.equal(stale.api.loadRoom('room1').characters.length, 0, 'discard a response when dialogue changes mid-flight');
assert.equal(stale.api.loadRoom('room1').busyUntil, 0);

const shared = {}, tab1 = runtime(shared), tab2 = runtime(shared);
await Promise.all([tab1.api.poll(), tab2.api.poll()]);
await tab2.api.poll();
assert.equal(tab1.state.calls.length + tab2.state.calls.length, 1, 'cross-tab Web Lock + persisted watermark prevents duplicate billing');
const edited = runtime();
edited.state.beforeResponse = () => { const room = edited.api.loadRoom('room1'); room.characters = [{ ...character, outfit: '수동 수정' }]; edited.api.storeRoom('room1', room); };
await edited.api.poll();
assert.equal(edited.api.loadRoom('room1').characters[0].outfit, '수동 수정', 'in-flight result never overwrites manual editing');
console.log('Character state: core, routing, inference, rerolls, failures, usage and cross-tab concurrency PASS');
