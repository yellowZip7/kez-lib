const { JSDOM } = require('jsdom'), fs = require('fs'), path = require('path');
const sample = (title, synopsis, watchUrl, service) => ({ title, poster: '', synopsis, watchUrl, service });
const SAMPLE = [
  sample('Sample Drama One', 'Replace this with the story summary. Two rivals.', 'https://www.viki.com', 'Viki'),
  sample('Sample Drama Two', 'A small-town doctor.', 'https://www.netflix.com', 'Netflix'),
  sample('Sample Drama Three', 'A time-slip romance.', 'https://www.kanopy.com', 'Kanopy'),
  sample('Sample Drama Four', 'Chefs and rivals.', 'https://www.viki.com', 'Viki'),
  sample('Sample Drama Five', 'A detective duo.', 'https://www.netflix.com', 'Netflix'),
  sample('Sample Drama Six', 'A cozy slice-of-life.', '', ''),
];
function loadPage(opts = {}) {
  let html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const shows = opts.codeShows || SAMPLE;
  const before = html;
  html = html.replace(/const SHOWS = \[[\s\S]*?\];/, () => 'const SHOWS = ' + JSON.stringify(shows) + ';');
  if (html === before && JSON.stringify(shows) !== '[]') throw new Error('SHOWS block not found');
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://x.test/',
    beforeParse(w) {
      w.fetch = opts.fetch || (() => Promise.reject(new Error('offline')));
      if (opts.pre) opts.pre(w);
    },
  });
}
// A pretend /api/shows. modes: ok | down | html404 | html200 | throttle | readonly | reject
function fakeApi({ pass = 'pw', shows = [], mode = 'ok' } = {}) {
  const db = new Map(shows.map(s => [s.id, s])); const calls = [];
  const res = (status, body) => Promise.resolve({ status, ok: status < 400, json: () => (body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body)) });
  const api = { db, calls, mode, pass, fetch(url, opts = {}) {
    const u = new URL(url, 'https://x.test'), method = opts.method || 'GET', h = opts.headers || {};
    calls.push({ method, url: String(url), pass: h['x-passcode'] || null, body: opts.body ? JSON.parse(opts.body) : null });
    if (api.mode === 'down') return Promise.reject(new Error('offline'));
    if (api.mode === 'html404') return res(404);
    if (api.mode === 'html200') return res(200);
    if (api.mode === 'throttle') return res(429, { error: 'Too many tries.' });
    if (api.pass && h['x-passcode'] !== api.pass) return res(401, { error: 'Wrong passcode.' });
    if (method === 'GET') return res(200, { shows: [...db.values()] });
    if (api.mode === 'readonly') return res(500, { error: 'read only' });
    if (api.mode === 'reject') return res(400, { error: 'bad' });
    if (method === 'PUT') { const s = JSON.parse(opts.body).show; db.set(s.id, s); return res(200, { show: s }); }
    if (method === 'DELETE') { db.delete(u.searchParams.get('id')); return res(200, { ok: true }); }
    return res(405, { error: 'no' });
  } };
  return api;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 1500) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(10); } throw new Error('timed out waiting for: ' + fn); }
module.exports = { loadPage, fakeApi, sleep, until, SAMPLE };
