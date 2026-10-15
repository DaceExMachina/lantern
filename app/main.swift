// Lantern.app: the Lantern page in its own window, with a Dock icon and badge. The server runs on its own (a login
// item), so this only points a web view at it, the same as the screensaver.
import AppKit
import WebKit

let home = URL(string: "http://127.0.0.1:7717/")! // apps opened from the Dock don't get your shell's env, so the port is fixed here

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
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
        window.center()
        window.setFrameAutosaveName("Lantern") // remembers size and position between launches
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: home))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

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

    // At login the app can open before the server is up, so keep trying until it answers.
    func webView(_ web: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { web.load(URLRequest(url: home)) }
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
