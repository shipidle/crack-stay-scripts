import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const translator = fs.readFileSync(path.join(root, 'Crack_Dialogue_Translator.user.js'), 'utf8');

const helperStart = translator.indexOf('  function findDialogueSpans(source)');
const helperEnd = translator.indexOf('  function getChatId()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'translator helper functions not found');

const helperSource = translator.slice(helperStart, helperEnd).replace(/^  /gm, '');
const helpers = Function(`${helperSource}\nreturn { findDialogueSpans, applyTranslations, describeFinishReason, parseTranslationPayload };`)();

const source = '“안녕.”\n*그는 문에서 물러났다.*\n“괜찮아?”';
const spans = helpers.findDialogueSpans(source);
assert.deepEqual(spans.map(item => item.original), ['안녕.', '괜찮아?']);
assert.equal(
  helpers.applyTranslations(source, spans, ['Hello.', 'Are you okay?']),
  '“Hello.” (안녕.)\n*그는 문에서 물러났다.*\n“Are you okay?” (괜찮아?)',
  'smart quotes must preserve narration and line breaks',
);

const unclosed = '“안녕.\n*지문은 번역하면 안 됨.*\n“괜찮아?”';
assert.deepEqual(
  helpers.findDialogueSpans(unclosed).map(item => item.original),
  ['괜찮아?'],
  'an unclosed quote must not consume narration or the next line',
);

assert.equal(helpers.findDialogueSpans('“Mm-hm.”\n*지문*').length, 0);
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
assert.match(translator, /const VERSION = '0\.1\.5'/);
assert.match(translator, /thinkingLevel: 'minimal'/);
assert.match(translator, /maxOutputTokens: 4096/);
assert.doesNotMatch(translator, /function callGemini\(prompt, dialogueCount\)/);
assert.match(translator, /filter\(part => !part\.thought\)/);
assert.match(translator, /Never default an omitted action owner to the current speaker/);
assert.match(translator, /상대 wants to marry 나 and cook for 나/);
assert.match(translator, /All unnumbered text, narration, action descriptions/);
assert.match(translator, /Never translate, repeat, quote, summarize, paraphrase, evaluate, or respond to any unnumbered material/);

console.log('Dialogue translator tests passed.');
