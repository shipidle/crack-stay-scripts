import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'NAI_Prompt_Selector.user.js');
const source = fs.readFileSync(file, 'utf8');
const context = {
  __NPS_DISABLE_BOOT__: true,
  crypto: { randomUUID: () => `test-${Math.random().toString(36).slice(2)}` },
  console,
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: file });

const api = context.__NAI_PROMPT_SELECTOR_TEST__;
assert.ok(api, '테스트 API가 노출되지 않음');

const parsed = api.parseBulkText(`
[프로필]
흰배경 = white background
portrait
나보기 = looking at viewer
내려다보기 = from below
`, 'main');
assert.equal(parsed.length, 1);
assert.equal(parsed[0].name, '프로필');
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed[0].rows.map(row => [row.name, row.content]))),
  [
    ['흰배경', 'white background'],
    ['portrait', 'portrait'],
    ['나보기', 'looking at viewer'],
    ['내려다보기', 'from below'],
  ],
);
assert.equal(api.categoryForSlot(parsed[0]), '[메인] 프로필');

const negative = api.parseBulkText('[손]\n손오류 = bad hands\n손가락 = extra fingers', 'negative')[0];
assert.equal(api.categoryForSlot(negative), '[네거] 손');

const state = api.createDefaultState();
state.slots[0].rows = [
  { id: 'a', name: 'A', content: 'first', enabled: true },
  { id: 'b', name: 'B', content: 'second', enabled: false },
];
state.slots.push({ id: 'slot-2', type: 'main', name: '후행', quickPrompt: 'quick', rows: [
  { id: 'c', name: 'C', content: 'third', enabled: true },
] });
assert.equal(api.buildExpandedPreview(state.slots.filter(slot => slot.type === 'main')), 'first,\nthird,\nquick');

state.characters = Array.from({ length: 7 }, (_, index) => ({
  id: `character-${index}`,
  name: `캐릭터 ${index + 1}`,
  active: true,
  gender: 'Female',
  main: { quickPrompt: '', rows: [] },
  negative: { quickPrompt: '', rows: [] },
}));
const sanitized = api.sanitizeState(state);
assert.equal(api.countActiveCharacters(sanitized), api.MAX_ACTIVE_CHARACTERS);
assert.equal(api.categoryForCharacter(sanitized.characters[0], 'main'), '[캐릭터-메인] 캐릭터 1');
assert.equal(api.categoryForCharacter(sanitized.characters[0], 'negative'), '[캐릭터-네거] 캐릭터 1');

const characterBulkRows = api.parseBulkRows(`
[외형]
눈 = blue eyes
smile
[의상]
눈 = eye ornament
`, 'main', '테스트 캐릭터', [{ name: '눈', content: 'existing', enabled: true }]);
assert.deepEqual(
  JSON.parse(JSON.stringify(characterBulkRows.map(row => [row.name, row.content]))),
  [
    ['눈 (2)', 'blue eyes'],
    ['smile', 'smile'],
    ['눈 (3)', 'eye ornament'],
  ],
  '캐릭터 여러 줄 입력은 헤더를 제외하고 기존 이름과 겹치지 않게 추가해야 함',
);

const current = api.createDefaultState();
current.slots[0].rows = [{ id: 'existing', name: '흰배경', content: 'white background', enabled: true }];
const incoming = api.createDefaultState();
incoming.slots[0].rows = [
  { id: 'incoming-1', name: '흰배경', content: 'pure white background', enabled: true },
  { id: 'incoming-2', name: 'portrait', content: 'portrait', enabled: true },
];
const merge = api.prepareImportMerge(current, incoming);
assert.equal(merge.conflicts.length, 1, '같은 이름·다른 내용은 충돌이어야 함');
assert.equal(merge.merged.slots[0].rows.length, 2, '새 Chunk는 삭제 없이 병합되어야 함');
assert.equal(merge.merged.slots[0].rows.find(row => row.name === '흰배경').content, 'white background');

assert.match(source, /button\.getAttribute\('title'\) === NATIVE_ACTION\.editChunk/);
assert.match(source, /nativeChunk\.item\.click\(\)/, '네이티브 Chunk 클릭 적용이 필요함');
assert.match(source, /Base Prompt 설정 버튼/, 'Prompt Chunks는 Base Prompt 설정에서 열어야 함');
assert.match(source, /getComputedStyle\(element\)\.cursor === 'pointer'/, 'Prompt Chunks 탭 전환 계약이 필요함');
assert.match(source, /data-action="apply-character-bulk"/, '캐릭터 메인·네거에도 여러 줄 입력 UI가 필요함');
assert.doesNotMatch(source, /Delete All/, '원격 전체 삭제 문구나 호출 경로가 있으면 안 됨');
assert.match(source, /MAX_ACTIVE_CHARACTERS = 6/);
assert.match(source, /@match\s+https:\/\/novelai\.net\/image\*/);

console.log('NAI Prompt Selector contracts passed.');
