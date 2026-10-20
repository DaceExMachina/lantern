// Lantern's server, in Swift, inside the app: takes Claude Code hook events, keeps session state, streams it to the
// page over SSE, and rebuilds sessions from their transcripts on start. Sessions are kept as plain JSON dictionaries,
// so the page gets the snapshot as they are. All state lives on the main queue; disk, process and network work runs on background
// queues and hops back.
import Foundation
import Network
import CoreGraphics

let EXPIRE_MS = 20.0 * 60 * 1000 // a session silent this long is assumed dead (killed terminal, no SessionEnd)
let WAITING_EXPIRE_MS = 3.0 * 60 * 60 * 1000 // ...unless it's waiting on me, which can quietly take a while
let SEED_RECENT_MS = 15.0 * 60 * 1000 // on startup, also bring back any session whose transcript moved this recently
let TITLE_EVERY_MS = 15.0 * 1000
// A session waiting on background tasks counts as working while one is younger than this, or one of its agents was heard
// from this recently; past both, it's left open but quiet (a dev server, a stuck agent) and rests like an idle one.
let TASK_FRESH_MS = (Double(ProcessInfo.processInfo.environment["LANTERN_TASK_FRESH_SECONDS"] ?? "") ?? 30 * 60) * 1000
let AGENT_FRESH_MS = (Double(ProcessInfo.processInfo.environment["LANTERN_AGENT_FRESH_SECONDS"] ?? "") ?? 5 * 60) * 1000
// A subagent not heard from this long is assumed finished (its SubagentStop never came) and stops orbiting.
let AGENT_EXPIRE_MS = (Double(ProcessInfo.processInfo.environment["LANTERN_AGENT_EXPIRE_SECONDS"] ?? "") ?? 15 * 60) * 1000
// Only a subagent quiet this long gets its transcript read to see if it finished; busier ones are plainly alive.
let AGENT_CHECK_MS = (Double(ProcessInfo.processInfo.environment["LANTERN_AGENT_CHECK_SECONDS"] ?? "") ?? 2 * 60) * 1000
let WAITING_NOTIFICATIONS: Set<String> = ["permission_prompt", "idle_prompt", "elicitation_dialog", "agent_needs_input"]
let HOME = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
// Claude Code's config folder: CLAUDE_CONFIG_DIR, or `claudeDir` in Lantern's settings.json (an app opened from the Dock
// doesn't see your shell's env, so the installer writes it there), or ~/.claude. Settings can override it at startup.
var CLAUDE_DIR = ProcessInfo.processInfo.environment["CLAUDE_CONFIG_DIR"] ?? HOME + "/.claude"
var PROJECTS: String { CLAUDE_DIR + "/projects" }
// The user's first name, for the candle's pencil (page/pencil.js): Claude Code's account name in ~/.claude.json, else the
// Mac's. Only those two fields are used, and the name goes nowhere but the page, once as each page connects.
let FIRST_NAME: String = {
    let account = (parse(FileManager.default.contents(atPath: HOME + "/.claude.json") ?? Data()) as? JSON)?["oauthAccount"] as? JSON
    let name = [account?["displayName"], account?["fullName"]].compactMap { $0 as? String }.first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    return (name ?? NSFullUserName()).split(separator: " ").first.map(String.init) ?? ""
}()

typealias JSON = [String: Any]

// MARK: - Small JS-alikes, so the logic treats odd input the way JavaScript would

func now() -> Double { (Date().timeIntervalSince1970 * 1000).rounded(.down) }
/// quietUntil for quiet hours with no end (quiet until switched off): the latest time a JavaScript Date can hold.
let QUIET_FOREVER = 8.64e15

/// JavaScript truthiness for a parsed JSON value.
func truthy(_ v: Any?) -> Bool {
    switch v {
    case nil, is NSNull: return false
    case let s as String: return !s.isEmpty
    case let n as NSNumber: return n.boolValue && !n.doubleValue.isNaN
    default: return true
    }
}
/// What a JSON value turns into inside a JS template string or String(): undefined, null, numbers and all.
func str(_ v: Any?) -> String {
    switch v {
    case nil: return "undefined"
    case is NSNull: return "null"
    case let s as String: return s
    case let n as NSNumber:
        if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? "true" : "false" }
        let d = n.doubleValue
        return d == d.rounded() && abs(d) < 1e21 ? String(Int64(d)) : String(d)
    case let a as [Any]: return a.map { $0 is NSNull ? "" : str($0) }.joined(separator: ",")
    default: return "[object Object]"
    }
}
/// `a || b`, for JSON values.
func or(_ a: Any?, _ b: Any?) -> Any? { truthy(a) ? a : b }

func jsonText(_ v: Any) -> String {
    (try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed, .withoutEscapingSlashes]))
        .map { String(decoding: $0, as: UTF8.self) } ?? "null"
}
func parse(_ data: Data) -> Any? { try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) }

extension String {
    /// JS .slice(0, n), which counts UTF-16 code units.
    func cut(_ n: Int) -> String { utf16.count <= n ? self : String(decoding: Array(utf16.prefix(n)), as: UTF16.self) }
    var trim: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var full: NSRange { NSRange(location: 0, length: utf16.count) }
    func sub(_ r: NSRange) -> String? { r.location == NSNotFound ? nil : (self as NSString).substring(with: r) }
    /// Every run of non-alphanumerics becomes dashes, one per UTF-16 unit, the way Claude Code names project folders.
    var projectName: String { String(decoding: utf16.map { ($0 < 128 && isalnum(Int32($0)) != 0) ? $0 : 45 }, as: UTF16.self) }
}

