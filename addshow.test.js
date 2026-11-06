const assert = require('assert'); const { loadPage, fakeApi, until, sleep, SAMPLE } = require('./page');
const S = (id, title, status = 'Up next') => ({ id, title, service: 'Viki', watchUrl: 'https://viki.com', synopsis: 's', poster: '', status, addedAt: 1 });
function open({ shows = [], codeShows = [], mode = 'ok', confirm = true } = {}) {
  const api = fakeApi({ shows, mode });
  const w = loadPage({ codeShows, fetch: api.fetch, pre: x => { x.localStorage.setItem('kdw-pass', 'pw'); x.sessionStorage.setItem('kdw-intro', '1'); x.confirm = () => confirm; } }).window;
  return { api, w, doc: w.document, q: s => w.document.querySelector(s), qa: s => w.document.querySelectorAll(s) };
}
const fill = (p, v) => { for (const [id, val] of Object.entries(v)) p.q('#f-' + id).value = val; };
const submit = p => p.q('#showform').dispatchEvent(new p.w.Event('submit', { cancelable: true, bubbles: true }));
const cards = p => p.qa('.card').length;
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
(async () => {
  await t('"+" opens the sheet', async () => { const p = open(); p.q('#add').click(); assert.ok(!p.q('#sheet').hidden); });
  await t('empty title shows a friendly message and adds nothing', async () => { const p = open(); p.q('#add').click(); submit(p); await sleep(30); assert.ok(p.q('#e-title').textContent.length > 0); assert.strictEqual(cards(p), 0); assert.strictEqual(p.api.db.size, 0); });
  await t('valid show appears, normalizes the link, syncs, closes the sheet, status is kept', async () => {
    const p = open(); p.q('#add').click(); fill(p, { title: 'My Show', url: 'viki.com/x', syn: 'Nice', service: 'Viki' });
    p.q('#f-status [data-s="Watching"]').click(); submit(p);
    await until(() => p.api.db.size === 1); const saved = [...p.api.db.values()][0];
    assert.strictEqual(saved.watchUrl, 'https://viki.com/x'); assert.strictEqual(saved.status, 'Watching');
    assert.strictEqual(cards(p), 1); assert.strictEqual(p.q('#hero h2').textContent, 'My Show'); assert.ok(p.q('#sheet').hidden);
  });
  await t('duplicate title (different case/spacing) is refused', async () => {
    const p = open({ shows: [S('aaaaaaaa', 'My Show')] }); await until(() => cards(p) === 1);
    p.q('#add').click(); fill(p, { title: ' my show ' }); submit(p); await sleep(30);
    assert.ok(p.q('#e-title').textContent.includes('already have')); assert.strictEqual(p.api.db.size, 1);
  });
  await t('javascript: link is refused gently', async () => { const p = open(); p.q('#add').click(); fill(p, { title: 'X', url: 'javascript:alert(1)' }); submit(p); await sleep(30); assert.ok(p.q('#e-watchUrl').textContent.includes('doesn’t look like a watch link')); assert.strictEqual(cards(p), 0); });
  await t('Edit pre-fills and saves to the same id', async () => {
    const p = open({ shows: [S('aaaaaaaa', 'Old')] }); await until(() => cards(p) === 1);
    p.q('.card').click(); p.q('[data-act="edit"]').click(); assert.strictEqual(p.q('#f-title').value, 'Old'); assert.ok(p.q('#panel').hidden);
    fill(p, { title: 'New' }); submit(p); await until(() => p.api.db.get('aaaaaaaa') && p.api.db.get('aaaaaaaa').title === 'New'); assert.strictEqual(p.api.db.size, 1);
  });
  await t('Remove asks first, then removes and syncs a delete', async () => {
    const p = open({ shows: [S('aaaaaaaa', 'Gone')], confirm: false }); await until(() => cards(p) === 1);
    p.q('.card').click(); p.q('[data-act="remove"]').click(); await sleep(30); assert.strictEqual(cards(p), 1); assert.ok(!p.api.calls.some(c => c.method === 'DELETE'));
    p.w.confirm = () => true; p.q('[data-act="remove"]').click(); await until(() => p.api.db.size === 0); assert.strictEqual(cards(p), 0);
  });
  await t('code-defined shows have no Edit/Remove', async () => { const p = open({ codeShows: SAMPLE.slice(0, 1) }); p.q('.card').click(); assert.ok(!p.q('[data-act]')); });
  await t('first-run screen shows with no shows and hides after adding one', async () => {
    const p = open(); assert.ok(!p.q('#firstrun').hidden); assert.ok(p.q('#hero').hidden);
    p.q('#add').click(); fill(p, { title: 'First' }); submit(p); await until(() => cards(p) === 1); assert.ok(p.q('#firstrun').hidden);
  });
  await t('HTML in a title renders as text', async () => {
    const p = open(); p.q('#add').click(); fill(p, { title: '<img src=x onerror=alert(1)>' }); submit(p); await until(() => cards(p) === 1);
    assert.ok(p.q('.ph').textContent.includes('<img src=x')); assert.strictEqual(p.qa('img').length, 0);
  });
  await t('a failing poster does not block saving, and a message appears', async () => {
    const p = open(); p.w.resizePoster = () => Promise.reject(new Error('nope')); p.q('#add').click(); fill(p, { title: 'NoPic' });
    const inp = p.q('#f-poster'); Object.defineProperty(inp, 'files', { value: [{ type: 'image/jpeg' }] }); inp.dispatchEvent(new p.w.Event('change'));
    await until(() => p.q('#e-poster').textContent.length > 0); submit(p); await until(() => p.api.db.size === 1); assert.strictEqual([...p.api.db.values()][0].poster, '');
  });
  await t('a good poster is saved as the resized image', async () => {
    const p = open(); p.w.resizePoster = () => Promise.resolve('data:image/jpeg;base64,AAAA'); p.q('#add').click(); fill(p, { title: 'Pic' });
    const inp = p.q('#f-poster'); Object.defineProperty(inp, 'files', { value: [{ type: 'image/jpeg' }] }); inp.dispatchEvent(new p.w.Event('change'));
    submit(p); await until(() => p.api.db.size === 1); assert.strictEqual([...p.api.db.values()][0].poster, 'data:image/jpeg;base64,AAAA');
  });
  await t('the 201st show is blocked with a message', async () => {
    const shows = Array.from({ length: 200 }, (_, i) => S('id' + String(i).padStart(8, '0'), 'T' + i));
    const p = open({ shows }); await until(() => cards(p) === 200); p.q('#add').click(); fill(p, { title: 'One too many' }); submit(p); await sleep(30);
    assert.ok(p.q('#e-limit').textContent.includes('200')); assert.strictEqual(p.api.db.size, 200);
  });
  await t('Forget passcode clears it and asks again', async () => {
    const p = open(); await until(() => p.w.eval('syncMode') === 'cloud'); p.q('#add').click(); p.q('#forget').click();
    assert.strictEqual(p.w.localStorage.getItem('kdw-pass'), null); assert.ok(!p.q('#lock').hidden); assert.ok(p.q('#sheet').hidden);
  });
  console.log(n + '/' + n + ' passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
