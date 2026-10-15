// A macOS screensaver that shows the Lantern page full screen. The server already runs at login,
// so this only has to point a web view at it.
import ScreenSaver
import WebKit

@objc(LanternView)
final class LanternView: ScreenSaverView {
    private let web: WKWebView
    // macOS starts each screensaver twice per display, a few seconds apart, and the later copy is the one on screen.
    // Each display remembers its newest copy; an older one unloads its page so it stops drawing for nobody.
    private static var newest: [String: ObjectIdentifier] = [:]
    private let display: String
    private var retired = false

    override init?(frame: NSRect, isPreview: Bool) {
        // Inside the screensaver's sandbox WebKit can't tell the window is on screen, so it treats the page as
        // hidden and freezes it. These private switches keep it running; each is only used if this macOS has it.
        let config = WKWebViewConfiguration()
        for (key, setter) in [("hiddenPageDOMTimerThrottlingEnabled", "_setHiddenPageDOMTimerThrottlingEnabled:"),
                              ("hiddenPageDOMTimerThrottlingAutoIncreases", "_setHiddenPageDOMTimerThrottlingAutoIncreases:")]
        where config.preferences.responds(to: Selector(setter)) {
            config.preferences.setValue(false, forKey: key)
        }
        web = WKWebView(frame: .zero, configuration: config)
        display = isPreview ? "preview" : NSStringFromRect(frame)
        if web.responds(to: Selector("_setWindowOcclusionDetectionEnabled:")) {
            web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        }
        super.init(frame: frame, isPreview: isPreview)
        web.frame = bounds
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground") // no white flash before the page paints
        addSubview(web)
        animationTimeInterval = 1.0 / 60

        // With several displays, the biggest one gets the lantern and the rest get just the ambient specks.
        let area = { (r: NSRect) in r.width * r.height }
        let biggest = NSScreen.screens.map { area($0.frame) }.max() ?? 0
        let ambient = !isPreview && area(frame) < biggest
        // An ambient display is told where both screens sit, so the lantern's rays can carry on across onto it.
        // (The frame a screensaver is handed may not say where its screen is, so find the screen by size.)
        let biggestFrame = NSScreen.screens.max { area($0.frame) < area($1.frame) }?.frame ?? frame
        let selfFrame = NSScreen.screens.first { $0.frame.size == frame.size && $0.frame != biggestFrame }?.frame ?? frame
        let f = { (r: NSRect) in [r.minX, r.minY, r.width, r.height].map { String(Int($0)) }.joined(separator: ",") }
        let mode = ambient ? "screensaver&ambient&lantern=\(f(biggestFrame))&self=\(f(selfFrame))" : "screensaver"
        // The screensaver draws without much GPU help, and a Retina or 5K screen is a lot of pixels; the scene is soft
        // and glowy, so drawing it at standard resolution looks the same and is several times cheaper.
        if web.responds(to: Selector("_setOverrideDeviceScaleFactor:")) {
            web.setValue(1.0, forKey: "overrideDeviceScaleFactor")
        }
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:7717/?\(mode)")!)) // screensavers don't get your shell's env, so the port is fixed here
        Self.newest[display] = ObjectIdentifier(self)
    }

    required init?(coder: NSCoder) { nil }

    // The web view never fires requestAnimationFrame inside a screensaver, so drive the page from the screensaver's clock.
    override func animateOneFrame() {
        if retired { return }
        if Self.newest[display] != ObjectIdentifier(self) {
            retired = true
            web.loadHTMLString("", baseURL: nil)
            return
        }
        web.evaluateJavaScript("window.lanternTick && lanternTick()")
    }

    // Mouse and keyboard belong to the screensaver (they wake the Mac), not the page.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
