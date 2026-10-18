# Lantern

A paper lantern that glows with your Claude Code sessions. Moths are your sessions, the flame is how busy they are, and when one of them needs you, its moth lands on the lantern and the light turns violet.

![The lantern icon](icon.svg)

## What you see

- **The flame and glow** grow brighter with every working session. Five or more is fully lit.
- **Big moths are sessions.** Each one has its own spot in the dark, a thread of light back to the lantern, and a wingbeat that drifts between a top-down and a side view.
- **Small moths are subagents** circling the session that started them. Supervisor agents are a size up.
- **Side sessions orbit their parent.** A session the Claude desktop app started from another session flies as a satellite around that session's moth, a little smaller and untethered. It still lands on the lantern by itself when it needs you.
- **A moth that needs you lands on the lantern**, folds its wings, and turns indigo. The flame, paper, and glow all shift to violet.
- **Waiting on agents isn't the same as waiting on you.** A session whose turn ended while its background agents keep running stays in the air. If it also asked you something, it lands.
- **Hover a session's moth** for its name, what it's doing right now, your last prompt, the question it's asking, and what each of its agents is working on. The hover area stays put while the moth wanders, so the card holds still.
- **A landed session's card says what it needs from you**: its "You:" line, the links it mentioned (clickable), how many questions it asked, and one line per PR with its state and title. Clicking the card opens the session.
- **Forgot what something means?** "What's what?" at the bottom of the settings menu explains it all.
- **Click a moth** to jump to that session's tab in iTerm2. Clicking "N need you" in the footer opens whichever session has waited longest, then the next.
- **Moths grow restless.** A landed moth now and then fans its wings or slowly flutters them while it waits; after 15 minutes it grows restless, fidgets more, and sometimes hops off the paper.
- **The Lantern app's Dock icon shows how many sessions need you.**
- **Threads pulse** with a little glow each time a session or one of its agents runs a tool.
- **Each project gets a faint tint**, a little different per session, so you can tell moths apart at a glance.
- **Fireflies** hang around a session's moth, one per open PR it owns (up to ten). A moth lands on the slice of the lantern facing its home, like a slice of pie, so the lines never cross. While it's landed a dotted line in its thread colour ties it to one of its fireflies back home. Hovering that cluster shows the session's card too, PRs and all. Only PRs the session (or one of its agents, in any worktree) created with `gh pr create` count, plus its branch's PR when it's the only session in that folder; a PR it just mentions never does. Without GitHub status, a fly appears when the You: line points at one of those.
- **With GitHub status on**, fireflies show what each PR needs: green is ready to merge, red (blinking faster) is failing checks, orange is changes requested, amber is a draft, and blue is waiting on review. Merged ones drift off. Reviews requested from you hover by the lantern, and the footer links to them.
- **The graveyard** is a drift of wisps, low in the scene: your open PRs that no session owns and nobody has touched for a week, as pale ghost fireflies in a washed-out shade of their PR colour. The oldest drift lowest and dimmest. Now and then one brightens: half pulse slowly, half flicker like a dying bulb. Up to 30 drift; the rest gather into a faint cloud with a count. Hover one for what it needs and which session made it; click to open it. When one gets touched again, it rises away. It needs GitHub status, and you can turn it off in the settings menu.
- **A singed moth** (grey, dark edge) means the turn ended with an API error.
- **Stats** in the settings menu shows how your day is going, read from the log below (the Lantern app only). The headline is warm moths: the share of your sessions' time not spent waiting on you (a snoozed wait still counts as waiting). Below it are how long the lantern stayed warm, how quickly you answered, PRs merged and in flight, and the graveyard. The day ribbon runs from your first session to now in three strips: the lantern (warm, violet, or dim in quiet hours), the share of moths flying (warm when they all are, violet when they've all landed), and how many sessions were alive, with the working ones darker (from the five-minute counts). Ticks along the top mark sessions starting. The week before sits underneath as mini ribbons.
- **"quiet"** in the footer treats everything as snoozed until 8am, on every display.
- **Right-click a waiting moth** to snooze it. It rests on the lantern in pale indigo and stops turning the light violet until the session does something new. Right-click again to snooze it for good, so new activity never wakes it (handy for a chat you only drop into now and then), and once more to wake it. Right-clicking a moth that isn't waiting snoozes it for good straight away.
- **Pick a lantern** from the settings menu (the sliders icon at the bottom right), which also holds "notify me" and GitHub: the book-page barrel, a round chōchin, or a brass Moroccan lantern. The choice is shared, so every window, the iTerm2 panel, and the screensaver switch together.
- **Open windows update themselves.** When the page (`index.html` or a script in `page/`) changes, every Lantern window (the iTerm2 panel, the Dock app, the screensaver) reloads on its own.
- **Any window shape works.** The scene stretches to fill wide, tall, or square windows, with the lantern staying the same size in the middle.

## How it works

Claude Code hooks send every session event to a small server: inside Lantern.app it's written in Swift, and without the app it's `server.js` (Node, no dependencies). Both do the same thing. The server keeps track of sessions and subagents and streams them to the page with Server-Sent Events. The page is one HTML file and a handful of plain scripts that animate an inline SVG over a WebGL background.

When the server starts, it rebuilds the sessions you already have open from their transcripts in `~/.claude/projects`, so a restart doesn't lose them.

## Setup

You need macOS and Node 18 or later.

```bash
npx claude-lantern
```

That's the whole setup. It:

