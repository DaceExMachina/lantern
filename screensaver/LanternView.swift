// A macOS screensaver that shows the Lantern page full screen. The server already runs at login,
// so this only has to point a web view at it.
import ScreenSaver
import WebKit
import os

// What each copy did, for when the screen goes black:
// log show --predicate 'subsystem == "com.lantern.screensaver"' --last 1h
private let logger = Logger(subsystem: "com.lantern.screensaver", category: "view")

@objc(LanternView)
final class LanternView: ScreenSaverView, WKNavigationDelegate {
    private var web: WKWebView?
    // macOS starts each screensaver twice per display, a few seconds apart, and the later copy is the one on screen.
    // Each display remembers its newest copy; an older one unloads its page so it stops drawing for nobody.
    private static var newest: [String: ObjectIdentifier] = [:]
    private let display: String
    private var running = false
    private var page: URL!
    private static var count = 0
    private let name: String // "#3 preview" or "#4 {{0, 0}, {2560, 1440}}", to tell copies apart in the log
    private var ticks = 0, frames = -1, seen = -2, checks = 0, failures = 0, retrying = false
    private var health: Timer?

    override init?(frame: NSRect, isPreview: Bool) {
        display = isPreview ? "preview" : NSStringFromRect(frame)
        Self.count += 1
        name = "#\(Self.count) \(display)"
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1.0 / 60

        // With several displays, the biggest one gets the lantern and the rest get just the ambient specks.
        let area = { (r: NSRect) in r.width * r.height }
        let biggest = NSScreen.screens.map { area($0.frame) }.max() ?? 0
        // (only when another screen really is bigger: a lone laptop screen can hand the saver a frame a few points
        // short of the screen's, which used to make it think it was the small one and show no lantern)
        let ambient = !isPreview && NSScreen.screens.count > 1 && area(frame) < biggest * 0.9
        // An ambient display is told where both screens sit, so the lantern's rays can carry on across onto it.
        // (The frame a screensaver is handed may not say where its screen is, so find the screen by size.)
        let biggestFrame = NSScreen.screens.max { area($0.frame) < area($1.frame) }?.frame ?? frame
        let selfFrame = NSScreen.screens.first { $0.frame.size == frame.size && $0.frame != biggestFrame }?.frame ?? frame
        let f = { (r: NSRect) in [r.minX, r.minY, r.width, r.height].map { String(Int($0)) }.joined(separator: ",") }
        let mode = ambient ? "screensaver&ambient&lantern=\(f(biggestFrame))&self=\(f(selfFrame))" : "screensaver"
        // screensavers don't get your shell's env, so the installer builds the port into the saver's Info.plist
        let port = Bundle(for: Self.self).object(forInfoDictionaryKey: "LanternPort") as? String ?? "7717"
        page = URL(string: "http://127.0.0.1:\(port)/?\(mode)")!
        Self.newest[display] = ObjectIdentifier(self)
        note("init \(mode) preview=\(isPreview)")
        start()
        // Since macOS 14 the screensaver's host process (legacyScreenSaver) stays running after the screensaver ends, and
        // often never calls stopAnimation, so the page would keep drawing for nobody (60% CPU for days, measured). macOS
        // posts this when the screensaver ends: stop the page, then quit the host a moment later, as Aerial does. macOS
        // starts a fresh host next time. Not for the preview in System Settings, which lives on after the screensaver.
        if !isPreview {
            DistributedNotificationCenter.default().addObserver(
                forName: .init("com.apple.screensaver.willstop"), object: nil, queue: .main) { [weak self] _ in
                self?.stop("screensaver ended")
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { exit(0) }
            }
        }
    }

    required init?(coder: NSCoder) { nil }

