// npm run snapshots [-- --update]: renders the page deterministically and compares it with test/snapshots/*.png.
// Each scene loads index.html in WebKit with test/snapshots/fixture.js injected (seeded random, a stepped clock, a fake
// event stream), inside a borderless window far off screen that is never shown or activated, so nothing appears or takes
// focus. A pixel differs when any channel is more than TOLERANCE off; any differing pixel fails, and the run writes the
// new picture and a diff (differences in red over a faded reference) to test/snapshots/out/. --update rewrites the
// references instead. macOS only, and the references come from a Retina Mac.
import AppKit
import WebKit

// each scene's name, page query and window size. The chrome scenes snap the menu, stats, recap, a card and the dev panel
// over the barrel: full width, a phone's width, and the iTerm2 panel's. The pinned scene docks two sessions in the sidebar in a
// window wide enough for it (card.js PIN_MIN), and checks the scene refitted to the room left.
let WIDE = NSSize(width: 720, height: 540)
let SCENES = [("barrel", "style=barrel&hover", WIDE), ("chochin", "style=chochin", WIDE), ("moroccan", "style=moroccan", WIDE), ("ambient", "style=barrel&ambient", WIDE), ("candle", "style=candle", WIDE),
  ("chrome", "style=barrel&chrome", WIDE), ("chrome375", "style=barrel&chrome", NSSize(width: 375, height: 700)), ("panel", "style=barrel&chrome&panel", NSSize(width: 300, height: 420)),
  ("pinned", "style=barrel&pinned", NSSize(width: 1100, height: 700))]
let FAR = NSScreen.screens.map(\.frame.maxX).max()! + 10000 // beyond every display, never on one (a negative origin once landed on the laptop screen)
let TOLERANCE = 2
let update = CommandLine.arguments.contains("--update")
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
let refs = root.appendingPathComponent("test/snapshots"), out = refs.appendingPathComponent("out")
let fixture = try! String(contentsOf: refs.appendingPathComponent("fixture.js"), encoding: .utf8)
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

// RGBA bytes in sRGB, whatever the image came as
func pixels(_ image: CGImage) -> [UInt8] {
  var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
  let ctx = CGContext(data: &data, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: image.width * 4, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  return data
}
func write(_ data: [UInt8], _ w: Int, _ h: Int, _ url: URL) {
  var data = data
  let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: url)
}

var failed = 0
func check(_ name: String, _ image: CGImage) {
  let w = image.width, h = image.height, now = pixels(image), ref = refs.appendingPathComponent("\(name).png")
  if update { return write(now, w, h, ref) }
  guard let old = NSImage(contentsOf: ref)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("\(name): no reference (npm run snapshots -- --update makes one)"); failed += 1; return
  }
  guard old.width == w && old.height == h else { print("\(name): \(w)x\(h), but the reference is \(old.width)x\(old.height)"); failed += 1; return }
  let was = pixels(old)
  var diff = [UInt8](repeating: 255, count: w * h * 4), count = 0
  for p in 0..<(w * h) {
    let off = (0..<4).contains { abs(Int(was[p * 4 + $0]) - Int(now[p * 4 + $0])) > TOLERANCE }
    if off { count += 1; diff[p * 4] = 255; diff[p * 4 + 1] = 0; diff[p * 4 + 2] = 0 }
    else { for c in 0..<3 { diff[p * 4 + c] = UInt8(191 + Int(was[p * 4 + c]) / 4) } }
  }
  if count == 0 { return print("\(name): same") }
  failed += 1
  try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
  write(now, w, h, out.appendingPathComponent("\(name).png")); write(diff, w, h, out.appendingPathComponent("\(name)-diff.png"))
  print("\(name): \(count) pixels differ, see test/snapshots/out/\(name).png and \(name)-diff.png")
}

final class Shooter: NSObject, WKNavigationDelegate {
  let window = NSWindow(contentRect: NSRect(origin: NSPoint(x: FAR, y: 0), size: WIDE), styleMask: .borderless, backing: .buffered, defer: false)
  var web: WKWebView!, queue = SCENES, scene = "", size = WIDE
  override init() {
    super.init()
    window.colorSpace = .sRGB
    window.collectionBehavior = [.transient, .ignoresCycle]
    try? FileManager.default.removeItem(at: out)
    next()
  }
  func next() {
    guard !queue.isEmpty else {
      print(update ? "references updated" : failed == 0 ? "all snapshots match" : "\(failed) snapshot(s) differ")
      exit(failed == 0 ? 0 : 1)
    }
    let (name, query, size) = queue.removeFirst()
    scene = name; self.size = size
    window.setContentSize(size)
    let config = WKWebViewConfiguration() // a fresh page per scene, so each starts from the same seed and clock
    config.userContentController.addUserScript(WKUserScript(source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
    web.setValue(false, forKey: "windowOcclusionDetectionEnabled") // keep painting although the window is never shown
    web.navigationDelegate = self
    window.contentView = web // never ordered in: it stays off screen and out of the way
    web.loadFileURL(URL(string: root.appendingPathComponent("index.html").absoluteString + "?" + query)!, allowingReadAccessTo: root)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { drive() }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fatalError("\(scene): \(error)") }
  func drive() {
    web.callAsyncJavaScript("return await __drive()", arguments: [:], in: nil, in: .page) { result in
      guard case .success(let value) = result, let step = value as? String, !step.hasPrefix("error") else { fatalError("\(self.scene): \(result)") }
      if step == "done" { return self.next() }
      let config = WKSnapshotConfiguration()
      config.afterScreenUpdates = true
      config.snapshotWidth = NSNumber(value: Double(self.size.width / self.window.backingScaleFactor)) // in points: one pixel per CSS pixel
      self.web.takeSnapshot(with: config) { image, error in
        guard let image = image?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fatalError("\(self.scene): \(String(describing: error))") }
        check("\(self.scene)-\(step)", image)
        self.drive()
      }
    }
  }
}

NSApplication.shared.setActivationPolicy(.prohibited) // no Dock icon, never takes focus
let shooter = Shooter()
DispatchQueue.main.asyncAfter(deadline: .now() + 120) { print("timed out in \(shooter.scene)"); exit(2) }
withExtendedLifetime(shooter) { NSApplication.shared.run() }
