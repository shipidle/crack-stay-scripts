import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const translator = fs.readFileSync(path.join(root, 'Crack_Dialogue_Translator.user.js'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'Crack_Assistant.user.js'), 'utf8');

const helperStart = translator.indexOf('  function findDialogueSpans(source)');
const helperEnd = translator.indexOf('  function compactText(text, limit)', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'translator helper functions not found');

const helperSource = translator.slice(helperStart, helperEnd).replace(/^  /gm, '');
const helpers = Function(`${helperSource}\nreturn { findDialogueSpans, applyTranslations };`)();

const source = '"안녕."\n*그는 문에서 물러났다.*\n“괜찮아?”';
const spans = helpers.findDialogueSpans(source);
assert.deepEqual(spans.map(item => item.original), ['안녕.', '괜찮아?']);
assert.equal(
  helpers.applyTranslations(source, spans, ['Hello.', 'Are you okay?']),
  '"Hello." (안녕.)\n*그는 문에서 물러났다.*\n“Are you okay?” (괜찮아?)',
  'dialogue replacement must preserve narration and line breaks',
);
assert.equal(helpers.findDialogueSpans('"Already translated."\n*지문*').length, 0);
assert.throws(() => helpers.applyTranslations(source, spans, ['Hello.']), /번역 개수/);

assert.match(translator, /const MODEL = 'gemini-3\.1-flash-lite'/);
assert.match(translator, /const INPUT_USD_PER_M = 0\.25/);
assert.match(translator, /const OUTPUT_USD_PER_M = 1\.50/);
assert.match(translator, /thinkingLevel: 'minimal'/);
assert.match(translator, /CONTEXT_MESSAGES = 6/);

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