// `\w`, `\d` and `\b` mean ASCII in JS but Unicode in ICU, so patterns here spell their classes out.
final class Re {
    let re: NSRegularExpression
    init(_ pattern: String, _ options: NSRegularExpression.Options = []) { re = try! NSRegularExpression(pattern: pattern, options: options) }
    func test(_ s: String) -> Bool { re.firstMatch(in: s, range: s.full) != nil }
    /// Like JS match(): the whole match then each group, nil for a group that didn't take part.
    func match(_ s: String) -> [String?]? { re.firstMatch(in: s, range: s.full).map { m in (0..<m.numberOfRanges).map { s.sub(m.range(at: $0)) } } }
    func matches(_ s: String) -> [NSTextCheckingResult] { re.matches(in: s, range: s.full) }
    func replace(_ s: String, _ template: String) -> String { re.stringByReplacingMatches(in: s, range: s.full, withTemplate: template) }
    func replaceFirst(_ s: String, _ template: String) -> String {
        guard let m = re.firstMatch(in: s, range: s.full) else { return s }
        return (s as NSString).replacingCharacters(in: m.range, with: re.replacementString(for: m, in: s, offset: 0, template: template))
    }
    func split(_ s: String) -> [String] {
        var out: [String] = [], at = 0
        for m in matches(s) where m.range.length > 0 || m.range.location > at {
            out.append(s.sub(NSRange(location: at, length: m.range.location - at))!)
            at = m.range.location + m.range.length
        }
        out.append(s.sub(NSRange(location: at, length: s.utf16.count - at))!)
        return out
    }
}

let UUID_RE = Re("^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$", .caseInsensitive)
let PR_CREATE = Re("\\bgh\\s+pr\\s+create\\b")
let PR_URL = Re("https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+")

/// An insertion-ordered map, like a JS Map: setting an existing key keeps its place.
struct Ordered<V> {
    private(set) var keys: [String] = []
    private var values: [String: V] = [:]
    subscript(key: String) -> V? {
        get { values[key] }
        set {
            if newValue == nil { if values.removeValue(forKey: key) != nil { keys.removeAll { $0 == key } } }
            else { if values[key] == nil { keys.append(key) }; values[key] = newValue }
        }
    }
    var items: [(String, V)] { keys.map { ($0, values[$0]!) } }
    var count: Int { keys.count }
}


/// Runs a command (found on PATH unless it's a full path) and returns its output, whatever its exit status.
func run(_ cmd: String, _ args: [String], cwd: String? = nil, timeout: Double = 10) -> (ok: Bool, out: String) {
    let p = Process(), out = Pipe()
    p.executableURL = URL(fileURLWithPath: cmd.hasPrefix("/") ? cmd : "/usr/bin/env")
    p.arguments = cmd.hasPrefix("/") ? args : [cmd] + args
    if let cwd { p.currentDirectoryURL = URL(fileURLWithPath: cwd) }
    p.standardInput = FileHandle.nullDevice
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    guard (try? p.run()) != nil else { return (false, "") }
    DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { if p.isRunning { p.terminate() } }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return (p.terminationStatus == 0 && p.terminationReason == .exit, String(decoding: data, as: UTF8.self))
}




// MARK: - The server

final class LanternServer {
    let port: UInt16
    let web: String // index.html and the icons
    let settingsFile: String, githubCache: String
    var settings: JSON = ["style": "barrel"]
    var sessions = Ordered<JSON>() // session_id -> what the hover card shows, as JSON
    var agents: [String: Ordered<JSON>] = [:] // session_id -> agent_id -> { type, description, activity, tries, last }
    var clients: [ObjectIdentifier: NWConnection] = [:]
    var reviews: [JSON] = [] // open PRs waiting on my review, from every account the sessions' folders use
    var stale: [JSON] = [] // my open PRs that no session owns and nobody has touched for a week, oldest first
    var owners: JSON = [:] // dead PR url -> the old session that made it (or NSNull: looked, found none); looked up once
    // the stale list as the page gets it: each PR with the old session that made it, when there is one
    func staleOut() -> [JSON] { stale.map { p in var p = p; if let o = owners[str(p["url"])] as? JSON { p["owner"] = o }; return p } }
    var accounts = Ordered<JSON>() // login -> { token, error }
    var signIn: JSON? // a device-flow sign-in in progress: { code, url, until }
    var refreshing = false
    var mirror: URL? // a preview's: the live app's /events, whose sessions it shows instead of finding its own (see follow())
    // the test server replaces it, since the machine running the tests may well be locked
    var screenLocked = { (CGSessionCopyCurrentDictionary() as? [String: Any])?["CGSSessionScreenIsLocked"] as? Bool == true }
    var broadcastDue = false, sentReviews = "[]", sentStale = "[]" // see broadcast()
    var listener: NWListener?
    var started = false
    var pageMtime = 0.0
    // The event log (Stats.swift), and what it last saw, so it only records changes.
    let stats: Stats
    struct Seen { var waiting = false, snoozed: String?, snoozing = false, title: String? }
    var seen: [String: Seen] = [:]
    var seeded = Set<String>() // sessions rebuilt from disk, not started while the lantern watched
    var recentProse: [String] = [] // runs of prose from the newest transcripts, ended sessions too, for the pages; memory only
    var violet = false, quiet = false
    var ownedPRs: [String: (need: String, session: String)] = [:]
    var strays: Int? // open PRs of mine that no session owns, as of the last refresh
    var buried = Set<String>() // the stale list the log last saw, by url

    init(port: UInt16, data: String, web: String) {
        self.port = port
        self.web = web
        try? FileManager.default.createDirectory(atPath: data, withIntermediateDirectories: true)
        settingsFile = data + "/settings.json"
        githubCache = data + "/github-cache.json"
        if let d = FileManager.default.contents(atPath: settingsFile), let j = parse(d) as? JSON { settings.merge(j) { $1 } }
        if let old = settings.removeValue(forKey: "graveyard") { settings["stale"] = settings["stale"] ?? old } // the old name of "stale"
        if let dir = settings["claudeDir"] as? String, !dir.isEmpty { CLAUDE_DIR = (dir as NSString).expandingTildeInPath }
        stats = Stats(data + "/stats.sqlite")
        stats.dayStart = clockMinutes(settings["dayStart"]) ?? 0
        // a badge just earned flashes on the open pages; only live, never in a new page's opening burst
        stats.onEarn = { [unowned self] id in self.send("event: badge\ndata: \(jsonText(["id": id]))\n\n") }
    }

