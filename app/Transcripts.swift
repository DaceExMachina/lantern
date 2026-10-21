// Reading what sessions are doing from hook payloads and transcripts, and rebuilding sessions from them (seeding, adopting).
import Foundation

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

// What a finished turn hands me, for its card: the "You:" line from its status footer (or its last paragraph), PRs and other links, and
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
    // the You: line from a status footer is the TL;DR of what to do. Without one, the final paragraph (headings dropped, list
    // items joined with dots) stands in, unless it's only a question the card lists anyway. Its links are kept either way,
    // split into plain text and {label, url} pieces.
    let footer = Re("\\*\\*You:\\*\\*\\s*(.+)").match(text)?[1]
    let item = Re("^\\s*([-*+]|[0-9]+[.)])\\s+")
    let lastParagraph = Re("\\n\\s*\\n").split(text).map { $0.components(separatedBy: "\n").filter { !Re("^\\s*#").test($0) } }
        .last { !$0.joined().trim.isEmpty }.map { lines in
            lines.enumerated().map { i, l in (i > 0 ? item.test(l) ? " · " : " " : "") + item.replace(l, "").trim }.joined()
        }
    let youRaw = footer ?? lastParagraph.flatMap { asked.contains(plain($0)) ? nil : $0 } ?? ""
    var you: [Any] = [], at = 0
    let strip = Re("[*_`]")
    for m in Re("\\[([^\\]]+)\\]\\((https?://[^\\s)]+)\\)").matches(youRaw) {
        you.append(strip.replace(youRaw.sub(NSRange(location: at, length: m.range.location - at))!, ""))
        you.append(["label": strip.replace(youRaw.sub(m.range(at: 1))!, ""), "url": youRaw.sub(m.range(at: 2))!])
        at = m.range.location + m.range.length
    }
    if at < youRaw.utf16.count { you.append(strip.replace(youRaw.sub(NSRange(location: at, length: youRaw.utf16.count - at))!, "")) }
    if footer == nil { // a whole paragraph can run long: keep about 200 characters, ending on a word
        var left = 200, kept: [Any] = []
        for piece in you where left > 0 {
            let shown = (piece as? String) ?? str((piece as? JSON)?["label"])
            if shown.utf16.count <= left { kept.append(piece); left -= shown.utf16.count; continue }
            if piece is String { kept.append(Re("\\s+\\S*$").replace(shown.cut(left), "") + "…") }
            left = 0
        }
        you = kept
    }
    var questions: [String] = []
    for q in blockers + asked where !questions.contains(q) { questions.append(q) }
    return ["you": you.filter { ($0 as? String)?.isEmpty != true },
            "prs": Array(prs.prefix(6)),
            "questions": questions.prefix(5).map { $0.cut(160) }]
}

