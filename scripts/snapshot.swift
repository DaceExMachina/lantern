// Deterministic pictures of the lanterns, for checking that a refactor changes nothing you can see.
//   swift scripts/snapshot.swift shoot <checkout> <outdir>   renders each lantern from that checkout's index.html
//   swift scripts/snapshot.swift diff <dirA> <dirB>          compares two shoots pixel by pixel
// shoot loads the page in WebKit inside a borderless window far off screen that is never shown or activated, with
// Math.random seeded, a stepped clock, and a fake event stream (three sessions, one of them waiting, so its moth lands).
// For each lantern it writes <style>.png (the whole window at 2x), <style>-top.png and <style>-bottom.png (the caps at
// 4x) and <style>.json (the numbers moths and shadows read: style.body sampled, and style.caps).
import AppKit
import WebKit

let args = CommandLine.arguments
let STYLES = ["barrel", "chochin", "moroccan"]
let SIZE = NSSize(width: 640, height: 720)
// the caps, in the lantern's own units (the chōchin is drawn at 2.4x round x 340, so its caps land in the same boxes)
let CROPS = ["top": CGRect(x: 270, y: 178, width: 140, height: 56), "bottom": CGRect(x: 270, y: 430, width: 140, height: 56)]

// installed before any page script: everything that would differ between runs is pinned
let SHIM = """
(() => {
  let seed = 7, now = 1000;
  Math.random = () => { let t = seed = (seed + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const T0 = Date.UTC(2026, 9, 18, 15), RealDate = Date;
  performance.now = () => now;
  Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(T0 + now); } static now() { return T0 + now; } };
  window.requestAnimationFrame = () => 0; window.setInterval = () => 0; window.setTimeout = () => 0;
  window.fetch = () => new Promise(() => {});
  window.EventSource = class { constructor() { window.__es = this; this.on = {}; } addEventListener(t, f) { this.on[t] = f; } };
  window.__run = style => {
    applyStyle(style);
    const send = (type, data) => (type === 'message' ? __es.onmessage : __es.on[type])({ data: JSON.stringify(data) });
    send('settings', { style, github: false, graveyard: false, lanternText: 'off' });
    const s = (id, state, extra = {}) => ({ id, cwd: '/work/' + id, state, subagents: [], last: T0, activity: 'Working', ...extra });
    send('message', [s('alpha', 'working'), s('beta', 'working', { subagents: [{ id: 'a1', type: 'Explore' }] }), s('gamma', 'waiting', { waitingSince: T0 })]);
    for (let i = 0; i < 900; i++) { now += 1000 / 60; frame(now); } // 15 seconds: everyone has flown in, gamma has landed
    const body = style => { const { top, bottom, half } = STYLES[style].body; return { top, bottom, half: Array.from({ length: 21 }, (_, i) => half(top + (bottom - top) * i / 20)) }; };
    const at = $('lantern').getScreenCTM();
    return JSON.stringify({ body: body(style), caps: STYLES[style].caps ?? null, ctm: [at.a, at.e, at.f], landed: [...moths.values()].filter(m => m.wasLanded).length });
  };
})();
"""

func png(_ image: NSImage, _ path: String) {
  let rep = NSBitmapImageRep(cgImage: image.cgImage(forProposedRect: nil, context: nil, hints: nil)!)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

final class Shooter: NSObject, WKNavigationDelegate {
  let root: URL, out: String, window: NSWindow
  var web: WKWebView!, queue = STYLES
  init(root: String, out: String) {
    self.root = URL(fileURLWithPath: root, isDirectory: true); self.out = out
    window = NSWindow(contentRect: NSRect(origin: NSPoint(x: -30000, y: -30000), size: SIZE), styleMask: .borderless, backing: .buffered, defer: false)
    super.init()
    try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
    next()
  }
  func next() {
    guard !queue.isEmpty else { exit(0) }
    let config = WKWebViewConfiguration() // a fresh page per lantern, so each starts from the same seed and clock
    config.userContentController.addUserScript(WKUserScript(source: SHIM, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(origin: .zero, size: SIZE), configuration: config)
    web.navigationDelegate = self
    window.contentView = web // the window is never ordered in: it stays off screen and out of the way
    web.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    let style = queue.removeFirst()
    web.evaluateJavaScript("__run('\(style)')") { result, error in
      guard let json = result as? String else { fatalError("\(style): \(String(describing: error))") }
      try! json.write(toFile: "\(self.out)/\(style).json", atomically: true, encoding: .utf8)
      let info = try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any], ctm = info["ctm"] as! [Double]
      var shots: [(String, CGRect?, CGFloat)] = [(style, nil, 2)]
      for (name, r) in CROPS { // lantern units to CSS pixels
        shots.append(("\(style)-\(name)", CGRect(x: ctm[1] + ctm[0] * r.minX, y: ctm[2] + ctm[0] * r.minY, width: ctm[0] * r.width, height: ctm[0] * r.height), 4))
      }
      self.shoot(shots)
    }
  }
  func shoot(_ shots: [(String, CGRect?, CGFloat)]) {
    guard let (name, rect, scale) = shots.first else { return next() }
    let config = WKSnapshotConfiguration()
    if let rect { config.rect = rect }
    config.snapshotWidth = NSNumber(value: Double((rect?.width ?? SIZE.width) * scale / window.backingScaleFactor)) // in points
    web.takeSnapshot(with: config) { image, error in
      guard let image else { fatalError("\(name): \(String(describing: error))") }
      png(image, "\(self.out)/\(name).png")
      self.shoot(Array(shots.dropFirst()))
    }
  }
}

func pixels(_ path: String) -> (Int, Int, [UInt8]) {
  let image = NSImage(contentsOfFile: path)!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  let w = image.width, h = image.height
  var data = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  return (w, h, data)
}

switch args.count > 3 ? args[1] : "" {
case "shoot":
  NSApplication.shared.setActivationPolicy(.prohibited) // no Dock icon, never takes focus
  let shooter = Shooter(root: args[2], out: args[3])
  withExtendedLifetime(shooter) { NSApplication.shared.run() }
case "diff":
  for file in try! FileManager.default.contentsOfDirectory(atPath: args[2]).sorted() where file.hasSuffix(".png") {
    let (w, h, a) = pixels("\(args[2])/\(file)"), (w2, h2, b) = pixels("\(args[3])/\(file)")
    guard w == w2 && h == h2 else { print("\(file): sizes differ, \(w)x\(h) vs \(w2)x\(h2)"); continue }
    var worst = 0, count = 0
    for p in 0..<(w * h) {
      let d = (0..<4).map { abs(Int(a[p * 4 + $0]) - Int(b[p * 4 + $0])) }.max()!
      if d > 0 { count += 1; worst = max(worst, d) }
    }
    print("\(file): \(w)x\(h), \(count) pixels differ, the most by \(worst)/255")
  }
default:
  print("usage: swift scripts/snapshot.swift shoot <checkout> <outdir> | diff <dirA> <dirB>"); exit(1)
}
