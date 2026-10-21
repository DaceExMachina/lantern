// test/morph.test.js runs this: index.html?style=barrel&morph in WebKit with test/snapshots/fixture.js injected, in a
// borderless window far off screen that is never shown or activated (like scripts/snapshots.swift). The fixture's morph
// steps check that a redraw keeps focus, scroll, hover and a press; the harness calls __drive() until it says 'done' or
// 'error: …', and between steps sends the real mouse press a step asks for ("down x y" or "up x y", in page px).
import AppKit
import WebKit

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let fixture = try! String(contentsOf: root.appendingPathComponent("test/snapshots/fixture.js"), encoding: .utf8)
let SIZE = NSSize(width: 900, height: 420) // short, so the big card scrolls, and wide enough to pin (card.js PIN_MIN)

final class Driver: NSObject, WKNavigationDelegate {
  let window = NSWindow(contentRect: NSRect(origin: NSPoint(x: -30000, y: -30000), size: SIZE), styleMask: .borderless, backing: .buffered, defer: false)
  var web: WKWebView!
  override init() {
    super.init()
    let config = WKWebViewConfiguration()
    config.userContentController.addUserScript(WKUserScript(source: fixture, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(origin: .zero, size: SIZE), configuration: config)
    web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
    web.navigationDelegate = self
    window.contentView = web // never ordered in
    web.loadFileURL(URL(string: root.appendingPathComponent("index.html").absoluteString + "?style=barrel&morph")!, allowingReadAccessTo: root)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { drive() }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print("FAIL \(error)"); exit(1) }
  func mouse(_ type: NSEvent.EventType, _ x: Double, _ y: Double) {
    let at = NSPoint(x: x, y: SIZE.height - y) // the window's origin is bottom left
    let e = NSEvent.mouseEvent(with: type, location: at, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                               context: nil, eventNumber: 0, clickCount: 1, pressure: type == .leftMouseUp ? 0 : 1)!
    if type == .leftMouseDown { web.mouseDown(with: e) } else { web.mouseUp(with: e) }
  }
  func drive() {
    web.callAsyncJavaScript("return await __drive()", arguments: [:], in: nil, in: .page) { result in
      guard case .success(let value) = result, let step = value as? String else { print("FAIL \(result)"); exit(1) }
      if step == "done" { print("ok"); exit(0) }
      if step.hasPrefix("error") { print("FAIL \(step)"); exit(1) }
      let p = step.split(separator: " "), x = Double(p[1])!, y = Double(p[2])!
      self.mouse(p[0] == "down" ? .leftMouseDown : .leftMouseUp, x, y)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.drive() } // let the web process take the event
    }
  }
}

NSApplication.shared.setActivationPolicy(.prohibited) // no Dock icon, never takes focus
let driver = Driver()
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("FAIL timed out"); exit(2) }
withExtendedLifetime(driver) { NSApplication.shared.run() }
