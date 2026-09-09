import assert from 'node:assert/strict';

// Deterministic provider simulation: never sends a request or uses a real key.
process.env.GROQ_API_KEY = 'test-only';
delete process.env.GROQ_SHARE_MODEL;
delete process.env.GROQ_SHARE_FALLBACK_MODELS;
const { default: handler } = await import('../api/generate-share.js');
const success = { choices: [{ message: { content: 'Explore practical ways to support families.' }, finish_reason: 'stop' }] };
async function run(responses, expectedStatus, expectedCalls) {
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const [status, body] = responses.shift();
    return new Response(JSON.stringify(body), { status });
  };
  let result;
  const res = { status(code) { this.code = code; return this; }, json(body) { result = { status: this.code, body }; }, setHeader() {} };
  await handler({ method: 'POST', body: { title: 'Supporting families' } }, res);
  assert.equal(result.status, expectedStatus);
  assert.equal(calls.length, expectedCalls);
  assert.equal(calls[0].model, 'openai/gpt-oss-20b');
  assert.equal(calls[0].reasoning_effort, 'low');
  assert.equal(calls[0].max_completion_tokens, 1024);
  if (calls.length > 1) assert.equal(calls[1].model, 'openai/gpt-oss-120b');
  if (expectedStatus === 200) assert.ok(result.body.middle);
}
await run([[200, success]], 200, 1);
await run([[404, { error: { code: 'model_not_found' } }], [200, success]], 200, 2);
await run([[429, { error: { message: 'Rate limit' } }], [200, success]], 200, 2);
await run([[200, { choices: [{ message: { content: '' } }] }], [200, success]], 200, 2);
await run([[200, { choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }] }], [200, success]], 200, 2);
await run([[401, { error: { message: 'Invalid API key' } }]], 401, 1);
console.log('PASS: caption success, missing model, rate limit, empty/truncated output, and invalid key.');
