// A stand-in for app/helper/NowPlayingHelper.swift in the server tests: no MediaRemote, the same lines in and out. It says
// everything twice, the way the real one repeats itself, and a toggle flips playing. FAKE_BUNDLE is the bundle id it names. FAKE_NOW_PLAYING picks a broken one:
// "deaf" closes its stdin and hangs on until the server goes, "fail" exits at once, and "flood" writes without end.
import Foundation

@_cdecl("lantern_now_playing") public func fakeNowPlaying() {
    setvbuf(stdout, nil, _IONBF, 0)
    var playing = true
    func say() { for _ in 0..<2 { print("art data:image/png;base64,AAAA"); print(#"item {"app":"Music","artist":"Band","bundle":"\#(ProcessInfo.processInfo.environment["FAKE_BUNDLE"] ?? "")","playing":\#(playing),"title":"Song"}"#) } }
    switch ProcessInfo.processInfo.environment["FAKE_NOW_PLAYING"] {
    case "deaf": close(0); say(); while getppid() != 1 { sleep(1) }; exit(0) // hangs on until the server goes, like the real one
    case "fail": exit(1)
    case "flood": let junk = String(repeating: "x", count: 65536); while true { print(junk, terminator: "") }
    default: break
    }
    say()
    while let line = readLine() { if line == "toggle" { playing.toggle(); say() } }
    exit(0)
}
