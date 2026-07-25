import assert from 'node:assert/strict';
import fs from 'node:fs';

const lorePath = new URL('../Crack_Lore_Sync_Bridge.user.js', import.meta.url);
const summaryPath = new URL('../Crack_Personal_AI_Summary.user.js', import.meta.url);
const loreSource = fs.readFileSync(lorePath, 'utf8');
const summarySource = fs.readFileSync(summaryPath, 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

function buildAuthHarness(initialSession, responder) {
  const store = new Map([['test-app:session', structuredClone(initialSession)]]);
  const GM_getValue = async (key, fallback) => structuredClone(store.has(key) ? store.get(key) : fallback);
  const GM_setValue = async (key, value) => { store.set(key, structuredClone(value)); };
  const GM_xmlhttpRequest = options => {
    Promise.resolve()
      .then(() => responder(options, store))
      .then(result => options.onload({
        status: result.status,
        responseText: result.body === undefined ? '' : JSON.stringify(result.body),
      }))
      .catch(() => options.onerror());
  };

  const authSource = [
    between(loreSource, '  async function persistSession', '  function makeHeaders'),
    between(loreSource, '  function makeHeaders', '  function request'),
    between(loreSource, '  function request', '  function validateConnection'),
    between(loreSource, '  async function syncStoredSession', '  async function consumeAuthHash'),
    between(loreSource, '  async function authHeaders', '  function sanitizeBackup'),
  ].join('\n');
  const factory = new Function(
    'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', 'initialSession',
    `const APP_KEY = 'test-app';
     const config = { projectUrl: 'https://example.supabase.co', publishableKey: 'publishable' };
     let session = structuredClone(initialSession);
     let refreshSessionPromise = null;
     ${authSource}
     return {
       authedRequest,
       refreshSessionIfNeeded,
       session: () => session,
     };`,
  );
  return { ...factory(GM_getValue, GM_setValue, GM_xmlhttpRequest, initialSession), store };
}

function session(name, expiresAt) {
  return {
    access_token: `access-${name}`,
    refresh_token: `refresh-${name}`,
    expires_at: expiresAt,
    user: { id: 'user-1' },
  };
}

const nowSeconds = Math.floor(Date.now() / 1000);

{
  let refreshCalls = 0;
  const seenAuth = [];
  const initial = session('old', nowSeconds - 1);
  const harness = buildAuthHarness(initial, async options => {
    if (options.url.includes('/auth/v1/token')) {
      refreshCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 20));
      return { status: 200, body: session('new', nowSeconds + 3600) };
    }
    seenAuth.push(options.headers.Authorization);
    return { status: 200, body: { ok: true } };
  });
  await Promise.all([
    harness.authedRequest('https://example.supabase.co/rest/v1/one'),
    harness.authedRequest('https://example.supabase.co/rest/v1/two'),
  ]);
  assert.equal(refreshCalls, 1, 'same-tab refresh must be single-flight');
  assert.deepEqual(seenAuth, ['Bearer access-new', 'Bearer access-new']);
}

{
  let refreshCalls = 0;
  let restCalls = 0;
  const initial = session('old', nowSeconds + 3600);
  const harness = buildAuthHarness(initial, options => {
    if (options.url.includes('/auth/v1/token')) {
      refreshCalls += 1;
      return { status: 200, body: session('new', nowSeconds + 7200) };
    }
    restCalls += 1;
    if (options.headers.Authorization === 'Bearer access-old') {
      return { status: 401, body: { message: 'JWT expired' } };
    }
    return { status: 200, body: { ok: true } };
  });
  const result = await harness.authedRequest('https://example.supabase.co/rest/v1/retry');
  assert.deepEqual(result, { ok: true });
  assert.equal(restCalls, 2, '401 request must retry exactly once');
  assert.equal(refreshCalls, 1, '401 request must refresh exactly once');
}

{
  const initial = session('old', nowSeconds - 1);
  const rotated = session('other-tab', nowSeconds + 3600);
  const harness = buildAuthHarness(initial, (options, store) => {
    if (options.url.includes('/auth/v1/token')) {
      setTimeout(() => store.set('test-app:session', structuredClone(rotated)), 20);
      return { status: 400, body: { message: 'Invalid Refresh Token: Already Used' } };
    }
    throw new Error('unexpected REST request');
  });
  const recovered = await harness.refreshSessionIfNeeded();
  assert.equal(recovered.access_token, 'access-other-tab', 'must adopt a token rotated by another tab');
}

{
  let refreshCalls = 0;
  let restCalls = 0;
  const initial = session('valid', nowSeconds + 3600);
  const harness = buildAuthHarness(initial, options => {
    if (options.url.includes('/auth/v1/token')) refreshCalls += 1;
    else restCalls += 1;
    return { status: 403, body: { message: 'permission denied' } };
  });
  await assert.rejects(
    harness.authedRequest('https://example.supabase.co/rest/v1/forbidden'),
    /\[Supabase HTTP 403\]/,
  );
  assert.equal(restCalls, 1, '403 must not be retried as an authentication refresh');
  assert.equal(refreshCalls, 0, '403 must not refresh the session');
}

{
  const shortErrorSource = between(summarySource, '  function shortError', '  function setStatus');
  const shortError = new Function(`${shortErrorSource}; return shortError;`)();
  assert.match(shortError(new Error('[Supabase HTTP 401] JWT expired')), /Supabase 로그인/);
  assert.match(shortError(new Error('[Supabase HTTP 403] permission denied')), /RLS 정책/);
  assert.match(shortError(new Error('[Crack API HTTP 401] unauthorized')), /Crack 로그인/);
  assert.match(shortError(new Error('[Google Gemini HTTP 403] forbidden')), /모델 사용 권한/);
  assert.match(summarySource, /lastSuccessfulProbeSignatures\.get\(chatId\) === activitySignature/);
  assert.match(summarySource, /response\.status === 401 && method === 'GET'/);
}

console.log('memory auth tests: PASS');
