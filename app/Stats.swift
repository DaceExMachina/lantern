// The event log: what the lantern saw, kept in stats.sqlite for the stats panel (report(), served as GET /stats).
// Three tables, times in ms since 1970:
//   spans  (kind, session, began, ended, data): stretches of time. kind is server (the app running), alive (a session),
//          waiting (a session waiting on me; data.snoozed says if it was snoozed during the wait), violet (the lantern
//          calling me) or quiet (quiet hours). An open span has ended NULL; data.how says how it ended.
//   events (time, kind, session, data): moments. kind is pr (data.change: appeared, need, merged, closed, stray, gone),
//          graveyard (data.change: entered, or left with data.how: merged, closed, revived, gone), api_error (the
//          singed moth) or compact.
//   gauges (time, alive, working, waiting, snoozed, fireflies, agents, strays, graveyard): counts every five minutes.
//   achievements (id, day, time, data): badges, good and cheeky, at most one of each per local day (day is yyyy-MM-dd).
//          Their names and blurbs live in page/stats.js; this side only decides when one is earned.
// PRAGMA user_version is the schema version, for later migrations. Writes run on their own queue and give up quietly,
// so a missing or broken database never slows or stops the lantern.
import Foundation
import SQLite3

private let TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

final class Stats {
    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "lantern.stats")
    private let file: String
    private var earned = Set<String>() // "id day" already in the table, so live checks don't write on every broadcast

    init(_ file: String) { self.file = file }

    /// Opens the log once the server holds its port, so a second copy of the app waiting for it leaves the log alone.
    func open() {
        queue.sync {
            guard sqlite3_open(file, &db) == SQLITE_OK else { print("stats: can't open \(file)"); sqlite3_close(db); db = nil; return }
            sqlite3_busy_timeout(db, 2000)
            exec("PRAGMA journal_mode = WAL") // so something can read it while the app writes
            if Int(run("PRAGMA user_version").first?[0] ?? "") ?? 0 < 1 {
                exec("""
                    BEGIN;
                    CREATE TABLE spans (kind TEXT NOT NULL, session TEXT, began INTEGER NOT NULL, ended INTEGER, data TEXT NOT NULL DEFAULT '{}');
                    CREATE TABLE events (time INTEGER NOT NULL, kind TEXT NOT NULL, session TEXT, data TEXT NOT NULL DEFAULT '{}');
                    CREATE TABLE gauges (time INTEGER NOT NULL, alive INTEGER, working INTEGER, waiting INTEGER, snoozed INTEGER, fireflies INTEGER, agents INTEGER, strays INTEGER, graveyard INTEGER);
                    CREATE INDEX spans_began ON spans (began);
                    CREATE INDEX events_time ON events (time);
                    CREATE INDEX gauges_time ON gauges (time);
                    PRAGMA user_version = 1;
                    COMMIT;
                    """)
            }
            if Int(run("PRAGMA user_version").first?[0] ?? "") ?? 0 < 2 {
                exec("""
                    BEGIN;
                    CREATE TABLE achievements (id TEXT NOT NULL, day TEXT NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (id, day));
                    PRAGMA user_version = 2;
                    COMMIT;
                    """)
            }
            earned = Set(run("SELECT id || ' ' || day FROM achievements").compactMap { $0[0] })
            // spans a crash or a kill left open end when the lantern last wrote anything (at most one gauge ago)
            exec("""
                UPDATE spans SET data = json_set(data, '$.how', 'shutdown'), ended = (SELECT max(t) FROM (
                  SELECT max(time) AS t FROM events UNION ALL SELECT max(time) FROM gauges UNION ALL SELECT max(coalesce(ended, began)) FROM spans))
                WHERE ended IS NULL
                """)
        }
    }

    func begin(_ kind: String, _ session: String? = nil, _ data: JSON = [:]) {
        write("INSERT INTO spans (kind, session, began, data) VALUES (?, ?, ?, ?)", [kind, session, now(), jsonText(data)])
    }
    /// Merges `data` into the open span's.
    func note(_ kind: String, _ session: String? = nil, _ data: JSON) {
        write("UPDATE spans SET data = json_patch(data, ?) WHERE kind = ? AND session IS ? AND ended IS NULL", [jsonText(data), kind, session])
    }
    func end(_ kind: String, _ session: String? = nil, _ data: JSON = [:]) {
        write("UPDATE spans SET ended = ?, data = json_patch(data, ?) WHERE kind = ? AND session IS ? AND ended IS NULL", [now(), jsonText(data), kind, session])
    }
    func event(_ kind: String, _ session: String? = nil, _ data: JSON = [:]) {
        write("INSERT INTO events (time, kind, session, data) VALUES (?, ?, ?, ?)", [now(), kind, session, jsonText(data)])
    }
    /// Column names come from our own code, never from input.
    func gauge(_ values: [(String, Int?)]) {
        let names = values.map(\.0).joined(separator: ", "), marks = values.map { _ in "?" }.joined(separator: ", ")
        write("INSERT INTO gauges (time, \(names)) VALUES (?, \(marks))", [now()] + values.map(\.1))
    }

    /// PRs sessions owned when the lantern last looked, so a restart doesn't log them all as new: url -> (need, session).
    func ownedPRs() -> [String: (need: String, session: String)] {
        let rows = queue.sync { run("""
            SELECT json_extract(data, '$.url'), json_extract(data, '$.need'), session FROM events
            WHERE rowid IN (SELECT max(rowid) FROM events WHERE kind = 'pr' GROUP BY json_extract(data, '$.url'))
              AND json_extract(data, '$.change') IN ('appeared', 'need')
            """) }
        return rows.reduce(into: [:]) { if let url = $1[0], let need = $1[1], let session = $1[2] { $0[url] = (need, session) } }
    }

    /// The graveyard when the lantern last looked, by url.
    func buried() -> Set<String> {
        Set(queue.sync { run("""
            SELECT json_extract(data, '$.url') FROM events
            WHERE rowid IN (SELECT max(rowid) FROM events WHERE kind = 'graveyard' GROUP BY json_extract(data, '$.url'))
              AND json_extract(data, '$.change') = 'entered'
            """) }.compactMap { $0[0] })
    }

    /// What GET /stats serves: each day's headline numbers (`days`, oldest first, each [start, end) in ms, the last one
    /// ending now), plus the spans and gauges the page draws its day ribbons from. Runs on the log's queue, then hands
    /// the result to `done` on the main queue, so the server never waits on it.
    func report(warmGoal: Double, done: @escaping (JSON) -> Void) {
        let days = localDays(7)
        queue.async {
            let bounds = jsonText(days.map { [$0.0, $0.1] }), from = days[0].0, to = days[days.count - 1].1
            let num = { (s: String?) in Double(s ?? "") }
            // time each kind of span covered in each day; an open span runs to now
            var cover = Array(repeating: [String: Double](), count: days.count)
            for r in self.run("""
                WITH days AS (SELECT key AS d, json_extract(value, '$[0]') AS f, json_extract(value, '$[1]') AS t FROM json_each(?1))
                SELECT d, kind, sum(min(coalesce(ended, ?2), t) - max(began, f)) FROM days JOIN spans ON began < t AND coalesce(ended, ?2) > f
                GROUP BY d, kind
                """, [bounds, to]) { if let d = Int(r[0] ?? ""), let k = r[1] { cover[d][k] = num(r[2]) } }
            // waits by the day they began: how long each lasted and whether I answered it
            var waits = Array(repeating: [(ms: Double, answered: Bool)](), count: days.count)
            for r in self.run("""
                WITH days AS (SELECT key AS d, json_extract(value, '$[0]') AS f, json_extract(value, '$[1]') AS t FROM json_each(?1))
                SELECT d, coalesce(ended, ?2) - began, json_extract(data, '$.how') = 'answered' FROM days JOIN spans
                ON kind = 'waiting' AND began >= f AND began < t
                """, [bounds, to]) { if let d = Int(r[0] ?? ""), let ms = num(r[1]) { waits[d].append((ms, r[2] == "1")) } }
            var merged = Array(repeating: 0, count: days.count)
            for r in self.run("""
                WITH days AS (SELECT key AS d, json_extract(value, '$[0]') AS f, json_extract(value, '$[1]') AS t FROM json_each(?1))
                SELECT d, count(*) FROM days JOIN events ON kind = 'pr' AND json_extract(data, '$.change') = 'merged' AND time >= f AND time < t
                GROUP BY d
                """, [bounds]) { if let d = Int(r[0] ?? "") { merged[d] = Int(r[1] ?? "") ?? 0 } }
            // gauges in the window, and the last one before it so the first day's graveyard has something to compare to
            let gauges = self.run("""
                SELECT * FROM (SELECT time, alive, working, fireflies, graveyard FROM gauges WHERE time < ?1 ORDER BY time DESC LIMIT 1)
                UNION ALL SELECT time, alive, working, fireflies, graveyard FROM gauges WHERE time >= ?1 ORDER BY time
                """, [from]).map { $0.map { num($0) ?? -1 } }
            // the spans themselves, clipped to the window, for the ribbons and the recap's constellation: [kind, began, ended,
            // seeded (already running at startup), session, title (sessions only)]
            let spans = self.run("""
                SELECT kind, max(began, ?1), min(coalesce(ended, ?2), ?2), coalesce(json_extract(data, '$.seeded'), 0), session,
                  iif(kind = 'alive', json_extract(data, '$.title'), NULL) FROM spans
                WHERE began < ?2 AND coalesce(ended, ?2) > ?1 ORDER BY began
                """, [from, to]).map { r -> [Any] in [r[0] ?? "", num(r[1]) ?? 0, num(r[2]) ?? 0, r[3] == "1", r[4] ?? NSNull(), r[5] ?? NSNull()] }

            let lastGauge = { (t: Double) in gauges.last { $0[0] < t } }
            let value = { (g: [Double]?, i: Int) -> Double? in g.flatMap { $0[i] >= 0 ? $0[i] : nil } } // a gauge's column, if it was recorded
            let pct = { (part: Double, whole: Double) -> Any in whole > 0 ? (100 * (1 - part / whole)).rounded() : NSNull() }
            let out: [JSON] = days.enumerated().map { d, day in
                let c = cover[d], answered = waits[d].filter(\.answered).map(\.ms).sorted()
                let at = { (q: Double) -> Any in answered.isEmpty ? NSNull() : answered[min(answered.count - 1, Int(Double(answered.count) * q))] }
                let end = lastGauge(day.1), start = lastGauge(day.0)
                return ["start": day.0, "end": day.1, "mothMs": c["alive"] ?? 0,
                        "warmMoths": pct(c["waiting"] ?? 0, c["alive"] ?? 0),
                        // the lantern's warm share of the time it ran outside quiet hours (it's never violet in quiet hours)
                        "warmLantern": pct(c["violet"] ?? 0, (c["server"] ?? 0) - (c["quiet"] ?? 0)),
                        "medianWait": at(0.5), "slowWait": at(0.9), "waits": waits[d].count, "answered": answered.count,
                        "merged": merged[d], "open": value(end, 3) ?? NSNull(), "graveyard": value(end, 4) ?? NSNull(),
                        "graveyardChange": value(end, 4).flatMap { e in value(start, 4).map { e - $0 } } ?? NSNull()]
            }
            let achievements = self.run("SELECT id, day, time FROM achievements WHERE time >= ?1 OR day >= ?2 ORDER BY time", [from, dayKey(from)])
                .map { [$0[0] ?? "", $0[1] ?? "", num($0[2]) ?? 0] as [Any] }
            let tally = self.run("SELECT id, count(*) FROM achievements GROUP BY id").reduce(into: JSON()) { $0[$1[0] ?? ""] = Int($1[1] ?? "") ?? 0 }
            let result: JSON = ["days": out, "spans": spans, "gauges": gauges.filter { $0[0] >= from }.map { Array($0[0...2]) },
                                "achievements": achievements, "tally": tally, "streak": self.streak(warmGoal), "warmGoal": warmGoal]
            DispatchQueue.main.async { done(result) }
        }
    }

    // MARK: achievements

    /// Earns a badge for today, once. For what the lantern can see right now (agents, PRs in flight), not the log.
    func earn(_ id: String) {
        let day = dayKey(now())
        queue.async {
            guard self.db != nil, self.earned.insert(id + " " + day).inserted else { return }
            self.run("INSERT OR IGNORE INTO achievements (id, day, time) VALUES (?, ?, ?)", [id, day, now()])
        }
    }

    /// Looks through the last eight days of the log for badges it hasn't given yet. Each check only depends on the log,
    /// so running it again (every gauge, and at startup) never gives one twice, and days the app was closed catch up.
    func award(warmGoal: Double) {
        let days = localDays(7)
        queue.async {
            guard self.db != nil else { return }
            let t = now(), week = 7 * 86400000.0
            let streaks = Dictionary(self.streaks(warmGoal).map { ($0.day, $0.streak) }) { $1 }
            for (i, (f, e)) in days.enumerated() {
                let day = dayKey(f), over = i < days.count - 1 // a finished day can be judged as a whole
                let yes = { (sql: String) in (self.run(sql, [f, e, t]).first?[0] ?? "0") != "0" } // ?1 day start, ?2 day end, ?3 now
                var got: [String] = []
                // Purple Rain: the lantern violet for a whole hour. Ghosted: a wait of three hours or more (not one snoozed for good).
                if yes("SELECT count(*) FROM spans WHERE kind = 'violet' AND coalesce(ended, ?3) - began >= 3600000 AND coalesce(ended, ?3) BETWEEN ?1 AND ?2") { got.append("purple_rain") }
                if yes("""
                    SELECT count(*) FROM spans WHERE kind = 'waiting' AND coalesce(json_extract(data, '$.snoozed'), '') != 'forGood'
                    AND coalesce(ended, ?3) - began >= 3 * 3600000 AND coalesce(ended, ?3) BETWEEN ?1 AND ?2
                    """) { got.append("ghosted") }
                // Snooze Button Champion: ten waits snoozed in a day
                if yes("SELECT count(*) >= 10 FROM spans WHERE kind = 'waiting' AND began >= ?1 AND began < ?2 AND json_extract(data, '$.snoozed') IS NOT NULL") { got.append("snooze_champion") }
                // Revived: a stale PR merged, straight off the stale list or after it was revived
                if yes("""
                    SELECT count(*) FROM events e WHERE e.time >= ?1 AND e.time < ?2 AND (
                      (e.kind = 'graveyard' AND json_extract(e.data, '$.how') = 'merged') OR
                      (e.kind = 'pr' AND json_extract(e.data, '$.change') = 'merged' AND EXISTS (SELECT 1 FROM events g WHERE g.kind = 'graveyard'
                        AND json_extract(g.data, '$.how') = 'revived' AND json_extract(g.data, '$.url') = json_extract(e.data, '$.url') AND g.time < e.time)))
                    """) { got.append("revived") }
                // Séance: five stale PRs revived in a week (touched again, or picked up by a session)
                if self.run("SELECT count(*) >= 5 FROM events WHERE kind = 'graveyard' AND json_extract(data, '$.how') = 'revived' AND time >= ?1 AND time < ?2", [e - week, e]).first?[0] == "1" { got.append("seance") }
                // Ghostbuster: five stale PRs merged or closed in a day (the stale list is 'graveyard' in the log)
                if yes("SELECT count(*) >= 5 FROM events WHERE kind = 'graveyard' AND json_extract(data, '$.how') IN ('merged', 'closed') AND time >= ?1 AND time < ?2") { got.append("ghostbuster") }
                if self.lightsOut(f, min(e, t)) { got.append("lights_out") }
                if over {
                    // Warm all day: an hour or more of sessions, and the lantern warm nine tenths of the time it ran outside quiet hours
                    var cover: [String: Double] = [:]
                    for r in self.run("SELECT kind, sum(min(coalesce(ended, ?3), ?2) - max(began, ?1)) FROM spans WHERE began < ?2 AND coalesce(ended, ?3) > ?1 GROUP BY kind", [f, e, t]) {
                        cover[r[0] ?? ""] = Double(r[1] ?? "") ?? 0
                    }
                    let ran = (cover["server"] ?? 0) - (cover["quiet"] ?? 0)
                    if (cover["alive"] ?? 0) >= 3600000 && ran > 0 && (cover["violet"] ?? 0) <= ran / 10 { got.append("warm_all_day") }
                    // Clear Night and Small Batches: a week of gauges (the log must go back that far) with no stale PRs, or never
                    // more than three fireflies in flight
                    let history: [Any?] = [e - week, e]
                    let enough = "(SELECT min(time) FROM gauges) <= ?1 AND (SELECT count(*) FROM gauges WHERE time >= ?1 AND time < ?2) > 0"
                    if self.run("SELECT \(enough) AND (SELECT max(graveyard) FROM gauges WHERE time >= ?1 AND time < ?2) = 0", history).first?[0] == "1" { got.append("clear_night") }
                    if self.run("SELECT \(enough) AND (SELECT max(fireflies) FROM gauges WHERE time >= ?1 AND time < ?2) <= 3", history).first?[0] == "1" { got.append("small_batches") }
                    // Warm streaks, on the day they reach 3, 7, 14 and 30 days
                    if let n = streaks[day], [3, 7, 14, 30].contains(n) { got.append("streak_\(n)") }
                }
                for id in got where self.earned.insert(id + " " + day).inserted {
                    self.run("INSERT OR IGNORE INTO achievements (id, day, time) VALUES (?, ?, ?)", [id, day, t])
                }
            }
        }
    }

    /// Lights Out: two hours or more between sessions (so lunch doesn't count) with the lantern open and nothing alive at all, outside quiet hours.
    private func lightsOut(_ from: Double, _ to: Double) -> Bool {
        let rows = run("SELECT kind, max(began, ?1), min(coalesce(ended, ?2), ?2) FROM spans WHERE kind IN ('alive', 'server', 'quiet') AND began < ?2 AND coalesce(ended, ?2) > ?1 ORDER BY began", [from, to])
            .compactMap { r in Double(r[1] ?? "").flatMap { b in Double(r[2] ?? "").map { (kind: r[0] ?? "", b: b, e: $0) } } }
        let cover = { (kind: String, a: Double, b: Double) in rows.filter { $0.kind == kind }.reduce(0.0) { $0 + max(0, min($1.e, b) - max($1.b, a)) } }
        var reach: Double? // where the sessions so far reach to
        for s in rows where s.kind == "alive" {
            if let r = reach, s.b - r >= 2 * 3600000, cover("server", r, s.b) >= (s.b - r) * 0.9, cover("quiet", r, s.b) == 0 { return true }
            reach = max(reach ?? s.e, s.e)
        }
        return false
    }

    /// The warm streak as it stands: through today once today is at or over the goal, otherwise through yesterday, since
    /// today isn't over yet.
    private func streak(_ goal: Double) -> Int {
        let all = streaks(goal), today = dayKey(now())
        guard let last = all.last else { return 0 }
        return last.day == today && last.streak == 0 ? (all.dropLast().last?.streak ?? 0) : last.streak
    }

    /// Each day with sessions, oldest first, and the run of warm days (warm moths at or over the goal) ending on it. Days
    /// without sessions (a weekend off) don't break a streak. ponytail: a span counts toward the day it began, so a session
    /// running past midnight lands on the day before; per-day clipping if that ever matters.
    private func streaks(_ goal: Double) -> [(day: String, streak: Int)] {
        var streak = 0
        return run("""
            SELECT date(began / 1000, 'unixepoch', 'localtime') AS d, sum(iif(kind = 'alive', coalesce(ended, ?1) - began, 0)),
              sum(iif(kind = 'waiting', coalesce(ended, ?1) - began, 0)) FROM spans WHERE kind IN ('alive', 'waiting') GROUP BY d ORDER BY d
            """, [now()]).compactMap { r in
            guard let day = r[0], let alive = Double(r[1] ?? ""), alive > 0 else { return nil }
            streak = 100 * (1 - (Double(r[2] ?? "") ?? 0) / alive) >= goal ? streak + 1 : 0
            return (day, streak)
        }
    }

    /// The app is quitting: close what's open now, and wait for every write to land.
    func shutdown() {
        let t = now()
        queue.sync {
            run("UPDATE spans SET ended = ?, data = json_set(data, '$.how', 'shutdown') WHERE ended IS NULL", [t])
            sqlite3_close(db)
            db = nil
        }
    }

    private func write(_ sql: String, _ args: [Any?]) { queue.async { self.run(sql, args) } }
    private func exec(_ sql: String) {
        guard let db, sqlite3_exec(db, sql, nil, nil, nil) != SQLITE_OK else { return }
        print("stats: \(String(cString: sqlite3_errmsg(db)))")
    }
    /// One statement, its rows as text. ponytail: prepares every time; the log writes a few rows a minute.
    @discardableResult
    private func run(_ sql: String, _ args: [Any?] = []) -> [[String?]] {
        guard let db else { return [] }
        var st: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else { print("stats: \(String(cString: sqlite3_errmsg(db)))"); return [] }
        defer { sqlite3_finalize(st) }
        for (i, a) in args.enumerated() {
            let n = Int32(i + 1)
            switch a {
            case let v as Int: sqlite3_bind_int64(st, n, Int64(v))
            case let v as Double: sqlite3_bind_int64(st, n, Int64(v))
            case let v as String: sqlite3_bind_text(st, n, v, -1, TRANSIENT)
            default: sqlite3_bind_null(st, n)
            }
        }
        var rows: [[String?]] = []
        while true {
            let r = sqlite3_step(st)
            if r != SQLITE_ROW { if r != SQLITE_DONE { print("stats: \(String(cString: sqlite3_errmsg(db)))") }; break }
            rows.append((0..<sqlite3_column_count(st)).map { c in sqlite3_column_text(st, c).map { String(cString: $0) } })
        }
        return rows
    }
}

private let dayFormat: DateFormatter = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); return f }()
/// The local day a time falls on, as yyyy-MM-dd.
func dayKey(_ ms: Double) -> String { dayFormat.string(from: Date(timeIntervalSince1970: ms / 1000)) }
/// Today and the `back` local days before it as [start, end) in ms, oldest first; today ends now.
func localDays(_ back: Int) -> [(Double, Double)] {
    let cal = Calendar.current, today = cal.startOfDay(for: Date()), ms = { (d: Date) in (d.timeIntervalSince1970 * 1000).rounded() }
    return (0...back).reversed().map { i in
        let day = cal.date(byAdding: .day, value: -i, to: today)!
        return (ms(day), i == 0 ? now() : ms(cal.date(byAdding: .day, value: 1, to: day)!))
    }
}
