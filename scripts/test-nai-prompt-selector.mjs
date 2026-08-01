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
assert.equal(api.nativeCharacterChunkName({ name: '로건' }, '네거'), '로건/네거');

const characterNameState = api.createDefaultState();
characterNameState.characters = [
  {
    id: 'logan', name: '로건', active: false, gender: 'Male',
    main: { quickPrompt: '', rows: [{ id: 'm', name: '베이스', content: '1man', enabled: true }] },
    negative: { quickPrompt: '', rows: [{ id: 'n', name: '네거', content: 'bad hands', enabled: true }] },
  },
  {
    id: 'other', name: '제이', active: false, gender: 'Male',
    main: { quickPrompt: '', rows: [] },
    negative: { quickPrompt: '', rows: [{ id: 'n2', name: '네거', content: 'bad hands', enabled: true }] },
  },
];
assert.deepEqual(
  JSON.parse(JSON.stringify(api.getManagedSpecs(characterNameState).filter(spec => spec.category.startsWith('[캐릭터')).map(spec => spec.name))),
  ['로건/베이스', '로건/네거', '제이/네거'],
  '캐릭터 Chunk는 캐릭터명/Chunk명으로 NAI 전체에서 구분되어야 함',
);

const nativeConflictDecisions = api.buildNativeConflictDecisions([
  { id: 'native-conflict-0', key: '[메인] 슬롯\u0000Chunk A' },
  { id: 'native-conflict-1', key: '[네거] 슬롯\u0000Chunk B' },
], ['native-conflict-0']);
assert.equal(nativeConflictDecisions.get('[메인] 슬롯\u0000Chunk A'), 'overwrite', '체크한 충돌은 NUL이 포함된 내부 키에도 덮어쓰기로 매핑되어야 함');
assert.equal(nativeConflictDecisions.get('[네거] 슬롯\u0000Chunk B'), 'skip', '체크하지 않은 충돌은 유지해야 함');

const collapsedRows = api.renderRows(
  { id: 'slot' },
  [{ id: 'row', name: '네거', content: 'bad hands', enabled: true }],
  'slot',
);
assert.match(collapsedRows, /<details class="nps-row-details" data-ui-details-key="row:row">/, 'Chunk 줄은 상태 복원용 고유 키가 있는 details여야 함');
assert.doesNotMatch(collapsedRows, /<details class="nps-row-details"[^>]*\sopen(?:\s|>)/, 'Chunk 줄은 기본으로 펼쳐지면 안 됨');
assert.match(collapsedRows, /<summary><span class="nps-row-title">네거<\/span>/, '접힌 상태에서도 Chunk 제목이 보여야 함');

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
    ['외형', 'smile'],
    ['눈 (3)', 'eye ornament'],
  ],
  '캐릭터 여러 줄 입력은 헤더를 이름 없는 줄의 Chunk명으로 쓰고 기존 이름과 겹치지 않게 추가해야 함',
);

const headerNamedCharacterRows = api.parseBulkRows(`
#로건
[베이스]
1 man, adult male, tall, kind
[표정]
smile
playful
[의상]
블랙탑=black tank top
바지 = cargo pants
`, 'main', '로건');
assert.deepEqual(
  JSON.parse(JSON.stringify(headerNamedCharacterRows.map(row => [row.name, row.content]))),
  [
    ['베이스', '1 man, adult male, tall, kind'],
    ['표정', 'smile'],
    ['표정 (2)', 'playful'],
    ['블랙탑', 'black tank top'],
    ['바지', 'cargo pants'],
  ],
  '캐릭터 헤더 이름 지정과 = 양옆 공백 선택 입력을 모두 지원해야 함',
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
assert.match(source, /panelOpen:\s*false/, 'NAI 진입 시 Selector 패널은 닫힌 상태여야 함');
assert.match(source, /id: `native-conflict-\$\{index\}`/, '충돌 체크박스에는 HTML 안전 ID가 필요함');
assert.doesNotMatch(source, /data-native-conflict="\$\{escapeHtml\(conflict\.key\)\}"/, 'NUL이 포함된 내부 충돌 키를 data 속성에 직접 넣으면 안 됨');
assert.match(source, /buildNativeConflictDecisions\(conflicts, checkedIds\)/, '화면용 충돌 ID를 내부 키의 결정값으로 다시 매핑해야 함');
assert.match(source, /function captureUiView\(\)/, '다시 그리기 전에 스크롤과 details 상태를 저장해야 함');
assert.match(source, /function restoreUiView\(view\)/, '다시 그린 뒤 스크롤과 details 상태를 복원해야 함');
assert.match(source, /content\.scrollTop = view\.contentScrollTop/, '콘텐츠 스크롤 위치를 복원해야 함');
assert.match(source, /details\.open = openDetails\.has\(details\.dataset\.uiDetailsKey\)/, 'Chunk 펼침 상태를 복원해야 함');
const nativeInsertBody = source.match(/async function insertNativeChunk[\s\S]*?\r?\n  }\r?\n\r?\n  async function applyTarget/)?.[0] || '';
assert.match(nativeInsertBody, /data-macro-label/, '네이티브 Chunk 삽입은 실제 macro-node 증가로 확인해야 함');
assert.doesNotMatch(nativeInsertBody, /insertEditorText/, 'Chunk 사이에 일반 쉼표 텍스트를 넣으면 다음 네이티브 Chunk 삽입이 깨짐');
assert.doesNotMatch(nativeInsertBody, /placeCaretAtEnd/, '연속 Chunk 클릭 사이에 캐럿을 다시 잡으면 NAI 네이티브 선택 상태가 깨질 수 있음');
assert.match(source, /placeCaretAtEnd\(editor\);\r?\n    for \(const spec of specs\) await insertNativeChunk/, 'Chunk 연속 삽입 전 캐럿은 한 번만 지정해야 함');
assert.match(source, /range\.selectNodeContents\(editor\.lastElementChild \|\| editor\)/, '캐럿은 ProseMirror 루트 밖이 아닌 마지막 문단 안에 둬야 함');
assert.doesNotMatch(source, /Delete All/, '원격 전체 삭제 문구나 호출 경로가 있으면 안 됨');
assert.match(source, /MAX_ACTIVE_CHARACTERS = 6/);
assert.match(source, /@match\s+https:\/\/novelai\.net\/image\*/);

console.log('NAI Prompt Selector contracts passed.');
