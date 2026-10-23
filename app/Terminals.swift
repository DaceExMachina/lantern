// Running `claude` processes and the apps around them: finding a session's terminal tab and bringing it to the front.
import Foundation

/// pids of running `claude` processes: a terminal's, named plainly, and the Claude app's, named by a full path with spaces in it
func claudePids() -> [String] {
    run("ps", ["-axo", "pid=,comm="]).out.components(separatedBy: "\n")
        .map { $0.trim.split(separator: " ", maxSplits: 1).map(String.init) }.filter { $0.count > 1 && ($0[1] as NSString).lastPathComponent == "claude" }.map { $0[0] }
}

/// The transcript Claude Code says a running `claude` writes, if it says (sessions/<pid>.json) and it's there yet, and
/// whether it says that session is mid-turn: its own `status`, "busy" or "idle" (nil for anything else, or none).
/// The record has to be that process's own: it names when the process started (procStart, in UTC and the C locale), and a pid that was reused
/// after the process ended leaves the old record behind, so a record whose start differs from the running process's is stale.
func sessionFile(_ pid: String) -> (file: String, busy: Bool?)? {
    guard let (dir, d) = CLAUDE_DIRS.lazy.compactMap({ dir in FileManager.default.contents(atPath: "\(dir)/sessions/\(pid).json").map { (dir, $0) } }).first, let j = parse(d) as? JSON,
          let id = j["sessionId"] as? String, UUID_RE.test(id), let cwd = j["cwd"] as? String else { return nil }
    // (a record without procStart, from an older Claude Code, can't be checked and is taken as written)
    if let started = j["procStart"] as? String, run("/usr/bin/env", ["LC_ALL=C", "TZ=UTC", "ps", "-o", "lstart=", "-p", pid]).out.split(whereSeparator: \.isWhitespace) != started.split(whereSeparator: \.isWhitespace) { return nil }
    // the folder that knows this process is where it writes; elsewhere may hold a stale copy
    let mine = "\(dir)/projects/\(cwd.projectName)/\(id).jsonl"
    let f = FileManager.default.fileExists(atPath: mine) ? mine : sessionPath(cwd.projectName, id) + ".jsonl"
    return FileManager.default.fileExists(atPath: f) ? (f, ["busy": true, "idle": false][str(j["status"])]) : nil
}

/// Running processes grouped by the transcript they write: one session can run in several (the Claude app's and a terminal
/// `claude --resume` of it). It's busy when any of them says so, idle when the ones that say anything all say idle, and
/// unknown when none says. check() reads the same mix the same way.
func bySession(_ procs: [(file: String, pid: Int?, busy: Bool?)]) -> [(file: String, pids: [Int], busy: Bool?)] {
    var out = Ordered<(pids: [Int], busy: Bool?)>()
    for p in procs {
        var x = out[p.file] ?? ([], nil)
        if let pid = p.pid { x.pids.append(pid) }
        if p.busy == true || x.busy == nil { x.busy = p.busy }
        out[p.file] = x
    }
    return out.items.map { ($0.0, $0.1.pids, $0.1.busy) }
}

// The transcripts of running terminal `claude`s, however long they've been quiet, each with its processes. Claude Code
// names a process's session in sessions/<pid>.json. A process without a usable record (a session so new its transcript
// isn't written yet) isn't guessed at from its folder's newest transcripts, which are other, long-finished sessions: its
// hooks bring it in.
func liveTranscripts() -> [(file: String, pids: [Int], busy: Bool?)] {
    bySession(claudePids().compactMap { pid in sessionFile(pid).map { ($0.file, Int(pid), $0.busy) } })
}

// The Claude app keeps a file per session it runs, with its own id for it (local_...) next to the Claude Code session
// id, and for its side sessions the session that started them. Only those fields and its title (what the app shows) are read.
let APP_SESSIONS = HOME + "/Library/Application Support/Claude/claude-code-sessions"
typealias AppSession = (cli: String, local: String, from: String?, title: String?, mtime: Double)
// Each file is parsed again only when it has changed (by modification time); files that are gone drop out.
var appSessionCache: [String: (mtime: Date, session: AppSession?)] = [:]
let appSessionLock = NSLock()
func appSessions() -> [AppSession] {
    appSessionLock.lock(); defer { appSessionLock.unlock() }
    var seen: [String: (mtime: Date, session: AppSession?)] = [:]
    let walk = FileManager.default.enumerator(at: URL(fileURLWithPath: APP_SESSIONS), includingPropertiesForKeys: [.contentModificationDateKey])
    while let file = walk?.nextObject() as? URL {
        guard file.lastPathComponent.hasPrefix("local_"), file.pathExtension == "json",
              let mtime = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate else { continue }
        if let known = appSessionCache[file.path], known.mtime == mtime { seen[file.path] = known; continue }
        var session: AppSession?
        if let data = FileManager.default.contents(atPath: file.path), let j = parse(data) as? JSON,
           let cli = j["cliSessionId"] as? String, let local = j["sessionId"] as? String {
            session = (cli, local, (j["spawnedFrom"] as? JSON)?["sessionId"] as? String, j["title"] as? String, mtime.timeIntervalSince1970 * 1000)
        }
        seen[file.path] = (mtime, session)
    }
    appSessionCache = seen
    return seen.values.compactMap(\.session)
}
/// child id -> parent id, in Claude Code ids, for the side sessions the Claude app started from another session
func spawnLinks() -> [String: String] {
    let all = appSessions(), cliOf = Dictionary(all.map { ($0.local, $0.cli) }, uniquingKeysWith: { a, _ in a })
    return Dictionary(all.compactMap { a in a.from.flatMap { cliOf[$0] }.map { (a.cli, $0) } }, uniquingKeysWith: { a, _ in a })
}

