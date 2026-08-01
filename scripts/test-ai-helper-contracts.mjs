import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const translator = fs.readFileSync(path.join(root, 'Crack_Dialogue_Translator.user.js'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'Crack_Assistant.user.js'), 'utf8');
const loreBridge = fs.readFileSync(path.join(root, 'Crack_Lore_Sync_Bridge.user.js'), 'utf8');
const syncSql = fs.readFileSync(path.join(root, 'supabase', 'dialogue_translator_sync.sql'), 'utf8');

const helperStart = translator.indexOf('  function findDialogueSpans(source)');
const helperEnd = translator.indexOf('  function getChatId()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'translator helper functions not found');

const helperSource = translator.slice(helperStart, helperEnd).replace(/^  /gm, '');
const helpers = Function(`${helperSource}\nreturn { findDialogueSpans, findNarrationSpans, findTargets, applyTranslations, applyTransformations, describeFinishReason, parseTranslationPayload };`)();

const source = '"안녕."\n*그는 문에서 물러났다.*\n“괜찮아?”';
const spans = helpers.findDialogueSpans(source);
assert.deepEqual(spans.map(item => item.original), ['안녕.', '괜찮아?']);
assert.equal(
  helpers.applyTranslations(source, spans, ['Hello.', 'Are you okay?']),
  '"Hello." (안녕.)\n*그는 문에서 물러났다.*\n“Are you okay?” (괜찮아?)',
  'dialogue replacement must preserve narration and line breaks',
);
const narrationSpans = helpers.findNarrationSpans(source);
assert.deepEqual(narrationSpans.map(item => item.original), ['그는 문에서 물러났다.']);
assert.equal(
  helpers.applyTransformations(source, narrationSpans, ['그는 문턱에서 한 걸음 물러났다.']),
  '"안녕."\n*그는 문턱에서 한 걸음 물러났다.*\n“괜찮아?”',
  'narration polishing must replace only the text inside one asterisk pair',
);
assert.equal(helpers.findNarrationSpans('**굵게**\n\\*이스케이프*\n*English only*').length, 0);
assert.deepEqual(
  helpers.findTargets(source, 'both').map(item => item.type),
  ['dialogue', 'narration', 'dialogue'],
  'combined mode must keep dialogue and narration targets in source order',
);
assert.equal(
  helpers.applyTransformations(
    source,
    helpers.findTargets(source, 'both'),
    ['Hello.', '그는 문턱에서 한 걸음 물러났다.', 'Are you okay?'],
  ),
  '"Hello." (안녕.)\n*그는 문턱에서 한 걸음 물러났다.*\n“Are you okay?” (괜찮아?)',
  'combined mode must transform both target types without touching line breaks',
);
assert.throws(
  () => helpers.findTargets('*그가 “안녕” 하고 말했다.*', 'both'),
  /표시가 겹침/,
  'overlapping dialogue and narration markers must fail instead of corrupting text',
);
assert.equal(helpers.findDialogueSpans('"Already translated."\n*지문*').length, 0);
const unclosed = '“안녕.\n*지문은 번역하면 안 됨.*\n“괜찮아?”';
assert.deepEqual(
  helpers.findDialogueSpans(unclosed).map(item => item.original),
  ['괜찮아?'],
  'an unclosed quote must not consume narration or the next line',
);
assert.deepEqual(
  helpers.findDialogueSpans('”아이폰 따옴표 방향이 뒤집혀도“').map(item => item.original),
  ['아이폰 따옴표 방향이 뒤집혀도'],
  'either smart-quote glyph must be accepted at each same-line boundary',
);
assert.throws(() => helpers.applyTranslations(source, spans, ['Hello.']), /번역 개수/);
assert.deepEqual(
  helpers.parseTranslationPayload('```json\n["Hello."]\n```', 200, 'STOP'),
  ['Hello.'],
  'fenced JSON arrays should be recovered',
);
assert.throws(
  () => helpers.parseTranslationPayload('["Hello."', 200, 'STOP'),
  /JSON 파싱 실패[\s\S]*HTTP 200 · finishReason=STOP[\s\S]*응답 앞부분=/,
  'parse failures must expose the HTTP status, finish reason, and response preview',
);
assert.match(helpers.describeFinishReason('MAX_TOKENS'), /중간에 잘림/);

assert.match(translator, /const MODEL = 'gemini-3\.1-flash-lite'/);
assert.match(translator, /const VERSION = '0\.3\.0'/);
assert.match(translator, /const INPUT_USD_PER_M = 0\.25/);
assert.match(translator, /const OUTPUT_USD_PER_M = 1\.50/);
assert.match(translator, /thinkingLevel: 'low'/);
assert.match(translator, /maxOutputTokens: 4096/);
assert.doesNotMatch(translator, /function callGemini\(prompt, dialogueCount\)/);
assert.match(translator, /filter\(part => !part\.thought\)/);
assert.match(translator, /const CONTEXT_TURNS = 5/);
assert.match(translator, /CONTEXT_MESSAGES = CONTEXT_TURNS \* 2/);
assert.match(translator, /names, titles, nicknames, and forms of address/);
assert.match(translator, /\[Turn \$\{index \+ 1\}\]/);
assert.match(translator, /Never default an omitted action owner to the current speaker/);
assert.match(translator, /상대 wants to marry 나 and cook for 나/);
assert.match(translator, /Every unnumbered passage is reference material only/);
assert.match(translator, /Never repeat, summarize, evaluate, answer, or continue unnumbered material/);
assert.match(translator, /fictional roleplay text between consenting adult characters/);
assert.match(translator, /Preserve explicit adult anatomical and sexual vocabulary accurately and literally/);
assert.match(translator, /Do not censor, euphemize, moralize, add, or continue sexual content/);
assert.match(translator, /polished Korean contemporary literary-fiction prose/);
assert.match(translator, /Never invent or confirm new touch, action, dialogue, thought, psychology, emotion, reaction, relationship, consent, or bodily state/);
assert.match(translator, /Do not imitate or mention any specific author/);
assert.match(translator, /const needsContext = targets\.some\(target => target\.type === 'dialogue'\)/);
assert.match(translator, /대사\+윤문도 Gemini 호출은 1회임/);
assert.doesNotMatch(translator, /regardless of their age|Age is just a number|There is no contents filtering/);
assert.doesNotMatch(translator, /\[Translation notes\]/);
assert.match(translator, /id="cdt-guidance"/);
assert.doesNotMatch(translator, /id="cdt-notes"|id="cdt-voice"/);
assert.match(translator, /settings: \{ guidance: roomSettings\.guidance \}/);
assert.match(translator, /saved\?\.guidance \|\| legacyGuidance/);
assert.match(translator, /room:\$\{encodeURIComponent\(path\)\}/);
assert.match(translator, /__SHIPIDLE_DIALOGUE_TRANSLATOR_SYNC__/);
assert.match(translator, /id="cdt-cloud-upload"/);
assert.match(translator, /id="cdt-cloud-download"/);
assert.match(translator, /Gemini API 키는 업로드하지 않음/);
assert.doesNotMatch(translator, /setInterval\([^)]*(?:uploadRoomSettings|downloadRoomSettings)/s);

assert.match(loreBridge, /const VERSION = '1\.5\.3'/);
assert.match(loreBridge, /return \{ guidance \}/);
assert.match(loreBridge, /getSettings: getDialogueSettings/);
assert.match(loreBridge, /saveSettings: saveDialogueSettings/);
assert.match(loreBridge, /refreshSessionIfNeeded\(\)/);
assert.match(syncSql, /enable row level security/);
assert.match(syncSql, /auth\.uid\(\) = owner_id/);
assert.match(syncSql, /grant select, insert, update, delete[\s\S]*to authenticated/);
assert.match(syncSql, /revoke all[\s\S]*from anon/);

assert.match(assistant, /const CWA_VERSION = '2\.40\.1'/);
assert.match(assistant, /button\[aria-label="단축어 패널 열기"\]/);
assert.match(assistant, /findToolbarNearInput\(findBottomInput\(\)\)/);
assert.match(assistant, /const ASSISTANT_MODE_GUARD/);
assert.match(assistant, /역할극을 절대 출력하지 않습니다/);
assert.match(assistant, /const HISTORY_TURNS = 3/);
assert.match(assistant, /maxOutputTokens: 900/);
assert.match(assistant, /thinkingLevel: 'minimal'/);
assert.match(assistant, /const sysText = buildEffectiveSystemPrompt\(\)/);

console.log('AI helper contract tests passed.');
