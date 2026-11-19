// Posting the review desk's findings I checked as one GitHub review, from the detail panel (POST /desk/post), links that open the panel
// (GET /review/..., POST /desk/show), and the code each finding cites (POST /desk/code).
import Foundation
import Network

// LANTERN_DRY_POST=1: say what would go out and answer with a made-up link, without calling GitHub (previews and tests).
let DRY_POST = ProcessInfo.processInfo.environment["LANTERN_DRY_POST"] == "1"

/// One call to GitHub as one account: a method, an API path and a body in, a status and JSON out.
typealias GitHubCall = (_ method: String, _ path: String, _ body: JSON?) -> (status: Int, json: JSON?)

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
    guard r.status / 100 == 2, let id = r.json?["id"] as? Int else { return (nil, "GitHub refused the review: \(r.json?["message"] as? String ?? "no answer (status \(r.status))").") }
    return ("https://github.com/\(repo)/pull/\(pr)#pullrequestreview-\(id)", "")
}

extension LanternServer {
    var deskDir: String { (ProcessInfo.processInfo.environment["LANTERN_PR_DIR"] ?? HOME + "/.ghbus") + "/reviews" } // lantern-pr's folder, which it lets the same variable move

    /// The calls to try, one per GitHub account Lantern has signed in, else one per top folder's `gh` (the way the PR query picks them).
    /// Runs on a background queue; `tokens` and `cwds` are what the main thread had.
    func githubCalls(tokens: [(String, JSON)], cwds: [String]) -> [GitHubCall] {
        if !tokens.isEmpty {
            return tokens.map { _, account in { method, path, body in
                fetch(GH_API + path, method: method, headers: ["Authorization": "Bearer \(str(account["token"]))", "User-Agent": "lantern-pr", "Accept": "application/vnd.github+json"], body: body)
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
            return (r.ok ? 200 : 400, parse(Data(r.out.utf8)) as? JSON)
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

/// The lines a finding cites (its line: a number, or a range like "4-9" or "L4-L9", at most ten lines) with fifteen either side (the finding's
/// own view shows them all, the list three), clamped to the file. `mark` is the cited range. Nil when the line isn't one of those or is past the end.
func codeAround(_ text: [String], line: Any?) -> JSON? {
    guard let m = Re("^L?([0-9]{1,7})(?:\\s*-\\s*L?([0-9]{1,7}))?$").match(str(line)), let a = Int(m[1] ?? ""), a >= 1, a <= text.count else { return nil }
    let b = min(max(a, Int(m[2] ?? "") ?? a), a + 9, text.count), start = max(1, a - 15), end = min(text.count, b + 15)
    return ["start": start, "lines": Array(text[(start - 1)..<end]), "mark": [a, b]]
}

/// A file's lines at a commit, from GitHub's contents API through the first account that has it. Nil when none does (or it's too big for the API).
func fileLines(repo: String, head: String, file: String, calls: [GitHubCall]) -> [String]? {
    let parts = file.split(separator: "/", omittingEmptySubsequences: false)
    guard !file.hasPrefix("/"), !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { return nil }
    let path = parts.map { $0.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? "" }.joined(separator: "/")
    for call in calls {
        let r = call("GET", "/repos/\(repo)/contents/\(path)?ref=\(head)", nil)
        guard r.status == 200, r.json?["encoding"] as? String == "base64", let b64 = r.json?["content"] as? String,
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else { continue }
        var lines = String(decoding: data, as: UTF8.self).components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
        if lines.last == "" { lines.removeLast() } // the newline that ends the file isn't a line of its own
        return lines
    }
    return nil
}

/// Files already fetched, by repo, head and path. Main thread only. A file that couldn't be fetched isn't kept, so the next open tries again.
var codeCache: [String: [String]] = [:] // ponytail: never evicted, a few KB per file read; prune by head if it ever shows in memory

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

    /// POST /desk/code { url }: for each of the record's findings, in its order, the code it cites at the record's head ({ start, lines, mark },
    /// see codeAround) or null. 404 when there's no such record or it has no head; the page then keeps its links to the diff.
    func deskCode(_ c: NWConnection, _ body: JSON?) {
        guard let url = body?["url"] as? String, let record = desk.first(where: { str($0["url"]) == url }), let repo = record["repo"] as? String,
              Re("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$").test(repo), let head = record["head"] as? String, Re("^[0-9a-f]{7,40}$").test(head)
        else { return respond(c, 404) }
        let findings = record["findings"] as? [JSON] ?? [], cached = codeCache
        let tokens = accounts.items, cwds = sessions.items.map { str($0.1["cwd"]) }.filter { !$0.isEmpty }
        DispatchQueue.global().async {
            var files: [String: [String]] = [:]
            lazy var calls = self.githubCalls(tokens: tokens, cwds: cwds)
            for file in Set(findings.compactMap { $0["file"] as? String }) {
                let key = "\(repo)@\(head):\(file)"
                if let lines = cached[key] ?? fileLines(repo: repo, head: head, file: file, calls: calls) { files[key] = lines }
            }
            let out = findings.map { f -> Any in (f["file"] as? String).flatMap { files["\(repo)@\(head):\($0)"] }.flatMap { codeAround($0, line: f["line"]) } ?? NSNull() }
            DispatchQueue.main.async {
                codeCache.merge(files) { a, _ in a }
                self.respond(c, 200, "application/json", Data(jsonText(out).utf8))
            }
        }
    }
}