// Runs of plain sentences in a message, for the barrel's paper (page/pages.js) to show in passing: each run is the
// consecutive sentences that pass, joined into a paragraph of at most about 70 words, and anything that doesn't pass ends
// the run. A sentence passes when it's whole, 6 to 20 words, starting with a capital and ending in a full stop. Anyone walking past can read the screensaver, so a sentence
// goes whole if it holds anything that could identify work: code, a link or path, any digit (ids, hashes, ports), a
// capitalised word past its first (a name), or talk to or about the person (I, you). Kept in memory only.
func prose(_ message: Any?) -> [String] {
    let text = Re("```[\\s\\S]*?```").replace(message == nil ? "" : str(message), "\n#\n") // a code block ends a run
    let person = Re("\\b(I|I'm|I'll|I've|I'd|me|my|you|your|you're|you'll|we|we're|let's|us|our)\\b", .caseInsensitive)
    // a sentence's first word could be a name too: it has to be a common opener, or a word the message also writes in lowercase
    let lower = Set(Re("\\b[a-z][a-z']*\\b").matches(text).compactMap { text.sub($0.range) }.map { $0.hasSuffix("s") ? String($0.dropLast()) : $0 })
    let openers: Set<String> = ["the", "this", "that", "these", "those", "it", "its", "a", "an", "each", "every", "both", "all", "some", "most",
                                "now", "then", "there", "here", "when", "while", "if", "once", "after", "before", "only", "no", "nothing",
                                "everything", "their", "they", "one", "so", "but", "and", "with", "without", "instead", "also", "still"]
    var out: [String] = [], run: [String] = []
    func end() { let p = run.joined(separator: " "); if !p.isEmpty && !out.contains(p) { out.append(p) }; run = [] }
    for line in text.components(separatedBy: "\n") {
        let l = line.trim
        if l.isEmpty { continue } // a blank line between paragraphs doesn't end a run
        if Re("^(#|>|\\|)").test(l) || Re("\\*\\*[A-Za-z ]+:\\*\\*").test(l) { end(); continue } // headings, quotes, tables, footer labels
        for raw in Re("(?<=[.!?])\\s+").split(Re("^([-*+]|[0-9]+[.)])\\s+").replace(l, "")) {
            if Re("[`/\\\\\\[\\]()<>#@:=|{}0-9]|https?|\\w\\.\\w").test(raw) || person.test(raw) { end(); continue }
            let s = Re("[*_]").replace(raw, "").trim
            let words = s.split(separator: " ")
            let first = words.first.map { $0.lowercased().trimmingCharacters(in: .punctuationCharacters) } ?? ""
            guard (6...20).contains(words.count), Re("^[A-Z][a-z']*,?$").test(String(words[0])), s.hasSuffix("."), !s.hasSuffix("..."),
                  openers.contains(first) || lower.contains(first.hasSuffix("s") ? String(first.dropLast()) : first),
                  !words.dropFirst().contains(where: { Re("^[^a-z]*[A-Z]").test(String($0)) }) else { end(); continue }
            if run.joined(separator: " ").split(separator: " ").count + words.count > 70 { end() }
            run.append(s)
        }
    }
    end()
    return out
}

