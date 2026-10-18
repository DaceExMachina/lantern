// The Lantern server without the app around it, for the replay tests: Server.swift and Stats.swift, run headless on
// LANTERN_PORT with its data in LANTERN_DATA.
import Foundation

let env = ProcessInfo.processInfo.environment
let server = LanternServer(port: UInt16(env["LANTERN_PORT"]!)!, data: env["LANTERN_DATA"]!, web: env["LANTERN_WEB"]!)
server.start()
RunLoop.main.run()
