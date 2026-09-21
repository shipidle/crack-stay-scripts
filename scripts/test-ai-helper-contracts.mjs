import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const translator = read('Crack_Dialogue_Translator.user.js');
const assistant = read('Crack_Assistant.user.js');
const loreBridge = read('Crack_Lore_Sync_Bridge.user.js');
const syncSql = read('supabase/dialogue_translator_sync.sql');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const code = [
  between(translator, '  const LANGUAGES =', '  let busy'),
  between(translator, '  function findDialogueSpans(', '  function getChatId()'),
  between(translator, '  function groupTargets(', '  function isProhibitedContentError('),
].join('\n');
const h = Function(code + '\nreturn { findDialogueSpans, applyTranslations, parseTranslationPayload, buildGroupedResponseSchema, unpackGroupedTranslations };')();

const source = '"안녕." -프\n*그는 문에서 물러났다.*\n“괜찮아?” -일\n"Already translated."';
const targets = h.findDialogueSpans(source, 'en');
assert.deepEqual(targets.map(t => [t.original, t.language]), [['안녕.', 'fr'], ['괜찮아?', 'ja']]);
const payload = { ja: [{ id: 2, translation: '大丈夫？' }], fr: [{ id: 1, translation: 'Salut.' }] };
assert.deepEqual(h.unpackGroupedTranslations(targets, payload), ['Salut.', '大丈夫？']);
assert.equal(h.applyTranslations(source, targets, h.unpackGroupedTranslations(targets, payload)),
  '"Salut." (안녕.)\n*그는 문에서 물러났다.*\n“大丈夫？” (괜찮아?)\n"Already translated."');
assert.deepEqual(h.findDialogueSpans('”아이폰 따옴표 방향이 뒤집혀도“', 'en').map(t => t.original), ['아이폰 따옴표 방향이 뒤집혀도']);
assert.deepEqual(h.findDialogueSpans('“안녕.\n*지문.*\n“괜찮아?”', 'en').map(t => t.original), ['괜찮아?']);
assert.equal(h.findDialogueSpans('*지문만 있음*', 'en').length, 0);
assert.throws(() => h.applyTranslations(source, targets, ['Hello']), /개수/);
assert.throws(() => h.unpackGroupedTranslations(targets, { fr: [{ id: 2, translation: 'wrong' }], ja: [] }), /언어/);
assert.throws(() => h.unpackGroupedTranslations(targets, { fr: [], ja: payload.ja }), /누락/);
assert.throws(() => h.unpackGroupedTranslations(targets, { ...payload, fr: [...payload.fr, ...payload.fr] }), /중복/);
assert.deepEqual(h.buildGroupedResponseSchema(targets).required, ['fr', 'ja']);
assert.deepEqual(h.parseTranslationPayload('{"fr":[]}', 200, 'STOP'), { fr: [] });
assert.throws(() => h.parseTranslationPayload('{"fr":', 200, 'STOP'), /JSON/);
assert.match(translator, /const CONTEXT_TURNS = 5/);
assert.match(translator, /const targets = findDialogueSpans\(source, selectedLanguage\(\)\)/);
assert.match(translator, /settings: \{ guidance: roomSettings\.guidance \}/);
assert.match(translator, /saved\?\.guidance \|\| legacyGuidance/);
assert.match(translator, /__SHIPIDLE_DIALOGUE_TRANSLATOR_SYNC__/);
assert.doesNotMatch(translator, /setInterval\([^)]*(?:uploadRoomSettings|downloadRoomSettings)/s);
assert.match(loreBridge, /return \{ guidance \}/);
assert.match(loreBridge, /refreshSessionIfNeeded\(\)/);
assert.match(syncSql, /enable row level security/);
assert.match(syncSql, /auth\.uid\(\) = owner_id/);
assert.match(syncSql, /revoke all[\s\S]*from anon/);
assert.match(assistant, /const ASSISTANT_MODE_GUARD/);
assert.match(assistant, /역할극을 절대 출력하지 않습니다/);
assert.match(assistant, /const HISTORY_TURNS = 3/);
assert.match(assistant, /const sysText = buildEffectiveSystemPrompt\(\)/);
console.log('AI helper contracts: dialogue-only, language routing, parsing, cloud isolation and assistant role PASS');

const contextCode = between(translator, '  function normalizeContextTurns(', '  function groupTargets(');
const contextHarness = (history = [], pageSize = 50) => {
  const requests = [], storage = new Map(), field = { value:'5' };
  const fetch = async url => {
    requests.push(url);
    const params = new URL(url).searchParams;
    const offset = Number(params.get('cursor') || 0);
    const limit = Math.min(pageSize, Number(params.get('limit')));
    const messages = history.slice(offset, offset + limit);
    const end = offset + messages.length;
    return { ok:true, json:async()=>({ data:{ messages, nextCursor:end < history.length ? String(end) : '' } }) };
  };
  const api = Function('fetch','getChatId','buildHeaders','$','GM_setValue', `
    const CONTEXT_TURNS=5, MAX_CONTEXT_TURNS=100, HISTORY_CHAR_BUDGET=20000;
    const API_BASE='https://example.test', KEY='test';
    ${code}
    ${contextCode}
    return { normalizeContextTurns, saveContextTurns, fetchRecentContext };
  `)(fetch,()=> 'chat',()=>({}),()=>field,(key,value)=>storage.set(key,value));
  return { ...api, requests, storage, field };
};
const history = Array.from({ length:100 }, (_,i)=>[
  { role:'user',content:`question-${i}` }, { role:'assistant',content:`answer-${i}` },
]).flat().reverse();
const context = contextHarness(history);
for (const [input,expected] of [[undefined,5],['',5],['invalid',5],[0,0],[-2,0],[8.9,8],[500,100]]) {
  assert.equal(context.normalizeContextTurns(input),expected);
}
context.field.value='8'; context.saveContextTurns();
assert.equal(context.storage.get('test:contextTurns'),8);
context.field.value=''; context.saveContextTurns(); assert.equal(context.field.value,'5');
const off=await context.fetchRecentContext(0);
assert.equal(off.turnCount,0); assert.equal(context.requests.length,0);
const defaults=await context.fetchRecentContext();
assert.equal(defaults.turnCount,5); assert.equal(defaults.messageCount,10);
assert.match(defaults.text,/question-95/); assert.doesNotMatch(defaults.text,/question-94\b/);
const eight=await context.fetchRecentContext(8);
assert.equal(eight.turnCount,8); assert.match(eight.text,/question-92/);
assert.doesNotMatch(eight.text,/question-91\b/);
const paginated=contextHarness(history,30);
const hundred=await paginated.fetchRecentContext(100);
assert.equal(hundred.turnCount,100); assert.equal(hundred.fetchedCount,200);
assert.equal(paginated.requests.length,7);
assert.ok(paginated.requests.every(url=>Number(new URL(url).searchParams.get('limit'))<=50));
assert.ok(hundred.text.indexOf('question-0')<hundred.text.indexOf('question-99'));
const short=await contextHarness(history.slice(0,4)).fetchRecentContext(50);
assert.equal(short.turnCount,2);
const clipped=await contextHarness([{ role:'assistant',content:'LATEST '+ 'x'.repeat(25000) },...history]).fetchRecentContext(100);
assert.ok(clipped.turnCount<100); assert.match(clipped.text,/LATEST/); assert.ok(clipped.chars<20100);
console.log('Translator context: saved count, zero-fetch mode, latest N turns, pagination and character budget PASS');
