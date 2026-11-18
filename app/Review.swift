// Posting the review desk's findings I checked as one GitHub review, from the detail panel (POST /desk/post).
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
