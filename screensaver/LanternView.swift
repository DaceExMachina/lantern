// A macOS screensaver that shows the Lantern page full screen. The server already runs at login,
// so this only has to point a web view at it.
import ScreenSaver
import WebKit

@objc(LanternView)
final class LanternView: ScreenSaverView {
    private let web: WKWebView

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
        if web.responds(to: Selector("_setWindowOcclusionDetectionEnabled:")) {
            web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        }
        super.init(frame: frame, isPreview: isPreview)
        web.frame = bounds
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground") // no white flash before the page paints
        addSubview(web)
        animationTimeInterval = 1.0 / 30

        // With several displays, the biggest one gets the lantern and the rest get just the ambient specks.
        let area = { (r: NSRect) in r.width * r.height }
        let biggest = NSScreen.screens.map { area($0.frame) }.max() ?? 0
        let mode = isPreview || area(frame) >= biggest ? "screensaver" : "screensaver&ambient"
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:7717/?\(mode)")!)) // screensavers don't get your shell's env, so the port is fixed here
    }

    required init?(coder: NSCoder) { nil }

    // The web view never fires requestAnimationFrame inside a screensaver, so drive the page from the screensaver's clock.
    override func animateOneFrame() {
        web.evaluateJavaScript("window.lanternTick && lanternTick()")
    }

    // Mouse and keyboard belong to the screensaver (they wake the Mac), not the page.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
