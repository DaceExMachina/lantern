// A stand-in for app/helper/NowPlayingHelper.swift in the server tests: no MediaRemote, the same lines in and out. It says
// everything twice, the way the real one repeats itself, and a toggle flips playing.
import Foundation

@_cdecl("lantern_now_playing") public func fakeNowPlaying() {
    setvbuf(stdout, nil, _IONBF, 0)
    var playing = true
    func say() { for _ in 0..<2 { print("art data:image/png;base64,AAAA"); print(#"item {"app":"Music","artist":"Band","playing":\#(playing),"title":"Song"}"#) } }
    say()
    while let line = readLine() { if line == "toggle" { playing.toggle(); say() } }
    exit(0)
}
