// CPU and memory, for the stats panel and the hover card: each session's Claude processes and everything they started (tools,
// test runs, dev servers), Lantern's own processes, and the whole Mac. Native calls, no `ps`: one pass over the process table
// for parents, then rusage for only the processes that count. Memory is the physical footprint (what Activity Monitor calls
// Memory), not RSS, which counts pages the system can take back. A process's CPU is how much CPU time it used since the last
// sample, as a share of one core, so a busy tool can show over 100. A session's processes also go out grouped by name
// ("procs", for its expanded card), the busiest first, eight groups at most.
// ponytail: a process that starts and ends between two samples is missed; sample faster if short test runs matter.
import Foundation
import Darwin

final class Usage {
    private var before: [pid_t: UInt64] = [:] // CPU time in ns per process at the last sample
    private var at: Double? // when that was, seconds
    private var ticks: [UInt32]? // the Mac's CPU ticks at the last sample: user, system, idle, nice
    private var names: [pid_t: (Double, String)] = [:] // each process's name and its start time, so a reused pid is named afresh
    private let timebase: (Double, Double) = { var t = mach_timebase_info(); mach_timebase_info(&t); return (Double(t.numer), Double(t.denom)) }()

    /// `sessions` is each session's id and process ids. Call it from one queue; it keeps state between calls.
    func sample(_ sessions: [(String, [Int])]) -> JSON {
        let t = Date().timeIntervalSince1970, since = at ?? t
        // the process table: parent and start time of everything
        var all = [pid_t](repeating: 0, count: Int(proc_listallpids(nil, 0)) + 64)
        let count = Int(proc_listallpids(&all, Int32(all.count * MemoryLayout<pid_t>.size)))
        var kids: [pid_t: [pid_t]] = [:], started: [pid_t: Double] = [:]
        for pid in all.prefix(max(count, 0)) where pid > 0 {
            var info = proc_bsdinfo()
            guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)) > 0 else { continue }
            kids[pid_t(info.pbi_ppid), default: []].append(pid)
            started[pid] = Double(info.pbi_start_tvsec)
        }
        func tree(_ roots: [Int]) -> [pid_t] {
            var out: [pid_t] = [], seen = Set<pid_t>(), todo = roots.map { pid_t($0) }.filter { started[$0] != nil }
            while let p = todo.popLast() {
                guard seen.insert(p).inserted else { continue }
                out.append(p)
                todo += kids[p] ?? []
            }
            return out
        }
        var now: [pid_t: UInt64] = [:]
        let secs = at == nil || t <= since ? 0 : t - since
        // CPU (ns used since the last sample) and memory (bytes) of each process that could be read
        func use(_ pids: [pid_t]) -> [(pid: pid_t, ns: Double, mem: UInt64)] {
            pids.compactMap { p in
                var ru = rusage_info_v4()
                let ok = withUnsafeMutablePointer(to: &ru) { $0.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(p, RUSAGE_INFO_V4, $0) } } == 0
                guard ok else { return nil }
                let ns = UInt64(Double(ru.ri_user_time + ru.ri_system_time) * timebase.0 / timebase.1)
                now[p] = ns
                // a process that began since the last sample has used all its time in it
                let used = before[p].map { Double(ns &- $0) } ?? (started[p] ?? 0 > since ? Double(ns) : 0)
                return (p, used, ru.ri_phys_footprint)
            }
        }
        let cpu = { (ns: Double) in secs == 0 ? 0 : (ns / (secs * 1e9) * 1000).rounded() / 10 } // percent of a core, to a tenth
        func sum(_ u: some Sequence<(pid: pid_t, ns: Double, mem: UInt64)>, n: Int) -> JSON {
            let (ns, mem) = u.reduce((0.0, UInt64(0))) { ($0.0 + $1.ns, $0.1 + $1.mem) }
            return ["cpu": cpu(ns), "mem": Int(mem >> 20), "n": n]
        }
        var perSession: JSON = [:]
        for (id, pids) in sessions {
            let all = tree(pids), u = use(all)
            // by name, busiest first (CPU as shown, then memory, then name so the order holds still); past eight, the eighth is the rest
            let groups = Dictionary(grouping: u) { name($0.pid, started[$0.pid] ?? 0) }
                .map { (name: $0.key, cpu: cpu($0.value.reduce(0) { $0 + $1.ns }), mem: $0.value.reduce(0) { $0 + $1.mem }, of: $0.value) }
                .sorted { ($0.cpu, $0.mem, $1.name) > ($1.cpu, $1.mem, $0.name) }
            let shown = groups.count > 8 ? groups.prefix(7) + [(name: "other", cpu: 0, mem: 0, of: groups.dropFirst(7).flatMap(\.of))] : groups[...]
            var g = sum(u, n: all.count)
            g["procs"] = shown.map { sum($0.of, n: $0.of.count).merging(["name": $0.name]) { a, _ in a } }
            perSession[id] = g
        }
        // Lantern: this server, and the app around it when that's what started it (its window), with the helper and the vite watcher below
        let parent = getppid()
        var buf = [CChar](repeating: 0, count: 4096)
        proc_pidpath(parent, &buf, 4096)
        let lantern = tree([Int(getpid())] + (String(cString: buf).contains("Lantern.app/") ? [Int(parent)] : [])), mine = use(lantern)
        let out: JSON = ["sessions": perSession, "lantern": sum(mine, n: lantern.count), "mac": mac()]
        before = now
        at = t
        names = names.filter { started[$0.key] == $0.value.0 } // forget the ones that ended
        return out
    }

    // A process's name as a person reads it: the last part of its argv[0], as Activity Monitor shows it (Claude Code's binary is
    // named for its version but runs as "claude"), or for node or python running a tool everyone knows, the tool.
    // ponytail: named once per process; a process that renames itself later (process.title) keeps its first name.
    private static let tools: Set<String> = ["vite", "vitest", "tsc", "vue-tsc", "playwright", "next"]
    private func name(_ pid: pid_t, _ start: Double) -> String {
        if let (s, n) = names[pid], s == start { return n }
        let args = Self.args(pid)
        // a path's last part; a title a process gave itself (node's process.title, "npm exec some-mcp --flag"), its first word
        let first = args.first ?? "", path = first.hasPrefix("/") ? first : String(first.split(separator: " ").first ?? "")
        var n = String(path.split(separator: "/").last ?? "")
        if n.hasPrefix("-") { n.removeFirst() } // a login shell's "-zsh"
        if n.isEmpty {
            var info = proc_bsdinfo()
            proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size))
            n = withUnsafeBytes(of: info.pbi_comm) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        }
        if n == "node" || n.lowercased().hasPrefix("python"), let script = args.dropFirst().first(where: { !$0.hasPrefix("-") }) {
            // the script's path from its end: .bin/vite, vitest/dist/workers/forks.js, typescript/bin/tsc, @playwright/test/cli.js
            let parts = script.split(separator: "/").reversed().map { $0.split(separator: ".").first.map { String($0.drop { $0 == "@" }) } ?? "" }
            if let tool = parts.first(where: Self.tools.contains) { n = tool }
        }
        names[pid] = (start, n)
        return n
    }
    // A process's arguments, from KERN_PROCARGS2 (argc, the executable's path, NULs, then argv); empty when it can't be read.
    private static func args(_ pid: pid_t) -> [String] {
        var mib = [CTL_KERN, KERN_PROCARGS2, pid], size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > 4 else { return [] }
        var buf = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &buf, &size, nil, 0) == 0, size > 4 else { return [] }
        let argc = Int(buf.withUnsafeBytes { $0.load(as: Int32.self) })
        return buf[4..<size].split(separator: 0).dropFirst().prefix(argc).map { String(decoding: $0, as: UTF8.self) }
    }

    private func mac() -> JSON {
        var cpu = host_cpu_load_info(), n = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info>.size / 4)
        let got = withUnsafeMutablePointer(to: &cpu) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(n)) { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &n) } } == KERN_SUCCESS
        let now = [cpu.cpu_ticks.0, cpu.cpu_ticks.1, cpu.cpu_ticks.2, cpu.cpu_ticks.3] // user, system, idle, nice
        var busy = 0.0
        if got, let was = ticks {
            let d = zip(now, was).map { Double($0 &- $1) }, total = d.reduce(0, +)
            if total > 0 { busy = ((d[0] + d[1] + d[3]) / total * 1000).rounded() / 10 }
        }
        if got { ticks = now }
        var vm = vm_statistics64(), c = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / 4)
        _ = withUnsafeMutablePointer(to: &vm) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(c)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &c) } }
        var total: UInt64 = 0, size = MemoryLayout<UInt64>.size, level: Int32 = 1, lsize = MemoryLayout<Int32>.size
        sysctlbyname("hw.memsize", &total, &size, nil, 0)
        sysctlbyname("kern.memorystatus_vm_pressure_level", &level, &lsize, nil, 0)
        // Activity Monitor's "memory used": app memory (not purgeable) + wired + compressed
        let used = (UInt64(vm.internal_page_count) &- UInt64(vm.purgeable_count) &+ UInt64(vm.wire_count) &+ UInt64(vm.compressor_page_count)) * UInt64(vm_kernel_page_size)
        return ["cpu": busy, "used": Int(used >> 20), "total": Int(total >> 20), "pressure": level >= 4 ? "critical" : level == 2 ? "warning" : "normal"]
    }
}
