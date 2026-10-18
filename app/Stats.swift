// The event log: what the lantern saw, kept in stats.sqlite for stats and daily recaps later (nothing reads it yet).
// Three tables, times in ms since 1970:
//   spans  (kind, session, began, ended, data): stretches of time. kind is server (the app running), alive (a session),
//          waiting (a session waiting on me; data.snoozed says if it was snoozed during the wait), violet (the lantern
//          calling me) or quiet (quiet hours). An open span has ended NULL; data.how says how it ended.
//   events (time, kind, session, data): moments. kind is pr (data.change: appeared, need, merged, closed, stray, gone),
//          api_error (the singed moth) or compact.
//   gauges (time, alive, working, waiting, snoozed, fireflies, agents, strays): counts every five minutes.
// PRAGMA user_version is the schema version, for later migrations. Writes run on their own queue and give up quietly,
// so a missing or broken database never slows or stops the lantern.
import Foundation
import SQLite3

private let TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

final class Stats {
    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "lantern.stats")
    private let file: String

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
                    CREATE TABLE gauges (time INTEGER NOT NULL, alive INTEGER, working INTEGER, waiting INTEGER, snoozed INTEGER, fireflies INTEGER, agents INTEGER, strays INTEGER);
                    CREATE INDEX spans_began ON spans (began);
                    CREATE INDEX events_time ON events (time);
                    CREATE INDEX gauges_time ON gauges (time);
                    PRAGMA user_version = 1;
                    COMMIT;
                    """)
            }
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
