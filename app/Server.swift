// Lantern's server, in Swift, inside the app. It does what server.js does (server.js still runs the npx and launchd
// setups): takes Claude Code hook events, keeps session state, streams it to the page over SSE, and rebuilds sessions
// from their transcripts on start. Sessions are kept as plain JSON dictionaries, like server.js's objects, so the page
// gets exactly the same snapshot. All state lives on the main queue; disk, process and network work runs on background
// queues and hops back.
import Foundation
import Network

let EXPIRE_MS = 20.0 * 60 * 1000 // a session silent this long is assumed dead (killed terminal, no SessionEnd)
let WAITING_EXPIRE_MS = 3.0 * 60 * 60 * 1000 // ...unless it's waiting on me, which can quietly take a while
let SEED_RECENT_MS = 15.0 * 60 * 1000 // on startup, also bring back any session whose transcript moved this recently
let TITLE_EVERY_MS = 15.0 * 1000
let WAITING_NOTIFICATIONS: Set<String> = ["permission_prompt", "idle_prompt", "elicitation_dialog", "agent_needs_input"]
let HOME = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
let PROJECTS = HOME + "/.claude/projects"

typealias JSON = [String: Any]

// MARK: - Small JS-alikes, so the ported logic reads like server.js and treats odd input the same way

func now() -> Double { (Date().timeIntervalSince1970 * 1000).rounded(.down) }

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

// MARK: - Reading what a session is doing, from hook payloads and transcripts

// What a tool call is doing, in a few words: the closest thing hooks give us to the app's agent status lines.
func describe(_ tool: String?, _ input: JSON) -> String {
    let file = { (k: String) in (truthy(input[k]) ? str(input[k]) : "").components(separatedBy: "/").last! }
    let text: Any? = switch tool {
    case "Bash": or(input["description"], input["command"])
    case "Read": "Reading \(file("file_path"))"
    case "Edit", "MultiEdit": "Editing \(file("file_path"))"
    case "Write": "Writing \(file("file_path"))"
    case "NotebookEdit": "Editing \(file("notebook_path"))"
    case "Grep": "Searching for \"\(str(input["pattern"]))\""
    case "Glob": "Finding \(str(input["pattern"]))"
    case "Agent", "Task": "Starting agent: \(str(or(input["description"], input["subagent_type"])))"
    case "WebFetch": "Fetching \(str(input["url"]))"
    case "WebSearch": "Searching the web for \"\(str(input["query"]))\""
    case "Skill": "Using skill \(str(input["skill"]))"
    default: nil
    }
    let fallback: Any? = tool.map { $0.hasPrefix("mcp__") ? "Using " + $0.components(separatedBy: "__").dropFirst().joined(separator: " ") : $0 }
    let picked = or(text, fallback)
    return (truthy(picked) ? str(picked) : "").cut(140)
}

// The question a finished turn ends on, if any: a "Blocker:" line, or a last sentence ending in "?".
func questionIn(_ message: Any?) -> String {
    let text = Re("[*_`#>]").replace(message == nil ? "" : str(message), "").trim
    let blocker = Re("Blocker:\\s*(.+)", .caseInsensitive).match(text)?[1]
    let last = text.components(separatedBy: "\n").map(\.trim).filter { !$0.isEmpty }.last ?? ""
    let asked = Re("\\?\\s*$").test(last) ? Re("(?<=[.!])\\s+").split(last).last! : ""
    return (blocker.flatMap { $0.isEmpty ? nil : $0 } ?? asked).trim.cut(160)
}

// What a finished turn hands me, for its card: the "You:" line from its status footer, PRs and other links, and
// the questions it asked. Links come from the model's own text, so only http(s) ones are kept.
func forYou(_ message: Any?) -> JSON {
    let text = Re("```[\\s\\S]*?```").replace(message == nil ? "" : str(message), "") // nothing inside code blocks
    let plain = { (t: String) in Re("[*_`]").replace(Re("\\[([^\\]]+)\\]\\([^)]+\\)").replace(t, "$1"), "").trim }
    var seen = Set<String>(), prs: [JSON] = []
    for m in Re("\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)|(https?://[^\\s)<>\\]]+)").matches(text) {
        let url = Re("[.,;:]+$").replace(text.sub(m.range(at: 2)) ?? text.sub(m.range(at: 3))!, "")
        if !seen.insert(url).inserted { continue }
        let pr = Re("github\\.com/[^/]+/([^/]+)/pull/([0-9]+)").match(url)
        let named = plain(text.sub(m.range(at: 1)) ?? "")
        let label = !named.isEmpty ? named : pr.map { "\($0[1]!)#\($0[2]!)" } ?? Re("^https?://").replace(url, "").cut(60)
        if pr != nil { prs.append(["label": label.cut(80), "url": url]) }
    }
    let lines = text.components(separatedBy: "\n").map(\.trim).filter { !$0.isEmpty && !$0.hasPrefix(">") }
    let isBlocker = Re("Blocker:", .caseInsensitive)
    let blockers = lines.filter(isBlocker.test).map { plain(Re("^.*?Blocker:\\**\\s*", .caseInsensitive).replace($0, "")) }
    let asked = lines.filter { !isBlocker.test($0) }.flatMap { Re("(?<=[.!?])\\s+").split(plain($0)) }.filter { $0.hasSuffix("?") }
    // the You: line is the TL;DR of what to do; keep its links, split into plain text and {label, url} pieces
    let youRaw = Re("\\*\\*You:\\*\\*\\s*(.+)").match(text)?[1] ?? ""
    var you: [Any] = [], at = 0
    let strip = Re("[*_`]")
    for m in Re("\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)").matches(youRaw) {
        you.append(strip.replace(youRaw.sub(NSRange(location: at, length: m.range.location - at))!, ""))
        you.append(["label": strip.replace(youRaw.sub(m.range(at: 1))!, ""), "url": youRaw.sub(m.range(at: 2))!])
        at = m.range.location + m.range.length
    }
    if at < youRaw.utf16.count { you.append(strip.replace(youRaw.sub(NSRange(location: at, length: youRaw.utf16.count - at))!, "")) }
    var questions: [String] = []
    for q in blockers + asked where !questions.contains(q) { questions.append(q) }
    return ["you": you.filter { ($0 as? String)?.isEmpty != true },
            "prs": Array(prs.prefix(6)),
            "questions": questions.prefix(5).map { $0.cut(160) }]
}