// The runs of plain sentences in a transcript's assistant messages, oldest first.
func transcriptProse(_ lines: [String]) -> [String] {
    var said: [String] = []
    for line in lines {
        guard let j = parse(Data(line.utf8)) as? JSON, str(j["type"]) == "assistant" else { continue }
        for c in (j["message"] as? JSON)?["content"] as? [JSON] ?? [] where str(c["type"]) == "text" { said += prose(c["text"]).filter { !said.contains($0) } }
    }
    return said
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

/// `idle`: it ended with nothing asked (a compaction, or an interrupt), so it's at the prompt rather than waiting on me.
struct Turn { var done = false, idle = false, text: String?, cwd: Any? }
// User lines without an origin that don't start a turn: local slash commands (/rename, /clear) and their output, `!` shell
// lines, a background task's "finished" notice (which only starts a turn once Claude picks it up), and the Claude app's
// side-session events. Lines with an origin say what they are: only `human` is a prompt.
let NOT_A_PROMPT = Re("^\\s*<(command-name|local-command-|bash-|task-notification|system-reminder)")
// How the last turn ended: a finished turn (end_turn, then in a terminal a turn_duration marker) means it's waiting for
// me. The transcript is only read when no hook has said (seeding, adopting, subagents), and terminal and desktop sessions
// read the same way: the Claude app never writes turn_duration, and needn't, since end_turn is there either way (and the
// stop_hook_summary both write follows an end_turn every time). Only the lines that mark a turn count: a prompt, a tool's
// result, an assistant message, the turn_duration marker, an interrupt and a compaction. Everything else Claude Code writes (attachments, titles, local commands, meta reminders, kinds it adds
// later) is skipped, so a session renamed after its turn still reads as waiting.
func lastTurn(_ lines: [String]) -> Turn {
    var ended = false // a turn_duration marker comes after the final message, so keep looking back for its text
    var answered = false // the last line is a tool's result: done only if that tool was a subagent's hand-back
    for line in lines.reversed() {
        guard let j = parse(Data(line.utf8)) as? JSON else { continue }
        let type = str(j["type"]), subtype = str(j["subtype"]), content = (j["message"] as? JSON)?["content"]
        let compact = truthy(j["isCompactSummary"]) || subtype == "compact_boundary"
        let origin = (j["origin"] as? JSON)?["kind"] as? String
        // Esc: no Stop and no end marker follow, just this line ("[Request interrupted by user]", or "... for tool use")
        let interrupt = type == "user" && (content as? [JSON] ?? []).contains { str($0["text"]).hasPrefix("[Request interrupted by user") }
        guard type == "assistant" || type == "user" && !truthy(j["isMeta"]) && (origin.map { $0 == "human" } ?? !NOT_A_PROMPT.test((content as? String) ?? ""))
              || subtype == "turn_duration" || compact else { continue }
        if subtype == "turn_duration" { ended = true; continue }
        if interrupt && !ended { return Turn(done: true, idle: true, cwd: j["cwd"]) }
        if type == "assistant" {
            let msg = j["message"] as? JSON
            let text = ((msg?["content"] as? [JSON]) ?? []).filter { str($0["type"]) == "text" }.map { str($0["text"]) }.joined(separator: "\n")
            if ended && text.isEmpty { continue }
            // a background agent ends by calling SubagentHandback with its report, not with a closing turn (and no
            // SubagentStop follows), so its transcript ends on that call's result
            if answered { return Turn(done: ((msg?["content"] as? [JSON]) ?? []).contains { str($0["type"]) == "tool_use" && str($0["name"]) == "SubagentHandback" }, text: text, cwd: j["cwd"]) }
            return Turn(done: ended || str(msg?["stop_reason"]) == "end_turn", text: text, cwd: j["cwd"])
        }
        if ended { return Turn(done: true, cwd: j["cwd"]) }
        if compact { return Turn(done: true, idle: true, cwd: j["cwd"]) } // stopped right after a compact
        if !answered, (content as? [JSON] ?? []).contains(where: { str($0["type"]) == "tool_result" }) { answered = true; continue }
        return Turn(done: false, cwd: j["cwd"]) // a prompt, or a second tool result: mid-turn
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

// PRs a session created, read back from its transcript and its subagents' (a restart forgets the live ones).
// ponytail: reads every transcript in full (memory-mapped); read only the tails if startup drags.
// Each Bash call that ran `gh pr create`, and the PR URL in that call's own output:
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

/// When the session itself started background task `id`: the timestamp of the tool result in its own transcript that
/// carries `"backgroundTaskId":"<id>"`. nil when the transcript has no such line, so a subagent started it (that line is
/// only in the subagent's transcript) and its finishing wakes the subagent, not the session. One memmem over the mapped
/// file, as in linesWorthParsing, so an 85 MB transcript costs milliseconds.
func taskStart(_ file: String, _ id: String) -> Double? {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: file), options: .alwaysMapped) else { return nil }
    let needle = Array("\"backgroundTaskId\":\"\(id)\"".utf8)
    let line = data.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> Data? in
        guard let base = buf.baseAddress, let hit = memmem(base, buf.count, needle, needle.count) else { return nil }
        var start = UnsafeRawPointer(hit) - base, end = start
        while start > 0 && buf[start - 1] != 10 { start -= 1 }
        while end < buf.count && buf[end] != 10 { end += 1 }
        return Data(bytes: base + start, count: end - start)
    }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let line, let stamp = (parse(line) as? JSON)?["timestamp"] as? String, let at = iso.date(from: stamp) else { return nil }
    return (at.timeIntervalSince1970 * 1000).rounded(.down)
}

/// Subagents under a session folder that look like they're still going: transcript touched in the last two minutes and not
/// finished. Skips (without reading) any in `known`.
func liveSubagents(_ dir: String, known: Ordered<JSON> = Ordered<JSON>()) -> Ordered<JSON> {
    var agents = Ordered<JSON>()
    for f in transcripts(dir + "/subagents") {
        guard let agent = Re("^agent-([A-Za-z0-9_-]+)\\.jsonl$").match((f as NSString).lastPathComponent)?[1], known[agent] == nil, let mtime = fileTimes(f)?.mtime,
              now() - mtime <= 2 * 60 * 1000, !lastTurn(tail(f, 64 * 1024)).done else { continue }
        var a: JSON = ["type": "", "description": "", "activity": "", "tries": 3, "last": mtime]
        if let data = FileManager.default.contents(atPath: "\(dir)/subagents/agent-\(agent).meta.json"), let j = parse(data) as? JSON {
            a["type"] = or(j["agentType"], ""); a["description"] = or(j["description"], "")
        }
        agents[agent] = a
    }
    return agents
}

