// Lantern.app: the Lantern page in its own window, with a Dock icon and badge, and the Lantern server (Server.swift) as its
// child, so hooks reach it as long as the app is open. The child is this same executable run with --server, so it has the
// app's identity (and its permissions); stopping just the server deploys a rebuilt one without touching the window
// (scripts/reload-server).
import AppKit
import ServiceManagement
import WebKit

// `--unregister` is for the uninstaller: only the app itself can take its login item back out.
if CommandLine.arguments.contains("--unregister") { try? SMAppService.mainApp.unregister(); exit(0) }

let env = ProcessInfo.processInfo.environment
let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Lantern").path
let data = env["LANTERN_DATA"] ?? support
// Apps opened from the Dock don't get your shell's env, so the port normally comes from settings.json (the installer
// writes it there when LANTERN_PORT is set). `open --env LANTERN_PORT=…` still overrides it.
let saved = FileManager.default.contents(atPath: data + "/settings.json").flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
let port = env["LANTERN_PORT"] ?? (saved?["port"] as? NSNumber)?.stringValue ?? "7717"
let home = URL(string: "http://127.0.0.1:\(port)/?app")!

// Settings live in Application Support, since an app can't write inside itself. The page comes from the app, or, when the
// installer ran from a git checkout, from that checkout, so edits to index.html go live.
if CommandLine.arguments.contains("--server") {
    let checkout = UserDefaults.standard.string(forKey: "pageDir").flatMap { FileManager.default.fileExists(atPath: $0 + "/index.html") ? $0 : nil }
    LanternServer(port: UInt16(port) ?? 7717, data: data, web: checkout ?? Bundle.main.resourcePath!).serve(build: true)
}

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var strip: DragStrip!

    func applicationDidFinishLaunching(_ note: Notification) {
        runServer()
        // Hooks need the server even with no window open, so an installed copy opens at login. That's offered once;
        // turning it off in System Settings > General > Login Items sticks.
        if !UserDefaults.standard.bool(forKey: "loginItemOffered"), Bundle.main.bundlePath.contains("/Applications/") {
            try? SMAppService.mainApp.register()
            UserDefaults.standard.set(true, forKey: "loginItemOffered")
        }

        let config = WKWebViewConfiguration()
        // The page sets the Dock badge with navigator.setAppBadge, which only Safari's Dock web apps have; hand it to the Dock tile.
        config.userContentController.add(self, name: "badge")
        config.userContentController.add(self, name: "dock") // the pinned sidebar's width, so the drag strip stops short of it
        config.userContentController.addUserScript(WKUserScript(source: """
            navigator.setAppBadge = n => (webkit.messageHandlers.badge.postMessage(n ?? 0), Promise.resolve());
            navigator.clearAppBadge = () => navigator.setAppBadge(0);
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground") // no white flash before the page paints

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Lantern"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0x2B / 255.0, green: 0x24 / 255.0, blue: 0x40 / 255.0, alpha: 1)
        // The page runs right up under the transparent title bar, so the web view would swallow drags there. A clear
        // strip along the top (the title bar's height) hands them to the window instead: drag to move, double-click to zoom.
        let container = NSView(frame: window.contentRect(forFrameRect: window.frame))
        web.frame = container.bounds; web.autoresizingMask = [.width, .height]
        strip = DragStrip(frame: NSRect(x: 0, y: container.bounds.height - 28, width: container.bounds.width, height: 28))
        strip.autoresizingMask = [.width, .minYMargin]
        container.addSubview(web); container.addSubview(strip)
        window.contentView = container
        window.isReleasedWhenClosed = false // closing hides it; the page keeps running for the badge
        // Put the window back exactly where it was. AppKit's own restore (setFrameAutosaveName) re-maps the saved frame onto the
        // screen the window starts on, which in a background launch is not necessarily the one it was on, so read the saved frame
        // ourselves. It's stored in AppKit's format ("x y w h" and then the screen), written by saveFrame below.
        if let n = UserDefaults.standard.string(forKey: "NSWindow Frame Lantern")?.split(separator: " ").prefix(4).compactMap({ Double($0) }), n.count == 4,
           NSScreen.screens.contains(where: { $0.visibleFrame.intersects(NSRect(x: n[0], y: n[1], width: n[2], height: n[3])) }) {
            window.setFrame(NSRect(x: n[0], y: n[1], width: n[2], height: n[3]), display: false)
        } else { window.center() }
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        // The saved frame is the windowed one (in full screen the frame is the whole display), so full screen is remembered
        // separately. The saved frame puts the window back on its display first; full screen then takes over that display.
        restoreFullScreen = UserDefaults.standard.bool(forKey: "fullScreen")
        web.load(URLRequest(url: home))
    }

    // Full screen is a Space of its own, and entering one switches its display to it, which brings Lantern to the front. So it
    // waits until Lantern is brought forward: at once for a Dock or Spotlight launch, and for a background relaunch (`open -g`)
    // not until you click it, so a relaunch leaves your focus where it was.
    var restoreFullScreen = false
    func applicationDidBecomeActive(_ note: Notification) {
        guard restoreFullScreen, let window else { return }
        restoreFullScreen = false
        window.toggleFullScreen(nil)
    }

    // Save the real frame before full screen replaces it, so leaving full screen (or relaunching) lands back where the window was.
    func windowWillEnterFullScreen(_ note: Notification) { window.saveFrame(usingName: "Lantern") }
    // Rectangle and other window managers move windows through Accessibility, which autosave can miss; record every move and resize.
    func saveFrame() { if !window.styleMask.contains(.fullScreen) { window.saveFrame(usingName: "Lantern") } }
    func windowDidMove(_ note: Notification) { saveFrame() }
    func windowDidResize(_ note: Notification) { saveFrame() }
    func windowDidEnterFullScreen(_ note: Notification) { UserDefaults.standard.set(true, forKey: "fullScreen") }
    func windowDidExitFullScreen(_ note: Notification) { UserDefaults.standard.set(false, forKey: "fullScreen") }

    // The server comes back whenever it exits, from the executable on disk now, so after a rebuild it's the new one. A server
    // that can't start must not spin: it comes back after a growing pause, and one that ran for half a minute starts the pause
    // over. The page then loads again: its own reconnect runs on timers that WebKit holds back while the window is hidden, so it
    // could wait for a look, and a failed load keeps the old page on screen and tries again (below). The app needs nothing on
    // the way out: the server notices the app going and stops itself (serve in Server.swift).
    func runServer(pause: Double = 0.25) {
        let p = Process(), began = Date()
        p.executableURL = Bundle.main.executableURL
        p.arguments = ["--server"]
        let again = {
            let wait = Date().timeIntervalSince(began) > 30 ? 0.25 : pause
            print("the server exited; starting it again in \(wait) s")
            DispatchQueue.main.asyncAfter(deadline: .now() + wait) { self.runServer(pause: min(wait * 2, 60)); self.reload(nil) }
        }
        p.terminationHandler = { _ in DispatchQueue.main.async(execute: again) }
        do { try p.run() } catch { print("the server won't start: \(error)"); again() }
    }

    // The server lives as long as the app, so closing the window keeps both running. Clicking the Dock icon brings it back.
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let n = message.body as? Int ?? 0
        if message.name == "dock" { strip.stopShort(of: CGFloat(n)) } else { NSApp.dockTile.badgeLabel = n > 0 ? String(n) : nil }
    }

    // Links leave the app for your browser; only the Lantern page itself loads in here.
    func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.host == home.host && url.port == home.port { return decisionHandler(.allow) }
        if action.targetFrame?.isMainFrame != false { openInBrowser(url) }
        decisionHandler(.cancel)
    }

    // Only web pages leave the app: no file:, ssh:, smb: or custom-scheme links.
    func openInBrowser(_ url: URL) { if ["http", "https"].contains(url.scheme?.lowercased() ?? "") { NSWorkspace.shared.open(url) } }

    func webView(_ web: WKWebView, createWebViewWith config: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openInBrowser(url) } // target="_blank" links
        return nil
    }

    // The server takes a moment to start, so keep trying until it answers.
    func webView(_ web: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { web.load(URLRequest(url: home)) }
    }

    @objc func reload(_ sender: Any?) { web.load(URLRequest(url: home)) }
}

// A minimal menu bar, so the usual shortcuts work: quit, close, minimise, full screen, copy, reload.
// A see-through title bar for a window whose content runs under it.
final class DragStrip: NSView {
    // The pinned sidebar starts at the very top, so the strip spans only the width left of it (0: the full width). Resizing the
    // window keeps that gap (autoresizing keeps the margin).
    func stopShort(of dock: CGFloat) { if let w = superview?.bounds.width { frame.size.width = max(0, w - dock) } }
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
    }
}

func menu(_ title: String, _ items: [NSMenuItem]) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.submenu = NSMenu(title: title)
    items.forEach(item.submenu!.addItem)
    return item
}
let mainMenu = NSMenu()
mainMenu.addItem(menu("Lantern", [NSMenuItem(title: "Hide Lantern", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"),
                                  NSMenuItem(title: "Quit Lantern", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")]))
mainMenu.addItem(menu("Edit", [NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"),
                               NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")]))
mainMenu.addItem(menu("View", [NSMenuItem(title: "Reload", action: #selector(App.reload(_:)), keyEquivalent: "r"),
                               NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")]))
mainMenu.addItem(menu("Window", [NSMenuItem(title: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"),
                                 NSMenuItem(title: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")]))
mainMenu.item(withTitle: "View")!.submenu!.item(withTitle: "Enter Full Screen")!.keyEquivalentModifierMask = [.command, .control]

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.mainMenu = mainMenu
app.setActivationPolicy(.regular)
app.run()
