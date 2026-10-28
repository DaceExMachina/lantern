import Foundation

// What's playing on this Mac, for the page's now playing widget, and its buttons. The helper (app/helper/NowPlayingHelper.swift)
// is a library /usr/bin/perl loads, since macOS only answers Apple's own processes; it says what changed a line at a time
// (the item, and the cover when that changes), and takes a command a line. It's NowPlaying.dylib next to the server's executable (app/build.sh puts it in the app),
// or wherever LANTERN_NOW_PLAYING says, which the tests use. With no helper there's no widget.
let PERL_HOST = #"use DynaLoader; my $h = DynaLoader::dl_load_file($ARGV[0]) or die DynaLoader::dl_error(); my $f = DynaLoader::dl_find_symbol($h, "lantern_now_playing") or die "no lantern_now_playing"; DynaLoader::dl_install_xsub("main::run", $f); run()"#

extension LanternServer {
    func startNowPlaying(pause: Double = 1) {
        let lib = ProcessInfo.processInfo.environment["LANTERN_NOW_PLAYING"]
            ?? Bundle.main.executableURL!.deletingLastPathComponent().appendingPathComponent("NowPlaying.dylib").path
        guard FileManager.default.fileExists(atPath: lib) else { return }
        let p = Process(), out = Pipe(), input = Pipe(), began = Date()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        p.arguments = ["-e", PERL_HOST, lib]
        p.standardInput = input; p.standardOutput = out
        var pending = Data()
        out.fileHandleForReading.readabilityHandler = { h in
            let chunk = h.availableData
            if chunk.isEmpty { h.readabilityHandler = nil; return }
            // sync, so while the main queue is busy the pipe fills and the helper waits: a flood can't pile up in memory
            DispatchQueue.main.sync {
                guard self.nowPlayingHelper?.process === p else { return } // one already gone says nothing after its null
                pending += chunk
                while let nl = pending.firstIndex(of: 10) {
                    let line = String(decoding: pending[..<nl], as: UTF8.self)
                    pending = pending[(nl + 1)...]
                    if line.hasPrefix("item "), parse(Data(line.dropFirst(5).utf8)) != nil { self.setNowPlaying(String(line.dropFirst(5))) }
                    if line.hasPrefix("art ") { self.setNowPlaying(art: String(line.dropFirst(4))) }
                }
                if pending.count > 1 << 20 { pending = Data() } // a megabyte with no line end isn't one of ours
            }
        }
        // It only ends if it fails or is killed: the widget goes, and it comes back after a growing pause (one that can't
        // start must not spin); one that ran for half a minute starts the pause over.
        p.terminationHandler = { _ in
            DispatchQueue.main.async {
                guard self.nowPlayingHelper?.process === p else { return }
                self.nowPlayingHelper = nil; self.setNowPlaying("null"); self.setNowPlaying(art: "")
                let wait = Date().timeIntervalSince(began) > 30 ? 1 : pause
                print("now playing helper exited; trying again in \(Int(wait)) s")
                DispatchQueue.main.asyncAfter(deadline: .now() + wait) { self.startNowPlaying(pause: min(wait * 2, 600)) }
            }
        }
        nowPlayingHelper = (p, input.fileHandleForWriting)
        guard (try? p.run()) != nil else { nowPlayingHelper = nil; return print("now playing helper won't start") }
        _ = fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1) // a write after it died fails, rather than killing the server
    }
    // The helper says so on every change, the same item over and over as its time moves; only a difference goes out.
    func setNowPlaying(_ json: String) {
        guard json != nowPlaying else { return }
        nowPlaying = json
        send("event: nowPlaying\ndata: \(json)\n\n")
    }
    // the cover, a small data URL or "" (as JSON), on its own so a play or pause doesn't resend it
    func setNowPlaying(art: String) {
        guard art != nowPlayingArt else { return }
        nowPlayingArt = art
        send("event: nowPlayingArt\ndata: \(jsonText(art))\n\n")
    }
}
