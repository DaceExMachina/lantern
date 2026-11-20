// Posting the review desk's findings I checked as one GitHub review, from the detail panel (POST /desk/post), links that open the panel
// (GET /review/..., POST /desk/show), and the code each finding cites (POST /desk/code).
import Foundation
import Network

// LANTERN_DRY_POST=1: say what would go out and answer with a made-up link, without calling GitHub (previews and tests).
let DRY_POST = ProcessInfo.processInfo.environment["LANTERN_DRY_POST"] == "1"

/// One call to GitHub as one account: a method, an API path and a body in, a status and JSON out.
typealias GitHubCall = (_ method: String, _ path: String, _ body: JSON?) -> (status: Int, json: Any?) // an object, or a list (pull files)

/// A finding the page can show: it needs a severity and a title, like the page's own parser (so both count the same findings).
func validFinding(_ f: Any) -> Bool { (f as? JSON).map { $0["severity"] is String && $0["title"] is String } ?? false }

/// The review's inline comments and its body. A finding with a file and a line number is a comment on that line; every other finding
/// goes in the body, and all of them do when `inline` is off.
func reviewParts(_ findings: [JSON], inline: Bool) -> (comments: [JSON], body: String) {
    var comments: [JSON] = [], lines: [String] = []
    for f in findings {
        let file = f["file"] as? String ?? "", line = f["line"].flatMap { Int(str($0)) } ?? 0
        let text = "**\(str(f["severity"]))** \(str(f["title"]))" + ((f["detail"] as? String).flatMap { $0.isEmpty ? nil : "\n\n" + $0 } ?? "")
        if inline && !file.isEmpty && line > 0 { comments.append(["path": file, "line": line, "side": "RIGHT", "body": text]) }
        else { lines.append((file.isEmpty ? "" : "`\(file)\(f["line"] == nil ? "" : ":" + str(f["line"]))` ") + text) }
    }
    return (comments, lines.joined(separator: "\n\n"))
}

/// Posts the findings as one COMMENT review, through the first account that can see the repo. Returns the review's link, or what went wrong.
func postReview(repo: String, pr: Int, head: String, findings: [JSON], calls: () -> [GitHubCall]) -> (url: String?, error: String) {
    let first = reviewParts(findings, inline: true)
    if DRY_POST {
        print("Dry post: \(repo)#\(pr) review, body \(first.body.count) characters, \(first.comments.count) inline")
        return ("https://github.com/\(repo)/pull/\(pr)#pullrequestreview-0", "")
    }
    guard let call = calls().first(where: { $0("GET", "/repos/\(repo)", nil).status == 200 }) else { return (nil, "No GitHub account signed in to Lantern can see \(repo).") }
    var review: JSON = ["event": "COMMENT", "body": first.body, "comments": first.comments]
    if !head.isEmpty { review["commit_id"] = head }
    var r = call("POST", "/repos/\(repo)/pulls/\(pr)/reviews", review)
    if r.status / 100 != 2 && !first.comments.isEmpty { // GitHub refused a line, or the commit: say it all in the body instead
        r = call("POST", "/repos/\(repo)/pulls/\(pr)/reviews", ["event": "COMMENT", "body": reviewParts(findings, inline: false).body])
    }
    guard r.status / 100 == 2, let id = (r.json as? JSON)?["id"] as? Int else { return (nil, "GitHub refused the review: \((r.json as? JSON)?["message"] as? String ?? "no answer (status \(r.status))").") }
    return ("https://github.com/\(repo)/pull/\(pr)#pullrequestreview-\(id)", "")
}

extension LanternServer {
    var deskDir: String { (ProcessInfo.processInfo.environment["LANTERN_PR_DIR"] ?? HOME + "/.ghbus") + "/reviews" } // lantern-pr's folder, which it lets the same variable move

