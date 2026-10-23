// Lantern.app: the Lantern page in its own window, with a Dock icon and badge, and the Lantern server (Server.swift)
// running inside it, so hooks reach it as long as the app is open.
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

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: LanternServer!
    var term: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ note: Notification) {
        // Settings live in Application Support, since an app can't write inside itself. The page comes from the app,
        // or, when the installer ran from a git checkout, from that checkout, so edits to index.html go live.
        let checkout = UserDefaults.standard.string(forKey: "pageDir").flatMap { FileManager.default.fileExists(atPath: $0 + "/index.html") ? $0 : nil }
        server = LanternServer(port: UInt16(port) ?? 7717, data: data, web: checkout ?? Bundle.main.resourcePath!)
        server.start()
        server.buildChrome()
        // SIGTERM (a relaunch, install.js) quits properly, which stops the vite watcher and closes the event log. If the main
        // thread is wedged, it leaves anyway after 3 s.
        signal(SIGTERM, SIG_IGN)
        term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .global())
        term?.setEventHandler { DispatchQueue.main.async { NSApp.terminate(nil) }; DispatchQueue.global().asyncAfter(deadline: .now() + 3) { exit(0) } }
        term?.resume()
        // Hooks need the server even with no window open, so an installed copy opens at login. That's offered once;
        // turning it off in System Settings > General > Login Items sticks.
        if !UserDefaults.standard.bool(forKey: "loginItemOffered"), Bundle.main.bundlePath.contains("/Applications/") {
            try? SMAppService.mainApp.register()
            UserDefaults.standard.set(true, forKey: "loginItemOffered")
        }

        let config = WKWebViewConfiguration()
        // The page sets the Dock badge with navigator.setAppBadge, which only Safari's Dock web apps have; hand it to the Dock tile.
        config.userContentController.add(self, name: "badge")
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
        let strip = DragStrip(frame: NSRect(x: 0, y: container.bounds.height - 28, width: container.bounds.width, height: 28))
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
        if UserDefaults.standard.bool(forKey: "fullScreen") { DispatchQueue.main.async { self.window.toggleFullScreen(nil) } }
        web.load(URLRequest(url: home))
    }

    // Save the real frame before full screen replaces it, so leaving full screen (or relaunching) lands back where the window was.
    func windowWillEnterFullScreen(_ note: Notification) { window.saveFrame(usingName: "Lantern") }
    // Rectangle and other window managers move windows through Accessibility, which autosave can miss; record every move and resize.
    func saveFrame() { if !window.styleMask.contains(.fullScreen) { window.saveFrame(usingName: "Lantern") } }
    func windowDidMove(_ note: Notification) { saveFrame() }
    func windowDidResize(_ note: Notification) { saveFrame() }
    func windowDidEnterFullScreen(_ note: Notification) { UserDefaults.standard.set(true, forKey: "fullScreen") }
    func windowDidExitFullScreen(_ note: Notification) { UserDefaults.standard.set(false, forKey: "fullScreen") }

    func applicationWillTerminate(_ note: Notification) { server.stopBuilding(); server.stats.shutdown() } // close the event log's open spans

    // The server lives as long as the app, so closing the window keeps both running. Clicking the Dock icon brings it back.
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let n = message.body as? Int ?? 0
        NSApp.dockTile.badgeLabel = n > 0 ? String(n) : nil
    }

    // Links leave the app for your browser; only the Lantern page itself loads in here.
    func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, url.host != home.host || url.port != home.port else { return decisionHandler(.allow) }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ web: WKWebView, createWebViewWith config: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) } // target="_blank" links
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
