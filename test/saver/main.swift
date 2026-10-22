// Loads a built Lantern.saver off screen and checks every way it stops its page (test/saver.test.js builds and runs it).
// Nothing is shown or activated: no Dock icon, borderless windows far off every screen, never ordered front.
import AppKit
import ScreenSaver
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("FAIL: timed out"); exit(3) }

let bundle = Bundle(path: CommandLine.arguments[1])!
bundle.load()
let cls = bundle.principalClass as! ScreenSaverView.Type
let FAR = NSScreen.screens.map(\.frame.maxX).max()! + 10000 // beyond every display, never on one (a negative origin once landed on the laptop screen)
func win() -> NSWindow { // borderless, off every screen, never ordered front
    let w = NSWindow(contentRect: NSRect(x: FAR, y: 0, width: 400, height: 300), styleMask: .borderless, backing: .buffered, defer: true)
    w.collectionBehavior = [.transient, .ignoresCycle]
    return w
}
let frame = NSRect(x: 0, y: 0, width: 400, height: 300)
let preview = cls.init(frame: frame, isPreview: true)!
let real = cls.init(frame: NSRect(x: 0, y: 0, width: 401, height: 301), isPreview: false)!
let w1 = win(), w2 = win()
w1.contentView!.addSubview(preview); w2.contentView!.addSubview(real)
preview.startAnimation(); real.startAnimation()
var failed = false
func hasWeb(_ v: NSView) -> Bool { v.subviews.contains { $0 is WKWebView } }
func expect(_ ok: Bool, _ what: String) { print(ok ? "ok   \(what)" : "FAIL \(what)"); if !ok { failed = true } }

expect(hasWeb(real) && hasWeb(preview), "both views start with a web view")
real.stopAnimation(); expect(!hasWeb(real), "stopAnimation drops the web view")
real.startAnimation(); expect(hasWeb(real), "startAnimation brings it back")
real.removeFromSuperview(); expect(!hasWeb(real), "leaving the window drops it")
w2.contentView!.addSubview(real); expect(hasWeb(real), "joining a window brings it back")
preview.stopAnimation(); preview.startAnimation(); expect(hasWeb(preview), "preview restarts after stop/start")

DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    DistributedNotificationCenter.default().postNotificationName(.init("com.apple.screensaver.willstop"), object: nil, userInfo: nil, deliverImmediately: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        expect(!hasWeb(real), "willstop drops the real screensaver's web view")
        expect(hasWeb(preview), "willstop leaves the preview alone")
        if failed { exit(1) }
        print("waiting for the process to exit by itself")
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { print("FAIL: still running 6s after willstop"); exit(2) }
    }
}
RunLoop.main.run()
