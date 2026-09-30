import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const source = fs.readFileSync(new URL('../Crack_Chat_Bookmarks.user.js', import.meta.url), 'utf8');
const coreSource = source.slice(source.indexOf('  function createBookmarkCore()'), source.indexOf('  // PURE CORE END'));
const C = Function(`${coreSource};return createBookmarkCore();`)();
assert.equal(C.chatId('/stories/s/episodes/room-a'), 'room-a');
assert.equal(C.chatId('/characters/c/chats/room-b'), 'room-b');
assert.equal(C.chatId('/u/name/c/room-c'), 'room-c');
assert.equal(C.chatId('/profile'), '');
assert.notEqual(C.key('a'), C.key('b'));
assert.ok(C.matches('메모 Hello', 'hello', false));
assert.ok(!C.matches('메모 Hello', 'hello', true));
assert.ok(C.matches('한글\n본문', '본문', true));
assert.throws(() => C.page({ data: { messages: [], hasNext: true } }), /다음 페이지/);
assert.throws(() => C.page({ data: { error: 'expired' } }), /응답 형식/);
assert.equal(C.page({ data: { messages: [], hasNext: false, nextCursor: 'stale' } }).cursor, '');
const msgs = [
  { id: 'new', aliases: ['new', 'turn-new'], text: '같은 문장', role: 'assistant', order: 0 },
  { id: 'old', aliases: ['old'], text: '같은 문장', role: 'assistant', order: -1 },
];
assert.equal(C.resolve({ aliases: [], quote: '같은 문장' }, msgs), null, 'repeated quotes must not guess a source');
assert.equal(C.resolve({ aliases: ['turn-new'], quote: '같은 문장' }, msgs).id, 'new');
assert.equal(C.resolve({ messageId: 'old' }, msgs).id, 'old');
const rebased = C.reindex([{ id: 'a', messageId: 'old', order: 0, offset: 0 }, { id: 'b', messageId: 'new', order: -9, offset: 0 }], msgs).sort(C.compare);
assert.equal(rebased[0].messageId, 'new', 'API chronology beats save time and previous ranks');
assert.ok(C.compare({ id: 'a', order: 0, offset: 50 }, { id: 'b', order: 0, offset: 5 }) < 0, 'later phrase in the same message comes first');
console.log('Bookmark core: PASS');

