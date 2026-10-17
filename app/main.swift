// Lantern.app: the Lantern page in its own window, with a Dock icon and badge, and the Lantern server inside it.
// When nothing answers on the port yet, the app runs its own copy of server.js with your node and stops it on quit.
import AppKit
import ServiceManagement
import WebKit

// `--unregister` is for the uninstaller: only the app itself can take its login item back out.
if CommandLine.arguments.contains("--unregister") { try? SMAppService.mainApp.unregister(); exit(0) }

let env = ProcessInfo.processInfo.environment
let port = env["LANTERN_PORT"] ?? "7717" // apps opened from the Dock don't get your shell's env; `open --env` can still set it
let home = URL(string: "http://127.0.0.1:\(port)/")!

// Asks your login shell, so node from nvm, fnm, asdf, Volta or Homebrew is found the same way your terminal finds it.
func findNode() -> String? {
    let shell = Process(), out = Pipe()
    shell.executableURL = URL(fileURLWithPath: env["SHELL"] ?? "/bin/zsh")
    shell.arguments = ["-ilc", "command -v node"]
    shell.standardInput = FileHandle.nullDevice
    shell.standardOutput = out
    shell.standardError = FileHandle.nullDevice
    var found: String?
    if (try? shell.run()) != nil {
        DispatchQueue.global().asyncAfter(deadline: .now() + 10) { if shell.isRunning { shell.terminate() } } // a stuck shell profile
        let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        found = text.split(separator: "\n").map(String.init).last { $0.hasPrefix("/") }
    }
    return [found, "/opt/homebrew/bin/node", "/usr/local/bin/node"].compactMap { $0 }.first(where: FileManager.default.isExecutableFile)
}

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var node: String?
    var quitting = false

    func applicationDidFinishLaunching(_ note: Notification) {
        startServerIfNeeded()
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
        window.contentView = web
        window.isReleasedWhenClosed = false // closing hides it; the page keeps running for the badge
        window.center()
        window.setFrameAutosaveName("Lantern") // remembers size and position between launches
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: home))
    }

    // The server lives as long as the app, so closing the window keeps both running. Clicking the Dock icon brings it back.
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func applicationWillTerminate(_ note: Notification) {
        quitting = true
        server?.terminate()
    }

    // A server that's already running (from a checkout, or launchd) is used as is; otherwise start ours.
    func startServerIfNeeded() {
        URLSession.shared.dataTask(with: URLRequest(url: home, timeoutInterval: 2)) { _, response, _ in
            if response != nil { return }
            let node = self.node ?? findNode()
            DispatchQueue.main.async { self.startServer(node) }
        }.resume()
    }

    func startServer(_ node: String?) {
        guard !quitting else { return }
        guard let node else {
            let alert = NSAlert()
            alert.messageText = "Lantern needs Node.js"
            alert.informativeText = "Install Node 18 or later (from nodejs.org or Homebrew), then open Lantern again."
            alert.runModal()
            return
        }
        self.node = node
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Lantern").path
        let logs = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/Lantern.log").path
        if !FileManager.default.fileExists(atPath: logs) { FileManager.default.createFile(atPath: logs, contents: nil) }
        let log = FileHandle(forWritingAtPath: logs)
        log?.seekToEndOfFile()

        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        // Installed from a git checkout, the installer points the app at it, so edits to the checkout go live.
        let checkout = UserDefaults.standard.string(forKey: "serverDir").map { "\($0)/server.js" }
        p.arguments = [checkout.flatMap { FileManager.default.fileExists(atPath: $0) ? $0 : nil } ?? Bundle.main.path(forResource: "server", ofType: "js")!]
        p.environment = env.merging(["LANTERN_APP": "1", "LANTERN_PORT": port, "LANTERN_DATA": env["LANTERN_DATA"] ?? support]) { $1 }
        p.standardInput = Pipe() // held open by us: the server exits when it closes, even if this app crashes
        p.standardOutput = log
        p.standardError = log
        // If it dies (or lost the port to another server), check again in a moment and start a new one if needed.
        p.terminationHandler = { _ in DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if !self.quitting { self.startServerIfNeeded() } } }
        try? p.run()
        server = p
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
