// How low SVG markup draws: the largest y (SVG's y runs down) of every shape it renders, for tests that check what sits
// below what. It follows SVG 1.1: every path command, absolute and relative, with arcs converted from endpoint to centre
// form as the implementation notes say (F.6.5, F.6.6, https://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes);
// the basic shapes with missing attributes defaulting as SVG says; `transform` on an element and its ancestors; and <use>
// of an element by id. Markup, an element or a transform it doesn't know throws. Stroke width is not counted.
'use strict';

const I = [1, 0, 0, 1, 0, 0];
// matrices as SVG writes them, [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f
const mul = ([a, b, c, d, e, f], [A, B, C, D, E, F]) => [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
const nums = s => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);

function transform(text) {
  let m = I, at = 0;
  const step = /\s*,?\s*(\w+)\s*\(([^)]*)\)/y;
  while (text.slice(at).trim()) {
    step.lastIndex = at;
    const t = step.exec(text);
    if (!t) throw new Error(`transform not understood: "${text}"`);
    at = step.lastIndex;
    const v = nums(t[2]), rad = (v[0] || 0) * Math.PI / 180;
    const own = {
      matrix: () => v.length === 6 && v,
      translate: () => v.length && v.length <= 2 && [1, 0, 0, 1, v[0], v[1] || 0],
      scale: () => v.length && v.length <= 2 && [v[0], 0, 0, v[1] ?? v[0], 0, 0],
      rotate: () => (v.length === 1 || v.length === 3) && mul(mul([1, 0, 0, 1, v[1] || 0, v[2] || 0],
        [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]), [1, 0, 0, 1, -(v[1] || 0), -(v[2] || 0)]),
      skewX: () => v.length === 1 && [1, 0, Math.tan(rad), 1, 0, 0],
      skewY: () => v.length === 1 && [1, Math.tan(rad), 0, 1, 0, 0],
    }[t[1]]?.();
    if (!own) throw new Error(`transform not understood: "${t[0].trim()}"`);
    m = mul(m, own);
  }
  return m;
}

// Highest y (largest value) of a quadratic or cubic Bézier given its control values along y.
function quadratic([a, b, c]) {
  const den = a - 2 * b + c, t = den ? (a - b) / den : -1;
  return Math.max(a, c, t > 0 && t < 1 ? (1 - t) ** 2 * a + 2 * t * (1 - t) * b + t * t * c : -Infinity);
}
function cubic([a, b, c, d]) {
  const at = t => (1 - t) ** 3 * a + 3 * t * (1 - t) ** 2 * b + 3 * t * t * (1 - t) * c + t ** 3 * d;
  // the derivative's roots: A t² + B t + C = 0
  const A = (b - a) - 2 * (c - b) + (d - c), B = 2 * ((c - b) - (b - a)), C = b - a;
  let ts = [];
  if (Math.abs(A) < 1e-12) { if (B) ts = [-C / B]; } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) ts = [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)];
  }
  return Math.max(a, d, ...ts.filter(t => t > 0 && t < 1).map(at));
}
// Highest y of an ellipse centred (cx, cy), radii rx and ry, turned phi, through M, over angles from t1 sweeping dt
// (the whole ellipse when dt is null).
function ellipse(M, cx, cy, rx, ry, phi, t1 = 0, dt = null) {
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const A = (M[1] * cos + M[3] * sin) * rx, B = (M[3] * cos - M[1] * sin) * ry, K = M[1] * cx + M[3] * cy + M[5];
  const top = K + Math.hypot(A, B);
  if (dt === null) return top;
  const at = t => K + A * Math.cos(t) + B * Math.sin(t), best = Math.atan2(B, A), TAU = 2 * Math.PI;
  const into = ((dt >= 0 ? best - t1 : t1 - best) % TAU + TAU) % TAU; // how far along the sweep's direction it lies
  return into <= Math.abs(dt) ? top : Math.max(at(t1), at(t1 + dt));
}
// Highest y of an arc from (x1, y1) to (x2, y2) in SVG's endpoint form, through M.
function arc(M, x1, y1, rx, ry, deg, large, sweep, x2, y2) {
  const Y = (x, y) => M[1] * x + M[3] * y + M[5];
  if (x1 === x2 && y1 === y2) return Y(x1, y1); // F.6.2: the arc is omitted
  if (!rx || !ry) return Math.max(Y(x1, y1), Y(x2, y2)); // a straight line
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = deg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const hx = (x1 - x2) / 2, hy = (y1 - y2) / 2, xp = cos * hx + sin * hy, yp = -sin * hx + cos * hy;
  const scale = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (scale > 1) { rx *= Math.sqrt(scale); ry *= Math.sqrt(scale); } // F.6.6: radii too small for the chord grow to fit
  const k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
  const t1 = angle(1, 0, ux, uy);
  let dt = angle(ux, uy, vx, vy) % (2 * Math.PI);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  return Math.max(ellipse(M, cx, cy, rx, ry, phi, t1, dt), Y(x1, y1), Y(x2, y2));
}