// Agent reports and notifications arrive as "prompts" wrapped in XML; keep just the readable part, labelled.
func cleanPrompt(_ p: String) -> String {
    let tag = Re("^\\s*<([A-Za-z0-9_-]+)").match(p)?[1]
    let summary = Re("<summary>([\\s\\S]*?)</summary>").match(p)?[1]
    var text = Re("\\[Subagent hand-back\\][\\s\\S]*?The report follows:").replaceFirst(summary.flatMap { $0.isEmpty ? nil : $0 } ?? p, "")
    text = Re("\\s+").replace(Re("<[^>]+>").replace(Re("\\[SYSTEM NOTIFICATION[^\\]]*\\]").replace(text, ""), " "), " ").trim
    let label = ["agent-message": "Agent report: ", "task-notification": "Task update: ", "side-sessions-event": "Session update: "][tag ?? ""] ?? ""
    return (label + text).cut(200)
}

// Session names and agent tasks live next to the transcript the hooks point at. Only ever read inside ~/.claude/projects.
func sessionDir(_ transcript: Any?) -> String? {
    let p = URL(fileURLWithPath: truthy(transcript) ? str(transcript) : "").standardized.path
    return p.hasPrefix(PROJECTS + "/") && p.hasSuffix(".jsonl") ? String(p.dropLast(6)) : nil
}

func readTail(_ file: String, _ bytes: Int) -> String? {
    guard let fh = FileHandle(forReadingAtPath: file) else { return nil }
    defer { try? fh.close() }
    let size = (try? fh.seekToEnd()) ?? 0, len = min(size, UInt64(bytes))
    try? fh.seek(toOffset: size - len)
    return String(decoding: (try? fh.read(upToCount: Int(len))) ?? Data(), as: UTF8.self)
}
func tail(_ file: String, _ bytes: Int = 256 * 1024) -> [String] { (readTail(file, bytes) ?? "").components(separatedBy: "\n") }

// A renamed session has custom-title.json; otherwise the transcript keeps logging an auto-generated title, so read its tail.
// Returns the new title given the current one.
func readTitle(_ dir: String, _ current: Any?) -> Any? {
    if let data = FileManager.default.contents(atPath: dir + "/custom-title.json"), let j = parse(data) as? JSON { return or(j["customTitle"], current) }
    guard let text = readTail(dir + ".jsonl", 512 * 1024) else { return current }
    let last = { (key: String) in Re("\"\(key)\":(\"(?:[^\"\\\\]|\\\\.)*\")").matches(text).last.flatMap { text.sub($0.range(at: 1)) } }
    return (last("customTitle") ?? last("aiTitle")).flatMap { parse(Data($0.utf8)) } ?? current
}

struct Turn { var done = false, compacted = false, text: String?, cwd: Any? }
// How the last turn ended: a finished turn (end_turn, then a turn_duration marker) means it's waiting for me.
func lastTurn(_ lines: [String]) -> Turn {
    var ended = false // a turn_duration marker comes after the final message, so keep looking back for its text
    for line in lines.reversed() {
        guard let j = parse(Data(line.utf8)) as? JSON else { continue }
        if str(j["type"]) == "system" && str(j["subtype"]) == "turn_duration" { ended = true; continue }
        if str(j["type"]) == "assistant" {
            let msg = j["message"] as? JSON
            let text = ((msg?["content"] as? [JSON]) ?? []).filter { str($0["type"]) == "text" }.map { str($0["text"]) }.joined(separator: "\n")
            if ended && text.isEmpty { continue }
            return Turn(done: ended || str(msg?["stop_reason"]) == "end_turn", text: text, cwd: j["cwd"])
        }
        if ended { return Turn(done: true, cwd: j["cwd"]) }
        if truthy(j["isCompactSummary"]) || str(j["subtype"]) == "compact_boundary" { return Turn(done: true, compacted: true, cwd: j["cwd"]) } // stopped right after a compact
        // a background task's "finished" notice lands as a user message but only starts a turn once Claude picks it up,
        // so one still sitting unanswered at the end doesn't mean the session is working
        if str(j["type"]) == "user", str((j["message"] as? JSON)?["content"]).hasPrefix("<task-notification>") { continue }
        if str(j["type"]) == "user" { return Turn(done: false, cwd: j["cwd"]) }
    }
    return Turn()
}
func transcripts(_ dir: String) -> [String] {
    ((try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".jsonl") }.sorted().map { dir + "/" + $0 }
}
func fileTimes(_ file: String) -> (birth: Double, mtime: Double)? {
    var st = stat()
    guard stat(file, &st) == 0 else { return nil }
    let ms = { (t: timespec) in Double(t.tv_sec) * 1000 + Double(t.tv_nsec) / 1_000_000 }
    return (ms(st.st_birthtimespec), ms(st.st_mtimespec))
}
func byNewest(_ files: [String]) -> [String] {
    let dated: [(file: String, mtime: Double, at: Int)] = files.enumerated().map { ($0.element, fileTimes($0.element)?.mtime ?? 0, $0.offset) }
    return dated.sorted { $0.mtime != $1.mtime ? $0.mtime > $1.mtime : $0.at < $1.at }.map(\.file) // stable, like JS sort
}

/// Runs a command (found on PATH, as server.js does, unless it's a full path) and returns its output, whatever its exit status.
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

/// pids of terminal `claude` processes
func claudePids() -> [String] {
    run("ps", ["-axo", "pid=,comm="]).out.components(separatedBy: "\n")
        .map { $0.trim.split(whereSeparator: \.isWhitespace).map(String.init) }.filter { $0.count > 1 && $0[1] == "claude" }.map { $0[0] }
}

// Each running terminal `claude` writes into the project folder named after its working folder, so the newest
// transcripts there (one per process) are live sessions, however long they've been quiet.
func liveTranscripts() -> [String] {
    let pids = claudePids()
    if pids.isEmpty { return [] }
    var count = Ordered<Int>()
    for line in run("lsof", ["-a", "-d", "cwd", "-p", pids.joined(separator: ","), "-Fn"]).out.components(separatedBy: "\n") where line.hasPrefix("n") {
        let d = String(line.dropFirst()).projectName
        count[d] = (count[d] ?? 0) + 1
    }
    return count.items.flatMap { d, n in byNewest(transcripts(PROJECTS + "/" + d)).prefix(n) }
}

