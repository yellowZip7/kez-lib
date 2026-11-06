const assert = require('assert');
const { loadLogic, evj } = require('./helpers');
process.env.SHOWS_PASSCODE = 'hunter2';
process.env.KV_REST_API_URL = 'https://fake.upstash.example';
process.env.KV_REST_API_TOKEN = 'tok_SECRET_123';

// fake Upstash REST over global.fetch
let hash, strings, expires, log, failMode, failNextExpire;
const reset = () => { hash = new Map(); strings = new Map(); expires = new Map(); log = []; failMode = false; failNextExpire = false; };
global.fetch = async (url, opts) => {
  if (failMode) return { ok: false, status: 500, json: async () => ({ error: 'boom tok_SECRET_123 https://fake.upstash.example' }) };
  const cmd = JSON.parse(opts.body); log.push(cmd);
  const [op, key, ...a] = cmd; let result = null;
  if (op === 'GET') result = strings.has(key) ? strings.get(key) : null;
  else if (op === 'INCR') { const v = Number(strings.get(key) || 0) + 1; strings.set(key, String(v)); result = v; }
  else if (op === 'EXPIRE') { if (failNextExpire) { failNextExpire = false; return { ok: false, status: 500, json: async () => ({ error: 'x' }) }; } expires.set(key, a[0]); result = 1; }
  else if (op === 'HGETALL') result = [...hash.entries()].flat();
  else if (op === 'HSET') { hash.set(a[0], a[1]); result = 1; }
  else if (op === 'HDEL') result = hash.delete(a[0]) ? 1 : 0;
  else if (op === 'HLEN') result = hash.size;
  else if (op === 'HEXISTS') result = hash.has(a[0]) ? 1 : 0;
  return { ok: true, status: 200, json: async () => ({ result }) };
};
const handler = require('../api/shows.js');
async function call(method, { headers = {}, query = {}, body } = {}) {
  const res = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ method, headers: { 'x-forwarded-for': '1.2.3.4', ...headers }, query, body }, res);
  return { status: res.code, body: res.body };
}
const auth = { 'x-passcode': 'hunter2' };
const good = (over = {}) => ({ id: 'abcdefgh1', title: 'Show', service: 'Viki', watchUrl: 'https://viki.com', synopsis: 's', poster: '', status: 'Up next', addedAt: 1, ...over });
let n = 0; const t = async (name, fn) => { reset(); await fn(); n++; console.log('ok -', name); };

(async () => {
  await t('no passcode → 401', async () => assert.strictEqual((await call('GET')).status, 401));
  await t('wrong passcode → 401', async () => assert.strictEqual((await call('GET', { headers: { 'x-passcode': 'nope' } })).status, 401));
  await t('10 failures → 429 even for the right passcode, expiry set to 900', async () => {
    for (let i = 0; i < 10; i++) await call('GET', { headers: { 'x-passcode': 'bad' + i } });
    assert.strictEqual((await call('GET', { headers: auth })).status, 429);
    assert.strictEqual(expires.get('kdw:fail:1.2.3.4'), 900);
  });
  await t('a failed EXPIRE on the first failure cannot leave a permanent lockout', async () => {
    failNextExpire = true;
    assert.strictEqual((await call('GET', { headers: { 'x-passcode': 'bad1' } })).status, 500);
    assert.strictEqual((await call('GET', { headers: { 'x-passcode': 'bad2' } })).status, 401);
    assert.strictEqual(expires.get('kdw:fail:1.2.3.4'), 900);
  });
  await t('POST → 405', async () => assert.strictEqual((await call('POST', { headers: auth })).status, 405));
  await t('GET returns stored shows; corrupt rows are skipped', async () => {
    hash.set('abcdefgh1', JSON.stringify(good())); hash.set('zzzzzzzz9', '{not json');
    const r = await call('GET', { headers: auth });
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body.shows.map(s => s.id), ['abcdefgh1']);
  });
  await t('PUT valid show stores and returns it', async () => {
    const r = await call('PUT', { headers: auth, body: { show: good() } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.show.title, 'Show'); assert.ok(hash.has('abcdefgh1'));
  });
  const bad = { 'bad id': { id: 'BAD ID' }, 'missing title': { title: '  ' }, 'title 101': { title: 'x'.repeat(101) }, 'poster 40001': { poster: 'data:image/jpeg;base64,' + 'A'.repeat(40000) }, 'png poster': { poster: 'data:image/png;base64,AA' }, 'javascript link': { watchUrl: 'jAvAsCrIpT:alert(1)' }, 'bad status': { status: 'Bogus' } };
  for (const [name, over] of Object.entries(bad)) await t('PUT ' + name + ' → 400', async () => assert.strictEqual((await call('PUT', { headers: auth, body: { show: good(over) } })).status, 400));
  await t('PUT with no body → 400', async () => assert.strictEqual((await call('PUT', { headers: auth, body: {} })).status, 400));
  await t('PUT new show when 200 exist → 400, editing an existing one still works', async () => {
    for (let i = 0; i < 200; i++) hash.set('id' + String(i).padStart(8, '0'), '{}');
    assert.strictEqual((await call('PUT', { headers: auth, body: { show: good({ id: 'newshow01' }) } })).status, 400);
    assert.strictEqual((await call('PUT', { headers: auth, body: { show: good({ id: 'id00000005' }) } })).status, 200);
  });
  await t('DELETE removes; without id → 400', async () => {
    hash.set('abcdefgh1', JSON.stringify(good()));
    assert.strictEqual((await call('DELETE', { headers: auth })).status, 400);
    assert.strictEqual((await call('DELETE', { headers: auth, query: { id: 'abcdefgh1' } })).status, 200);
    assert.ok(!hash.has('abcdefgh1'));
  });
  await t('UPSTASH_REDIS_REST_* env names work too', async () => {
    const a = process.env.KV_REST_API_URL, b = process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
    process.env.UPSTASH_REDIS_REST_URL = a; process.env.UPSTASH_REDIS_REST_TOKEN = b;
    assert.strictEqual((await call('GET', { headers: auth })).status, 200);
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = a; process.env.KV_REST_API_TOKEN = b;
  });
  await t('storage failure → 500 with no secrets in the body', async () => {
    failMode = true; const r = await call('GET', { headers: auth });
    assert.strictEqual(r.status, 500);
    const s = JSON.stringify(r.body); assert.ok(!s.includes('tok_SECRET') && !s.includes('upstash'));
  });
  // parity: server validateShow vs client validateShowInput
  await t('server and client validation agree', async () => {
    const c = loadLogic();
    const cases = [{}, { title: '' }, { title: 'x'.repeat(100) }, { title: 'x'.repeat(101) }, { service: 'x'.repeat(41) }, { synopsis: 'x'.repeat(601) }, { watchUrl: 'data:text/html,hi' }, { watchUrl: 'java\tscript:1' }, { watchUrl: 'netflix://t/1' }, { watchUrl: 'https://' + 'x'.repeat(495) }, { poster: 'data:image/png;base64,AA' }, { poster: 'data:image/jpeg;base64,AAAA' }, { poster: 'data:image/jpeg;base64,' + 'A'.repeat(40000) }];
    for (const over of cases) {
      const s = good(over);
      const server = handler.validateShow(s).ok;
      const client = evj(c, 'validateShowInput(' + JSON.stringify(s) + ', [], null)').ok;
      assert.strictEqual(server, client, 'disagree on ' + JSON.stringify(over).slice(0, 60));
    }
  });
  console.log(n + '/' + n + ' passed');
})().catch(e => { console.error(e); process.exit(1); });
