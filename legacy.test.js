const assert = require('assert'); const { loadPage, sleep } = require('./page');
const g = d => { const w = d.window, doc = w.document; return { w, doc, q: s => doc.querySelector(s), qa: s => doc.querySelectorAll(s), root: doc.documentElement }; };
(async () => {
  let p = g(loadPage());
  assert.strictEqual(p.doc.title, 'K’s Dramas'); assert.ok(p.q('header').textContent.includes('Keziah’s Dramas'));
  assert.strictEqual(p.qa('.rowwrap').length, 1, 'only Up Next row'); assert.strictEqual(p.qa('.card').length, 6);
  assert.strictEqual(p.q('#hero h2').textContent, 'Sample Drama One', 'hero falls back to first');
  p.q('#hero .gray').click(); assert.ok(!p.q('#panel').hidden, 'More info opens panel');
  assert.ok(p.q('#pbody a.watch[target=_blank][rel=noopener]'), 'watch link');
  p.q('#pbody [data-s="Watching"]').click();
  assert.strictEqual(p.qa('.rowwrap h3')[0].textContent, 'Continue Watching'); assert.strictEqual(p.qa('.rowwrap').length, 2);
  p.doc.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape' })); assert.ok(p.q('#panel').hidden);
  const cards = [...p.qa('.card')]; cards[cards.length - 1].click(); assert.ok(!p.q('#pbody a.watch'), 'no watch button without url');
  p = g(loadPage({ pre: w => Object.defineProperty(w, 'localStorage', { get() { throw new Error('no'); } }) }));
  assert.strictEqual(p.qa('.card').length, 6, 'renders with broken storage');
  // theme
  p = g(loadPage()); assert.strictEqual(p.q('#theme').getAttribute('data-mode'), 'light');
  p.q('#theme').click(); assert.strictEqual(p.root.getAttribute('data-theme'), 'dark'); assert.strictEqual(p.w.localStorage.getItem('kdw-theme'), 'dark');
  p = g(loadPage({ pre: w => w.localStorage.setItem('kdw-theme', 'dark') })); assert.strictEqual(p.root.getAttribute('data-theme'), 'dark', 'saved theme applied');
  // splash + reveal
  p = g(loadPage());
  assert.ok(p.q('#splash .ez') && p.qa('#splash .ez span').length === 5, 'K to Keziah markup');
  assert.strictEqual(p.w.sessionStorage.getItem('kdw-intro'), '1'); assert.ok(!p.root.classList.contains('rv-go'));
  p.q('#splash').dispatchEvent(new p.w.Event('pointerdown', { bubbles: true }));
  assert.strictEqual(p.q('#splash'), null, 'tap skips'); assert.ok(p.root.classList.contains('rv-go'), 'reveal on skip');
  assert.ok(p.q('.rowwrap').getAttribute('style').includes('--i:0')); assert.ok(p.q('.card').getAttribute('style').includes('--c:0'));
  await sleep(1900); assert.ok(!p.root.classList.contains('rv-go'), 'reveal class cleared');
  p.q('.card').click(); p.q('#pbody [data-s="Watching"]').click(); assert.ok(!p.root.classList.contains('rv-go'), 'status change does not replay');
  p.q('#brand').click(); assert.ok(p.q('#splash'), 'brand replays'); assert.ok(p.q('#panel').hidden);
  await sleep(2250); assert.ok(p.root.classList.contains('rv-go') && p.q('#splash'), 'reveal starts while splash fades');
  await sleep(500); assert.strictEqual(p.q('#splash'), null);
  p = g(loadPage({ pre: w => w.sessionStorage.setItem('kdw-intro', '1') })); assert.strictEqual(p.q('#splash'), null); assert.ok(!p.root.classList.contains('rv-go'));
  p = g(loadPage({ pre: w => Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('no'); } }) }));
  assert.ok(p.q('#splash'), 'plays when sessionStorage blocked'); assert.strictEqual(p.qa('.card').length, 6);
  p.doc.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'a' })); assert.strictEqual(p.q('#splash'), null, 'key skips');
  console.log('legacy ui: passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