// PRs a session created, read back from its transcript and its subagents' (a restart forgets the live ones).
// ponytail: reads every transcript in full (memory-mapped); read only the tails if startup drags.
// Each Bash call that ran `gh pr create`, and the PR URL in that call's own output:
// Which old session made each dead PR. Every transcript from the last 60 days is mapped into memory and searched
// for the PR links with memmem (fast: a few seconds for gigabytes); a hit in a subagent's transcript counts for its
// session. Then that session's own `gh pr create` output has to contain the link, so a PR it only mentioned doesn't
// count. PRs with no owner come back as NSNull (their transcript may have been cleaned up by Claude Code).
func findOwners(_ urls: [String]) -> [String: Any] {
    var found: [String: Any] = Dictionary(uniqueKeysWithValues: urls.map { ($0, NSNull()) })
    let needles = urls.map { Array($0.utf8) }, since = Date().addingTimeInterval(-60 * 24 * 3600)
    var checked = Set<String>()
    let walk = FileManager.default.enumerator(at: URL(fileURLWithPath: PROJECTS), includingPropertiesForKeys: [.contentModificationDateKey])
    while let file = walk?.nextObject() as? URL {
        guard file.pathExtension == "jsonl", let at = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate, at > since,
              let data = try? Data(contentsOf: file, options: .alwaysMapped) else { continue }
        let mentions = data.withUnsafeBytes { raw in needles.contains { n in n.withUnsafeBytes { memmem(raw.baseAddress, raw.count, $0.baseAddress, $0.count) != nil } } }
        guard mentions else { continue }
        let path = file.path, sessionFile = path.contains("/subagents/") ? path.components(separatedBy: "/subagents/")[0] + ".jsonl" : path
        guard checked.insert(sessionFile).inserted, FileManager.default.fileExists(atPath: sessionFile) else { continue }
        let dir = String(sessionFile.dropLast(".jsonl".count)), made = Set(createdPRs(sessionFile, dir))
        for url in urls where made.contains(url) && found[url] is NSNull {
            found[url] = ["id": (dir as NSString).lastPathComponent, "title": readTitle(dir, nil) ?? NSNull(),
                          "cwd": lastTurn(tail(sessionFile)).cwd ?? NSNull(), "last": fileTimes(sessionFile)?.mtime ?? 0] as JSON
        }
    }
    return found
}

// Sessions the Claude app starts from another session (its side sessions) name their parent in the app's own
// per-session files, alongside their Claude Code session id. Returns child id -> parent id, in Claude Code ids.
let APP_SESSIONS = HOME + "/Library/Application Support/Claude/claude-code-sessions"
func spawnLinks() -> [String: String] {
    var cliOf: [String: String] = [:], parentOf: [String: String] = [:]
    let walk = FileManager.default.enumerator(atPath: APP_SESSIONS)
    while let f = walk?.nextObject() as? String {
        guard (f as NSString).lastPathComponent.hasPrefix("local_"), f.hasSuffix(".json"),
              let data = FileManager.default.contents(atPath: APP_SESSIONS + "/" + f), let j = parse(data) as? JSON,
              let cli = j["cliSessionId"] as? String, let local = j["sessionId"] as? String else { continue }
        cliOf[local] = cli
        if let from = (j["spawnedFrom"] as? JSON)?["sessionId"] as? String { parentOf[cli] = from }
    }
    return parentOf.compactMapValues { cliOf[$0] }
}

func createdPRs(_ file: String, _ dir: String) -> [String] {
    var calls = Set<String>(), urls: [String] = []
    for f in [file] + transcripts(dir + "/subagents") {
        // only the `gh pr create` call itself and that call's own output are worth parsing
        for line in linesWorthParsing(f, isCall: { calls.contains($0) }) {
            guard let j = parse(line) as? JSON, let content = (j["message"] as? JSON)?["content"] as? [JSON] else { continue }
            for c in content {
                if str(c["type"]) == "tool_use" && str(c["name"]) == "Bash" && PR_CREATE.test(str(or((c["input"] as? JSON)?["command"], ""))) { calls.insert(str(c["id"])) }
                if str(c["type"]) == "tool_result" && calls.contains(str(c["tool_use_id"])),
                   let url = PR_URL.match(jsonText(c["content"] ?? NSNull()))?[0], !urls.contains(url) { urls.append(url) }
            }
        }
    }
    return urls
}
/// The lines of a transcript that mention `gh pr create`, or answer a call `isCall` knows, found with memchr and memmem over
/// the mapped file: transcripts run to gigabytes, and almost every line is skipped unparsed. Lazy, so calls found in a
/// line count for the lines after it.
func linesWorthParsing(_ file: String, isCall: @escaping (String) -> Bool) -> AnySequence<Data> {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: file), options: .alwaysMapped) else { return AnySequence([]) }
    let needle: [UInt8] = Array("gh pr create".utf8), key: [UInt8] = Array("\"tool_use_id\":\"".utf8)
    let has = { (p: UnsafeRawPointer, n: Int, what: [UInt8]) -> UnsafeMutableRawPointer? in memmem(p, n, what, what.count) }
    let any = data.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> Bool in buf.baseAddress.map { has($0, buf.count, needle) != nil } ?? false }
    if !any { return AnySequence([]) }
    var at = 0
    return AnySequence(AnyIterator { () -> Data? in
        data.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> Data? in
            let base = buf.baseAddress!
            while at < buf.count {
                let line = base + at
                let n: Int = memchr(line, 10, buf.count - at).map { UnsafeRawPointer($0) - line } ?? buf.count - at
                at += n + 1
                if has(line, n, needle) != nil { return Data(bytes: line, count: n) }
                guard let k = has(line, n, key) else { continue }
                let id = UnsafeRawPointer(k) + key.count
                guard let quote = memchr(id, 34, n - (id - line)) else { continue }
                let callId = String(decoding: UnsafeRawBufferPointer(start: id, count: UnsafeRawPointer(quote) - id), as: UTF8.self)
                if !callId.isEmpty && isCall(callId) { return Data(bytes: line, count: n) }
            }
            return nil
        }
    })
}

/// A session rebuilt from its transcript, before it joins the live ones.
func seedSession(_ file: String, live: Bool) -> (JSON, Ordered<JSON>)? {
    let id = ((file as NSString).lastPathComponent as NSString).deletingPathExtension, dir = String(file.dropLast(6))
    guard UUID_RE.test(id), let st = fileTimes(file) else { return nil }
    let turn = lastTurn(tail(file))
    var s: JSON = ["id": id, "cwd": or(turn.cwd, "")!, "state": turn.compacted ? "idle" : turn.done ? "waiting" : "working",
                   "note": turn.done && !turn.compacted ? "Finished its turn, waiting for you" : "",
                   "started": st.birth, "last": live ? now() : st.mtime, "project": ((dir as NSString).deletingLastPathComponent as NSString).lastPathComponent,
                   "unconfirmed": !live]
    if turn.done, let text = turn.text, !text.isEmpty { s["forYou"] = forYou(text) }
    s["created"] = createdPRs(file, dir)
    // subagents that look like they're still going: transcript touched in the last two minutes and not finished
    var agents = Ordered<JSON>()
    for f in transcripts(dir + "/subagents") {
        guard let agent = Re("^agent-([A-Za-z0-9_-]+)\\.jsonl$").match((f as NSString).lastPathComponent)?[1], let mtime = fileTimes(f)?.mtime,
              now() - mtime <= 2 * 60 * 1000, !lastTurn(tail(f, 64 * 1024)).done else { continue }
        var a: JSON = ["type": "", "description": "", "activity": "", "tries": 3, "last": mtime]
        if let data = FileManager.default.contents(atPath: "\(dir)/subagents/agent-\(agent).meta.json"), let j = parse(data) as? JSON {
            a["type"] = or(j["agentType"], ""); a["description"] = or(j["description"], "")
        }
        agents[agent] = a
    }
    if str(s["state"]) == "waiting" && agents.count > 0 { s["state"] = "paused"; s["note"] = "Waiting on its agents" }
    if str(s["state"]) == "waiting" { s["waitingSince"] = st.mtime } // it's been waiting since its transcript last changed
    return (s, agents)
}