// MARK: bringing a session's window to the front, in whichever terminal (or the Claude app) runs it

/// The app executable among a process's ancestors: its terminal, e.g. /Applications/iTerm.app/Contents/MacOS/iTerm2
func terminalBinary(_ pid: String) -> String? {
    var p = pid
    for _ in 0..<20 where Re("^[0-9]+$").test(p) && p != "1" {
        let line = run("ps", ["-o", "ppid=,comm=", "-p", p]).out.trim
        guard let gap = line.firstIndex(where: \.isWhitespace) else { return nil }
        let comm = String(line[gap...]).trim
        if comm.contains(".app/Contents/MacOS/") && !comm.contains("/claude-code/") { return comm } // not Claude Code's own bundled binary
        p = String(line[..<gap])
    }
    return nil
}

/// Brings a session's terminal tab, or its session in the Claude app, to the front. iTerm2 is handled by the caller,
/// which can look its tabs up. Falls back to just bringing the terminal app forward. Every value used here was checked
/// against a pattern when it arrived, and none of them goes through a shell.
func focusElsewhere(_ s: JSON) -> Bool {
    let term = s["term"] as? String ?? "", app = s["app"] as? String ?? "", pid = (s["pids"] as? [Int])?.last.map(String.init) ?? ""
    let open = { (args: [String]) in run("open", args).ok }
    // The Claude app opens one of its sessions from its own link (it ignores the link when its entry points are switched off,
    // and opening it still brings the app forward). Sessions seeded at startup don't say where they run, so check those too.
    if app == "com.anthropic.claudefordesktop" || app.isEmpty && term.isEmpty,
       let local = appSessions().first(where: { $0.cli == str(s["id"]) })?.local, Re("^local_[A-Za-z0-9-]{1,64}$").test(local) {
        return open(["claude://code/continue?session=" + local])
    }
    let binary = terminalBinary(pid), bundle = binary.map { $0.components(separatedBy: "/Contents/MacOS/")[0] }
    let activate = { !app.isEmpty ? open(["-b", app]) : bundle.map { open(["-a", $0]) } ?? false }
    switch term {
    case "Apple_Terminal": // Terminal.app finds the tab by its tty
        // Since Sierra, Terminal's tabs are native window tabs. `set index of w to 1` re-orders the tab group and can bring
        // back whichever tab it had showing, so raise the window with `frontmost` (which also selects it within its group)
        // before selecting the tab, then activate. `contents of` resolves the loop variables, which are otherwise references
        // into the list that `set selected tab` can mishandle. It prints "ok" on a match, so no match falls back to activate().
        let tty = run("ps", ["-o", "tty=", "-p", pid]).out.trim
        if Re("^ttys[0-9]+$").test(tty), run("osascript", ["-e", """
            tell application "Terminal"
              repeat with w in windows
                set win to contents of w
                repeat with t in tabs of win
                  if tty of t is "/dev/\(tty)" then
                    set frontmost of win to true
                    set selected tab of win to contents of t
                    activate
                    return "ok"
                  end if
                end repeat
              end repeat
            end tell
            """], timeout: 30).out.trim == "ok" { return true }
    case "WezTerm": // its CLI sits next to the app's binary
        if truthy(s["pane"]), let bundle, run(bundle + "/Contents/MacOS/wezterm", ["cli", "activate-pane", "--pane-id", str(s["pane"])]).ok { return activate() }
    case "vscode": // VS Code and its forks bring the window that has this folder open forward (or open one)
        if !app.isEmpty && truthy(s["cwd"]) { return open(["-b", app, str(s["cwd"])]) }
    default: // kitty only takes remote commands when its kitty.conf allows them (allow_remote_control, listen_on)
        if truthy(s["kitty"]) && truthy(s["pane"]), let bundle,
           run(bundle + "/Contents/MacOS/kitten", ["@", "--to", str(s["kitty"]), "focus-window", "--match", "id:" + str(s["pane"])]).ok { return activate() }
    }
    return activate()
}

extension LanternServer {
    // MARK: finding a session's iTerm tab when hooks haven't told us (seeded, or quiet since a restart)

    func findIterm(_ id: String, _ done: @escaping (String?) -> Void) {
        DispatchQueue.global().async {
            // the separator is set outside the tell block: inside it, the word `tab` means iTerm's tab object, not a character
            let list = run("osascript", ["-e", """
                set out to ""
                set sep to character id 9
                if application "iTerm2" is running then
                  tell application "iTerm2"
                    repeat with w in windows
                      repeat with t in tabs of w
                        repeat with ss in sessions of t
                          set out to out & (unique id of ss) & sep & (name of ss) & linefeed
                        end repeat
                      end repeat
                    end repeat
                  end tell
                end if
                return out
                """])
            if !list.ok { print("findIterm: osascript failed") } // its error is in the log just above
            let tabs = list.out.components(separatedBy: "\n").map { $0.components(separatedBy: "\t") }.filter { UUID_RE.test($0[0]) }
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
}
