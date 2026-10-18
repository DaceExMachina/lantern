# Lantern

A paper lantern that glows with your Claude Code sessions. Moths are your sessions, the flame is how busy they are, and when one of them needs you, its moth lands on the lantern and the light turns violet.

![The lantern icon](icon.svg)

## What you see

- **The flame and glow** grow brighter with every working session. Five or more is fully lit.
- **Big moths are sessions.** Each one has its own spot in the dark, a thread of light back to the lantern, and a wingbeat that drifts between a top-down and a side view.
- **Small moths are subagents** circling the session that started them. Supervisor agents are a size up (agent types matching `supervisor` or `orchestrat`, or your own `supervisorPattern`, see [Settings](#settings)).
- **Side sessions orbit their parent.** A session the Claude desktop app started from another session flies as a satellite around that session's moth, a little smaller and untethered. While its parent is alive it reports back to the parent, not to you: when it finishes it keeps orbiting (its card says "reported back") and never turns the lantern violet. The parent's card lists its side sessions like its agents.
- **A moth that needs you lands on the lantern**, folds its wings, and turns indigo. The flame, paper, and glow all shift to violet.
- **Waiting on agents isn't the same as waiting on you.** A session whose turn ended while its background agents keep running stays in the air. If it also asked you something, it lands.
- **Hover a session's moth** for its name, what it's doing right now, your last prompt, the question it's asking, and what each of its agents is working on. The hover area stays put while the moth wanders, so the card holds still.
- **A landed session's card says what it needs from you**: its "You:" line (a `**You:**` line from a status footer if your sessions write one, otherwise the last paragraph of its final message), the links it mentioned (clickable), how many questions it asked, and one line per PR with its state and title. Clicking the card opens the session.
- **Forgot what something means?** "What's what?" at the bottom of the settings menu explains it all.
- **Click a moth** to bring that session to the front: its terminal tab, or the session itself in the Claude desktop app (see [Works with](#works-with)). Clicking "N need you" in the footer opens whichever session has waited longest, then the next.
- **Moths grow restless.** A landed moth now and then takes a slow breath while it waits, opening its wings and closing them again; after 15 minutes it grows restless and sometimes hops off the paper.
- **The Lantern app's Dock icon shows how many sessions need you.**
- **Threads pulse** with a little glow each time a session or one of its agents runs a tool.
- **Each project gets a faint tint**, a little different per session, so you can tell moths apart at a glance.
- **Fireflies** hang around a session's moth, one per open PR it owns (up to ten). A moth lands on the slice of the lantern facing its home, like a slice of pie, so the lines never cross. While it's landed a dotted line in its thread colour ties it to one of its fireflies back home. Hovering that cluster shows the session's card too, PRs and all. Only PRs the session (or one of its agents, in any worktree) created with `gh pr create` count, plus its branch's PR when it's the only session in that folder; a PR it just mentions never does. Without GitHub status, a fly appears when the You: line points at one of those.
- **With GitHub status on**, fireflies show what each PR needs: green is ready to merge, red (blinking faster) is failing checks, orange is changes requested, amber is a draft, and blue is waiting on review. Merged ones drift off. Reviews requested from you hover by the lantern, and the footer links to them.
- **Stale PRs** drift as wisps, low in the scene: your open PRs that no session owns and nobody has touched for a week, as pale ghost fireflies in a washed-out shade of their PR colour. The oldest drift lowest and dimmest. Now and then one slowly brightens and fades again. Up to 30 drift; the rest gather into a faint cloud with a count. Hover one for what it needs and which session made it; click to open it. When one gets touched again, it rises away. Behind them, the old sessions that made some of them drift as faint ghost moths (when Lantern can still find their transcripts): hover one for its dead PRs, click it to resume it in a new iTerm2 tab (iTerm2 only for now). It needs GitHub status, and you can turn it off in the settings menu.
- **A singed moth** (grey, dark edge) means the turn ended with an API error.
- **Stats** (the chart button beside the settings button) shows how your day is going, read from the log below (the Lantern app only). The headline is warm moths: the share of your sessions' time not spent waiting on you (a snoozed wait still counts as waiting). Below it are how long the lantern stayed warm, how quickly you answered, PRs merged and in flight, and stale PRs. The day ribbon runs from your first session to now in three strips: the lantern (warm, violet, or dim in quiet hours), the share of moths flying (warm when they all are, violet when they've all landed), and how many sessions were alive, with the working ones darker (from the five-minute counts). Ticks along the top mark sessions starting. The week before sits underneath as mini ribbons. You can set a few **goals** there too (fireflies in flight at most N, a median answer time within N minutes, warm moths at least N%). Each is off until it has a number, and it glows warm when you're on track. Goals live in the shared settings, so every window sees them. **Badges** come from the log too: Warm all day, Clear night, Small batches, Revived, Ghostbuster, Séance, Lights Out, warm streaks, Haunted, Restless spirits, Light Pollution, Swarm Season, Hive Mind, Purple Rain, Ghosted and Snooze Button Champion. They aren't sorted into good or bad; what each one means is up to you. The panel shows this week's, and **All badges** lists every one. Hover or tap a badge for what it is, how to earn it, and when you last did (a tap keeps it open).
- **The daily recap** opens by itself when quiet hours start, or as yesterday's recap the first time you look at the lantern the next day, whichever comes first (once per day across every window, and never in the iTerm panel or the screensaver). It shows the day's ribbon, warm moths, lantern warm time, answer time, fireflies merged and left open, the stale PR change, the badges earned that day, your warm streak, and the day's sessions as a small constellation (one star per session, bigger the longer it ran). With "notify me" on, it sends a notification too. Click a day in the stats panel's week (or **recap** next to Today) to see any day of the past week.
- **"quiet"** in the footer treats everything as snoozed until 8am (or your `quietEnd`), on every display.
- **Right-click a waiting moth** to snooze it. It rests on the lantern in pale indigo, now and then breathing out z's, and stops turning the light violet until the session does something new. Right-click again to snooze it for good, so new activity never wakes it (handy for a chat you only drop into now and then), and once more to wake it. Right-clicking a moth that isn't waiting snoozes it for good straight away.
- **Session text is printed on the book-page barrel.** Paragraphs of what your sessions wrote wrap round the paper like print on a drum, squeezing as they turn toward the sides and vanishing round the back, on the rows between the wires. A new one fades in every twenty seconds or so over about 18 seconds, lingers for about a minute and fades out, overlapping the others. Some are printed on the inside (mirrored). They read best near the flame. Only plain sentences make it: anything with code, a link or path, a number, a name (a capitalised word past the first) or talk to or about you is dropped, and the words are only held in memory. Besides the sessions running now, Lantern reads the newest few transcripts when it starts, ended sessions too. With nothing to show, the paper stays blank. Turn it off with "show session text" in the settings menu: the words fade out, and Lantern stops reading and keeping them until you turn it back on.
- **Pick a lantern** from the settings menu (the sliders icon at the bottom right), which also holds "notify me" and GitHub: the book-page barrel, a round chōchin, or a brass Moroccan lantern. The choice is shared, so every window, the iTerm2 panel, and the screensaver switch together.
- **Open windows update themselves.** When the page (`index.html` or a script in `page/`) changes, every Lantern window (the iTerm2 panel, the Dock app, the screensaver) reloads on its own.
- **Any window shape works.** The scene stretches to fill wide, tall, or square windows, with the lantern staying the same size in the middle.

## Works with

- **macOS 13 or later.** Tested on macOS 26. The app, the screensaver and click to focus are Mac only. Elsewhere, `server.js` and the page in a browser still work (see [Without the app](#without-the-app-serverjs)).
- **Claude Code**, in a terminal or in the Claude desktop app (both run the hooks). Tested with 2.1.302. The installer registers hooks for newer events such as `PermissionRequest` and `PostCompact`, which a much older Claude Code may not know.
- **Your own `~/.claude` folder**, or wherever `CLAUDE_CONFIG_DIR` points when you run the installer.
- **Any CLAUDE.md.** A status footer with a `**You:**` line and `**Blocker:**` questions gives the card a sharper summary, but it's optional: without one the card shows the last paragraph of the final message, and any sentence ending in "?" counts as a question (English only).
- **GitHub status** on github.com, through the Claude Lantern GitHub App or your own `gh`. A session owns a PR when it ran `gh pr create` in Bash; PRs opened through an MCP tool or the website aren't linked to a session.

Clicking a moth brings its session to the front in:

| Where the session runs | What a click does |
|---|---|
| iTerm2 | Selects its tab (sessions from before a Lantern restart are matched by tab title). |
| Terminal | Selects its tab, found by the session's tty. |
| The Claude desktop app | Opens that session in the app. |
| VS Code, Cursor and other VS Code forks | Brings forward the window with the session's folder (or opens one). |
| WezTerm | Activates its pane with `wezterm cli`. |
| kitty | Focuses its window with `kitten @`, if `allow_remote_control` and `listen_on` are set in kitty.conf; otherwise brings kitty forward. |
| Ghostty and anything else | Brings the terminal app forward. |

The first click in iTerm2 or Terminal makes macOS ask whether Lantern can control it. Allow it. Sessions started before you installed or updated Lantern send less detail, so a click may only bring their app forward until they're restarted.

## How it works

Claude Code hooks send every session event to a small server: inside Lantern.app it's written in Swift, and without the app it's `server.js` (Node, no dependencies), an older, simpler copy (see [Without the app](#without-the-app-serverjs)). The server keeps track of sessions and subagents and streams them to the page with Server-Sent Events. The page is one HTML file and a handful of plain scripts that animate an inline SVG over a WebGL background.

When the server starts, it rebuilds the sessions you already have open from their transcripts in `~/.claude/projects` (or under `CLAUDE_CONFIG_DIR`), so a restart doesn't lose them.

## Setup

You need macOS and Node 18 or later.

```bash
npx claude-lantern
```

That's the whole setup. It:

- backs up `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`) and adds one async `curl` hook per event, tagged `#lantern`. If the server isn't running, the hook gives up after a second and stays quiet, so Claude Code never waits on it.
- builds Lantern.app and the screensaver from source and installs them, if you have Xcode's command line tools. The app runs the server and opens at every login (see [The Lantern app](#the-lantern-app)).
- without Xcode's command line tools, it skips the app and the screensaver and runs the server with a launchd agent instead (`com.lantern.server`), which starts at every login and restarts it if it crashes. Run `xcode-select --install`, then run the installer again to get the app.
- adds the iTerm2 panel script, if you have iTerm2.
- opens Lantern.app, or <http://127.0.0.1:7717> if the app wasn't built.

Running it again is safe: it replaces what it installed last time. To undo all of it (your settings get backed up first):

```bash
npx claude-lantern uninstall
```

### Working on Lantern

Clone the repo and run the installer from it (`<clone-dir>` below is wherever you cloned it). Lantern.app then serves your checkout's page (`index.html` and `page/`) instead of its own copy, so page changes go live:

```bash
git clone https://github.com/DaceExMachina/lantern.git <clone-dir>
```

```bash
node <clone-dir>/install.js
```

The page is `index.html` plus plain scripts in `page/`, one per part of the scene (moths, lanterns, fireflies, the card, and so on), loaded in order with `main.js` last to wire everything up. It reloads itself when any of them changes. The server inside the app is `app/Server.swift`; after changing it, rebuild the app (below). `server.js` is the older fallback server and is frozen, so new features go in the Swift server only. To run it on a spare port alongside the app:

```bash
LANTERN_PORT=7718 node <clone-dir>/server.js
```

To preview a branch's page with your real sessions and PRs, add `LANTERN_MIRROR=http://127.0.0.1:7717`: it serves the branch's page but takes everything else live from the app, and snoozes, settings and clicks in the preview go nowhere.

To see every state without real sessions:

```bash
node <clone-dir>/fake.js
```

To type-check the JavaScript (the servers, the installer and the page's scripts) with TypeScript, no build step involved:

```bash
npm install && npm run check
```

To run the tests (macOS only, since they build the Swift server with `swiftc`):

```bash
npm test
```

They use Node's built-in test runner, so there's nothing extra to install. `test/server.test.js` builds the app's server without its window, runs it on a spare port with its own temporary home folder, and replays the hook events in `test/replay/` against it: each file is a list of requests to send, and `expect` steps holding the sessions the page should get by then. After changing what the server does on purpose, `UPDATE=1 npm test` rewrites the `expect` steps from what it does now, so read the diff before committing it. `test/page.test.js` covers the page's landing spots and wing flapping, and `test/legacy.test.js` covers how `server.js` reads transcripts and turns.

### The Lantern app

The installer puts `Lantern.app` in `~/Applications`. It's a plain window around the page, with the moth as its Dock icon and a badge counting the sessions that need you. It remembers where you left its window, and links open in your default browser. Drag it to your Dock to keep it there.

The Lantern server is part of the app, so there's nothing else to run and no Node needed. If another Lantern server already has port 7717 (one you started yourself, say), the app shows that one and takes the port over once it's free.

- **Closing the window keeps Lantern running**, so the hooks still have a server and the Dock badge keeps counting. Click the Dock icon to bring the window back.
- **Quitting the app stops the server.** Until you open it again, the hooks quietly do nothing.
- **It opens at login**, so the server is there before your first session. Turn that off in System Settings > General > Login Items.
- **Your settings** (the lantern you picked, and the GitHub status cache) live in `~/Library/Application Support/Lantern`, since an app can't write inside itself.
- **It keeps a log for stats** in `stats.sqlite` in the same folder: when sessions wait on you, when the lantern turns violet, what happens to your PRs, and a few counts every five minutes. The Stats panel reads it through `GET /stats`. The schema is described at the top of `app/Stats.swift`, and `server.js` doesn't keep one.
- **Rebuilding the app makes macOS ask again** whether Lantern can control iTerm2 or Terminal, because an app signed on your own Mac counts as a new app each time it's built.

The app is built on your Mac and signed for your Mac alone, so macOS opens it without asking, and you don't need an Apple developer account. To rebuild it by hand after changing it:

```bash
<clone-dir>/app/build.sh
```

### Or download the app

Each [GitHub release](https://github.com/DaceExMachina/lantern/releases) has a prebuilt `Lantern.zip` for Apple silicon Macs on macOS 13 or later. On an Intel Mac, build it with the installer instead (see Setup). Unzip it and move `Lantern.app` to `~/Applications`. The app is the server, but Claude Code still needs the hooks that send it your sessions, and those come from the installer (see Setup).

It isn't signed with a paid Apple developer ID, so macOS blocks it the first time:

1. Open `Lantern.app`. macOS says it can't check it for malicious software. Click Done.
2. Open System Settings > Privacy & Security, scroll down to Security, and click Open Anyway next to the Lantern message.
3. Confirm with your password or Touch ID. After that it opens normally.

Building it yourself with the installer skips all of this, because an app built on your own Mac isn't quarantined.

### Or use Safari

If you'd rather not build anything, open the page in Safari and choose File > Add to Dock. The moth icon comes with it, and so does the badge. An indigo version of the icon is in `icon-indigo.svg` and `icon-indigo.png`.

### Put it in iTerm2's toolbelt

1. Turn on iTerm2's Python API (Settings > General > Magic).
2. The installer copies `iterm/lantern.py` to `~/Library/Application Support/iTerm2/Scripts/AutoLaunch/`. If you installed iTerm2 afterwards, run the installer again.
3. Run it once from Scripts > AutoLaunch > lantern.py, and accept the Python runtime download.
4. Choose View > Toolbelt > Show Toolbelt, then tick Lantern.

### Use it as your screensaver

The installer builds it for you if you have Xcode's command line tools. To rebuild it by hand after changing it:

```bash
<clone-dir>/screensaver/build.sh
```

That builds `Lantern.saver` from source and installs it in `~/Library/Screen Savers`. Then choose Lantern in System Settings > Wallpaper > Screen Saver (it's listed under Other). It shows the live page full screen, so the server needs to be running.

With more than one display, the biggest one gets the lantern and the others get just the background and drifting specks. The lantern's light carries on across onto the other displays, lined up with where they really sit. To pick which lantern it shows, choose one in any other Lantern window.

### Click to focus

The first time you click a moth in iTerm2 or Terminal, macOS asks whether Lantern can control it. Allow it. See [Works with](#works-with) for what a click does in each terminal.

Using a terminal Lantern doesn't know yet? Adding it is a small change, and pull requests are welcome. The hook already sends `TERM_PROGRAM` and the terminal app's bundle id with every event (`install.js`), and `focusElsewhere` in `app/Server.swift` is where each terminal gets its own way of bringing a session forward; add a case there next to the others.

### Without the app (`server.js`)

`server.js` is the server from before Lantern.app, kept as a plain fallback: the installer runs it under launchd when your Mac has no Xcode command line tools, and it's the way to run Lantern off macOS. It needs only Node 18. It's frozen, so it lacks everything added since the app took over:

- stale PRs' ghost moths and resuming their sessions, and side sessions orbiting the session that started them
- the event log, the Stats panel (it says it can't read the stats), badges and the daily recap
- the card's last-paragraph summary when a session writes no `**You:**` footer (it shows nothing there)
- click to focus anywhere but iTerm2
- `claudeDir` and `port` in settings.json: it reads `~/.claude`, and the port from `LANTERN_PORT` only

The installer refuses to run off macOS. On Linux, start `node server.js` (under systemd if you want it at login), open <http://127.0.0.1:7717> in a browser, and add the hooks to `~/.claude/settings.json` by hand: one entry per event listed in `EVENTS` in `install.js`, each running

```bash
curl -s -m 1 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:7717/event >/dev/null 2>&1; exit 0
```

with `"async": true`. For GitHub status off macOS, use your own `gh` (the account sign-in keeps its token in the macOS Keychain).

## GitHub status (optional)

Open the settings menu (the sliders icon at the bottom right), then **Connect an account** under GitHub. Lantern shows a code; enter it at github.com/login/device and approve the Claude Lantern GitHub App. It can only read pull requests, checks and statuses, and only on accounts and orgs where it's installed (the panel links to installing it; an org admin may need to approve). The token is kept in your macOS Keychain, and you can connect more than one account. Disconnecting removes it from the Keychain; revoke the app in your GitHub settings to cut it off completely.

Every two minutes Lantern asks GitHub, once per account, for your open PRs and reviews requested from you. Merged and closed PRs drop out. A session's own PRs are the ones it created plus its branch's PR, when it's the only session in that folder.

If you'd rather use your own `gh` instead, with no account connected, turn that on with:

```bash
curl -H 'Content-Type: application/json' -d '{"github":true}' http://127.0.0.1:7717/settings
```

It runs read-only `gh api graphql` queries from each session's folder, and only in folders that are git repos, so each folder uses whichever account `gh` picks there. Lantern looks for `gh` at `LANTERN_GH`, then `~/.local/bin/gh`, then Homebrew's.

## Settings

Lantern keeps its settings in `settings.json` in `~/Library/Application Support/Lantern` (next to `server.js` without the app). The menu manages most of them. A few are only set by hand, and the app reads them when it starts, so quit and reopen it after an edit:

| Setting | Default | What it does |
|---|---|---|
| `port` | `7717` | The server's port. Run the installer with `LANTERN_PORT=7718` to set it: it writes it here and points the hooks, the iTerm2 panel and the screensaver at it. |
| `claudeDir` | `~/.claude` | Claude Code's config folder. The installer writes it from `CLAUDE_CONFIG_DIR`. |
| `quietEnd` | `"08:00"` | When "quiet" ends, as `"HH:MM"` in your local time. |
| `supervisorPattern` | `"supervisor\|orchestrat"` | A regular expression for agent types that fly as supervisors (a size up), ignoring case. |

`LANTERN_PORT` in the environment still wins, for example `open --env LANTERN_PORT=7718 ~/Applications/Lantern.app`.

## License

MIT. See [LICENSE](LICENSE).
