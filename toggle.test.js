const assert = require('assert'); const { loadPage, sleep } = require('./page');
(async () => {
  let w = loadPage().window, doc = w.document, b = doc.getElementById('theme');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(b.textContent), 'no emoji'); assert.strictEqual(b.querySelectorAll('svg').length, 2);
  assert.strictEqual(b.getAttribute('aria-label'), 'Switch to dark mode');
  let calls = 0;
  w = loadPage({ pre: x => { x.document.startViewTransition = fn => { calls++; fn(); return {}; }; } }).window; doc = w.document;
  doc.getElementById('theme').click(); assert.strictEqual(calls, 1); assert.strictEqual(doc.documentElement.getAttribute('data-theme'), 'dark');
  assert.strictEqual(doc.getElementById('theme').getAttribute('aria-label'), 'Switch to light mode'); assert.ok(!doc.documentElement.classList.contains('theme-fade'));
  w = loadPage().window; doc = w.document; doc.getElementById('theme').click();
  assert.ok(doc.documentElement.classList.contains('theme-fade')); assert.strictEqual(doc.documentElement.getAttribute('data-theme'), 'dark');
  await sleep(500); assert.ok(!doc.documentElement.classList.contains('theme-fade')); assert.strictEqual(w.localStorage.getItem('kdw-theme'), 'dark');
  calls = 0;
  w = loadPage({ pre: x => { x.matchMedia = q => ({ matches: /reduce/.test(q) }); x.document.startViewTransition = fn => { calls++; fn(); }; } }).window; doc = w.document;
  doc.getElementById('theme').click(); assert.strictEqual(calls, 0); assert.ok(!doc.documentElement.classList.contains('theme-fade')); assert.strictEqual(doc.documentElement.getAttribute('data-theme'), 'dark');
  console.log('toggle ui: passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