    // Takes the port, or, while something else holds it (a lantern run from a checkout, say), keeps trying every few seconds.
    func start() {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        guard let l = try? NWListener(using: params) else { return retry() }
        listener = l
        l.newConnectionHandler = { [weak self] c in self?.accept(c) }
        l.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                print("Lantern lit at http://127.0.0.1:\(l.port?.rawValue ?? self.port)") // port 0 takes any free one, which the tests use
                if !self.started { self.started = true; self.begin() }
            case .failed: l.cancel(); self.retry()
            default: break
            }
        }
        l.start(queue: .main)
    }
    func retry() { DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.start() } }

    // Claude Code's hooks only reach the live app, so sessions a preview found itself would never change. It shows the
    // app's instead, each time the app sends them. When the stream ends (the app quitting, say) it keeps the last ones
    // and tries again every two seconds; a new stream starts with the app's current list.
    func follow(_ url: URL) {
        Task {
            while true {
                var heard = false
                if let (lines, _) = try? await URLSession.shared.bytes(from: url) {
                    var event: String?
                    do {
                        for try await line in lines.lines {
                            if line.hasPrefix("event: ") { event = String(line.dropFirst(7)); continue }
                            guard line.hasPrefix("data: ") else { continue }
                            // the sessions are the one message without an event name
                            if event == nil, let list = parse(Data(line.utf8.dropFirst(6))) as? [JSON] { heard = true; await MainActor.run { self.mirrored(list) } }
                            event = nil
                        }
                    } catch {}
                }
                if heard { print("Lost the app at \(url); showing its last sessions until it's back") }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }
    func mirrored(_ list: [JSON]) {
        sessions = Ordered(); agents = [:]
        for var s in list {
            let id = str(s["id"])
            var a = Ordered<JSON>()
            for var x in s.removeValue(forKey: "subagents") as? [JSON] ?? [] { a[str(x.removeValue(forKey: "id"))] = x }
            sessions[id] = s; agents[id] = a
        }
        broadcast()
    }

    func begin() {
        stats.open()
        stats.begin("server")
        ownedPRs = stats.ownedPRs()
        buried = stats.buried()
        stats.award(warmGoal: warmGoal)
        seed()
        loadAccounts()
        Timer.scheduledTimer(withTimeInterval: 2 * 60, repeats: true) { _ in self.refreshGitHub() }
        if let mirror { follow(mirror) } else {
            Timer.scheduledTimer(withTimeInterval: Double(ProcessInfo.processInfo.environment["LANTERN_SWEEP_SECONDS"] ?? "") ?? 30, repeats: true) { _ in self.sweep(); self.linkSpawned() }
            Timer.scheduledTimer(withTimeInterval: Double(ProcessInfo.processInfo.environment["LANTERN_ADOPT_SECONDS"] ?? "") ?? 60, repeats: true) { _ in self.adopt() }
        }
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in // quiet hours start or end with nothing else happening
            if self.autoQuiet() { self.settingsChanged() } else { self.observe() }
        }
        Timer.scheduledTimer(withTimeInterval: 5 * 60, repeats: true) { _ in self.gauge() }
        // Open pages (the toolbelt panel, the Dock app, the screensaver) reload themselves when the page changes on disk.
        pageMtime = pageVersion()
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            let v = self.pageVersion()
            if v != self.pageMtime { self.pageMtime = v; self.send("event: version\ndata: \(str(v))\n\n") }
        }
    }

    // MARK: state out

    // Sessions snoozed for good stay snoozed through new activity and restarts, until they're woken by hand.
    // ponytail: the list is never pruned; ids are small and a resumed session keeps its id.
    func forGood(_ id: String) -> Bool { (settings["snoozedForGood"] as? [Any] ?? []).contains { str($0) == id } }
    func snapshot() -> String {
        jsonText(sessions.items.map { id, s -> JSON in
            var out = s
            for key in ["titleRead", "unconfirmed", "kitty", "taskSince", "resting"] { out[key] = nil } // the server's own bookkeeping; the page never reads them
            if forGood(id) { out["snoozed"] = true; out["forGood"] = true }
            out["subagents"] = (agents[id] ?? Ordered()).items.map { aid, a in a.merging(["id": aid]) { $1 } }
            return out
        })
    }
    // Session text (the barrel's pages) are on unless settings.json says "off"; while off, none are read, kept or sent.
    var wordsOn: Bool { settings["lanternText"] as? String != "off" }
    func send(_ msg: String) { for c in clients.values { write(c, msg) } }
    /// Tells the pages something changed. Hook events arrive in bursts, so one send, a moment later, covers them all.
    func broadcast() {
        if broadcastDue { return }
        broadcastDue = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.broadcastDue = false; self.sendState() }
    }
    // The sessions go out every time; the PR lists only when they differ from what the pages last got.
    func sendState() {
        observe()
        var msg = ""
        let r = jsonText(reviews), g = jsonText(staleOut())
        if r != sentReviews { sentReviews = r; msg += "event: reviews\ndata: \(r)\n\n" }
        if g != sentStale { sentStale = g; msg += "event: stale\ndata: \(g)\n\n" }
        send(msg + "data: \(snapshot())\n\n")
    }
    func githubState() -> JSON { ["accounts": accounts.items.map { ["login": $0.0, "error": or($0.1["error"], "")!] }, "signIn": signIn ?? NSNull()] }
    func broadcastGitHub() { send("event: github\ndata: \(jsonText(githubState()))\n\n") }
    /// Saves the settings and tells every open window.
    func settingsChanged() {
        saveSettings()
        observe()
        send("event: settings\ndata: \(jsonText(settings))\n\n")
    }
    func saveSettings() {
        let text = String(decoding: (try? JSONSerialization.data(withJSONObject: settings, options: [.prettyPrinted, .withoutEscapingSlashes])) ?? Data(), as: UTF8.self)
        DispatchQueue.global().async { [settingsFile] in try? (text + "\n").write(toFile: settingsFile, atomically: true, encoding: .utf8) }
    }
    // the newest change to index.html or any of its scripts in page/
    func pageVersion() -> Double {
        let scripts = ((try? FileManager.default.contentsOfDirectory(atPath: web + "/page")) ?? []).map { web + "/page/" + $0 }
        return ([web + "/index.html"] + scripts).compactMap { fileTimes($0)?.mtime }.max() ?? 0
    }

    // MARK: hook events

    func handle(_ e: JSON) {
        guard let id = e["session_id"] as? String, !id.isEmpty else { return }
        let ev = e["hook_event_name"] as? String
        if ev == "SessionEnd" { sessions[id] = nil; agents[id] = nil; return }

        var s = sessions[id] ?? ["id": id, "cwd": or(e["cwd"], "")!, "state": "working", "started": now(), "last": 0]
        if agents[id] == nil { agents[id] = Ordered() }
        defer { settle(&s, id); sessions[id] = s } // (until the end of this function, s is a copy)
        s["last"] = now()
        if ev == "PreToolUse" { s["ticks"] = ((s["ticks"] as? Int) ?? 0) + 1 } // each tool call, its agents' included, sends a pulse down its thread
        // A session (or one of its agents) that runs `gh pr create` claims the PR: its URL is in the command's output.
        if ev == "PostToolUse" && str(e["tool_name"]) == "Bash" && PR_CREATE.test(str(or((e["tool_input"] as? JSON)?["command"], ""))),
           let url = PR_URL.match(jsonText(or(e["tool_response"], "")!))?[0] {
            var created = s["created"] as? [String] ?? []
            if !created.contains(url) {
                created.append(url); s["created"] = created
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.refreshGitHub() }
            }
        }
        s["unconfirmed"] = false
        if truthy(e["cwd"]) { s["cwd"] = e["cwd"] }
        if let pid = e["pid"] as? String, Re("^[0-9]+$").test(pid) { s["pid"] = Int(pid) ?? Double(pid)! } // the Claude Code process the hook ran under ($PPID)
        let iterm = ((e["iterm"] as? String) ?? "").components(separatedBy: ":").last! // ITERM_SESSION_ID looks like w0t1p0:<uuid>
        if UUID_RE.test(iterm) { s["iterm"] = iterm }
        // which terminal (or app) runs it, so a click can bring the right window to the front; see focusTerminal
        for (key, pattern) in [("term", "^[A-Za-z0-9._ -]{1,40}$"), ("app", "^[A-Za-z0-9.-]{1,100}$"), ("pane", "^[0-9]{1,9}$"), ("kitty", "^(unix|tcp):[^\\s'\"]{1,200}$")] {
            if let v = e[key] as? String, Re(pattern).test(v) { s[key] = v }
        }
        let dir = sessionDir(e["transcript_path"])
        if let dir { s["project"] = ((dir as NSString).deletingLastPathComponent as NSString).lastPathComponent }
        if let dir, now() - ((s["titleRead"] as? Double) ?? 0) > TITLE_EVERY_MS {
            s["titleRead"] = now()
            loadTitle(id, dir)
        }

        // Any event from inside a subagent tells us it exists, so agents started before the hooks or server still show up.
        if truthy(e["agent_id"]) {
            let aid = str(e["agent_id"])
            if ev == "SubagentStop" { agents[id]![aid] = nil }
            else {
                var a = agents[id]![aid] ?? ["type": "", "description": "", "activity": "", "tries": 0]
                // its meta file may not be written yet on the very first event, so try a few times
                if !truthy(a["description"]), let dir {
                    let tries = a["tries"] as? Int ?? 0
                    a["tries"] = tries + 1
                    if tries < 3 && Re("^[A-Za-z0-9_-]+$").test(aid) { loadAgentMeta(id, aid, "\(dir)/subagents/agent-\(aid).meta.json") }
                }
                a["type"] = or(e["agent_type"], a["type"])
                if ev == "PreToolUse" { a["activity"] = describe(e["tool_name"] as? String, e["tool_input"] as? JSON ?? [:]) }
                a["last"] = now()
                agents[id]![aid] = a
            }
            // Background agents keep working after the turn ends, so their activity mustn't clear "needs you". Them asking for me still counts.
            if ev != "PermissionRequest" && ev != "Notification" { return }
        }

        switch ev {
        case "SessionStart":
            s["state"] = "idle"
            s["resting"] = nil
        case "Stop":
            // Three ways a turn ends: agents still running and nothing to ask (not waiting on me), agents running but
            // it asked me something, or fully stopped. Only the first one leaves me alone.
            let running = (e["background_tasks"] as? [JSON] ?? []).filter { !truthy($0["status"]) || str($0["status"]) == "running" }
            let q = questionIn(e["last_assistant_message"])
            let tasks = running.isEmpty ? "" : "\(running.count) background task\(running.count > 1 ? "s" : "")"
            s["tasks"] = Array(running.map { $0["description"] }.filter(truthy).prefix(4)).map { $0! }
            // when each task was first seen running (the payload has no start time), kept across turns so a dev server stays old
            let since = s["taskSince"] as? [String: Double] ?? [:]
            s["taskSince"] = Dictionary(running.enumerated().map { i, t in
                let key = str(or(t["id"], or(t["description"], "\(i)")))
                return (key, since[key] ?? now())
            }) { a, _ in a }
            s["forYou"] = forYou(e["last_assistant_message"])
            if wordsOn {
                let said = s["prose"] as? [String] ?? [], fresh = prose(e["last_assistant_message"]).filter { !said.contains($0) }
                if !fresh.isEmpty { s["prose"] = Array((said + fresh).suffix(10)) } // the newest few runs
            }
            s["error"] = false
            if !running.isEmpty && q.isEmpty { s["state"] = "paused"; s["note"] = "Waiting on \(tasks)" }
            else { s["state"] = "waiting"; s["note"] = (q.isEmpty ? "Finished its turn" : "Asks: \(q)") + (tasks.isEmpty ? "" : " (\(tasks) still running)") }
        case "StopFailure":
            s["state"] = "waiting"
            s["note"] = "Turn ended with an API error"
            s["error"] = true // the moth lands singed
            stats.event("api_error", id)
        // A /compact you run yourself ends back at the prompt with no Stop after it, so put the session back to idle.
        // An automatic compact carries on with whatever the session was doing (working mid-turn, or waiting), so leave that.
        case "PreCompact":
            s["activity"] = "Compacting the conversation"
            stats.event("compact", id, ["trigger": e["trigger"] ?? NSNull()])
            if str(e["trigger"]) == "manual" { s["state"] = "working" }
        case "PostCompact":
            s["activity"] = ""
            if str(e["trigger"]) == "manual" { s["state"] = "idle"; s["note"] = "" }
        case "PermissionRequest":
            s["state"] = "waiting"
            s["note"] = "Wants permission to use \(truthy(e["tool_name"]) ? str(e["tool_name"]) : "a tool")"
        case "Notification":
            // the "idle, waiting for input" nudge also fires while a session waits on its agents; that one doesn't count
            if str(e["notification_type"]) == "idle_prompt" && (str(s["state"]) == "paused" || truthy(s["resting"])) { break }
            if let t = e["notification_type"] as? String, WAITING_NOTIFICATIONS.contains(t) { s["state"] = "waiting"; s["note"] = or(e["message"], s["note"]) }
        default: // UserPromptSubmit, PreToolUse, PostToolUse: the session is moving, so it no longer needs me
            s["state"] = "working"
            s["note"] = ""
            s["tasks"] = [Any]()
            s["error"] = false
            s["snoozed"] = false // a snooze only covers the wait it was set on
            if ev == "UserPromptSubmit" && truthy(e["prompt"]) { s["prompt"] = cleanPrompt(str(e["prompt"])) }
            if ev == "PreToolUse" { s["activity"] = describe(e["tool_name"] as? String, e["tool_input"] as? JSON ?? [:]) }
            if ev == "UserPromptSubmit" { s["activity"] = "Thinking about your message" }
        }
        // when it started waiting on me: the footer goes oldest first, and moths grow restless the longer it's been
        if str(s["state"]) == "waiting" { if !truthy(s["waitingSince"]) { s["waitingSince"] = now() } } else { s["waitingSince"] = 0 }
        if str(s["state"]) != "idle" { s["resting"] = nil }
    }

    /// A session waiting on background tasks is paused (working) while one of them is fresh or an agent was heard from
    /// lately, and otherwise rests as idle, open but quiet. Runs after every event and on the sweep; says if it changed.
    @discardableResult func settle(_ s: inout JSON, _ id: String) -> Bool {
        guard str(s["state"]) == "paused" || truthy(s["resting"]) else { return false }
        let t = now(), since = s["taskSince"] as? [String: Double] ?? [:]
        let heard = (agents[id]?.items.compactMap { $0.1["last"] as? Double } ?? []).max() ?? 0
        let busy = since.values.contains { t - $0 < TASK_FRESH_MS } || t - heard < AGENT_FRESH_MS
        let tasks = "\(since.count) background task\(since.count == 1 ? "" : "s")"
        let before = (str(s["state"]), str(s["note"]))
        s["state"] = busy ? "paused" : "idle"
        s["resting"] = busy ? nil : true
        s["note"] = busy ? "Waiting on \(tasks)" : "\(tasks) open for \(Int((t - max(since.values.min() ?? t, heard)) / 60000))m" // since the oldest opened, or an agent last spoke
        return before != (str(s["state"]), str(s["note"]))
    }


    // A closed terminal tab or a killed process can skip SessionEnd, so a session whose Claude process is gone ends here.
    func sweep() {
        let t = now()
        var changed = false
        reconcile()
        for (id, var s) in sessions.items {
            if settle(&s, id) { sessions[id] = s; changed = true }
            // with its process known, only that decides: a closed session goes, an open one stays however quiet it's been
            if truthy(s["pid"]) {
                let pid = pid_t(str(s["pid"])) ?? 0
                if kill(pid, 0) != 0 && errno != EPERM { sessions[id] = nil; agents[id] = nil; changed = true }
                continue
            }
            // a session only seen on disk gets the normal timeout until it proves it's alive with a real event
            let limit = str(s["state"]) == "waiting" && !truthy(s["unconfirmed"]) ? WAITING_EXPIRE_MS : EXPIRE_MS
            if t - ((s["last"] as? Double) ?? 0) > limit { sessions[id] = nil; agents[id] = nil; changed = true; continue }
        }
        if changed { broadcast() }
    }

    // A side session whose parent is still alive reports back to that session, so its waiting isn't waiting on Dace.
    func reportsBack(_ s: JSON) -> Bool { truthy(s["parent"]) && sessions[str(s["parent"])] != nil }


    // MARK: the event log: what changed since it last looked, called on every broadcast so it sees what the page sees

    func observe() {
        let t = now() // one clock reading per look, so spans that change together (a wait and its snooze) share it
        let quietNow = ((settings["quietUntil"] as? NSNumber)?.doubleValue ?? 0) > t
        for (id, s) in sessions.items {
            var was = seen[id] ?? Seen()
            let title = truthy(s["title"]) ? str(s["title"]) : nil, project = s["project"] ?? NSNull()
            if seen[id] == nil { stats.begin("alive", id, ["title": title ?? NSNull(), "project": project, "seeded": seeded.contains(id)], at: t) }
            else if title != was.title, let title { stats.note("alive", id, ["title": title]); if was.waiting { stats.note("waiting", id, ["title": title]) } }
            was.title = title
            let waiting = str(s["state"]) == "waiting" && !reportsBack(s) // a side session reporting back isn't waiting on Dace
            if waiting != was.waiting {
                if waiting { stats.begin("waiting", id, ["title": title ?? NSNull(), "project": project], at: t) } else { stats.end("waiting", id, ["how": "answered"], at: t) }
                was.waiting = waiting
                was.snoozed = nil
            }
            // snoozed during the wait: for a while (until it does something new) or for good
            let snoozed = forGood(id) ? "forGood" : truthy(s["snoozed"]) ? "temporary" : nil
            if waiting, let snoozed, snoozed != was.snoozed { stats.note("waiting", id, ["snoozed": snoozed]); was.snoozed = snoozed }
            // the stretches of the wait it was snoozed, by hand or by quiet hours
            let snoozing = waiting && (snoozed != nil || quietNow)
            if snoozing != was.snoozing { if snoozing { stats.begin("snoozed", id, at: t) } else { stats.end("snoozed", id, at: t) }; was.snoozing = snoozing }
            seen[id] = was
        }
        for (id, was) in seen where sessions[id] == nil {
            if was.waiting { stats.end("waiting", id, ["how": "ended"], at: t) }
            if was.snoozing { stats.end("snoozed", id, at: t) }
            stats.end("alive", id, ["how": "ended"], at: t)
            seen[id] = nil
        }
        // the lantern's colour, worked out the way the page does it
        let violetNow = !quietNow && sessions.items.contains { str($0.1["state"]) == "waiting" && !reportsBack($0.1) && !truthy($0.1["snoozed"]) && !forGood($0.0) }
        if quietNow != quiet { if quietNow { stats.begin("quiet", at: t) } else { stats.end("quiet", at: t) }; quiet = quietNow }
        if violetNow != violet { if violetNow { stats.begin("violet", at: t) } else { stats.end("violet", at: t) }; violet = violetNow }
        // badges for what's on screen right now (Stats.earn gives each once a day): ten agents in one session, ten open PRs
        // owned by one session, twenty fireflies in flight, stale PRs past their 30 (the faint cloud shows), and one ghost moth
        // (an old session) behind five stale PRs
        if agents.values.contains(where: { $0.count >= 10 }) { stats.earn("hive_mind") }
        let open = ownedPRs.filter { !["merged", "closed"].contains($0.value.need) }
        if Dictionary(grouping: open.values, by: \.session).values.contains(where: { $0.count >= 10 }) { stats.earn("swarm_season") }
        if open.count >= 20 { stats.earn("light_pollution") }
        if stale.count > 30 { stats.earn("haunted") }
        let ghosts = stale.compactMap { (owners[str($0["url"])] as? JSON)?["id"] as? String }
        if Dictionary(grouping: ghosts) { $0 }.values.contains(where: { $0.count >= 5 }) { stats.earn("restless_spirits") }
    }
    /// Quiet until (settings.quietEnd, on unless settings.quietEndOn is false): whether quiet hours end by themselves.
    var quietEndOn: Bool { (settings["quietEndOn"] as? NSNumber)?.boolValue ?? true }
    /// When quiet hours started now would end: the next quietEnd, or never while quiet until is off.
    func quietEndsAt(_ t: Date = Date()) -> Double {
        guard quietEndOn else { return QUIET_FOREVER }
        let ended = lastAt(clockMinutes(settings["quietEnd"]) ?? 8 * 60, t)
        return (Calendar.current.date(byAdding: .day, value: 1, to: ended)!.timeIntervalSince1970 * 1000).rounded()
    }
    /// Quiet from (settings.quietFrom): quiet hours start by themselves once a night, as if the moon were pressed. Not if
    /// quiet hours already started, or were turned on or off by hand, since that night's quietFrom (quietUntil says when
    /// they last ended, or will), nor once quietEnd has passed while quiet until is on. True when it turned them on.
    @discardableResult
    func autoQuiet() -> Bool {
        guard let from = clockMinutes(settings["quietFrom"]) else { return false }
        let t = Date(), began = lastAt(from, t), ended = lastAt(clockMinutes(settings["quietEnd"]) ?? 8 * 60, t)
        let until = (settings["quietUntil"] as? NSNumber)?.doubleValue ?? 0
        guard !quietEndOn || ended < began, until < began.timeIntervalSince1970 * 1000 else { return false }
        settings["quietUntil"] = quietEndsAt(t)
        return true
    }
    /// The warm moths goal from the stats panel, or 75%: it decides which days count toward a warm streak.
    var warmGoal: Double { ((settings["goals"] as? JSON)?["warm"] as? NSNumber)?.doubleValue ?? 75 }

    // PR changes, from what the sessions own after a refresh. One no session owns any more was merged or closed, or is
    // still open with no session (a stray), or fell out of the closed search (gone). Stale list changes go in too.
    func logPRs(open: Set<String>, closed: [String: String]) {
        var owned: [String: (need: String, session: String, title: Any)] = [:]
        for (id, s) in sessions.items {
            for p in s["github"] as? [JSON] ?? [] where owned[str(p["url"])] == nil { owned[str(p["url"])] = (str(p["need"]), id, p["title"] ?? NSNull()) }
        }
        for (url, p) in owned where ownedPRs[url]?.need != p.need {
            let was = ownedPRs[url]
            stats.event("pr", p.session, ["url": url, "change": was == nil ? "appeared" : "need", "need": p.need, "from": was?.need ?? NSNull(), "title": p.title])
        }
        for (url, was) in ownedPRs where owned[url] == nil {
            let change = open.contains(url) ? "stray" : closed[url].map { $0 == "MERGED" ? "merged" : "closed" } ?? "gone"
            stats.event("pr", was.session, ["url": url, "change": change, "from": was.need])
        }
        ownedPRs = owned.mapValues { ($0.need, $0.session) }
        strays = open.subtracting(owned.keys).count
        // PRs entering the stale list, and leaving it: merged, closed, or revived (a session took it, or someone touched it)
        let dead = Set(stale.map { str($0["url"]) })
        for url in dead.subtracting(buried) { stats.event("stale", nil, ["url": url, "change": "entered"]) }
        for url in buried.subtracting(dead) {
            let how = open.contains(url) ? "revived" : closed[url].map { $0 == "MERGED" ? "merged" : "closed" } ?? "gone"
            stats.event("stale", nil, ["url": url, "change": "left", "how": how])
        }
        buried = dead
    }

    func gauge() {
        let waiting = sessions.items.filter { str($0.1["state"]) == "waiting" }
        let fireflies = Set(sessions.items.flatMap { ($0.1["github"] as? [JSON] ?? []).filter { !["merged", "closed"].contains(str($0["need"])) }.map { str($0["url"]) } })
        stats.gauge([("alive", sessions.count), ("working", sessions.items.filter { ["working", "paused"].contains(str($0.1["state"])) }.count),
                     ("waiting", waiting.count), ("snoozed", waiting.filter { truthy($0.1["snoozed"]) || forGood($0.0) }.count),
                     ("fireflies", fireflies.count), ("agents", agents.values.reduce(0) { $0 + $1.count }), ("strays", strays), ("stale", stale.count)])
        stats.award(warmGoal: warmGoal)
    }

    // MARK: HTTP

    struct Request { var method = "", url = "", headers: [String: String] = [:], body = Data() }

    func accept(_ c: NWConnection) {
        c.start(queue: .main)
        receive(c, Data())
    }
    // Reads one request: headers, then a Content-Length body. Bodies past the endpoint's limit drop the connection.
    func receive(_ c: NWConnection, _ buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
            var buffer = buffer
            if let data { buffer.append(data) }
            guard let end = buffer.range(of: Data("\r\n\r\n".utf8)) else {
                if isComplete || error != nil || buffer.count > 65536 { c.cancel() } else { self.receive(c, buffer) }
                return
            }
            let lines = String(decoding: buffer[..<end.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
            let first = lines[0].components(separatedBy: " ")
            var req = Request(method: first[0], url: first.count > 1 ? first[1] : "")
            for l in lines.dropFirst() { if let i = l.firstIndex(of: ":") { req.headers[l[..<i].lowercased()] = String(l[l.index(after: i)...]).trim } }
            let length = Int(req.headers["content-length"] ?? "") ?? 0
            if length > (req.url == "/event" ? 1_000_000 : 10_000) { return c.cancel() }
            req.body = buffer[end.upperBound...]
            if req.body.count < length {
                if isComplete || error != nil { return c.cancel() }
                return self.receive(c, buffer)
            }
            req.body = req.body.prefix(length)
            self.route(req, c)
        }
    }
    func respond(_ c: NWConnection, _ status: Int, _ type: String? = nil, _ body: Data = Data()) {
        let reason = [200: "OK", 204: "No Content", 400: "Bad Request", 404: "Not Found", 500: "Internal Server Error"][status] ?? ""
        var head = "HTTP/1.1 \(status) \(reason)\r\nConnection: close\r\n"
        if let type { head += "Content-Type: \(type)\r\n" }
        if status != 204 { head += "Content-Length: \(body.count)\r\n" }
        c.send(content: Data((head + "\r\n").utf8) + body, completion: .contentProcessed { _ in c.cancel() })
    }
    func write(_ c: NWConnection, _ text: String) {
        c.send(content: Data(text.utf8), completion: .contentProcessed { error in
            if error != nil { self.clients[ObjectIdentifier(c)] = nil; c.cancel() }
        })
    }

    func route(_ req: Request, _ c: NWConnection) {
        let post = req.method == "POST"
        // The endpoints that change things only take a JSON POST, which other websites can't send here without a CORS
        // preflight we never answer.
        let json = post && req.headers["content-type"] == "application/json"
        let body = parse(req.body) as? JSON
        if post && req.url == "/event" {
            if var e = body {
                e["iterm"] = req.headers["x-iterm-session"]; e["pid"] = req.headers["x-claude-pid"]
                e["term"] = req.headers["x-term-program"]; e["app"] = req.headers["x-term-app"]
                e["pane"] = req.headers["x-term-pane"]; e["kitty"] = req.headers["x-kitty-socket"]
                handle(e); broadcast()
            }
            return respond(c, 200)
        }
        // Resume the old session behind a dead moth: a new iTerm tab in its folder running `claude --resume <id>`.
        // Only sessions that own something on the stale list can be resumed this way.
        if json && req.url == "/resume" {
            guard let id = body?["id"] as? String, UUID_RE.test(id),
                  let o = owners.values.compactMap({ $0 as? JSON }).first(where: { str($0["id"]) == id }) else { return respond(c, 404) }
            let shell = "cd '\(str(o["cwd"]).replacingOccurrences(of: "'", with: "'\\''"))' && claude --resume \(id)"
            let script = shell.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            DispatchQueue.global().async {
                let r = run("osascript", ["-e", """
                    tell application "iTerm2"
                      activate
                      if (count of windows) = 0 then
                        create window with default profile
                      else
                        tell current window to create tab with default profile
                      end if
                      tell current session of current window to write text "\(script)"
                    end tell
                    """], timeout: 30)
                DispatchQueue.main.async { self.respond(c, r.ok ? 204 : 500) }
            }
            return
        }
        // Bring a session's window to the front: its iTerm2 tab, else whatever focusElsewhere can do for its terminal.
        if json && req.url == "/focus" {
            guard let id = body?["id"] as? String, let s = sessions[id] else { return respond(c, 404) }
            let focus = { (tab: Any?) in
                DispatchQueue.global().async {
                    var ok = false
                    if let tab = tab as? String, UUID_RE.test(tab) {
                        ok = run("osascript", ["-e", """
                            tell application "iTerm2"
                              repeat with w in windows
                                repeat with t in tabs of w
                                  repeat with s in sessions of t
                                    if unique id of s is "\(tab)" then
                                      select w
                                      tell t to select
                                      tell s to select
                                      activate
                                      return
                                    end if
                                  end repeat
                                end repeat
                              end repeat
                            end tell
                            """], timeout: 60).ok
                    }
                    if !ok { ok = focusElsewhere(s) }
                    if !ok { print("focus failed") }
                    DispatchQueue.main.async { self.respond(c, ok ? 204 : 404) }
                }
            }
            // iTerm2 tabs can be looked up when the hooks haven't said which one (a seeded session says nothing)
            if truthy(s["iterm"]) || truthy(s["term"]) || truthy(s["app"]) { return focus(s["iterm"]) }
            return findIterm(id) { tab in
                if self.sessions[id] != nil { self.sessions[id]!["iterm"] = tab ?? NSNull() }
                focus(tab)
            }
        }
        // Snooze or wake a session: it stops counting as needing me until it does something new, or with "always" for good.
        if json && req.url == "/snooze" {
            guard let j = body, let id = j["id"] as? String, sessions[id] != nil else { return respond(c, 404) }
            sessions[id]!["snoozed"] = truthy(j["snoozed"])
            let rest = (settings["snoozedForGood"] as? [Any] ?? []).filter { str($0) != id }
            settings["snoozedForGood"] = (j["snoozed"] as? String) == "always" ? rest + [id] : rest
            saveSettings()
            broadcast()
            return respond(c, 204)
        }
        // Connect GitHub: start a device-flow sign-in, or disconnect an account.
        if json && req.url == "/github" {
            let j = body ?? [:]
            if truthy(j["connect"]) { connectGitHub() }
            else if truthy(j["cancel"]) { signIn = nil; broadcastGitHub() }
            else if let login = j["disconnect"] as? String, accounts[login] != nil { disconnectGitHub(login) }
            else { return respond(c, 400) }
            return respond(c, 204)
        }
        // Change a shared setting and tell every open window.
        if json && req.url == "/settings" {
            var ok = false
            if let j = body {
                if let github = j["github"] as? NSNumber, CFGetTypeID(github) == CFBooleanGetTypeID() {
                    settings["github"] = github.boolValue; ok = true
                    if github.boolValue { DispatchQueue.main.async { self.refreshGitHub() } } else { clearGitHub() }
                }
                if let style = j["style"] as? String, Re("^[a-z]+$").test(style) { settings["style"] = style; ok = true }
                // goals for the stats panel: a number turns one on, null turns it off
                if let g = j["goals"] as? JSON {
                    var goals = settings["goals"] as? JSON ?? [:]
                    for key in ["fireflies", "answer", "warm"] {
                        if g[key] is NSNull { goals[key] = nil; ok = true }
                        if let n = g[key] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite, n.doubleValue >= 0 { goals[key] = n; ok = true }
                    }
                    settings["goals"] = goals
                }
                if let g = j["stale"] as? NSNumber, CFGetTypeID(g) == CFBooleanGetTypeID() { settings["stale"] = g.boolValue; ok = true }
                // session text on the barrel: turning them off drops every word held; turning them on reads the pool afresh
                if let t = j["lanternText"] as? String, ["sessions", "off"].contains(t) {
                    let was = wordsOn
                    settings["lanternText"] = t; ok = true
                    if was && !wordsOn {
                        recentProse = []
                        for (id, _) in sessions.items { sessions[id]!["prose"] = nil }
                        send("event: prose\ndata: []\n\n"); broadcast()
                    }
                    if !was && wordsOn { seedProse() }
                }
                // the last day a recap opened by itself, so every window shows each one once
                if let day = j["recapSeen"] as? String, Re("^[0-9]{4}-[0-9]{2}-[0-9]{2}$").test(day) { settings["recapSeen"] = day; ok = true }
                // quiet hours: every wait counts as snoozed until then. Ending them (a time already past) keeps when they
                // ended, so quiet from (autoQuiet) knows they were turned off tonight and leaves them off.
                if let quiet = j["quietUntil"] as? NSNumber, CFGetTypeID(quiet) != CFBooleanGetTypeID(), quiet.doubleValue.isFinite {
                    settings["quietUntil"] = max(quiet.doubleValue, now()); ok = true
                }
                // times of day, "HH:MM": the day rollover (a stats day starts), when quiet hours end, and when they start by themselves (null: never)
                for key in ["dayStart", "quietEnd", "quietFrom"] where clockMinutes(j[key]) != nil { settings[key] = j[key]; ok = true }
                if j["quietFrom"] is NSNull { settings["quietFrom"] = nil; ok = true }
                // quiet until switched on or off: quiet hours already on now end at quietEnd, or last until the moon is pressed
                if let on = j["quietEndOn"] as? NSNumber, CFGetTypeID(on) == CFBooleanGetTypeID() {
                    settings["quietEndOn"] = on.boolValue; ok = true
                    if ((settings["quietUntil"] as? NSNumber)?.doubleValue ?? 0) > now() { settings["quietUntil"] = quietEndsAt() }
                }
                if let ribbon = j["ribbon"] as? String, Re("^[a-z]+$").test(ribbon) { settings["ribbon"] = ribbon; ok = true } // the barrel's bookmark colour
            }
            if !ok { return respond(c, 400) }
            stats.dayStart = clockMinutes(settings["dayStart"]) ?? 0
            autoQuiet()
            settingsChanged()
            return respond(c, 204)
        }
        if req.url == "/events" {
            clients[ObjectIdentifier(c)] = c
            c.stateUpdateHandler = { state in
                if case .failed = state { self.clients[ObjectIdentifier(c)] = nil }
                if case .cancelled = state { self.clients[ObjectIdentifier(c)] = nil }
            }
            write(c, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n")
            write(c, "retry: 2000\nevent: version\ndata: \(str(pageVersion()))\n\nevent: prose\ndata: \(jsonText(recentProse))\n\nevent: settings\ndata: \(jsonText(settings))\n\nevent: github\ndata: \(jsonText(githubState()))\n\nevent: reviews\ndata: \(jsonText(reviews))\n\nevent: stale\ndata: \(jsonText(staleOut()))\n\nevent: name\ndata: \(jsonText(FIRST_NAME))\n\ndata: \(snapshot())\n\n")
            // a closed page shows up as the connection ending, so keep reading until it does
            func drain() { c.receive(minimumIncompleteLength: 1, maximumLength: 1024) { _, _, done, error in if done || error != nil { self.clients[ObjectIdentifier(c)] = nil; c.cancel() } else { drain() } } }
            drain()
            return
        }
        // Today and the seven days before it (local days), for the stats panel. Read-only, and computed off the main queue.
        if req.method == "GET" && req.url == "/stats" {
            return stats.report(warmGoal: warmGoal) { self.respond(c, 200, "application/json", Data(jsonText($0).utf8)) }
        }
        let icons = ["/icon.svg": "image/svg+xml", "/icon.png": "image/png", "/icon-indigo.svg": "image/svg+xml", "/icon-indigo.png": "image/png"]
        if let type = icons[req.url] { return respond(c, 200, type, FileManager.default.contents(atPath: web + req.url) ?? Data()) }
        let page = req.url.components(separatedBy: "?")[0] // ?panel and friends are for the page, not the server
        if page.range(of: #"^/page/[a-z]+\.js$"#, options: .regularExpression) != nil, let js = FileManager.default.contents(atPath: web + page) {
            return respond(c, 200, "text/javascript; charset=utf-8", js)
        }
        if page == "/" || page == "/index.html" { return respond(c, 200, "text/html; charset=utf-8", FileManager.default.contents(atPath: web + "/index.html") ?? Data()) }
        respond(c, 404)
    }
}