    /// The calls to try, one per GitHub account Lantern has signed in, else one per top folder's `gh` (the way the PR query picks them).
    /// Runs on a background queue; `tokens` and `cwds` are what the main thread had.
    func githubCalls(tokens: [(String, JSON)], cwds: [String]) -> [GitHubCall] {
        if !tokens.isEmpty {
            return tokens.map { _, account in { method, path, body in
                fetchAny(GH_API + path, method: method, headers: ["Authorization": "Bearer \(str(account["token"]))", "User-Agent": "lantern-pr", "Accept": "application/vnd.github+json"], body: body)
            } }
        }
        return accountFolders(cwds.filter { git($0, ["rev-parse", "--is-inside-work-tree"]) != nil }).map { f in { method, path, body in
            var args = ["api", "-X", method, path], input: String?
            if let body, let data = try? JSONSerialization.data(withJSONObject: body) {
                let file = NSTemporaryDirectory() + "lantern-review-\(UUID().uuidString).json"
                FileManager.default.createFile(atPath: file, contents: data, attributes: [.posixPermissions: 0o600])
                input = file; args += ["--input", file]
            }
            defer { if let input { try? FileManager.default.removeItem(atPath: input) } }
            let r = run(GH, args, cwd: f.cwd, timeout: 30)
            return (r.ok ? 200 : 400, parse(Data(r.out.utf8)))
        } }
    }

    /// POST /desk/post { url, head, findings: [index] }: the PR's record must exist, its findings must be the ones the page saw, and
    /// the indices must be in range. The answer is { url } (the review) or { error }.
    func postDesk(_ c: NWConnection, _ body: JSON?) {
        let fail = { (status: Int, error: String) in self.respond(c, status, "application/json", Data(jsonText(["error": error]).utf8)) }
        guard let url = body?["url"] as? String, url.hasPrefix("https://github.com/"), let given = body?["findings"] as? [Int], !given.isEmpty, Set(given).count == given.count
        else { return fail(400, "That isn't something to post.") }
        guard let record = desk.first(where: { str($0["url"]) == url }), let repo = record["repo"] as? String, let pr = record["pr"] as? Int, Re("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$").test(repo)
        else { return fail(404, "The desk has no notes on that PR.") }
        let all = record["findings"] as? [JSON] ?? [], head = record["head"] as? String ?? ""
        guard given.allSatisfy({ all.indices.contains($0) }) else { return fail(400, "That finding isn't in the desk's notes.") }
        guard head == body?["head"] as? String ?? "" else { return fail(409, "The desk has new notes on this PR. Look again before posting.") }
        let tokens = accounts.items, cwds = sessions.items.map { str($0.1["cwd"]) }.filter { !$0.isEmpty }
        DispatchQueue.global().async {
            let done = postReview(repo: repo, pr: pr, head: head, findings: given.sorted().map { all[$0] }) { self.githubCalls(tokens: tokens, cwds: cwds) }
            guard let link = done.url else { return fail(502, done.error) }
            DispatchQueue.main.async { self.markPosted(repo: repo, pr: pr, link: link, head: head, findings: given); self.respond(c, 200, "application/json", Data(jsonText(["url": link]).utf8)) }
        }
    }

    /// Writes the review's link into the record's `posted`, and which findings went out on which head into `sent`, leaving the rest as it is.
    /// A temp file then a rename, so the desk never reads half a file. (The temp name doesn't end in .json, which refreshDesk reads.)
    func markPosted(repo: String, pr: Int, link: String, head: String, findings: [Int]) {
        for name in ((try? FileManager.default.contentsOfDirectory(atPath: deskDir)) ?? []).filter({ $0.hasSuffix(".json") }) {
            let path = deskDir + "/" + name
            guard var r = FileManager.default.contents(atPath: path).flatMap(parse) as? JSON, r["repo"] as? String == repo, r["pr"] as? Int == pr else { continue }
            let before = (r["sent"] as? JSON).flatMap { $0["head"] as? String == head ? $0["findings"] as? [Int] : nil } ?? []
            r["posted"] = link
            r["sent"] = ["head": head, "findings": Set(before + findings).sorted()] as JSON
            guard let data = try? JSONSerialization.data(withJSONObject: r, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]), (try? data.write(to: URL(fileURLWithPath: path + ".tmp"))) != nil else { return }
            rename(path + ".tmp", path)
            break
        }
        refreshDesk()
    }
}

// MARK: links into the detail panel, and the code a finding cites