const SIZE = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
function path(d, M) {
  const Y = (x, y) => M[1] * x + M[3] * y + M[5];
  if (/[^MmLlHhVvCcSsQqTtAaZz\d\s,.eE+-]/.test(d) || (d.trim() && !/^\s*[Mm]/.test(d))) throw new Error(`path data not understood: "${d}"`);
  let low = -Infinity, x = 0, y = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
  for (const seg of d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || []) {
    const c = seg[0], C = c.toUpperCase(), rel = c !== C, v = nums(seg.slice(1)), n = SIZE[C];
    if (C === 'Z') { [x, y] = [sx, sy]; lastC = lastQ = null; continue; } // back to the subpath's start
    if (!v.length || v.length % n) throw new Error(`path data not understood: "${seg}"`);
    for (let i = 0; i < v.length; i += n) {
      const g = v.slice(i, i + n), ox = rel ? x : 0, oy = rel ? y : 0, pt = j => [g[j] + ox, g[j + 1] + oy];
      const from = [x, y], mirror = p => p ? [2 * x - p[0], 2 * y - p[1]] : [x, y];
      let c2 = null, q1 = null, to;
      if (C === 'M' || C === 'L' || C === 'T') to = pt(0);
      else if (C === 'H') to = [g[0] + ox, y];
      else if (C === 'V') to = [x, g[0] + oy];
      else if (C === 'C' || C === 'S') {
        const c1 = C === 'C' ? pt(0) : mirror(lastC);
        c2 = pt(C === 'C' ? 2 : 0); to = pt(C === 'C' ? 4 : 2);
        low = Math.max(low, cubic([Y(...from), Y(...c1), Y(...c2), Y(...to)]));
      } else if (C === 'Q') {
        q1 = pt(0); to = pt(2);
        low = Math.max(low, quadratic([Y(...from), Y(...q1), Y(...to)]));
      } else { // A
        if (![g[3], g[4]].every(f => f === 0 || f === 1)) throw new Error(`arc flags not understood: "${seg}"`);
        to = pt(5);
        low = Math.max(low, arc(M, x, y, g[0], g[1], g[2], g[3], g[4], ...to));
      }
      if (C === 'T') { q1 = mirror(lastQ); low = Math.max(low, quadratic([Y(...from), Y(...q1), Y(...to)])); }
      [x, y] = to;
      if (C === 'M' && i === 0) [sx, sy] = to;
      low = Math.max(low, Y(x, y));
      lastC = c2; lastQ = q1;
    }
  }
  return low;
}