/// A session rebuilt from its transcript, before it joins the live ones. `busy` is what Claude Code itself says about a
/// running one (sessions/<pid>.json); it wins over reading the transcript, which is only the fallback.
func seedSession(_ file: String, live: Bool, busy: Bool? = nil, words: Bool) -> (JSON, Ordered<JSON>)? {
    let id = ((file as NSString).lastPathComponent as NSString).deletingPathExtension, dir = String(file.dropLast(6))
    guard UUID_RE.test(id), let st = fileTimes(file) else { return nil }
    let lines = tail(file)
    var turn = lastTurn(lines)
    if let busy { turn.done = !busy; turn.idle = turn.idle && !busy }
    var s: JSON = ["id": id, "cwd": or(turn.cwd, "")!, "turn": turn.idle ? "idle" : turn.done ? "ended" : "running",
                   "note": turn.done && !turn.idle ? "Finished its turn, waiting for you" : "",
                   "started": st.birth, "last": live ? now() : st.mtime, "project": ((dir as NSString).deletingLastPathComponent as NSString).lastPathComponent,
                   "unconfirmed": !live]
    if turn.done, let text = turn.text, !text.isEmpty { s["forYou"] = forYou(text) }
    // everything it said in the transcript's tail, not just the last turn, so the pages have words straight after a restart
    if words, case let said = transcriptProse(lines), !said.isEmpty { s["prose"] = Array(said.suffix(10)) }
    s["created"] = createdPRs(file, dir)
    let agents = liveSubagents(dir)
    s["awaits"] = str(s["turn"]) == "ended" && agents.count > 0
    s["agentsAwaited"] = agents.keys
    if str(s["turn"]) == "ended" { s["waitingSince"] = st.mtime } // it's been waiting since its transcript last changed
    return (s, agents)
}