/// A link to a record's detail: http://localhost:7717/review/<owner>/<repo>/<pr>, with #finding-<i> (its place in the record's findings),
/// #summary or #ask. The fragment never reaches a server, so GET answers a page (REVIEW_PAGE) that posts it to /desk/show, then closes its tab.
let REVIEW_PATH = Re("^/review/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/([0-9]{1,9})/?$")
let REVIEW_ANCHOR = Re("^(finding-[0-9]{1,4}|summary|ask)$")
let REVIEW_PAGE = """
    <!doctype html><meta charset="utf-8"><meta name="color-scheme" content="dark light"><title>Lantern</title>
    <p style="font: 14px system-ui; margin: 2em">Opened in Lantern. You can close this tab.</p>
    <script>fetch('/desk/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: location.pathname, anchor: location.hash.slice(1) }) }).finally(() => close())</script>
    """

/// The lines a finding cites: its line, a number or a range like "4-9" or "L4-L9", at most ten lines. Nil for anything else.
func citedLines(_ line: Any?) -> (Int, Int)? {
    guard let m = Re("^L?([0-9]{1,7})(?:\\s*-\\s*L?([0-9]{1,7}))?$").match(str(line)), let a = Int(m[1] ?? ""), a >= 1 else { return nil }
    return (a, min(max(a, Int(m[2] ?? "") ?? a), a + 9))
}
/// One line to show: added "+", removed "-" or context " ", its number on the old and new side (0 where it has none), and its text.
func codeLine(_ kind: String, _ old: Int, _ new: Int, _ text: String) -> JSON { ["kind": kind, "old": old, "new": new, "text": text] }

/// The PR's change around the cited lines: the hunk of the file's patch (GitHub's unified diff) that holds the first one, cut to fifteen lines
/// either side of them. Nil when no hunk does, so the finding is about code the PR didn't touch.
func diffAround(_ patch: String, _ a: Int, _ b: Int) -> JSON? {
    var hunks: [[JSON]] = [], old = 0, new = 0
    for l in patch.components(separatedBy: "\n") {
        if let h = Re("^@@ -([0-9]+)(?:,[0-9]+)? \\+([0-9]+)").match(l) { old = Int(h[1] ?? "") ?? 0; new = Int(h[2] ?? "") ?? 0; hunks.append([]); continue }
        guard !hunks.isEmpty, let kind = l.first.map(String.init), ["+", "-", " "].contains(kind) else { continue } // "\ No newline at end of file"
        let text = String(l.dropFirst())
        switch kind {
        case "+": hunks[hunks.count - 1].append(codeLine("+", 0, new, text)); new += 1
        case "-": hunks[hunks.count - 1].append(codeLine("-", old, 0, text)); old += 1
        default: hunks[hunks.count - 1].append(codeLine(" ", old, new, text)); old += 1; new += 1
        }
    }
    let cited = { (l: JSON) in l["kind"] as? String != "-" && (a...b).contains(l["new"] as? Int ?? 0) }
    guard let hunk = hunks.first(where: { $0.contains(where: { $0["kind"] as? String != "-" && $0["new"] as? Int == a }) }),
          let first = hunk.firstIndex(where: cited), let last = hunk.lastIndex(where: cited) else { return nil }
    return ["diff": true, "lines": Array(hunk[max(0, first - 15)...min(hunk.count - 1, last + 15)]), "mark": [a, b]]
}

/// The file at the audited head around the cited lines, fifteen either side, for a finding about code the PR didn't change. Nil past the end.
func fileAround(_ text: [String], _ a: Int, _ b: Int) -> JSON? {
    guard a <= text.count else { return nil }
    let start = max(1, a - 15), end = min(text.count, b + 15)
    return ["diff": false, "lines": (start...end).map { codeLine(" ", 0, $0, text[$0 - 1]) }, "mark": [a, min(b, text.count)]]
}

/// Each changed file's patch in a PR, by path, from GitHub's pull files API through the first account that has it. Nil when none does.
/// ponytail: ten pages (1,000 files); GitHub itself stops at 3,000.
func prPatches(repo: String, pr: Int, calls: [GitHubCall]) -> [String: String]? {
    for call in calls {
        var patches: [String: String] = [:]
        for page in 1...10 {
            let r = call("GET", "/repos/\(repo)/pulls/\(pr)/files?per_page=100&page=\(page)", nil)
            guard r.status == 200, let files = r.json as? [JSON] else { break }
            for f in files { if let name = f["filename"] as? String, let patch = f["patch"] as? String { patches[name] = patch } }
            if files.count < 100 { return patches }
        }
        if !patches.isEmpty { return patches }
    }
    return nil
}

