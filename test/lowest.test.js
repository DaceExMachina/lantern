// The lowest point SVG markup draws (test/lowest.js), against answers worked out by hand.
const test = require('node:test');
const assert = require('node:assert');
const { lowestY, lowest } = require('./lowest');

const near = (got, want, what, within = 1e-9) => assert.ok(Math.abs(got - want) < within, `${what}: ${got}, not ${want}`);
const d = p => lowestY('path', { d: p });

test('path curves reach their true lowest point, between their ends or at one', () => {
  near(d('M0 0Q50 100 100 0'), 50, 'a quadratic peaks halfway to its control');
  near(d('M0 0C0 100 100 100 100 0'), 75, 'a symmetric cubic peaks at 3/4 of its controls');
  near(d('M0 0C0 -10 10 -10 10 5'), 5, 'a cubic rising away from its end is lowest at the end');
  near(d('M0 540S340 900 680 540'), 700, 'S with no curve before it takes its first control at the current point');
  near(d('M0 0C0 0 50 -100 100 0S150 100 200 0'), 75, 'S reflects the previous control point');
  near(d('M0 0Q50 -100 100 0T200 0'), 50, 'T reflects the previous control point');
  near(d('M0 0q50 100 100 0'), 50, 'relative');
  near(d('M0 0h10v10zm0 600h10v10z'), 610, 'a relative move after Z starts from the subpath\'s start');
  near(d('M0 0H10V20L5 7Z'), 20, 'H and V');
  near(d('M0 0L10 10 20 30'), 30, 'a move\'s or line\'s extra pairs are lines');
});

test('arcs are converted from endpoint form as SVG says', () => {
  near(d('M0 549A1 1 0 0 0 100 549'), 599, 'radii too small for the chord grow to fit');
  near(d('M0 549A1 1 0 0 1 100 549'), 549, 'the other sweep bows up');
  near(d('M0 549A5 5 0 1 0 1 549'), 549 + Math.sqrt(24.75) + 5, 'a large arc reaches round the far side');
  near(d('M0 549A5 5 0 0 0 1 549'), 549 + 5 - Math.sqrt(24.75), 'its small arc stays near the chord');
  near(d('M0 0A10 20 90 0 0 0 40'), 40, 'turned, with its lowest point at an end');
  near(d('M0 0A20 10 0 1 0 0 0.000001'), 10, 'a near-full ellipse, centred beside its ends', 1e-5);
  assert.throws(() => d('M0 0A5 5 0 2 0 10 0'), /flags/, 'a flag other than 0 or 1');
});

test('basic shapes, with missing attributes at their SVG defaults', () => {
  near(lowestY('rect', { x: '0', width: '680', height: '700' }), 700, 'a rect with no y starts at 0');
  near(lowestY('rect', { width: '10', height: '10', transform: 'translate(0 600)' }), 610, 'a translated rect');
  near(lowestY('rect', { width: '10', height: '10', transform: 'rotate(45)' }), 10 * Math.SQRT2, 'a rect turned on its corner');
  near(lowestY('rect', { width: '10', height: '10', rx: '5', transform: 'rotate(45)' }), 5 * Math.SQRT2 + 5, 'a fully rounded one is a circle');
  near(lowestY('polygon', { points: '0 560 680 560 680 700 0 700' }), 700, 'a polygon');
  near(lowestY('polyline', { points: '0,1 5,9 9,2' }), 9, 'a polyline');
  near(lowestY('line', { x1: '0', y1: '0', x2: '680', y2: '600' }), 600, 'a line');
  near(lowestY('line', { y1: '-5' }), 0, 'a line\'s missing ends are at 0');
  near(lowestY('circle', { r: '5' }), 5, 'a circle at the origin');
  near(lowestY('ellipse', { cx: '1', cy: '2', rx: '10', ry: '3', transform: 'rotate(90)' }), 10 + 1, 'an ellipse turned on its side');
  near(lowestY('ellipse', { rx: '10', ry: '3', transform: 'matrix(1 0.5 0 1 0 0)' }), Math.hypot(5, 3), 'a sheared ellipse');
  assert.strictEqual(lowestY('ellipse', { rx: '10' }), -Infinity, 'an ellipse with no ry draws nothing');
  assert.throws(() => lowestY('text', {}), /lowestY knows/, 'an element it doesn\'t know');
  assert.throws(() => lowestY('rect', { width: '1', height: '1', transform: 'perspective(3)' }), /transform/, 'a transform it doesn\'t know');
  assert.throws(() => lowestY('rect', { width: '1', height: '1', y: '1em' }), /not understood/, 'a length it can\'t read');
});

test('markup: transforms on groups compose, <use> draws what it refers to, nothing in <defs> draws itself', () => {
  near(lowest('<g transform="translate(0 100)"><g transform="scale(2)"><rect height="5" width="1"/></g></g>'), 110, 'nested groups');
  near(lowest('<defs><g id="dot"><circle r="5"/></g><rect width="1" height="900"/></defs><use href="#dot" x="0" y="20"/>'), 25, '<use>');
  near(lowest('<g transform="rotate(90)"><path d="M0 0H30"/></g><!-- a <rect> in a comment draws nothing -->'), 30, 'a turned group');
  assert.throws(() => lowest('<g><foo/></g>'), /lowestY knows/, 'an element it doesn\'t know');
  assert.throws(() => lowest('<use href="#nothing"/>'), /refers to nothing/, 'a <use> of nothing');
  assert.throws(() => lowest('<g><rect width="1" height="1"/>'), /markup/, 'an unclosed group');
});
