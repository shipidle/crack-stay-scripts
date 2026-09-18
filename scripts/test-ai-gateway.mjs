import assert from 'node:assert/strict';
import fs from 'node:fs';

const names = ['Crack_Assistant.user.js', 'Crack_Personal_AI_Summary.user.js', 'Crack_Dialogue_Translator.user.js'];
const sources = names.map(name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const adapters = sources.map(s => between(s, '  // BEGIN AI GATEWAY ADAPTER', '  // END AI GATEWAY ADAPTER'));
assert.equal(adapters[0], adapters[1]);
assert.equal(adapters[0], adapters[2]);
const adapter = adapters[0];
const h = Function(adapter + ';return { buildGatewayRequest, parseGatewayResponse };')();
const schema = { type: 'ARRAY', minItems: 2, maxItems: 3, items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' } }, required: ['title', 'summary'] } };
const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'prompt' }];
const body = h.buildGatewayRequest('google/gemini-3.8-flash', messages, schema, 4096);
assert.equal(body.model, 'google/gemini-3.8-flash');
assert.equal(body.reasoning_effort, 'low');
assert.equal(body.max_tokens, 4096);
assert.equal(body.response_format.json_schema.schema.properties.items.items.properties.title.type, 'string');
assert.equal(body.response_format.json_schema.schema.properties.items.items.additionalProperties, false);
assert.equal(messages.length, 2, 'caller messages must not be mutated');
assert.equal(schema.type, 'ARRAY', 'original Gemini schema must not be mutated');
assert.equal(h.buildGatewayRequest('anthropic/custom-model', messages, null, 900).reasoning_effort, undefined);
assert.throws(() => h.buildGatewayRequest('Gemini 3.8 Flash', messages, null, 900), /모델 ID/);
function response(content, finish = 'stop', usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, completion_tokens_details: { reasoning_tokens: 20 } }) {
  return JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage });
}
const parsed = h.parseGatewayResponse(200, response('{"items":[{"title":"a","summary":"b"}]}'), schema);
assert.deepEqual(JSON.parse(parsed.text), [{ title: 'a', summary: 'b' }]);
assert.equal(parsed.usage.candidatesTokenCount + parsed.usage.thoughtsTokenCount, 50, 'no reasoning double billing');
assert.equal(h.parseGatewayResponse(200, response('hello', 'stop', null)).usage.gateway, true);
assert.throws(() => h.parseGatewayResponse(401, '{"error":{"message":"bad key"}}'), /401.*bad key/);
assert.throws(() => h.parseGatewayResponse(429, '{"error":{"message":"rate limit"}}'), /429/);
assert.throws(() => h.parseGatewayResponse(200, response('partial', 'length')), /미완료/);
assert.throws(() => h.parseGatewayResponse(200, response('', 'content_filter')), /거절/);
assert.throws(() => h.parseGatewayResponse(200, response('')), /빈 응답/);
assert.throws(() => h.parseGatewayResponse(200, '<html>'), /파싱/);
assert.throws(() => h.parseGatewayResponse(200, response('{}'), schema), /items/);

const summary = sources[1];
const compactSchema = { type: 'ARRAY', minItems: 10, maxItems: 10 };
const config = { provider: 'vercel', gatewayModel: 'google/normal', gatewayCompactModel: 'google/compact', model: 'old-normal', compactModel: 'old-compact', extraPrompt: '' };
const seen = [];
const call = async (...args) => { seen.push(args); return { text: '[]', usage: { gateway: true } }; };
const route = Function('config', 'COMPACT_SCHEMA', 'callGateway', 'callGoogle', 'callFirebase', 'recordCost',
  between(summary, '  function summaryModel(', '  function parseJsonOutput(') + '; return { summaryModel, callModel };')(config, compactSchema, call, call, call, () => {});
await route.callModel('chat', 'sys', 'prompt', schema);
await route.callModel('chat', 'sys', 'prompt', compactSchema);
assert.deepEqual(seen.map(args => args[3]), ['google/normal', 'google/compact']);
config.gatewayCompactModel = '';
assert.equal(route.summaryModel('compact'), 'google/normal');
config.provider = 'google';
assert.equal(route.summaryModel('normal'), 'old-normal');
assert.equal(route.summaryModel('compact'), 'old-compact');
config.compactModel = '';
assert.equal(route.summaryModel('compact'), 'old-normal');

// Mock the real transport entry points; no paid API requests.
config.provider = 'vercel'; config.gatewayKey = 'gateway-test-key';
const fetchMock = async (url, options) => {
  assert.equal(url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer gateway-test-key');
  assert.equal(JSON.parse(options.body).model, 'google/compact');
  return { status: 200, text: async () => response('{"items":[]}') };
};
const summaryCall = Function('config', 'fetch', adapter + between(summary, '  async function callGateway(', '  function summaryModel(') + ';return callGateway;')(config, fetchMock);
await summaryCall('system', 'user', schema, 'google/compact');

const assistantConfig = { gatewayKey: 'gateway-test-key', gatewayModel: 'google/gemini-3.8-flash', thinking: '0' };
const assistantCall = Function('settings', 'gmRequest', adapter + between(sources[0], '  async function callGateway(', '  function ask(') + ';return callGateway;')(assistantConfig, async options => {
  assert.equal(options.headers.Authorization, 'Bearer gateway-test-key');
  const request = JSON.parse(options.data);
  assert.deepEqual(request.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  return { status: 200, responseText: response('answer') };
});
assert.equal((await assistantCall('system', [{ role: 'user', parts: [{ text: 'one' }] }, { role: 'model', parts: [{ text: 'two' }] }, { role: 'user', parts: [{ text: 'three' }] }])).text, 'answer');
const fields = { '#cdt-gateway-key': { value: 'gateway-test-key' }, '#cdt-gateway-model': { value: 'google/gemini-3.8-flash' } };
const translatorCall = Function('$', 'GM_xmlhttpRequest', 'parseTranslationPayload', adapter +
  between(sources[2], '  function callGateway(', '  function callGemini(') + ';return callGateway;')(
  selector => fields[selector],
  options => {
    assert.equal(options.headers.Authorization, 'Bearer gateway-test-key');
    options.onload({ status: 200, responseText: response('{"en":[{"id":1,"translation":"hello"}]}') });
  }, JSON.parse);
assert.deepEqual((await translatorCall('prompt', { type: 'OBJECT' })).payload, { en: [{ id: 1, translation: 'hello' }] });
fields['#cdt-gateway-key'].value = '';
await assert.rejects(translatorCall('prompt', schema), /키/);

assert.match(summary, /type: 'ARRAY', minItems: 2, maxItems: 3/);
assert.match(summary, /type: 'ARRAY', minItems: 10, maxItems: 10/);
assert.match(summary, /const AUTO_TURN_COUNT = 20/);
assert.doesNotMatch(sources[0], /<select id="cwa-model"/);
assert.doesNotMatch(summary, /<select id="cmm-model"/);
assert.match(sources[0], /@connect\s+ai-gateway.vercel.sh/);
assert.match(sources[2], /@connect\s+ai-gateway.vercel.sh/);
console.log('AI Gateway: adapter, errors, token accounting, HTTP mocks and per-summary models PASS');
