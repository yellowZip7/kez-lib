const fs = require('fs'), vm = require('vm'), path = require('path');
function logicSource() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('logic script missing');
  return m[1];
}
const mem = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, _d: d }; };
function loadLogic(opts = {}) {
  const ctx = vm.createContext({ localStorage: opts.localStorage || mem(), sessionStorage: opts.sessionStorage || mem() });
  vm.runInContext(logicSource(), ctx);
  return ctx;
}
const ev = (c, s) => vm.runInContext(s, c);
const evj = (c, s) => JSON.parse(ev(c, 'JSON.stringify(' + s + ')'));
module.exports = { loadLogic, ev, evj, mem };
