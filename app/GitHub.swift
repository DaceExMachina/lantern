// GitHub status: PRs through the Claude Lantern GitHub App's tokens, or the person's own `gh`.
import Foundation

// MARK: - GitHub status: PRs through the Claude Lantern GitHub App's tokens, or the person's own `gh`

let GH = [ProcessInfo.processInfo.environment["LANTERN_GH"], HOME + "/.local/bin/gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]
    .compactMap { $0 }.first { FileManager.default.fileExists(atPath: $0) } ?? "gh" // an app's PATH is minimal, so look in the usual places
let CLIENT_ID = "Iv23liGsGuBVmd5HoOSn", KEYCHAIN = "lantern-pr"
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
// When the page animates a PR's firefly from, so every window plays it at the same moment: `seen` when this list first
// had it (it flies in), `since` when its need last changed, and `was` the need before (its colour crossfades). One that
// left the list merged or closed stays a minute with that as its need, for its firefly's exit.
func stamp(_ prs: [JSON], was old: [JSON], closed: [String: String], at t: Double) -> [JSON] {
    let before = Dictionary(old.map { (str($0["url"]), $0) }, uniquingKeysWith: { a, _ in a })
    var out = prs.map { p -> JSON in
        var p = p
        guard let o = before[str(p["url"])] else { p["seen"] = t; p["since"] = t; return p }
        p["seen"] = o["seen"] ?? 0
        if str(o["need"]) == str(p["need"]) { p["since"] = o["since"] ?? 0; p["was"] = o["was"] } else { p["since"] = t; p["was"] = o["need"] }
        return p
    }
    let still = Set(prs.map { str($0["url"]) })
    for var o in old where !still.contains(str(o["url"])) {
        guard let state = closed[str(o["url"])] else { continue }
        let need = state == "MERGED" ? "merged" : "closed"
        if str(o["need"]) == need { if t - ((o["since"] as? NSNumber)?.doubleValue ?? 0) < 60_000 { out.append(o) } }
        else if !["merged", "closed"].contains(str(o["need"])) { o["was"] = o["need"]; o["need"] = need; o["since"] = t; out.append(o) }
    }
    return out
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
// Through gh, which GitHub account a folder gets can depend on where it is (a wrapper that picks a token by the
// top folder under home, say: ~/work for one account, ~/projects for another). So the PR query runs once per top folder
// under home (one more for everything outside it), from any one of that folder's repos, not once per repo.
func accountFolders(_ cwds: [String]) -> [(top: String, cwd: String)] {
    var byTop: [String: String] = [:]
    for cwd in cwds {
        let top = cwd.hasPrefix(HOME + "/") ? cwd.dropFirst(HOME.count + 1).split(separator: "/").first.map(String.init) ?? "" : ""
        byTop[top] = byTop[top] ?? cwd
    }
    return byTop.sorted { $0.key < $1.key }.map { (top: $0.key, cwd: $0.value) }
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
// The Keychain through Apple's own `security` tool: tokens saved by earlier versions stay readable without a prompt, and a
// rebuilt (newly signed) app doesn't have to be allowed in again.
func security(_ args: [String]) -> String? {
    let r = run("/usr/bin/security", args)
    return r.ok ? r.out.trim : nil
}

extension LanternServer {
    // MARK: GitHub status (opt-in): one GraphQL query per account (or per folder, through gh), all at once

    // A session owns the PRs it created, plus its branch's PR, but only if it's the only session in that folder
    // (sessions sharing the main checkout don't each own whatever branch happens to be checked out there).
    func refreshGitHub() {
        if accounts.count == 0 && !truthy(settings["github"]) { return }
        if refreshing { refreshAgain = true; return }
        refreshing = true
        let list = sessions.items.filter { $0.1["createdPending"] == nil }.map { ($0.0, str($0.1["cwd"]), $0.1["created"] as? [String] ?? []) }
        let tokens = accounts.items.map { ($0.0, str($0.1["token"])) }, previous = lastResults
        DispatchQueue.global().async {
            // Only folders inside a git repo: elsewhere (a home folder, say) gh may fall back to the Keychain, which prompts
            // every time from a background process.
            let live = list.filter { !$0.1.isEmpty && git($0.1, ["rev-parse", "--is-inside-work-tree"]) != nil }
            var errors: [String: String] = [:]
            let folders = tokens.isEmpty ? accountFolders(live.map(\.1)) : [], keys = tokens.isEmpty ? folders.map(\.top) : tokens.map(\.0) // a query is a top folder's gh or an account's token
            let queries: [() -> JSON?] = tokens.isEmpty
                ? folders.map { f in { ghGraphql(f.cwd) } }
                : tokens.map { login, token in {
                    let r = fetch("https://api.github.com/graphql", method: "POST", headers: ["Authorization": "Bearer \(token)", "User-Agent": "lantern-pr"], body: ["query": prQuery(PR_GQL)])
                    if r.status == 401 { DispatchQueue.main.sync { errors[login] = "expired" }; return nil } // the token was revoked or expired: reconnect
                    let data = r.json?["data"] as? JSON
                    if data != nil { DispatchQueue.main.sync { errors[login] = "" } }
                    return data
                } }
            var results = [JSON?](repeating: nil, count: queries.count)
            DispatchQueue.concurrentPerform(iterations: queries.count) { i in let r = queries[i](); DispatchQueue.main.sync { results[i] = r } }
            // a query that failed (a blip) keeps what it found in the last 10 minutes (GH_KEEP_MS), so its PRs neither vanish and fly back in,
            // nor hold up every other query's. An expired token isn't a blip: its PRs go, and the account row says to reconnect.
            let t0 = now(), answers = results.enumerated().map { i, r -> JSON? in
                if let r = r { return r }
                guard errors[keys[i]] != "expired", let last = previous[keys[i]], t0 - last.at < GH_KEEP_MS else { return nil }
                return last.data
            }
            var all = Ordered<JSON>(), wanted = Ordered<JSON>(), closed: [String: String] = [:]
            for data in answers {
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
            // The stale list: my open PRs that no session owns and nobody has touched for a week (quiet), oldest first.
            let owned = Set(github.values.flatMap { $0.map { str($0["url"]) } }), weekAgo = Date().addingTimeInterval(-7 * 24 * 3600)
            let iso = ISO8601DateFormatter()
            let quiet = Set(all.items.filter { iso.date(from: str($0.1["updatedAt"])).map { $0 < weekAgo } ?? false }.map(\.0))
            let dead: [JSON] = all.items.compactMap { url, p in
                guard !owned.contains(url), quiet.contains(url) else { return nil }
                return ["url": url, "title": p["title"] ?? NSNull(), "label": "\(str((p["repository"] as? JSON)?["name"]))#\(str(p["number"]))",
                        "need": prNeed(p), "updatedAt": p["updatedAt"]!]
            }.sorted { str($0["updatedAt"]) < str($1["updatedAt"]) }
            DispatchQueue.main.async {
                // turned off while this ran: don't bring the PRs back
                guard self.accounts.count > 0 || truthy(self.settings["github"]) else { self.refreshing = false; self.refreshAgain = false; return }
                for (login, error) in errors { self.accounts[login]?["error"] = error }
                let t = now()
                // fresh answers are remembered with their time; a kept one keeps its old time, so it ages out
                self.lastResults = Dictionary(keys.enumerated().compactMap { i, k in results[i].map { (k, (at: t, data: $0)) } ?? previous[k].map { (k, $0) } }, uniquingKeysWith: { a, _ in a })
                self.reviews = stamp(wanted.items.map(\.1), was: self.reviews, closed: [:], at: t)
                self.stale = dead
                for (id, g) in github { let was = self.sessions[id]?["github"] as? [JSON] ?? []; self.sessions[id]?["github"] = stamp(g, was: was, closed: closed, at: t) }
                // a query that failed with nothing from before would make its PRs look gone, so then nothing is logged
                if !answers.isEmpty && answers.allSatisfy({ $0 != nil }) { self.logPRs(open: Set(all.keys), quiet: quiet, closed: closed) }
                // remember the result, so a restart shows the fireflies straight away instead of after the first slow refresh
                self.saveGitHubCache()
                self.refreshing = false
                self.broadcast()
                if self.refreshAgain { self.refreshAgain = false; self.refreshGitHub() }
                // then, in the background, find which old sessions made any dead PRs we haven't looked up yet
                let missing = self.stale.map { str($0["url"]) }.filter { self.owners[$0] == nil }
                if !missing.isEmpty {
                    DispatchQueue.global().async {
                        let found = findOwners(missing)
                        DispatchQueue.main.async { for (url, o) in found { self.owners[url] = o }; self.saveGitHubCache(); self.broadcast() }
                    }
                }
            }
        }
    }

    func saveGitHubCache() {
        let bySession = sessions.items.filter { $0.1["github"] != nil }.reduce(into: JSON()) { $0[$1.0] = $1.1["github"] }
        let text = jsonText(["reviews": reviews, "stale": stale, "owners": owners, "bySession": bySession]) + "\n"
        DispatchQueue.global().async { try? text.write(toFile: self.githubCache, atomically: true, encoding: .utf8) }
    }

    func clearGitHub() { lastResults = [:]; reviews = []; stale = []; for (id, _) in sessions.items { sessions[id]!["github"] = nil }; broadcast() }

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
                    guard let login = fetch("https://api.github.com/user", headers: ["Authorization": "Bearer \(token)", "User-Agent": "lantern-pr"]).json?["login"] as? String else { break }
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
}
