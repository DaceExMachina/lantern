// The Lantern server without the app around it, for the replay tests: the files of app/ other than main.swift, run headless on
// LANTERN_PORT with its data in LANTERN_DATA. Its output is line-buffered, so the tests read "Lantern lit at <url>" as it starts.
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)
let env = ProcessInfo.processInfo.environment
let server = LanternServer(port: UInt16(env["LANTERN_PORT"]!)!, data: env["LANTERN_DATA"]!, web: env["LANTERN_WEB"]!)
server.screenLocked = { false } // a locked screen pauses adoption, and whoever runs the tests may have stepped away
server.mirror = env["LANTERN_MIRROR"].flatMap(URL.init(string:)) // npm run preview: the live app's sessions
server.start()
RunLoop.main.run()
