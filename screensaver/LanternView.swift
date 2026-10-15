// A macOS screensaver that shows the Lantern page full screen. The server already runs at login,
// so this only has to point a web view at it.
import ScreenSaver
import WebKit

@objc(LanternView)
final class LanternView: ScreenSaverView {
    private let web = WKWebView()

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        web.frame = bounds
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground") // no white flash before the page paints
        addSubview(web)
        animationTimeInterval = 1.0 / 30
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:7717/?screensaver")!)) // screensavers don't get your shell's env, so the port is fixed here
    }

    required init?(coder: NSCoder) { nil }

    // The web view never fires requestAnimationFrame inside a screensaver, so drive the page from the screensaver's clock.
    override func animateOneFrame() {
        web.evaluateJavaScript("window.lanternTick && lanternTick()")
    }

    // Mouse and keyboard belong to the screensaver (they wake the Mac), not the page.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
