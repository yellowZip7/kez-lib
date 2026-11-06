const assert = require('assert');
const { loadLogic, ev, evj } = require('./helpers');
const c = loadLogic();
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const J = JSON.stringify;
const norm = raw => evj(c, 'normalizeLink(' + J(raw) + ')');
const val = (inp, ex = [], id = null) => evj(c, 'validateShowInput(' + J(inp) + ',' + J(ex) + ',' + J(id) + ')');
const ok = { title: 'Show', service: '', watchUrl: '', synopsis: '', poster: '', status: 'Up next' };
const show = (id, title) => ({ id, title, service: '', watchUrl: '', synopsis: '', poster: '', status: 'Up next', addedAt: 1 });

t('link without scheme gets https://', () => assert.deepStrictEqual(norm('viki.com/x'), { ok: true, url: 'https://viki.com/x' }));
t('link with scheme is unchanged', () => assert.strictEqual(norm('HTTPS://x.com').url, 'HTTPS://x.com'));
t('app link scheme is accepted', () => assert.strictEqual(norm('netflix://title/1').ok, true));
t('empty link is fine', () => assert.deepStrictEqual(norm(''), { ok: true, url: '' }));
t('dangerous schemes are blocked in any disguise', () => ['  JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,hi', 'vbscript:x', 'jav\nascript:1'].forEach(x => assert.strictEqual(norm(x).ok, false, x)));
t('whitespace-only title rejected', () => assert.ok(val({ ...ok, title: '   ' }).errors.title));
t('duplicate title differing in case/spacing rejected', () => assert.ok(val({ ...ok, title: '  sample DRAMA ' }, [show('aaaaaaaa', 'Sample Drama')]).errors.title));
t('editing a show may keep its own title', () => assert.strictEqual(val({ ...ok, title: 'Sample Drama' }, [show('aaaaaaaa', 'Sample Drama')], 'aaaaaaaa').ok, true));
t('over-long title / synopsis / service / link each error', () => {
  assert.ok(val({ ...ok, title: 'x'.repeat(101) }).errors.title);
  assert.ok(val({ ...ok, synopsis: 'x'.repeat(601) }).errors.synopsis);
  assert.ok(val({ ...ok, service: 'x'.repeat(41) }).errors.service);
  assert.ok(val({ ...ok, watchUrl: 'a.com/' + 'x'.repeat(500) }).errors.watchUrl);
});
t('poster must be a small jpeg data URI', () => {
  assert.ok(val({ ...ok, poster: 'data:image/png;base64,AA' }).errors.poster);
  assert.ok(val({ ...ok, poster: 'data:image/jpeg;base64,' + 'A'.repeat(40000) }).errors.poster);
  assert.strictEqual(val({ ...ok, poster: 'data:image/jpeg;base64,AAAA' }).ok, true);
});
t('201st show is blocked, edits are not', () => {
  const many = Array.from({ length: 200 }, (_, i) => show('id' + String(i).padStart(8, '0'), 'T' + i));
  assert.ok(val({ ...ok, title: 'New' }, many).errors.limit);
  assert.strictEqual(val({ ...ok, title: 'T1' }, many, 'id00000001').ok, true);
});
t('values are trimmed, status defaults', () => { const r = val({ title: '  A  ', service: ' V ', watchUrl: ' viki.com ', synopsis: ' s ', poster: '' }); assert.deepStrictEqual(r.value, { title: 'A', service: 'V', watchUrl: 'https://viki.com', synopsis: 's', poster: '', status: 'Up next', fromBaba: false, note: '' }); });
t('newId matches the id pattern and differs', () => { const a = ev(c, 'newId()'), b = ev(c, 'newId()'); assert.ok(/^[a-z0-9-]{8,40}$/.test(a)); assert.notStrictEqual(a, b); });
t('del then put same id ends present; put edits; del removes server row', () => {
  const s = [show('aaaaaaaa', 'A'), show('bbbbbbbb', 'B')];
  const edited = { ...show('aaaaaaaa', 'A2') };
  let r = evj(c, 'mergeShows(' + J(s) + ',' + J([{ type: 'del', id: 'aaaaaaaa' }, { type: 'put', show: show('aaaaaaaa', 'A') }]) + ')');
  assert.deepStrictEqual(r.map(x => x.id), ['bbbbbbbb', 'aaaaaaaa']);
  r = evj(c, 'mergeShows(' + J(s) + ',' + J([{ type: 'put', show: edited }]) + ')');
  assert.strictEqual(r.find(x => x.id === 'aaaaaaaa').title, 'A2');
  r = evj(c, 'mergeShows(' + J(s) + ',' + J([{ type: 'del', id: 'bbbbbbbb' }]) + ')');
  assert.deepStrictEqual(r.map(x => x.id), ['aaaaaaaa']);
});
t('merge and applyOp do not mutate their inputs', () => assert.strictEqual(ev(c, '(() => { const a = [{id:"x"}]; const before = JSON.stringify(a); mergeShows(a, [{type:"del",id:"x"},{type:"put",show:{id:"y"}}]); applyOp(a, {type:"del",id:"x"}); return JSON.stringify(a) === before; })()'), true));
console.log(n + '/' + n + ' passed');
t('Baba picks keep their flag and note', () => { const r = val({ title: 'P', fromBaba: true, note: ' hi ' }); assert.strictEqual(r.value.fromBaba, true); assert.strictEqual(r.value.note, 'hi'); });
t('a note over 300 characters is rejected', () => { const r = val({ title: 'P', note: 'x'.repeat(301) }); assert.ok(r.errors && r.errors.note); });
