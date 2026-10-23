// The page in happy-dom, for the Vitest tests: index.html's markup, and a stand-in WebGL that compiles anything and keeps
// the last value each uniform was set to (gl.uniforms, by name). test/setup.js lays the page out before each test file,
// so a test that imports src/ statically gets the page as it first loads. A test that needs a page of its own (another
// query string, or state no other test touched) calls layOut(search) and vi.resetModules(), then imports src/ afresh.
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.html'), 'utf8').replace(/<script[^]*?<\/script>/g, '');
export function layOut(search = '') {
  history.replaceState(null, '', `/${search}`);
  document.documentElement.innerHTML = html;
}

// each program's uniforms are listed from its shaders' source
const sources = [];
const recorded = {
  getShaderParameter: () => true, getProgramParameter: () => 64, isContextLost: () => false,
  shaderSource: (_, src) => sources.push(src),
  createProgram: () => { sources.length = 0; return {}; },
  getActiveUniform: (_, i) => {
    const names = (sources.join('\n').match(/uniform\s+\w+\s+[^;]+;/g) ?? []).flatMap(d => d.replace(/uniform\s+\w+\s+/, '').replace(';', '').split(',').map(n => n.trim().replace(/\[.*/, '[0]')));
    return { name: names[i] ?? `unused${i}` };
  },
  getUniformLocation: (_, name) => name,
};
export const gl = new Proxy(Object.assign(recorded, { uniforms: {} }), {
  get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.startsWith('uniform') ? (loc, ...v) => { t.uniforms[loc] = v.length === 1 && v[0]?.length ? [...v[0]] : v; } : () => ({}),
});
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl' ? gl : getContext.call(this, type, ...rest); };

// happy-dom has no 2d canvas: a test whose page draws text calls this for a context that accepts anything
// (and returns the log of what it was asked). It lasts until vi.restoreAllMocks() and vi.unstubAllGlobals().
export function stubCanvas2d() {
  const webgl = HTMLCanvasElement.prototype.getContext, calls = [], anything = new Proxy(function () {}, { get: (_, k) => k === Symbol.toPrimitive ? () => 10 : (calls.push(k), anything), apply: () => anything });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type, ...rest) { return type === '2d' ? anything : webgl.call(this, type, ...rest); });
  vi.stubGlobal('Path2D', class {});
  return calls; // the names of everything asked of any 2d context
}