- backs up `~/.claude/settings.json` and adds one async `curl` hook per event, tagged `#lantern`. If the server isn't running, the hook gives up after a second and stays quiet, so Claude Code never waits on it.
- builds Lantern.app and the screensaver from source and installs them, if you have Xcode's command line tools. The app runs the server and opens at every login (see [The Lantern app](#the-lantern-app)).
- without Xcode's command line tools, it skips the app and the screensaver and runs the server with a launchd agent instead (`com.lantern.server`), which starts at every login and restarts it if it crashes. Run `xcode-select --install`, then run the installer again to get the app.
- adds the iTerm2 panel script, if you have iTerm2.
- opens Lantern.app, or <http://127.0.0.1:7717> if the app wasn't built.

Running it again is safe: it replaces what it installed last time. To undo all of it (your settings get backed up first):

```bash
npx claude-lantern uninstall
```

### Working on Lantern

Clone the repo and run the installer from it. Lantern.app then serves your checkout's page (`index.html` and `page/`) instead of its own copy, so page changes go live:

```bash
git clone https://github.com/DaceExMachina/lantern.git ~/projects/lantern
```

```bash
node ~/projects/lantern/install.js
```

The page is `index.html` plus plain scripts in `page/`, one per part of the scene (moths, lanterns, fireflies, the card, and so on), loaded in order with `main.js` last to wire everything up. It reloads itself when any of them changes. The server inside the app is `app/Server.swift`; after changing it, rebuild the app (below). `server.js` is the same server for setups without the app, so a change to one belongs in the other. To run it on a spare port alongside the app:

```bash
LANTERN_PORT=7718 node ~/projects/lantern/server.js
```

To see every state without real sessions:

```bash
node ~/projects/lantern/fake.js
```

To type-check the JavaScript (the servers, the installer and the page's scripts) with TypeScript, no build step involved:

```bash
npm install && npm run check
```

### The Lantern app

The installer puts `Lantern.app` in `~/Applications`. It's a plain window around the page, with the moth as its Dock icon and a badge counting the sessions that need you. It remembers where you left its window, and links open in your default browser. Drag it to your Dock to keep it there.

The Lantern server is part of the app, so there's nothing else to run and no Node needed. If another Lantern server already has port 7717 (one you started yourself, say), the app shows that one and takes the port over once it's free.

- **Closing the window keeps Lantern running**, so the hooks still have a server and the Dock badge keeps counting. Click the Dock icon to bring the window back.
- **Quitting the app stops the server.** Until you open it again, the hooks quietly do nothing.
- **It opens at login**, so the server is there before your first session. Turn that off in System Settings > General > Login Items.
- **Your settings** (the lantern you picked, and the GitHub status cache) live in `~/Library/Application Support/Lantern`, since an app can't write inside itself.
- **It keeps a log for stats** in `stats.sqlite` in the same folder: when sessions wait on you, when the lantern turns violet, what happens to your PRs, and a few counts every five minutes. The Stats panel reads it through `GET /stats`. The schema is described at the top of `app/Stats.swift`, and `server.js` doesn't keep one.
- **Rebuilding the app makes macOS ask again** whether Lantern can control iTerm2, because an app signed on your own Mac counts as a new app each time it's built.

The app is built on your Mac and signed for your Mac alone, so macOS opens it without asking, and you don't need an Apple developer account. To rebuild it by hand after changing it:

```bash
~/projects/lantern/app/build.sh
```

### Or download the app

Each [GitHub release](https://github.com/DaceExMachina/lantern/releases) has a prebuilt `Lantern.zip` for Apple silicon Macs on macOS 13 or later. Unzip it and move `Lantern.app` to `~/Applications`. The app is the server, but Claude Code still needs the hooks that send it your sessions, and those come from the installer (see Setup).

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
~/projects/lantern/screensaver/build.sh
```

That builds `Lantern.saver` from source and installs it in `~/Library/Screen Savers`. Then choose Lantern in System Settings > Wallpaper > Screen Saver (it's listed under Other). It shows the live page full screen, so the server needs to be running.

With more than one display, the biggest one gets the lantern and the others get just the background and drifting specks. The lantern's rays carry on across onto the other displays, lined up with where they really sit. To pick which lantern it shows, choose one in any other Lantern window.

### Click to focus iTerm2

The first time you click a moth, macOS asks whether Lantern (or `node`, without the app) can control iTerm2. Allow it.

## GitHub status (optional)

Open the settings menu (the sliders icon at the bottom right), then **Connect an account** under GitHub. Lantern shows a code; enter it at github.com/login/device and approve the Claude Lantern GitHub App. It can only read pull requests, checks and statuses, and only on accounts and orgs where it's installed (the panel links to installing it; an org admin may need to approve). The token is kept in your macOS Keychain, and you can connect more than one account. Disconnecting removes it from the Keychain; revoke the app in your GitHub settings to cut it off completely.

Every two minutes Lantern asks GitHub, once per account, for your open PRs and reviews requested from you. Merged and closed PRs drop out. A session's own PRs are the ones it created plus its branch's PR, when it's the only session in that folder.

If you'd rather use your own `gh` instead, with no account connected, turn that on with:

```bash
curl -H 'Content-Type: application/json' -d '{"github":true}' http://127.0.0.1:7717/settings
```

It runs `gh pr view` and `gh search prs` read-only from each session's folder, and only in folders that are git repos.

## Settings

Set `LANTERN_PORT` to use a port other than 7717. The hooks, the server, and the demo script read it; change the address in `iterm/lantern.py` and `screensaver/LanternView.swift` to match.

The chosen lantern is saved in `settings.json`: in `~/Library/Application Support/Lantern` with the app, or next to `server.js` without it.

The app reads `LANTERN_PORT` too, but apps opened from the Dock don't see your shell's settings, so it uses 7717 unless you open it with `open --env LANTERN_PORT=7718 ~/Applications/Lantern.app`.

## License

MIT. See [LICENSE](LICENSE).