if (process.argv.includes('--dom')) {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require(require.resolve('jsdom', { paths: [process.env.BOOKMARK_TEST_MODULES || process.cwd()] }));
  const dom = new JSDOM(`<!doctype html><body>
    <div data-message-group-id="turn-new"><div><div class="wrtn-markdown">최신 문장. 같은 문장.</div></div></div>
    <div data-message-group-id="turn-old"><div><div class="wrtn-markdown">이전 문장. 같은 문장.</div></div></div>
    <footer><div class="flex items-center space-x-2"><button id="cdt-toolbar-btn">🌐</button></div><textarea></textarea></footer>
  </body>`, { url: 'https://crack.wrtn.ai/u/test/c/room-a', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  const values = new Map(); let failSave = false, mode = 'normal', release, requests = 0;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 10, y: 450, left: 10, top: 450, right: 360, bottom: 500, width: 350, height: 50 });
  w.Range.prototype.getBoundingClientRect = w.HTMLElement.prototype.getBoundingClientRect;
  w.GM_addStyle = () => {};
  w.GM_getValue = async (key, fallback) => structuredClone(values.has(key) ? values.get(key) : fallback);
  w.GM_setValue = async (key, value) => { if (failSave) throw new Error('Storage full'); values.set(key, structuredClone(value)); };
  w.confirm = () => true;
  const newer = { _id: 'new', turnId: 'turn-new', role: 'assistant', content: '최신 문장. 같은 문장.' };
  const older = { _id: 'old', turnId: 'turn-old', role: 'assistant', content: '이전 문장. 같은 문장.' };
  w.fetch = async (url, init) => {
    requests++;
    if (mode === 'delay') await new Promise(resolve => { release = resolve; });
    if (init.signal.aborted) throw new w.DOMException('Aborted', 'AbortError');
    const next = url.includes('cursor='), isB = url.includes('/room-b/');
    if (mode === 'fail' && next) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ data: isB ? { messages: [{ _id: 'b', role: 'user', content: '방 B 원문' }], hasNext: false }
      : next ? { messages: [older, { _id: 'hidden', role: 'user', content: '화면 밖 오래된 단서' }], hasNext: false }
        : { messages: [newer], nextCursor: 'page2', hasNext: true } }) };
  };
  const $ = s => d.querySelector(s);
  async function wait(check) { for (let n = 0; n < 400; n++) { if (check()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('DOM wait timeout: ' + check); }
  const cards = () => [...d.querySelectorAll('#csb-list .csb-card')];
  function button(text) { return [...d.querySelectorAll('#csb-panel button')].find(b => b.textContent === text); }
  async function select(group, text) {
    const el = d.querySelector(`[data-message-group-id="${group}"] .wrtn-markdown`), range = d.createRange();
    const start = el.firstChild.textContent.indexOf(text); range.setStart(el.firstChild, start); range.setEnd(el.firstChild, start + text.length);
    w.getSelection().removeAllRanges(); w.getSelection().addRange(range); d.dispatchEvent(new w.Event('selectionchange'));
    await wait(() => !$('#csb-pick').hidden); $('#csb-pick').click(); await wait(() => !$('#csb-editor').hidden);
  }
  async function save(comment) { $('#csb-comment').value = comment; $('#csb-save').click(); await wait(() => $('#csb-editor').hidden); }
  async function navigate(id) { w.history.pushState({}, '', `/u/test/c/${id}`); w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(() => $('#csb-panel').hidden); $('#csb-toolbar-btn').click(); await wait(() => !$('#csb-panel').hidden); }
  try {
    w.eval(source); await wait(() => $('#csb-toolbar-btn'));
    await select('turn-new', '최신 문장.'); await save('찾을 메모 <img src=x onerror="window.pwned=1">');
    assert.equal(requests, 2);
    $('#csb-close').click(); await select('turn-old', '이전 문장.'); await save('나중에 저장');
    assert.deepEqual([...d.querySelectorAll('#csb-list .csb-quote')].map(e => e.textContent), ['최신 문장.', '이전 문장.']);
    assert.equal(d.querySelectorAll('#csb-panel img').length, 0);
    $('#csb-search').value = '찾을 메모'; $('#csb-search').dispatchEvent(new w.Event('input')); await wait(() => cards().length === 1);
    button('코멘트 수정').click(); await save('수정한 메모');
    $('#csb-history-tab').click(); await wait(() => cards().length === 3);
    $('#csb-search').value = '오래된 단서'; $('#csb-search').dispatchEvent(new w.Event('input')); await wait(() => cards().length === 1);
    assert.match($('#csb-list').textContent, /화면 밖/);
    button('대화 전체 북마크').click(); await save('화면 밖 북마크'); assert.equal(cards().length, 3);
    await navigate('room-b'); assert.equal(cards().length, 0);
    $('#csb-history-tab').click(); await wait(() => $('#csb-status').textContent.includes('전체 불러오기 완료'));
    button('대화 전체 북마크').click(); await save('방 B 코멘트');
    $('#csb-select-mode').click(); $('#csb-delete-all').click(); await wait(() => cards().length === 0);
    assert.equal(values.get(C.key('room-a')).bookmarks.length, 3);
    mode = 'delay'; $('#csb-history-tab').click(); $('#csb-refresh').click(); await wait(() => release);
    await navigate('room-a'); mode = 'normal'; release(); await wait(() => cards().length === 3);
    assert.equal(values.get(C.key('room-b')).bookmarks.length, 0, 'in-flight response cannot overwrite destination');
    mode = 'fail'; $('#csb-history-tab').click(); await wait(() => $('#csb-status').textContent.includes('HTTP 500'));
    assert.ok(!$('#csb-status').textContent.includes('전체 불러오기 완료'));
    mode = 'normal'; $('#csb-refresh').click(); await wait(() => $('#csb-status').textContent.includes('전체 불러오기 완료'));
    $('#csb-bookmarks-tab').click(); button('코멘트 수정').click(); failSave = true;
    $('#csb-comment').value = '저장 실패 메모'; $('#csb-save').click(); await wait(() => $('#csb-status').textContent.includes('Storage full'));
    assert.equal($('#csb-editor').hidden, false);
    assert.ok(!JSON.stringify(values.get(C.key('room-a'))).includes('저장 실패 메모'));
    failSave = false; $('#csb-cancel').click(); $('#csb-select-mode').click();
    d.querySelector('#csb-list .csb-card input').click(); $('#csb-delete-selected').click(); await wait(() => cards().length === 2);
    // Cancellation preserves both bookmarks and comments.
    w.confirm = () => false; $('#csb-delete-all').click(); await new Promise(r => setTimeout(r, 20)); assert.equal(cards().length, 2);
    console.log('Bookmark DOM: selection, comment search/edit, all-page search, source order, room navigation/races, deletion, storage failure: PASS');
  } finally { w.close(); }
}

if (process.argv.includes('--browser')) {
  const require = createRequire(import.meta.url);
  const { chromium, webkit } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
  const mobile = process.argv.includes('--webkit');
  const browser = await (mobile ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const dom = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;padding:12px}.message{margin:12px 0;padding:12px;background:#eee}footer{position:fixed;bottom:15px;left:15px;right:15px}.tools{display:flex;gap:8px}textarea{width:90%;height:65px}</style></head><body>
    <div data-message-group-id="turn-new" class="message"><div class="items-start"><div class="wrtn-markdown">최신 대화. 남겨둘 문장 하나. 같은 문장.</div></div></div>
    <div data-message-group-id="turn-old" class="message"><div class="items-start"><div class="wrtn-markdown">오래된 대화. 남겨둘 문장 둘. 같은 문장.</div></div></div>
    <footer><div class="flex items-center space-x-2 tools"><button id="cdt-toolbar-btn">🌐</button><button>추천답변</button></div><textarea placeholder="메시지 입력"></textarea></footer></body></html>`;
  await context.route('https://crack.wrtn.ai/**', route => route.fulfill({ contentType: 'text/html', body: dom }));
  const newMsg = { _id: 'new', turnId: 'turn-new', role: 'assistant', status: 'end', createdAt: '2026-09-29T10:00:00Z', content: '최신 대화. 남겨둘 문장 하나. 같은 문장.' };
  const oldMsg = { _id: 'old', turnId: 'turn-old', role: 'assistant', status: 'end', createdAt: '2026-09-28T10:00:00Z', content: '오래된 대화. 남겨둘 문장 둘. 같은 문장.' };
  let mode = 'normal'; let delayed = null; const requested = [];
  await context.route('https://crack-api.wrtn.ai/**', async route => {
    const url = new URL(route.request().url()); requested.push(url.pathname + url.search);
    if (mode === 'delay') { await new Promise(resolve => { delayed = resolve; }); }
    if (mode === 'fail' && url.searchParams.has('cursor')) { await route.fulfill({ status: 500, body: '{}' }); return; }
    const isB = url.pathname.includes('/room-b/');
    const data = isB ? { messages: [{ _id: 'b1', role: 'user', content: '다른 방 대화' }], hasNext: false }
      : url.searchParams.has('cursor') ? { messages: [oldMsg, { _id: 'hidden', role: 'user', content: '화면 밖 과거 단서 <img src=x onerror="window.pwned=1">' }], hasNext: false }
      : { messages: [newMsg], hasNext: true, nextCursor: 'older' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await context.addInitScript(() => {
    window.__writes = []; window.__failSave = false;
    window.GM_addStyle = css => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); };
    window.GM_getValue = async (key, fallback) => JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    window.GM_setValue = async (key, value) => { if (window.__failSave) throw new Error('Storage full'); localStorage.setItem(key, JSON.stringify(value)); window.__writes.push(key); };
  });
  await page.goto('https://crack.wrtn.ai/u/test/c/room-a');
  await page.addScriptTag({ content: source });
  await page.locator('#csb-toolbar-btn').waitFor();
  async function selectQuote(group, text) {
    await page.evaluate(({ group, text }) => {
      const el = document.querySelector(`[data-message-group-id="${group}"] .wrtn-markdown`);
      const start = el.firstChild.textContent.indexOf(text), r = document.createRange(); r.setStart(el.firstChild, start); r.setEnd(el.firstChild, start + text.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange'));
    }, { group, text });
    await page.locator('#csb-pick').waitFor({ state: 'visible' });
    await page.locator('#csb-pick').click();
    await page.locator('#csb-editor').waitFor({ state: 'visible' });
  }
  async function saveComment(text) {
    await page.locator('#csb-comment').fill(text); await page.locator('#csb-save').click();
    await page.locator('#csb-editor').waitFor({ state: 'hidden' });
  }
  await selectQuote('turn-new', '남겨둘 문장 하나.');
  await saveComment('찾을 코멘트 <img src=x onerror="window.pwned=1">');
  assert.equal(requested.length, 2, 'must fetch through the oldest page');
  await page.locator('#csb-close').click();
  await selectQuote('turn-old', '남겨둘 문장 둘.'); await saveComment('나중에 저장한 옛 대화');
  let quotes = await page.locator('#csb-list .csb-quote').allTextContents();
  assert.deepEqual(quotes, ['남겨둘 문장 하나.', '남겨둘 문장 둘.']);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  await page.locator('#csb-search').fill('찾을 코멘트');
  await page.waitForFunction(() => document.querySelectorAll('#csb-list .csb-card').length === 1);
  assert.ok((await page.locator('#csb-list').textContent()).includes('남겨둘 문장 하나.'));
  await page.locator('#csb-list button', { hasText: '코멘트 수정' }).click();
  await saveComment('수정한 메모');
  await page.locator('#csb-history-tab').click();
  await page.locator('#csb-search').fill('화면 밖');
  await page.waitForFunction(() => document.querySelector('#csb-list').textContent.includes('과거 단서'));
  assert.equal(await page.locator('#csb-list img').count(), 0, 'API content must not create HTML');
  await page.locator('#csb-list summary').click();
  // Source text in search results can itself be selected and bookmarked.
  await page.evaluate(() => {
    const el = document.querySelector('[data-csb-source="hidden"]'), r = document.createRange(); r.setStart(el.firstChild, 0); r.setEnd(el.firstChild, 5);
    getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange'));
  });
  await page.locator('#csb-pick').waitFor({ state: 'visible' }); await page.locator('#csb-pick').click(); await saveComment('검색에서 저장');
  assert.equal(await page.locator('#csb-list .csb-card').count(), 3);
  // A reload must retain room-local comments and order.
  await page.reload(); await page.addScriptTag({ content: source }); await page.locator('#csb-toolbar-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('#csb-list .csb-card').length === 3);
  assert.ok((await page.locator('#csb-list').textContent()).includes('수정한 메모'));
  await page.locator('#csb-select-mode').check();
  await page.locator('#csb-list .csb-card input').nth(1).check();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#csb-delete-selected').click();
  await page.waitForFunction(() => document.querySelectorAll('#csb-list .csb-card').length === 2);
  await page.evaluate(() => { history.pushState({}, '', '/u/test/c/room-b'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('#csb-panel').waitFor({ state: 'hidden' }); await page.locator('#csb-toolbar-btn').click();
  assert.equal(await page.locator('#csb-list .csb-card').count(), 0);
  await page.locator('#csb-history-tab').click(); await page.waitForFunction(() => document.querySelector('#csb-status').textContent.includes('전체 불러오기 완료'));
  await page.getByText('대화 전체 북마크', { exact: true }).click(); await saveComment('방 B 메모');
  await page.locator('#csb-select-mode').check(); page.once('dialog', dialog => dialog.accept()); await page.locator('#csb-delete-all').click();
  await page.waitForFunction(() => document.querySelectorAll('#csb-list .csb-card').length === 0);
  const storedA = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), C.key('room-a'));
  assert.equal(storedA.bookmarks.length, 2, 'delete all must affect only the current room');
  // Navigation while a page is in flight must not populate or write the destination room.
  mode = 'delay'; await page.locator('#csb-history-tab').click(); await page.locator('#csb-refresh').click();
  await page.waitForFunction(() => !document.querySelector('#csb-stop').hidden);
  await page.evaluate(() => { history.pushState({}, '', '/u/test/c/room-a'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('#csb-panel').waitFor({ state: 'hidden' }); mode = 'normal'; delayed?.();
  await page.locator('#csb-toolbar-btn').click(); await page.waitForFunction(() => document.querySelectorAll('#csb-list .csb-card').length === 2);
  // Partial API errors must never claim full history completion.
  mode = 'fail'; await page.locator('#csb-history-tab').click();
  await page.waitForFunction(() => document.querySelector('#csb-status').textContent.includes('HTTP 500'));
  assert.ok(!(await page.locator('#csb-status').textContent()).includes('전체 불러오기 완료'));
  mode = 'normal'; await page.locator('#csb-refresh').click();
  await page.waitForFunction(() => document.querySelector('#csb-status').textContent.includes('전체 불러오기 완료'));
  await page.locator('#csb-bookmarks-tab').click();
  await page.locator('#csb-list button', { hasText: '코멘트 수정' }).first().click();
  await page.evaluate(() => { window.__failSave = true; });
  await page.locator('#csb-comment').fill('저장 실패 메모'); await page.locator('#csb-save').click();
  await page.waitForFunction(() => document.querySelector('#csb-status').textContent.includes('Storage full'));
  assert.ok(await page.locator('#csb-editor').isVisible(), 'failed saves keep the draft');
  assert.ok(!(await page.evaluate(key => localStorage.getItem(key), C.key('room-a'))).includes('저장 실패 메모'));
  await page.evaluate(() => { window.__failSave = false; }); await page.locator('#csb-cancel').click();
  const box = await page.locator('#csb-panel').boundingBox(); const viewport = page.viewportSize();
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0, 'popup fits viewport');
  if (process.env.BOOKMARK_SCREENSHOT) await page.screenshot({ path: process.env.BOOKMARK_SCREENSHOT });
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`${mobile ? 'WebKit mobile' : 'Chromium desktop'} bookmark interactions: PASS`);
  await browser.close();
}