/// A file's lines at a commit, from GitHub's contents API through the first account that has it. Nil when none does (or it's too big for the API).
func fileLines(repo: String, head: String, file: String, calls: [GitHubCall]) -> [String]? {
    let parts = file.split(separator: "/", omittingEmptySubsequences: false)
    guard !file.hasPrefix("/"), !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
    let path = parts.map { $0.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? "" }.joined(separator: "/")
    for call in calls {
        let r = call("GET", "/repos/\(repo)/contents/\(path)?ref=\(head)", nil)
        guard r.status == 200, let j = r.json as? JSON, j["encoding"] as? String == "base64", let b64 = j["content"] as? String,
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else { continue }
        var lines = String(decoding: data, as: UTF8.self).components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
        if lines.last == "" { lines.removeLast() } // the newline that ends the file isn't a line of its own
        return lines
    }
    return nil
}

/// What's been fetched, kept by head: files by "repo@head:path", a PR's patches by "repo#pr@head". Main thread only. What couldn't be fetched
/// isn't kept, so the next open tries again. ponytail: never evicted, a few KB a file or PR; prune by head if it ever shows in memory.
var codeCache: [String: [String]] = [:], patchCache: [String: [String: String]] = [:]

extension LanternServer {
    /// POST /desk/show { path, anchor } (from REVIEW_PAGE): brings the app's window forward and tells the page which record to open, and where.
    /// Whatever doesn't fit the patterns is dropped, so a bad link still opens the reviews list.
    func showDesk(_ c: NWConnection, _ body: JSON?) {
        let m = REVIEW_PATH.match(body?["path"] as? String ?? ""), anchor = body?["anchor"] as? String ?? ""
        let pr = m.flatMap { Int($0[2] ?? "") } ?? 0
        send("event: show\ndata: \(jsonText(["repo": pr > 0 ? m?[1] ?? "" : "", "pr": pr, "anchor": REVIEW_ANCHOR.test(anchor) ? anchor : ""]))\n\n")
        if handActivation { print("show") } // the app's window, its parent, comes forward (main.swift); a bare server (tests, previews) has no window
        respond(c, 204)
    }

    /// POST /desk/code { url }: for each of the record's findings, in its order, the code it cites ({ diff, lines, mark }, see diffAround and
    /// fileAround) or null. The PR's change when a hunk holds the cited line, else the file at the record's head. 404 when there's no such
    /// record or it has no head; the page then keeps its links to the diff.
    func deskCode(_ c: NWConnection, _ body: JSON?) {
        guard let url = body?["url"] as? String, let record = desk.first(where: { str($0["url"]) == url }), let repo = record["repo"] as? String, let pr = record["pr"] as? Int,
              Re("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$").test(repo), let head = record["head"] as? String, Re("^[0-9a-f]{7,40}$").test(head)
        else { return respond(c, 404) }
        let findings = record["findings"] as? [JSON] ?? [], files = codeCache, patchKey = "\(repo)#\(pr)@\(head)", cachedPatches = patchCache[patchKey]
        let tokens = accounts.items, cwds = sessions.items.map { str($0.1["cwd"]) }.filter { !$0.isEmpty }
        DispatchQueue.global().async {
            lazy var calls = self.githubCalls(tokens: tokens, cwds: cwds)
            var fetched: [String: [String]] = [:]
            let cites = findings.compactMap { f in (f["file"] as? String).flatMap { file in citedLines(f["line"]).map { (file, $0) } } }
            let patches = cites.isEmpty ? nil : cachedPatches ?? prPatches(repo: repo, pr: pr, calls: calls)
            let out = findings.map { f -> Any in
                guard let file = f["file"] as? String, let (a, b) = citedLines(f["line"]) else { return NSNull() }
                if let patch = patches?[file], let diff = diffAround(patch, a, b) { return diff }
                let key = "\(repo)@\(head):\(file)"
                if fetched[key] == nil, let lines = files[key] ?? fileLines(repo: repo, head: head, file: file, calls: calls) { fetched[key] = lines }
                return fetched[key].flatMap { fileAround($0, a, b) } ?? NSNull()
            }
            DispatchQueue.main.async {
                codeCache.merge(fetched) { a, _ in a }
                if let patches { patchCache[patchKey] = patches }
                self.respond(c, 200, "application/json", Data(jsonText(out).utf8))
            }
        }
    }
}
