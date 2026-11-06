const assert = require('assert'); const { loadPage, fakeApi, until, sleep } = require('./page'); const J = JSON.stringify;
const S = (id, title, status = 'Up next') => ({ id, title, service: 'Viki', watchUrl: 'https://viki.com', synopsis: 's', poster: '', status, addedAt: 1 });
const page = (api, { pass = 'pw', cache, outbox } = {}) => loadPage({ codeShows: [], fetch: api.fetch, pre: w => {
  if (pass) w.localStorage.setItem('kdw-pass', pass); if (cache) w.localStorage.setItem('kdw-cache', J(cache)); if (outbox) w.localStorage.setItem('kdw-outbox', J(outbox));
  w.sessionStorage.setItem('kdw-intro', '1'); } }).window;
const cards = w => w.document.querySelectorAll('.card').length;
const ls = (w, k) => JSON.parse(w.localStorage.getItem(k) || 'null');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
(async () => {
  await t('renders the cache before any fetch resolves', async () => { const api = fakeApi(); api.fetch = () => new Promise(() => {}); assert.strictEqual(cards(page(api, { cache: [S('aaaaaaaa', 'Cached')] })), 1); });
  await t('refresh replaces the cache with the server list', async () => { const api = fakeApi({ shows: [S('aaaaaaaa', 'A'), S('bbbbbbbb', 'B')] }); const w = page(api, { cache: [S('cccccccc', 'Old')] }); await until(() => cards(w) === 2); assert.strictEqual(ls(w, 'kdw-cache').length, 2); });
  await t('401 shows the prompt; wrong passcode is refused; right one loads shows', async () => {
    const api = fakeApi({ shows: [S('aaaaaaaa', 'A')] }); const w = page(api, { pass: null }); const d = w.document;
    await until(() => !d.getElementById('lock').hidden);
    d.getElementById('passin').value = 'bad'; d.getElementById('passgo').click();
    await until(() => d.getElementById('lockmsg').textContent.includes('didn’t work')); assert.strictEqual(w.localStorage.getItem('kdw-pass'), null);
    d.getElementById('passin').value = 'pw'; d.getElementById('passgo').click();
    await until(() => cards(w) === 1 && d.getElementById('lock').hidden); assert.strictEqual(w.localStorage.getItem('kdw-pass'), 'pw');
  });
  await t('429 tells her to wait', async () => { const api = fakeApi({ mode: 'throttle' }); const w = page(api); await until(() => w.document.getElementById('lockmsg').textContent.includes('Too many tries')); });
  for (const mode of ['html404', 'html200']) await t(mode + ' → device-only mode, no prompt', async () => {
    const w = page(fakeApi({ mode }), { pass: null }); await until(() => w.eval('syncMode') === 'local');
    assert.ok(w.document.getElementById('syncnote').textContent.includes('Sync is off')); assert.ok(w.document.getElementById('lock').hidden);
  });
  await t('offline edits queue in the outbox and flush when back online', async () => {
    const api = fakeApi({ mode: 'down' }); const w = page(api);
    await until(() => api.calls.length >= 1);
    w.eval('commitOp({type:"put",show:' + J(S('newshow01', 'Queued')) + '})');
    assert.strictEqual(ls(w, 'kdw-outbox').length, 1); assert.strictEqual(cards(w), 1);
    api.mode = 'ok'; w.dispatchEvent(new w.Event('online'));
    await until(() => (ls(w, 'kdw-outbox') || []).length === 0 && api.db.has('newshow01'));
  });
  await t('a pending delete is not resurrected by a refresh', async () => {
    const api = fakeApi({ mode: 'readonly', shows: [S('aaaaaaaa', 'A')] }); const w = page(api, { cache: [], outbox: [{ type: 'del', id: 'aaaaaaaa' }] });
    await until(() => api.calls.some(c => c.method === 'GET')); await sleep(50); assert.strictEqual(cards(w), 0); assert.strictEqual(ls(w, 'kdw-outbox').length, 1);
  });
  await t('a pending edit is not reverted by a refresh', async () => {
    const api = fakeApi({ mode: 'readonly', shows: [S('aaaaaaaa', 'Orig')] }); const w = page(api, { cache: [], outbox: [{ type: 'put', show: S('aaaaaaaa', 'Edited') }] });
    await until(() => api.calls.some(c => c.method === 'GET')); await sleep(50); assert.ok(w.document.getElementById('rows').textContent.includes('Edited') || w.document.querySelector('#hero h2').textContent === 'Edited');
    assert.ok(!w.document.getElementById('rows').textContent.includes('Orig'));
  });
  await t('a change the server rejects keeps its message and is undone', async () => {
    const api = fakeApi({ mode: 'reject' }); const w = page(api, { cache: [] });
    await until(() => api.calls.some(c => c.method === 'GET'));
    w.eval('commitOp({type:"put",show:' + J(S('newshow01', 'Rejected')) + '})');
    await until(() => (ls(w, 'kdw-outbox') || []).length === 0);
    await until(() => cards(w) === 0);
    const note = w.document.getElementById('syncnote').textContent;
    assert.ok(note.includes('couldn’t be saved'), 'note was: ' + note);
  });
  console.log(n + '/' + n + ' passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