// MARK: - GitHub status: PRs through the Claude Lantern GitHub App's tokens, or the person's own `gh`

let GH = [ProcessInfo.processInfo.environment["LANTERN_GH"], HOME + "/.local/bin/gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]
    .compactMap { $0 }.first { FileManager.default.fileExists(atPath: $0) } ?? "gh" // an app's PATH is minimal, so look in the usual places
let CLIENT_ID = "Iv23liGsGuBVmd5HoOSn", KEYCHAIN = "claude-lantern"
let PR_GQL = "url number title state isDraft updatedAt reviewDecision headRefName repository { name nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }"
func prQuery(_ fields: String) -> String {
    """
    query {
      reviews: search(query: "is:pr is:open archived:false review-requested:@me", type: ISSUE, first: 20) { nodes { ... on PullRequest { \(fields) } } }
      mine: search(query: "is:pr is:open archived:false author:@me", type: ISSUE, first: 100) { nodes { ... on PullRequest { \(fields) } } }
      closed: search(query: "is:pr is:closed archived:false author:@me sort:updated-desc", type: ISSUE, first: 30) { nodes { ... on PullRequest { url state } } }
    }
    """
}
// what a PR needs from me: merged/closed (gone), checks failing, changes requested, ready to merge, or nothing yet
func prNeed(_ p: JSON) -> String {
    if str(p["state"]) != "OPEN" { return str(p["state"]) == "MERGED" ? "merged" : "closed" }
    let checks = p["statusCheckRollup"] as? [JSON] ?? [], result = { (c: JSON) in str(or(c["conclusion"], c["state"])) }
    if checks.contains(where: { ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].contains(result($0)) }) { return "failing" }
    if str(p["reviewDecision"]) == "CHANGES_REQUESTED" { return "changes" }
    let running = checks.contains { (truthy($0["status"]) && str($0["status"]) != "COMPLETED") || result($0) == "PENDING" }
    if str(p["reviewDecision"]) == "APPROVED" && !running { return "ready" }
    return truthy(p["isDraft"]) ? "draft" : "waiting"
}
func git(_ cwd: String, _ args: [String]) -> String? {
    let r = run("/usr/bin/git", ["-C", cwd] + args, timeout: 5)
    return r.ok ? r.out.trim : nil
}
// gh prints the response even when the query partly fails; a token without checks access fails the whole thing, so
// that one is asked again without checks
func ghGraphql(_ cwd: String) -> JSON? {
    let data = { (q: String) in (parse(Data(run(GH, ["api", "graphql", "-f", "query=\(q)"], cwd: cwd, timeout: 20).out.utf8)) as? JSON)?["data"] as? JSON }
    if let d = data(prQuery(PR_GQL)), d["mine"] != nil { return d }
    return data(prQuery(Re(" commits\\(.*$").replace(PR_GQL, "")))
}
/// A blocking HTTPS request, for background queues only.
func fetch(_ url: String, method: String = "GET", headers: [String: String], body: Any? = nil) -> (status: Int, json: JSON?) {
    var req = URLRequest(url: URL(string: url)!, timeoutInterval: 30)
    req.httpMethod = method
    headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
    if let body { req.httpBody = try? JSONSerialization.data(withJSONObject: body) }
    var result: (Int, JSON?) = (0, nil)
    let done = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: req) { data, response, _ in
        result = ((response as? HTTPURLResponse)?.statusCode ?? 0, data.flatMap(parse) as? JSON)
        done.signal()
    }.resume()
    done.wait()
    return result
}
// The Keychain through Apple's own `security` tool: tokens server.js saved stay readable without a prompt, and a
// rebuilt (newly signed) app doesn't have to be allowed in again.
func security(_ args: [String]) -> String? {
    let r = run("/usr/bin/security", args)
    return r.ok ? r.out.trim : nil
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
    var graveyard: [JSON] = [] // my open PRs that no session owns and nobody has touched for a week, oldest first
    var owners: JSON = [:] // dead PR url -> the old session that made it (or NSNull: looked, found none); looked up once
    // the graveyard as the page gets it: each PR with the old session that made it, when there is one
    func graveyardOut() -> [JSON] { graveyard.map { p in var p = p; if let o = owners[str(p["url"])] as? JSON { p["owner"] = o }; return p } }
    var accounts = Ordered<JSON>() // login -> { token, error }
    var signIn: JSON? // a device-flow sign-in in progress: { code, url, until }
    var refreshing = false
    var listener: NWListener?
    var started = false
    var pageMtime = 0.0
    // The event log (Stats.swift), and what it last saw, so it only records changes.
    let stats: Stats
    struct Seen { var waiting = false, snoozed: String?, title: String? }
    var seen: [String: Seen] = [:]
    var seeded = Set<String>() // sessions rebuilt from disk, not started while the lantern watched
    var violet = false, quiet = false
    var ownedPRs: [String: (need: String, session: String)] = [:]
    var strays: Int? // open PRs of mine that no session owns, as of the last refresh
    var buried = Set<String>() // the graveyard the log last saw, by url

    init(port: UInt16, data: String, web: String) {
        self.port = port
        self.web = web
        try? FileManager.default.createDirectory(atPath: data, withIntermediateDirectories: true)
        settingsFile = data + "/settings.json"
        githubCache = data + "/github-cache.json"
        if let d = FileManager.default.contents(atPath: settingsFile), let j = parse(d) as? JSON { settings.merge(j) { $1 } }
        stats = Stats(data + "/stats.sqlite")
    }

    // Takes the port, or, while something else holds it (server.js from a checkout, say), keeps trying every few seconds.
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
                print("Lantern lit at http://127.0.0.1:\(self.port)")
                if !self.started { self.started = true; self.begin() }
            case .failed: l.cancel(); self.retry()
            default: break
            }
        }
        l.start(queue: .main)
    }
    func retry() { DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.start() } }

    func begin() {
        stats.open()
        stats.begin("server")
        ownedPRs = stats.ownedPRs()
        buried = stats.buried()
        seed()
        loadAccounts()
        Timer.scheduledTimer(withTimeInterval: 2 * 60, repeats: true) { _ in self.refreshGitHub() }
        Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in self.sweep(); self.linkSpawned() }
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in self.observe() } // quiet hours end with nothing else happening
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
            if forGood(id) { out["snoozed"] = true; out["forGood"] = true }
            out["subagents"] = (agents[id] ?? Ordered()).items.map { aid, a in a.merging(["id": aid]) { $1 } }
            return out
        })
    }
    func send(_ msg: String) { for c in clients.values { write(c, msg) } }
    func broadcast() { observe(); send("event: reviews\ndata: \(jsonText(reviews))\n\nevent: graveyard\ndata: \(jsonText(graveyardOut()))\n\ndata: \(snapshot())\n\n") }
    func githubState() -> JSON { ["accounts": accounts.items.map { ["login": $0.0, "error": or($0.1["error"], "")!] }, "signIn": signIn ?? NSNull()] }
    func broadcastGitHub() { send("event: github\ndata: \(jsonText(githubState()))\n\n") }
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
        defer { sessions[id] = s } // (until the end of this function, s is a copy)
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
        if truthy(e["permission_mode"]) { s["mode"] = e["permission_mode"] }
        if let pid = e["pid"] as? String, Re("^[0-9]+$").test(pid) { s["pid"] = Int(pid) ?? Double(pid)! } // the Claude Code process the hook ran under ($PPID)
        let iterm = ((e["iterm"] as? String) ?? "").components(separatedBy: ":").last! // ITERM_SESSION_ID looks like w0t1p0:<uuid>
        if UUID_RE.test(iterm) { s["iterm"] = iterm }
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
        case "Stop":
            // Three ways a turn ends: agents still running and nothing to ask (not waiting on me), agents running but
            // it asked me something, or fully stopped. Only the first one leaves me alone.
            let running = (e["background_tasks"] as? [JSON] ?? []).filter { !truthy($0["status"]) || str($0["status"]) == "running" }
            let q = questionIn(e["last_assistant_message"])
            let tasks = running.isEmpty ? "" : "\(running.count) background task\(running.count > 1 ? "s" : "")"
            s["tasks"] = Array(running.map { $0["description"] }.filter(truthy).prefix(4)).map { $0! }
            s["forYou"] = forYou(e["last_assistant_message"])
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
            if str(e["notification_type"]) == "idle_prompt" && str(s["state"]) == "paused" { break }
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
    }

    func loadTitle(_ id: String, _ dir: String) {
        let current = sessions[id]?["title"]
        DispatchQueue.global().async {
            let title = readTitle(dir, current)
            DispatchQueue.main.async {
                if self.sessions[id] != nil { self.sessions[id]!["title"] = title }
                self.broadcast()
            }
        }
    }
    func loadAgentMeta(_ id: String, _ aid: String, _ file: String) {
        DispatchQueue.global().async {
            guard let data = FileManager.default.contents(atPath: file), let j = parse(data) as? JSON else { return }
            DispatchQueue.main.async {
                if var a = self.agents[id]?[aid] {
                    a["description"] = or(j["description"], "")
                    if !truthy(a["type"]) { a["type"] = or(j["agentType"], "") }
                    self.agents[id]![aid] = a
                }
                self.broadcast()
            }
        }
    }

    // MARK: finding a session's iTerm tab when hooks haven't told us (seeded, or quiet since a restart)

    func findIterm(_ id: String, _ done: @escaping (String?) -> Void) {
        DispatchQueue.global().async {
            // the separator is set outside the tell block: inside it, the word `tab` means iTerm's tab object, not a character
            let tabs = run("osascript", ["-e", """
                set out to ""
                set sep to character id 9
                tell application "iTerm2"
                  repeat with w in windows
                    repeat with t in tabs of w
                      repeat with ss in sessions of t
                        set out to out & (unique id of ss) & sep & (name of ss) & linefeed
                      end repeat
                    end repeat
                  end repeat
                end tell
                return out
                """]).out.components(separatedBy: "\n").map { $0.components(separatedBy: "\t") }.filter { UUID_RE.test($0[0]) }
            let pids = claudePids()
            var tabOf: [String: String] = [:], dirOf: [String: String] = [:]
            if !pids.isEmpty {
                for line in run("ps", ["-E", "-p", pids.joined(separator: ","), "-o", "pid=,command="]).out.components(separatedBy: "\n") {
                    let pid = line.trim.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
                    if let tab = Re("ITERM_SESSION_ID=\\S*?([0-9A-F-]{36})", .caseInsensitive).match(line)?[1] { tabOf[pid] = tab }
                }
                var pid = ""
                for line in run("lsof", ["-a", "-d", "cwd", "-p", pids.joined(separator: ","), "-Fpn"]).out.components(separatedBy: "\n") {
                    if line.hasPrefix("p") { pid = String(line.dropFirst()) }
                    if line.hasPrefix("n") { dirOf[pid] = String(line.dropFirst()).projectName }
                }
            }
            DispatchQueue.main.async {
                guard let s = self.sessions[id] else { return done(nil) }
                let tabTitle = { (name: String) in Re("\\s*\\(claude\\)$").replace(Re("^[^A-Za-z0-9_(]+").replace(name, ""), "").trim } // "✳ Some title (claude)" -> "Some title"
                // 1. Claude Code puts the session title in the tab name
                if truthy(s["title"]), let hit = tabs.first(where: { $0.count > 1 && tabTitle($0[1]) == str(s["title"]) }) { return done(hit[0]) }
                // 2. Otherwise: the terminal `claude` in this session's project folder whose tab no other session can claim
                if pids.isEmpty { return done(nil) }
                let others = self.sessions.items.filter { $0.0 != id }.map(\.1)
                var claimed = Set(others.compactMap { o in truthy(o["iterm"]) ? str(o["iterm"]) : nil })
                for t in tabs where t.count > 1 && others.contains(where: { truthy($0["title"]) && str($0["title"]) == tabTitle(t[1]) }) { claimed.insert(t[0]) }
                let left = pids.filter { dirOf[$0] == (s["project"] as? String) && tabOf[$0] != nil && !claimed.contains(tabOf[$0]!) }.map { tabOf[$0]! }
                done(left.count == 1 ? left[0] : nil)
            }
        }
    }
    /// Finds each listed session's tab in turn, since each one found is claimed from the next.
    func findItermTabs(_ ids: [String], _ done: @escaping () -> Void) {
        guard let id = ids.first else { return done() }
        findIterm(id) { tab in
            if self.sessions[id] != nil { self.sessions[id]!["iterm"] = tab ?? NSNull() }
            self.findItermTabs(Array(ids.dropFirst()), done)
        }
    }

    // MARK: seeding: rebuild sessions from disk when the server starts, so a restart doesn't forget them

    func seed() {
        DispatchQueue.global().async {
            var seeded: [(JSON, Ordered<JSON>)] = [], seen = Set<String>()
            let take = { (f: String, live: Bool) in
                let id = ((f as NSString).lastPathComponent as NSString).deletingPathExtension
                if seen.contains(id) { return }
                if let s = seedSession(f, live: live) { seen.insert(id); seeded.append(s) }
            }
            for f in liveTranscripts() { take(f, true) }
            if let dirs = try? FileManager.default.contentsOfDirectory(atPath: PROJECTS) {
                for d in dirs.sorted() { for f in transcripts(PROJECTS + "/" + d) where now() - (fileTimes(f)?.mtime ?? 0) < SEED_RECENT_MS { take(f, false) } }
            } else { print("seeding failed: no \(PROJECTS)") }
            let cache = FileManager.default.contents(atPath: self.githubCache).flatMap(parse) as? JSON
            DispatchQueue.main.async {
                for (s, a) in seeded {
                    let id = str(s["id"])
                    if self.sessions[id] != nil { continue }
                    self.sessions[id] = s
                    self.agents[id] = a
                    self.seeded.insert(id)
                    self.loadTitle(id, String(PROJECTS + "/" + str(s["project"]) + "/" + id))
                }
                print("Seeded \(self.sessions.count) session(s) from disk")
                self.linkSpawned()
                // last known PR status, until the first refresh replaces it
                if let cache, (self.settings["githubAccounts"] as? [Any])?.isEmpty == false || truthy(self.settings["github"]) {
                    self.reviews = cache["reviews"] as? [JSON] ?? []
                    self.graveyard = cache["graveyard"] as? [JSON] ?? []
                    self.owners = cache["owners"] as? JSON ?? [:]
                    for (id, _) in self.sessions.items { if let g = (cache["bySession"] as? JSON)?[id] { self.sessions[id]!["github"] = g } }
                }
                // give the titles a moment to load, then find each seeded session's iTerm tab so it's clickable right away
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    self.findItermTabs(self.sessions.items.filter { !truthy($0.1["iterm"]) }.map(\.0)) {
                        self.broadcast()
                        self.refreshGitHub()
                    }
                }
            }
        }
    }

    // A closed terminal tab or a killed process can skip SessionEnd, so a session whose Claude process is gone ends here.
    func sweep() {
        let t = now()
        var changed = false
        for (id, s) in sessions.items {
            // with its process known, only that decides: a closed session goes, an open one stays however quiet it's been
            if truthy(s["pid"]) {
                let pid = pid_t(str(s["pid"])) ?? 0
                if kill(pid, 0) != 0 && errno != EPERM { sessions[id] = nil; agents[id] = nil; changed = true }
                continue
            }
            // a session only seen on disk gets the normal timeout until it proves it's alive with a real event
            let limit = str(s["state"]) == "waiting" && !truthy(s["unconfirmed"]) ? WAITING_EXPIRE_MS : EXPIRE_MS
            if t - ((s["last"] as? Double) ?? 0) > limit { sessions[id] = nil; agents[id] = nil; changed = true; continue }
            for (aid, a) in agents[id]?.items ?? [] where t - ((a["last"] as? Double) ?? 0) > EXPIRE_MS { agents[id]![aid] = nil; changed = true }
        }
        if changed { broadcast() }
    }

    // MARK: GitHub status (opt-in): one GraphQL query per account (or per folder, through gh), all at once

    // A session owns the PRs it created, plus its branch's PR, but only if it's the only session in that folder
    // (sessions sharing the main checkout don't each own whatever branch happens to be checked out there).
    func refreshGitHub() {
        if refreshing || (accounts.count == 0 && !truthy(settings["github"])) { return }
        refreshing = true
        let list = sessions.items.map { ($0.0, str($0.1["cwd"]), $0.1["created"] as? [String] ?? []) }
        let tokens = accounts.items.map { ($0.0, str($0.1["token"])) }
        DispatchQueue.global().async {
            // Only folders inside a git repo: elsewhere (a home folder, say) gh may fall back to the Keychain, which prompts
            // every time from a background process.
            let live = list.filter { !$0.1.isEmpty && git($0.1, ["rev-parse", "--is-inside-work-tree"]) != nil }
            var errors: [String: String] = [:]
            let queries: [() -> JSON?] = tokens.isEmpty
                ? Array(Set(live.map(\.1))).map { cwd in { ghGraphql(cwd) } }
                : tokens.map { login, token in {
                    let r = fetch("https://api.github.com/graphql", method: "POST", headers: ["Authorization": "Bearer \(token)", "User-Agent": "claude-lantern"], body: ["query": prQuery(PR_GQL)])
                    if r.status == 401 { DispatchQueue.main.sync { errors[login] = "expired" }; return nil } // the token was revoked or expired: reconnect
                    let data = r.json?["data"] as? JSON
                    if data != nil { DispatchQueue.main.sync { errors[login] = "" } }
                    return data
                } }
            var results = [JSON?](repeating: nil, count: queries.count)
            DispatchQueue.concurrentPerform(iterations: queries.count) { i in let r = queries[i](); DispatchQueue.main.sync { results[i] = r } }
            var all = Ordered<JSON>(), wanted = Ordered<JSON>(), closed: [String: String] = [:]
            for data in results {
                for p in (data?["closed"] as? JSON)?["nodes"] as? [JSON] ?? [] where truthy(p["url"]) { closed[str(p["url"])] = str(p["state"]) }
                for p in (data?["reviews"] as? JSON)?["nodes"] as? [JSON] ?? [] where truthy(p["url"]) {
                    wanted[str(p["url"])] = ["url": p["url"]!, "title": p["title"] ?? NSNull(), "label": "\(str((p["repository"] as? JSON)?["name"]))#\(str(p["number"]))"]
                }
                // reshape to gh's form so prNeed can read it: checks become one rollup state
                for var p in (data?["mine"] as? JSON)?["nodes"] as? [JSON] ?? [] where truthy(p["url"]) {
                    let rollup = ((((p["commits"] as? JSON)?["nodes"] as? [JSON])?.first?["commit"] as? JSON)?["statusCheckRollup"] as? JSON)?["state"]
                    p["statusCheckRollup"] = truthy(rollup) ? [["state": rollup!]] : [JSON]()
                    all[str(p["url"])] = p
                }
            }
            let alone = { (cwd: String) in live.filter { $0.1 == cwd }.count == 1 }
            var github: [String: [JSON]] = [:]
            for (id, cwd, created) in live {
                var prs = Ordered<JSON>()
                if alone(cwd) {
                    let branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]), origin = git(cwd, ["remote", "get-url", "origin"])
                    let repo = origin.flatMap { Re("github\\.com[:/](.+?)(?:\\.git)?$").match($0)?[1] }
                    for (url, p) in all.items where str(p["headRefName"]) == branch && str((p["repository"] as? JSON)?["nameWithOwner"]).lowercased() == repo?.lowercased() { prs[url] = p }
                }
                for url in created { if let p = all[url] { prs[url] = p } }
                github[id] = prs.items.map { ["url": $0.1["url"]!, "title": $0.1["title"] ?? NSNull(), "label": "#\(str($0.1["number"]))", "need": prNeed($0.1)] }
            }
            // The graveyard: my open PRs that no session owns and nobody has touched for a week, oldest first.
            let owned = Set(github.values.flatMap { $0.map { str($0["url"]) } }), weekAgo = Date().addingTimeInterval(-7 * 24 * 3600)
            let iso = ISO8601DateFormatter()
            let dead: [JSON] = all.items.compactMap { url, p in
                guard !owned.contains(url), let at = iso.date(from: str(p["updatedAt"])), at < weekAgo else { return nil }
                return ["url": url, "title": p["title"] ?? NSNull(), "label": "\(str((p["repository"] as? JSON)?["name"]))#\(str(p["number"]))",
                        "need": prNeed(p), "updatedAt": p["updatedAt"]!]
            }.sorted { str($0["updatedAt"]) < str($1["updatedAt"]) }
            DispatchQueue.main.async {
                for (login, error) in errors { self.accounts[login]?["error"] = error }
                self.reviews = wanted.items.map(\.1)
                self.graveyard = dead
                for (id, g) in github { self.sessions[id]?["github"] = g }
                // a failed query would make every PR look gone, so only a complete answer goes in the log
                if !results.isEmpty && results.allSatisfy({ $0 != nil }) { self.logPRs(open: Set(all.keys), closed: closed) }
                // remember the result, so a restart shows the fireflies straight away instead of after the first slow refresh
                self.saveGitHubCache()
                self.refreshing = false
                self.broadcast()
                // then, in the background, find which old sessions made any dead PRs we haven't looked up yet
                let missing = self.graveyard.map { str($0["url"]) }.filter { self.owners[$0] == nil }
                if !missing.isEmpty {
                    DispatchQueue.global().async {
                        let found = findOwners(missing)
                        DispatchQueue.main.async { for (url, o) in found { self.owners[url] = o }; self.saveGitHubCache(); self.broadcast() }
                    }
                }
            }
        }
    }
    // Mark each session the Claude app started from another live session with its parent, so its moth orbits the parent's.
    func linkSpawned() {
        DispatchQueue.global().async {
            let links = spawnLinks()
            DispatchQueue.main.async {
                var changed = false
                for (id, s) in self.sessions.items {
                    let parent: Any = links[id].flatMap { self.sessions[$0] != nil ? $0 : nil } ?? NSNull()
                    if str(s["parent"]) != str(parent) { self.sessions[id]!["parent"] = parent; changed = true }
                }
                if changed { self.broadcast() }
            }
        }
    }

    func saveGitHubCache() {
        let bySession = sessions.items.filter { $0.1["github"] != nil }.reduce(into: JSON()) { $0[$1.0] = $1.1["github"] }
        let text = jsonText(["reviews": reviews, "graveyard": graveyard, "owners": owners, "bySession": bySession]) + "\n"
        DispatchQueue.global().async { try? text.write(toFile: self.githubCache, atomically: true, encoding: .utf8) }
    }

    // MARK: the event log: what changed since it last looked, called on every broadcast so it sees what the page sees

    func observe() {
        for (id, s) in sessions.items {
            var was = seen[id] ?? Seen()
            let title = truthy(s["title"]) ? str(s["title"]) : nil, project = s["project"] ?? NSNull()
            if seen[id] == nil { stats.begin("alive", id, ["title": title ?? NSNull(), "project": project, "seeded": seeded.contains(id)]) }
            else if title != was.title, let title { stats.note("alive", id, ["title": title]); if was.waiting { stats.note("waiting", id, ["title": title]) } }
            was.title = title
            let waiting = str(s["state"]) == "waiting"
            if waiting != was.waiting {
                if waiting { stats.begin("waiting", id, ["title": title ?? NSNull(), "project": project]) } else { stats.end("waiting", id, ["how": "answered"]) }
                was.waiting = waiting
                was.snoozed = nil
            }
            // snoozed during the wait: for a while (until it does something new) or for good
            let snoozed = forGood(id) ? "forGood" : truthy(s["snoozed"]) ? "temporary" : nil
            if waiting, let snoozed, snoozed != was.snoozed { stats.note("waiting", id, ["snoozed": snoozed]); was.snoozed = snoozed }
            seen[id] = was
        }
        for (id, was) in seen where sessions[id] == nil {
            if was.waiting { stats.end("waiting", id, ["how": "ended"]) }
            stats.end("alive", id, ["how": "ended"])
            seen[id] = nil
        }
        // the lantern's colour, worked out the way the page does it
        let quietNow = ((settings["quietUntil"] as? NSNumber)?.doubleValue ?? 0) > now()
        let violetNow = !quietNow && sessions.items.contains { str($0.1["state"]) == "waiting" && !truthy($0.1["snoozed"]) && !forGood($0.0) }
        if quietNow != quiet { if quietNow { stats.begin("quiet") } else { stats.end("quiet") }; quiet = quietNow }
        if violetNow != violet { if violetNow { stats.begin("violet") } else { stats.end("violet") }; violet = violetNow }
    }

    // PR changes, from what the sessions own after a refresh. One no session owns any more was merged or closed, or is
    // still open with no session (a stray), or fell out of the closed search (gone). Graveyard changes go in too.
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
        // PRs entering the graveyard, and leaving it: merged, closed, or revived (a session took it, or someone touched it)
        let dead = Set(graveyard.map { str($0["url"]) })
        for url in dead.subtracting(buried) { stats.event("graveyard", nil, ["url": url, "change": "entered"]) }
        for url in buried.subtracting(dead) {
            let how = open.contains(url) ? "revived" : closed[url].map { $0 == "MERGED" ? "merged" : "closed" } ?? "gone"
            stats.event("graveyard", nil, ["url": url, "change": "left", "how": how])
        }
        buried = dead
    }

    func gauge() {
        let waiting = sessions.items.filter { str($0.1["state"]) == "waiting" }
        let fireflies = Set(sessions.items.flatMap { ($0.1["github"] as? [JSON] ?? []).filter { !["merged", "closed"].contains(str($0["need"])) }.map { str($0["url"]) } })
        stats.gauge([("alive", sessions.count), ("working", sessions.items.filter { str($0.1["state"]) == "working" }.count),
                     ("waiting", waiting.count), ("snoozed", waiting.filter { truthy($0.1["snoozed"]) || forGood($0.0) }.count),
                     ("fireflies", fireflies.count), ("agents", agents.values.reduce(0) { $0 + $1.count }), ("strays", strays), ("graveyard", graveyard.count)])
    }

    func clearGitHub() { reviews = []; graveyard = []; for (id, _) in sessions.items { sessions[id]!["github"] = nil }; broadcast() }

    // Connect GitHub: the GitHub App's device flow (no server, no secret), tokens kept in the macOS Keychain.
    func loadAccounts() {
        let logins = (settings["githubAccounts"] as? [Any] ?? []).map { str($0) }
        DispatchQueue.global().async {
            let found = logins.compactMap { login in security(["find-generic-password", "-s", KEYCHAIN, "-a", login, "-w"]).map { (login, $0) } }
            DispatchQueue.main.async {
                for (login, token) in found where !token.isEmpty { self.accounts[login] = ["token": token] }
                if self.accounts.count > 0 { self.refreshGitHub() }
            }
        }
    }
    func connectGitHub() {
        DispatchQueue.global().async {
            let post = { (url: String, body: JSON) in
                fetch(url, method: "POST", headers: ["Accept": "application/json", "Content-Type": "application/json"], body: body.merging(["client_id": CLIENT_ID]) { $1 }).json ?? [:]
            }
            let start = post("https://github.com/login/device/code", [:])
            guard let device = start["device_code"] else { return }
            let code = start["user_code"] ?? NSNull()
            let until = now() + (Double(str(start["expires_in"])) ?? 900) * 1000
            DispatchQueue.main.sync { self.signIn = ["code": code, "url": start["verification_uri"] ?? NSNull(), "until": until]; self.broadcastGitHub() }
            var wait = (Double(str(or(start["interval"], 5))) ?? 5)
            let current = { DispatchQueue.main.sync { self.signIn.map { str($0["code"]) == str(code) } ?? false } }
            while current() && now() < until {
                Thread.sleep(forTimeInterval: wait)
                let t = post("https://github.com/login/oauth/access_token", ["device_code": device, "grant_type": "urn:ietf:params:oauth:grant-type:device_code"])
                if str(t["error"]) == "slow_down" { wait += 5 }
                else if let token = t["access_token"] as? String, !token.isEmpty {
                    guard let login = fetch("https://api.github.com/user", headers: ["Authorization": "Bearer \(token)", "User-Agent": "claude-lantern"]).json?["login"] as? String else { break }
                    _ = security(["add-generic-password", "-U", "-s", KEYCHAIN, "-a", login, "-l", "Claude Lantern GitHub", "-w", token])
                    DispatchQueue.main.async {
                        self.accounts[login] = ["token": token]
                        var logins = (self.settings["githubAccounts"] as? [Any] ?? []).map { str($0) }
                        if !logins.contains(login) { logins.append(login) }
                        self.settings["githubAccounts"] = logins
                        self.saveSettings()
                        self.signIn = nil; self.broadcastGitHub(); self.refreshGitHub()
                    }
                    return
                } else if str(t["error"]) != "authorization_pending" { break }
            }
            DispatchQueue.main.async { self.signIn = nil; self.broadcastGitHub() }
        }
    }
    func disconnectGitHub(_ login: String) {
        DispatchQueue.global().async {
            _ = security(["delete-generic-password", "-s", KEYCHAIN, "-a", login])
            DispatchQueue.main.async {
                self.accounts[login] = nil
                self.settings["githubAccounts"] = (self.settings["githubAccounts"] as? [Any] ?? []).filter { str($0) != login }
                self.saveSettings(); self.broadcastGitHub()
                if self.accounts.count == 0 && !truthy(self.settings["github"]) { self.clearGitHub() } else { self.refreshGitHub() }
            }
        }
    }

    // MARK: HTTP

    struct Request { var method = "", url = "", headers: [String: String] = [:], body = Data() }

    func accept(_ c: NWConnection) {
        c.start(queue: .main)
        receive(c, Data())
    }
    // Reads one request: headers, then a Content-Length body. Bodies past the endpoint's limit drop the connection, as server.js does.
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
                handle(e); broadcast()
            }
            return respond(c, 200)
        }
        // Bring a session's iTerm tab to the front. Only an id we stored ourselves ever reaches AppleScript.
        // Resume the old session behind a dead moth: a new iTerm tab in its folder running `claude --resume <id>`.
        // Only sessions that own something in the graveyard can be resumed this way.
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
        if json && req.url == "/focus" {
            guard let id = body?["id"] as? String, sessions[id] != nil else { return respond(c, 404) }
            let focus = { (tab: Any?) in
                guard let tab = tab as? String, UUID_RE.test(tab) else { return self.respond(c, 404) }
                DispatchQueue.global().async {
                    let r = run("osascript", ["-e", """
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
                        """], timeout: 60)
                    if !r.ok { print("focus failed") }
                    DispatchQueue.main.async { self.respond(c, r.ok ? 204 : 500) }
                }
            }
            if truthy(sessions[id]!["iterm"]) { return focus(sessions[id]!["iterm"]) }
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
                if let g = j["graveyard"] as? NSNumber, CFGetTypeID(g) == CFBooleanGetTypeID() { settings["graveyard"] = g.boolValue; ok = true }
                if let quiet = j["quietUntil"] as? NSNumber, CFGetTypeID(quiet) != CFBooleanGetTypeID(), quiet.doubleValue.isFinite {
                    settings["quietUntil"] = quiet; ok = true // quiet hours: every wait counts as snoozed until then
                }
            }
            if !ok { return respond(c, 400) }
            saveSettings()
            observe()
            send("event: settings\ndata: \(jsonText(settings))\n\n")
            return respond(c, 204)
        }
        if req.url == "/events" {
            clients[ObjectIdentifier(c)] = c
            c.stateUpdateHandler = { state in
                if case .failed = state { self.clients[ObjectIdentifier(c)] = nil }
                if case .cancelled = state { self.clients[ObjectIdentifier(c)] = nil }
            }
            write(c, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n")
            write(c, "retry: 2000\nevent: version\ndata: \(str(pageVersion()))\n\nevent: settings\ndata: \(jsonText(settings))\n\nevent: github\ndata: \(jsonText(githubState()))\n\nevent: reviews\ndata: \(jsonText(reviews))\n\nevent: graveyard\ndata: \(jsonText(graveyardOut()))\n\ndata: \(snapshot())\n\n")
            // a closed page shows up as the connection ending, so keep reading until it does
            func drain() { c.receive(minimumIncompleteLength: 1, maximumLength: 1024) { _, _, done, error in if done || error != nil { self.clients[ObjectIdentifier(c)] = nil; c.cancel() } else { drain() } } }
            drain()
            return
        }
        // Today and the seven days before it (local days), for the stats panel. Read-only, and computed off the main queue.
        if req.method == "GET" && req.url == "/stats" {
            let cal = Calendar.current, today = cal.startOfDay(for: Date()), ms = { (d: Date) in (d.timeIntervalSince1970 * 1000).rounded() }
            let days = (0...7).reversed().map { i -> (Double, Double) in
                let day = cal.date(byAdding: .day, value: -i, to: today)!
                return (ms(day), i == 0 ? now() : ms(cal.date(byAdding: .day, value: 1, to: day)!))
            }
            return stats.report(days) { self.respond(c, 200, "application/json", Data(jsonText($0).utf8)) }
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
