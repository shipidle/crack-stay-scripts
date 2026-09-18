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
