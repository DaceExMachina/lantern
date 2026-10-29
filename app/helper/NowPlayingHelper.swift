// What's playing on this Mac, from any app (Spotify, Music, a browser tab, a podcast app), and its play/pause, next and
// previous buttons: macOS's Now Playing service, the private MediaRemote framework behind Control Center's media widget.
//
// Since macOS 15.4 MediaRemote only answers Apple's own processes, so this is a library, not a program: the server runs
// /usr/bin/perl, which is Apple-signed, and has it load this and call lantern_now_playing (Server.swift startNowPlaying).
// The trick is ungive/mediaremote-adapter's (BSD-3-Clause, https://github.com/ungive/mediaremote-adapter); this is our own
// small version of it. It's unofficial, so a macOS update may close it: then it hears nothing and the widget never shows.
//
// Out, on stdout, a line each time something changes: "item " and the item as JSON ({ title, artist, app, bundle, playing }; bundle is the app's bundle identifier, or "") or
// null, and "art " and its cover (a data URL, or nothing) when that changes.
// In, on stdin: one command a line, "toggle", "next" or "previous". When stdin closes (the server has gone) it exits.
import AppKit
import ImageIO

let MR = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW)
func mr<T>(_ name: String, _ type: T.Type) -> T {
    guard let f = dlsym(MR, name) else { FileHandle.standardError.write(Data("no \(name)\n".utf8)); exit(1) }
    return unsafeBitCast(f, to: type) // cast: a C symbol to its signature, the only way to call one Swift found by name
}
let getInfo = mr("MRMediaRemoteGetNowPlayingInfo", (@convention(c) (DispatchQueue, @escaping @convention(block) (NSDictionary?) -> Void) -> Void).self)
let getPlaying = mr("MRMediaRemoteGetNowPlayingApplicationIsPlaying", (@convention(c) (DispatchQueue, @escaping @convention(block) (Bool) -> Void) -> Void).self)
let getClient = mr("MRMediaRemoteGetNowPlayingClient", (@convention(c) (DispatchQueue, @escaping @convention(block) (NSObject?) -> Void) -> Void).self)
let sendCommand = mr("MRMediaRemoteSendCommand", (@convention(c) (Int32, NSDictionary?) -> Bool).self)
let register = mr("MRMediaRemoteRegisterForNowPlayingNotifications", (@convention(c) (DispatchQueue) -> Void).self)
let COMMANDS: [String: Int32] = ["toggle": 2, "next": 4, "previous": 5] // MRCommand: kMRTogglePlayPause, kMRNextTrack, kMRPreviousTrack

// The app's bundle identifier, for the server to bring it to the front: a browser's media comes from a helper process,
// whose parent is the browser, so the parent's wins; "" when MediaRemote doesn't say.
func appBundle(_ client: NSObject?) -> String {
    for key in ["parentApplicationBundleIdentifier", "bundleIdentifier"] { if let id = client?.value(forKey: key) as? String, !id.isEmpty { return id } }
    return ""
}

// The app's name: the client's own, else its parent app's (a browser's media comes from a helper process).
func appName(_ client: NSObject?) -> String {
    guard let client else { return "" }
    if let name = client.value(forKey: "displayName") as? String, !name.isEmpty { return name }
    guard let parent = client.value(forKey: "parentApplicationBundleIdentifier") as? String,
          let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: parent) else { return "" }
    return FileManager.default.displayName(atPath: url.path).replacingOccurrences(of: ".app", with: "")
}

// The cover, scaled down to a small JPEG as a data URL (a few KB), or "" when it won't read.
func thumbnail(_ data: Data) -> String {
    let out = NSMutableData()
    guard let src = CGImageSourceCreateWithData(data as CFData, nil), // cast: Data bridges to CFData
          let img = CGImageSourceCreateThumbnailAtIndex(src, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 128] as CFDictionary), // cast: the options' bridge
          let dest = CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil) else { return "" } // cast: a literal's bridge
    CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary) // cast: the options' bridge
    return CGImageDestinationFinalize(dest) ? "data:image/jpeg;base64,\(out.base64EncodedString())" : ""
}

// The cover goes out on its own line, only when it changes, so play and pause don't resend it. A change mid-track can
// come without it, which would flicker it off, so a track keeps the last cover it had.
var art = (track: "", url: ""), sentArt = ""
func say(_ line: String) { FileHandle.standardOutput.write(Data((line + "\n").utf8)) }

func emit() {
    getClient(.main) { client in
        getPlaying(.main) { playing in
            getInfo(.main) { info in
                var item: Any = NSNull()
                if let info, let title = info["kMRMediaRemoteNowPlayingInfoTitle"] as? String, !title.isEmpty {
                    let artist = info["kMRMediaRemoteNowPlayingInfoArtist"] as? String ?? "", track = "\(title)\n\(artist)"
                    if art.track != track { art = (track, "") }
                    if art.url.isEmpty, let data = info["kMRMediaRemoteNowPlayingInfoArtworkData"] as? Data, !data.isEmpty { art.url = thumbnail(data) }
                    item = ["title": title, "artist": artist, "app": appName(client), "bundle": appBundle(client), "playing": playing]
                } else { art = ("", "") }
                if art.url != sentArt { sentArt = art.url; say("art " + art.url) }
                guard let json = try? JSONSerialization.data(withJSONObject: item, options: [.fragmentsAllowed, .sortedKeys]) else { return }
                say("item " + String(decoding: json, as: UTF8.self))
            }
        }
    }
}

@_cdecl("lantern_now_playing") public func lanternNowPlaying() {
    setvbuf(stdout, nil, _IONBF, 0)
    register(.main)
    for name in ["kMRMediaRemoteNowPlayingInfoDidChangeNotification", "kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification",
                 "kMRMediaRemoteNowPlayingApplicationDidChangeNotification"] {
        NotificationCenter.default.addObserver(forName: Notification.Name(name), object: nil, queue: .main) { _ in emit() }
    }
    var pending = ""
    FileHandle.standardInput.readabilityHandler = { h in
        let data = h.availableData
        if data.isEmpty { exit(0) } // the server has gone
        pending += String(decoding: data, as: UTF8.self)
        while let nl = pending.firstIndex(of: "\n") {
            let line = String(pending[..<nl]); pending = String(pending[pending.index(after: nl)...])
            if let c = COMMANDS[line] { _ = sendCommand(c, nil) }
        }
    }
    DispatchQueue.global().async { while getppid() != 1 { sleep(5) }; exit(0) } // the server died without closing stdin: don't linger
    emit()
    CFRunLoopRun()
}
