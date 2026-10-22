// UI chrome (the footer, menus, cards, stats, recap, tips, dev panel and flash pill) takes its colours, spacing, radii,
// type, shadows and layers from the design tokens in index.html's :root, so agents can't drift into one-off values.
// Scene art (the lanterns, moths, fireflies, wisps, smoke and shaders) keeps its own palettes in the SCENE scripts.
// See "Design tokens" in CONTRIBUTING.md.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..'), PAGE = path.join(ROOT, 'public', 'page');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const UI = ['card.js', 'dev.js', 'github.js', 'main.js', 'notify.js', 'recap.js', 'stats.js'];
const SCENE = ['background.js', 'fireflies.js', 'flash.js', 'frame.js', 'lanterns.js', 'pages.js', 'pencil.js', 'scene.js', 'stale.js', 'state.js'];

const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i;
const SIZED = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|border-radius|font-size|font|box-shadow|backdrop-filter)(?:-[a-z-]+)?$/;
// whether a declaration needs a token: a raw colour anywhere, a px value in spacing, radius, type or shadow, or a bare
// weight or layer number
const raw = (prop, value) => RAW_COLOUR.test(value) || SIZED.test(prop) && /(?<![\w.-])-?\d*\.?\d+px\b/.test(value)
  || prop === 'font-weight' && /^(?:\d+|normal|bold)$/.test(value) || prop === 'z-index' && /^-?\d+$/.test(value);
const declarations = body => body.split(';').map(d => d.split(':')).filter(d => d.length > 1).map(([p, ...v]) => [p.trim(), v.join(':').trim()]);

// What's left to migrate. It only shrinks: an entry that no longer has a raw value fails too, so delete it.
const DEBT = new Set(require('./tokens-debt.json'));

// Every place with a raw value: CSS rules outside :root by selector, style attributes in index.html outside the scene's
// SVG, and colours or sized CSS strings in the UI scripts.
function offenders() {
  const found = new Set();
  for (const [, sel, body] of style.replace(/:root\s*\{[^}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (declarations(body).some(([p, v]) => raw(p, v))) found.add(sel.trim().replace(/\s+/g, ' '));
  for (const [, attr] of html.split('</style>')[1].replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/style="([^"]*)"/g))
    if (declarations(attr).some(([p, v]) => raw(p, v))) found.add(`index.html style="${attr}"`);
  for (const file of UI) {
    const src = fs.readFileSync(path.join(PAGE, file), 'utf8').replace(/^\s*\/\/.*$|\s\/\/\s.*$/gm, '');
    for (const [c] of src.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\([^)]*\)/gi)) found.add(`${file} ${c}`);
    for (const [d, p, v] of src.matchAll(/\b([a-z-]+)\s*:\s*([^;'"`{}]*px[^;'"`{}]*)/g)) if (raw(p, v.trim())) found.add(`${file} ${d.trim()}`);
  }
  return found;
}

test('UI chrome uses the design tokens, not raw colours or sizes', () => {
  const found = offenders();
  const fresh = [...found].filter(k => !DEBT.has(k)), clean = [...DEBT].filter(k => !found.has(k));
  assert.deepStrictEqual(fresh, [], 'use a token from :root in index.html (or add one there and to CONTRIBUTING.md), not a raw value');
  assert.deepStrictEqual(clean, [], 'these are migrated now: delete them from test/tokens-debt.json');
});

test('every page script is either UI chrome or scene art', () => {
  const files = fs.readdirSync(PAGE).filter(f => f.endsWith('.js')).sort();
  assert.deepStrictEqual([...UI, ...SCENE].sort(), files, 'add the new script to UI or SCENE in test/tokens.test.js');
});

test('the state and PR tokens are the colours the scene draws', () => {
  const tokens = Object.fromEntries([...html.match(/:root\s*\{([^}]*)\}/)[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const stub = () => ({ addEventListener() {}, classList: { toggle() {} } });
  const page = vm.createContext({ URLSearchParams, location: { search: '' }, performance, document: { getElementById: stub, querySelectorAll: () => [] } });
  for (const f of ['scene', 'dev', 'lanterns', 'state', 'stats', 'fireflies']) vm.runInContext(fs.readFileSync(path.join(PAGE, f + '.js'), 'utf8'), page, { filename: f + '.js' });
  const js = vm.runInContext(`({ '--state-working': MOTHS.working, '--state-waiting': MOTHS.waiting, '--state-snoozed': MOTHS.snoozed, '--state-idle': MOTHS.idle,
    '--lantern-warm': RIBBON.warm, '--lantern-violet': RIBBON.violet, '--lantern-quiet': RIBBON.quiet, '--accent-warm': WARM.mid,
    '--pr-ready': FLY.ready, '--pr-failing': FLY.failing, '--pr-changes': FLY.changes, '--pr-draft': FLY.draft,
    '--pr-in-review': FLY.quiet, '--pr-review': FLY.review, '--pr-mention': FLY.mention })`, page);
  for (const [token, colour] of Object.entries(js)) assert.strictEqual(tokens[token]?.toUpperCase(), colour.toUpperCase(), `${token} in index.html's :root`);
});