// The lowest y one element draws, through M, from its tag and attributes (its own `transform` included); its children
// and <use> are the markup walk's.
function lowestY(tag, attrs, M = I) {
  if (attrs.transform) M = mul(M, transform(attrs.transform));
  const num = k => (k in attrs ? Number(attrs[k]) : 0);
  for (const [k, v] of Object.entries(attrs)) if (/^(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height)$/.test(k) && !Number.isFinite(Number(v))) throw new Error(`${tag} ${k}="${v}" not understood`);
  const Y = (x, y) => M[1] * x + M[3] * y + M[5];
  switch (tag) {
    case 'path': return path(attrs.d || '', M);
    case 'rect': {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map(num);
      if (w <= 0 || h <= 0) return -Infinity; // nothing drawn
      let rx = 'rx' in attrs ? num('rx') : num('ry'), ry = 'ry' in attrs ? num('ry') : num('rx');
      rx = Math.min(Math.abs(rx), w / 2); ry = Math.min(Math.abs(ry), h / 2);
      if (!rx || !ry) return Math.max(Y(x, y), Y(x + w, y), Y(x, y + h), Y(x + w, y + h));
      return path(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
        + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`, M);
    }
    case 'circle': return num('r') > 0 ? ellipse(M, num('cx'), num('cy'), num('r'), num('r'), 0) : -Infinity;
    case 'ellipse': return num('rx') > 0 && num('ry') > 0 ? ellipse(M, num('cx'), num('cy'), num('rx'), num('ry'), 0) : -Infinity;
    case 'line': return Math.max(Y(num('x1'), num('y1')), Y(num('x2'), num('y2')));
    case 'polyline': case 'polygon': {
      const v = nums(attrs.points || '');
      if (v.length % 2) throw new Error(`${tag} points="${attrs.points}" not understood`);
      return Math.max(...Array.from({ length: v.length / 2 }, (_, i) => Y(v[2 * i], v[2 * i + 1])));
    }
    default: throw new Error(`<${tag}> isn't a shape lowestY knows`);
  }
}

// Elements that are never drawn where they stand (only through a reference to them, or not at all).
const UNDRAWN = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'filter', 'symbol', 'title', 'desc']);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

// Parse markup into a tree of { tag, attrs, children, parent }.
function parse(markup) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let node = root, at = 0;
  const text = markup.replace(/<!--[\s\S]*?-->/g, '');
  const tag = /<(\/?)([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  for (let m; (m = tag.exec(text));) {
    if (text.slice(at, m.index).includes('<')) throw new Error(`markup not understood near "${text.slice(at, at + 60)}"`);
    at = tag.lastIndex;
    const [, close, name, attrText, selfClose] = m;
    if (close) {
      if (node.tag !== name) throw new Error(`</${name}> closes <${node.tag}>`);
      node = node.parent;
      continue;
    }
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(a => [a[1], a[2]]));
    const child = { tag: name, attrs, children: [], parent: node };
    node.children.push(child);
    if (!selfClose) node = child;
  }
  if (text.slice(at).includes('<') || node !== root) throw new Error('markup not understood at its end');
  return root;
}

// Every shape the markup draws, as { node, low }: `node` is the element drawn where it stands (for a <use>, the <use>),
// so a caller can ask which group it sits in through node.parent.
function drawn(markup) {
  const root = parse(markup), ids = new Map(), out = [];
  (function index(n) { if (n.attrs.id) ids.set(n.attrs.id, n); n.children.forEach(index); })(root);
  const walk = (n, M, as, depth) => {
    if (depth > 20) throw new Error('<use> nested too deep');
    if (UNDRAWN.has(n.tag) && n !== as.ref) return;
    const own = n.attrs.transform ? mul(M, transform(n.attrs.transform)) : M;
    const node = as.node || n;
    if (SHAPES.has(n.tag)) out.push({ node, low: lowestY(n.tag, n.attrs, M) });
    else if (n.tag === 'use') {
      const href = n.attrs.href || n.attrs['xlink:href'] || '', ref = ids.get(href.slice(1));
      if (!href.startsWith('#') || !ref) throw new Error(`<use href="${href}"> refers to nothing here`);
      walk(ref, mul(own, [1, 0, 0, 1, Number(n.attrs.x || 0), Number(n.attrs.y || 0)]), { node: as.node || n, ref }, depth + 1);
    } else if (n.tag === 'g' || n.tag === '#root' || n === as.ref) n.children.forEach(c => walk(c, own, { node: as.node, ref: null }, depth));
    else throw new Error(`<${n.tag}> isn't an element lowestY knows`);
  };
  walk(root, I, { node: null, ref: null }, 0);
  return out;
}

const lowest = markup => Math.max(-Infinity, ...drawn(markup).map(d => d.low));

module.exports = { lowestY, drawn, lowest, transform };
