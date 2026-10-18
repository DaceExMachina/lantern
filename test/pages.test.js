// The barrel's session text (page/pages.js) is printed onto one canvas covering PAPER, so that box has to cover all the
// paper the barrel shows, or words would stop short of its edges.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const measure = { font: '', measureText: t => ({ width: t.length * 0.5 * parseFloat(measure.font) }) }; // about half an em a glyph
const page = vm.createContext({
  URLSearchParams, location: { search: '' }, performance, setInterval: () => 0, clearInterval: () => {},
  document: { createElement: () => ({ getContext: () => measure }) },
});
for (const f of ['scene', 'lanterns', 'pages']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'page', f + '.js'), 'utf8'), page, { filename: f + '.js' });
const run = code => vm.runInContext(code, page);

test('the session text canvas covers the whole of the barrel paper', () => {
  // the paper's outline is one M and then Q curves: check each curve's ends and middle
  const { x, y, w, h } = run('PAPER'), [start, ...curves] = run('ODAWARA.outline').split(/[QZ]/).map(part => part.match(/-?[\d.]+/g)?.map(Number)).filter(Boolean);
  let [x0, y0] = start;
  assert.ok(curves.length > 20);
  for (const [cx, cy, x1, y1] of curves) {
    for (const [px, py] of [[x0, y0], [(x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4]]) {
      assert.ok(px >= x && px <= x + w && py >= y && py <= y + h, `the paper's edge at ${px}, ${py} is off the canvas`);
    }
    [x0, y0] = [x1, y1];
  }
});