    // The page runs only while the view is animating and in a window, so every way macOS ends a screensaver stops it.
    override func startAnimation() { super.startAnimation(); start() }
    override func stopAnimation() { super.stopAnimation(); stop("stopAnimation") }
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); if window == nil { stop("left its window") } else { start() } }

    private func start() {
        guard !running, Self.newest[display] == ObjectIdentifier(self) else { return }
        running = true
        failures = 0; retrying = false // a retry left waiting by stop() would block new ones
        load()
        // Every 10s, check the page is still drawing. This runs on its own timer, so it keeps going even if macOS stops
        // calling animateOneFrame (the page then draws from its own timer, see src/wiring.js).
        let timer = Timer(timeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
        RunLoop.main.add(timer, forMode: .common)
        health = timer
    }

    // Drop the web view (and with it the page's web process) and the timer.
    private func stop(_ why: String) {
        guard running else { return }
        let w = window
        note("stop: \(why) (window=\(w?.windowNumber ?? -1) visible=\(w?.isVisible ?? false) "
            + "onscreen=\(w?.occlusionState.contains(.visible) ?? false))")
        running = false
        health?.invalidate()
        health = nil
        web?.navigationDelegate = nil
        web?.removeFromSuperview()
        web = nil
    }

    private func note(_ s: String) { logger.log("\(self.name, privacy: .public) \(s, privacy: .public)") }

    // Each load gets a new web view (and with it a new web process): one whose process was killed or hung can stay
    // stuck loading for good, whatever it's asked to load next.
    private func load() {
        note("load \(page.absoluteString)")
        frames = -1; seen = -2 // a fresh page: the first check only asks
        web?.navigationDelegate = nil
        web?.removeFromSuperview()
        // Inside the screensaver's sandbox WebKit can't tell the window is on screen, so it treats the page as
        // hidden and freezes it. These private switches keep it running; each is only used if this macOS has it.
        let config = WKWebViewConfiguration()
        for (key, setter) in [("hiddenPageDOMTimerThrottlingEnabled", "_setHiddenPageDOMTimerThrottlingEnabled:"),
                              ("hiddenPageDOMTimerThrottlingAutoIncreases", "_setHiddenPageDOMTimerThrottlingAutoIncreases:")]
        where config.preferences.responds(to: Selector(setter)) {
            config.preferences.setValue(false, forKey: key)
        }
        let web = WKWebView(frame: bounds, configuration: config)
        if web.responds(to: Selector("_setWindowOcclusionDetectionEnabled:")) {
            web.setValue(false, forKey: "windowOcclusionDetectionEnabled")
        }
        // The screensaver draws without much GPU help, and a Retina or 5K screen is a lot of pixels; the scene is soft
        // and glowy, so drawing it at standard resolution looks the same and is several times cheaper.
        if web.responds(to: Selector("_setOverrideDeviceScaleFactor:")) {
            web.setValue(1.0, forKey: "overrideDeviceScaleFactor")
        }
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground") // no white flash before the page paints
        web.navigationDelegate = self
        addSubview(web)
        self.web = web
        web.load(URLRequest(url: page))
    }

    // Load the page again after something went wrong (the server not answering yet, the web process dying, a page that
    // stopped drawing), waiting 2, 4, 8, 16, then 30s between tries so a server that's down isn't hammered.
    private func retry(_ why: String) {
        guard running, !retrying else { return }
        failures += 1
        let delay = min(30, 1 << min(failures, 5))
        note("retry in \(delay)s: \(why)")
        retrying = true
        DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(delay)) { [weak self] in
            guard let self, self.running else { return }
            self.retrying = false
            self.load()
        }
    }

    // The page counts the frames it really drew (src/scene/background.js). If that count hasn't moved since the last check, or the
    // page never answered (its web process is gone), the page is blank, an error page, hung, or lost its GPU for good: load it
    // again. Once a minute, log how it's doing.
    private func check() {
        if retireIfStale() { return }
        checks += 1
        if checks % 6 == 0 {
            let w = window
            note("heartbeat ticks=\(ticks) frames=\(frames) window=\(w?.windowNumber ?? -1) visible=\(w?.isVisible ?? false) "
                + "onscreen=\(w?.occlusionState.contains(.visible) ?? false)")
        }
        if frames <= seen { retry("page not drawing (frames=\(frames))") } else if frames > 0 { failures = 0 }
        seen = frames
        web?.evaluateJavaScript("window.lanternFrames") { [weak self] result, _ in self?.frames = result as? Int ?? -1 }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error, "load failed")
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error, "page failed") }
    private func failed(_ error: Error, _ what: String) {
        // cancelled just means another load took over (the page reloading itself, say), and that one reports for itself
        if (error as NSError).code == NSURLErrorCancelled { return }
        retry("\(what): \(error.localizedDescription)")
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { note("loaded") }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let r = navigationResponse.response as? HTTPURLResponse, r.statusCode != 200 { note("HTTP \(r.statusCode)") }
        decisionHandler(.allow) // an error page then never draws a frame, and check() reloads it
    }
    // The page's web process can crash, or be killed by macOS when memory is short, leaving the view black for good.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { retry("web process ended") }

    // An older copy on the same display unloads its page so it stops drawing for nobody (see `newest`).
    private func retireIfStale() -> Bool {
        if running && Self.newest[display] != ObjectIdentifier(self) { stop("retire") }
        return !running
    }

    // The web view never fires requestAnimationFrame inside a screensaver, so drive the page from the screensaver's clock.
    override func animateOneFrame() {
        if retireIfStale() { return }
        ticks += 1
        web?.evaluateJavaScript("window.lanternTick && lanternTick()")
    }

    // Mouse and keyboard belong to the screensaver (they wake the Mac), not the page.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