extension LanternServer {
    func loadTitle(_ id: String, _ dir: String) {
        let current = sessions[id]?["title"]
        DispatchQueue.global().async {
            let title = readTitle(dir, current)
            DispatchQueue.main.async {
                guard self.sessions[id] != nil, str(self.sessions[id]!["title"]) != str(title) else { return }
                self.sessions[id]!["title"] = title
                self.broadcast()
            }
        }
    }
    /// Corrects the in-memory state against what's on disk, for the things a lost hook event leaves wrong. Called by the
    /// sweep; reads happen off the main queue and apply only if nothing changed meanwhile. Today it covers subagents:
    ///  - tracked ones quiet for AGENT_CHECK_MS go when their transcript's last turn is done, or when neither hooks nor
    ///    transcript moved for AGENT_EXPIRE_MS (SubagentStop never came);
    ///  - running ones the hooks never announced are added, for working or paused sessions.
    /// New "state we infer from events but can verify on disk" checks belong here, not scattered through sweep().
    func reconcile() {
        struct Look { let id: String, dir: String, tracked: [(String, Double)], known: Ordered<JSON>, adopt: Bool, title: Any?, titleSeen: Double }
        let looks = sessions.items.compactMap { id, s -> Look? in
            guard let project = s["project"] as? String else { return nil }
            let list = agents[id] ?? Ordered<JSON>()
            let tracked = list.items.compactMap { aid, a -> (String, Double)? in
                let last = (a["last"] as? Double) ?? 0
                return now() - last >= AGENT_CHECK_MS && Re("^[A-Za-z0-9_-]+$").test(aid) ? (aid, last) : nil
            }
            return Look(id: id, dir: "\(PROJECTS)/\(project)/\(id)", tracked: tracked, known: list, adopt: ["working", "paused"].contains(str(s["state"])), title: s["title"], titleSeen: (s["titleSeen"] as? Double) ?? 0)
        }
        guard !looks.isEmpty else { return }
        DispatchQueue.global().async {
            let app = appSessions() // the Claude app keeps the title it shows in its own file for the session
            let results = looks.map { l -> (String, [(String, Double)], Ordered<JSON>, Double, Any?) in
                let gone = l.tracked.filter { aid, last in
                    let file = "\(l.dir)/subagents/agent-\(aid).jsonl", mtime = fileTimes(file)?.mtime
                    return (mtime != nil && lastTurn(tail(file, 64 * 1024)).done) || now() - max(last, mtime ?? 0) > AGENT_EXPIRE_MS
                }
                // a rename fires no hook, so re-read the title when a file it lives in has been written since we last looked
                let mine = app.first { $0.cli == l.id }
                let written = max(fileTimes(l.dir + "/custom-title.json")?.mtime ?? 0, fileTimes(l.dir + ".jsonl")?.mtime ?? 0, mine?.mtime ?? 0)
                let title: Any? = written > l.titleSeen ? (mine?.title.flatMap { $0.isEmpty ? nil : $0 } ?? readTitle(l.dir, l.title)) : l.title
                return (l.id, gone, l.adopt ? liveSubagents(l.dir, known: l.known) : Ordered<JSON>(), written, title)
            }
            DispatchQueue.main.async {
                var changed = false
                for (id, gone, found, written, title) in results where self.sessions[id] != nil {
                    self.sessions[id]!["titleSeen"] = written
                    if str(self.sessions[id]!["title"]) != str(title) { self.sessions[id]!["title"] = title; changed = true }
                    for (aid, last) in gone where (self.agents[id]?[aid]?["last"] as? Double) == last { self.agents[id]![aid] = nil; changed = true } // unless it fired again meanwhile
                    for (aid, a) in found.items where self.agents[id]?[aid] == nil { self.agents[id, default: Ordered<JSON>()][aid] = a; changed = true }
                }
                if changed { self.broadcast() }
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

    // The pages also draw on recent transcripts, so they aren't blank when little is running: up to fifteen runs from
    // the tail of each, newest first, going further back until there are about a hundred and twenty, enough for a paper
    // full of different paragraphs (reading at most sixty transcripts). Read when the server starts and when session text
    // is turned on.
    func seedProse() {
        let most = 120
        DispatchQueue.global().async {
            let started = now()
            let newest = ((try? FileManager.default.contentsOfDirectory(atPath: PROJECTS)) ?? []).flatMap { transcripts(PROJECTS + "/" + $0) }
                .map { ($0, fileTimes($0)?.mtime ?? 0) }.sorted { $0.1 > $1.1 }.prefix(60).map(\.0)
            var pool: [String] = [], read = 0
            for f in newest where pool.count < most { read += 1; pool += transcriptProse(tail(f)).suffix(15).filter { !pool.contains($0) } }
            print("Read \(pool.count) run(s) of prose from \(read) recent transcript(s) in \(Int(now() - started)) ms")
            DispatchQueue.main.async {
                if !self.wordsOn { return } // turned off again while reading
                self.recentProse = Array(pool.prefix(most))
                self.send("event: prose\ndata: \(jsonText(self.recentProse))\n\n")
            }
        }
    }

    // MARK: seeding: rebuild sessions from disk when the server starts, so a restart doesn't forget them

    func seed() {
        let words = wordsOn, mirroring = mirror != nil // a preview following the app shows the app's sessions, not its own
        if words { seedProse() }
        DispatchQueue.global().async {
            var seeded: [(JSON, Ordered<JSON>)] = [], seen = Set<String>()
            let take = { (f: String, live: Bool, pids: [Int], busy: Bool?) in
                let id = ((f as NSString).lastPathComponent as NSString).deletingPathExtension
                if seen.contains(id) { return }
                // with its processes known, sweep() keeps it while one runs and drops it once all are gone, as for a hooked one
                if var s = seedSession(f, live: live, busy: busy, words: words) { if !pids.isEmpty { s.0["pids"] = pids }; seen.insert(id); seeded.append(s) }
            }
            if !mirroring {
                for (f, pids, busy) in liveTranscripts() { take(f, true, pids, busy) }
                if let dirs = try? FileManager.default.contentsOfDirectory(atPath: PROJECTS) {
                    for d in dirs.sorted() { for f in transcripts(PROJECTS + "/" + d) where now() - (fileTimes(f)?.mtime ?? 0) < SEED_RECENT_MS { take(f, false, [], nil) } }
                } else { print("seeding failed: no \(PROJECTS)") }
            }
            let cache = FileManager.default.contents(atPath: self.githubCache).flatMap(parse) as? JSON
            DispatchQueue.main.async {
                self.add(seeded)
                if !mirroring { print("Seeded \(self.sessions.count) session(s) from disk") }
                self.linkSpawned()
                // last known PR status, until the first refresh replaces it
                if let cache, (self.settings["githubAccounts"] as? [Any])?.isEmpty == false || truthy(self.settings["github"]) {
                    self.reviews = cache["reviews"] as? [JSON] ?? []
                    self.stale = cache["stale"] as? [JSON] ?? []
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

    /// Sessions rebuilt from disk join the live ones, unless hooks brought them back first.
    func add(_ seeded: [(JSON, Ordered<JSON>)]) {
        for (s, a) in seeded {
            let id = str(s["id"])
            if sessions[id] != nil { continue }
            var s = s
            agents[id] = a
            derive(&s, id)
            sessions[id] = s
            self.seeded.insert(id)
            loadTitle(id, String(PROJECTS + "/" + str(s["project"]) + "/" + id))
        }
    }

    // Hooks can miss a session (iTerm restarting, a hook failing), so now and then any running `claude` the lantern
    // doesn't know is brought back from its transcript, as at startup. One ps; the session files only for unknown pids.
    // A process of a session already known (the Claude app's, while a terminal resume of it sends the hooks) joins that
    // session's pids without its transcript being read, which for a long desktop session is 175 MB a minute.
    // Not while the screen's locked: nobody's looking, and the first sweep after unlocking catches up.
    func adopt() {
        if screenLocked() { return }
        let known = Set(sessions.items.flatMap { $0.1["pids"] as? [Int] ?? [] }.map(String.init)), ids = Set(sessions.keys), words = wordsOn
        DispatchQueue.global().async {
            var joins: [(String, Int)] = [], unknown: [(file: String, pid: Int?, busy: Bool?)] = []
            for pid in claudePids() where !known.contains(pid) {
                guard let f = sessionFile(pid), let p = Int(pid) else { continue }
                let id = ((f.file as NSString).lastPathComponent as NSString).deletingPathExtension
                if ids.contains(id) { joins.append((id, p)) } else { unknown.append((f.file, p, f.busy)) }
            }
            let found = bySession(unknown).compactMap { f, pids, busy in
                seedSession(f, live: true, busy: busy, words: words).map { s -> (JSON, Ordered<JSON>) in var s = s; s.0["pids"] = pids; return s }
            }
            if found.isEmpty && joins.isEmpty { return }
            DispatchQueue.main.async {
                for (id, p) in joins where self.sessions[id] != nil { self.sessions[id]!["pids"] = [p] + (self.sessions[id]!["pids"] as? [Int] ?? []) } // first: the hooks' process stays the one to focus
                let before = self.sessions.count
                self.add(found)
                if self.sessions.count == before { return }
                print("Adopted \(self.sessions.count - before) running session(s) the hooks missed")
                self.broadcast()
                // then, as at startup, its iTerm tab so it's clickable, and its PRs
                self.findItermTabs(found.map { str($0.0["id"]) }.filter { self.sessions[$0] != nil && !truthy(self.sessions[$0]!["iterm"]) }) {
                    self.broadcast()
                    self.refreshGitHub()
                }
            }
        }
    }
}
