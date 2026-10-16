# Lantern

A paper lantern that glows with your Claude Code sessions. Moths are your sessions, the flame is how busy they are, and when one of them needs you, its moth lands on the lantern and the light turns violet.

![The lantern icon](icon.svg)

## What you see

- **The flame and glow** grow brighter with every working session. Five or more is fully lit.
- **Big moths are sessions.** Each one has its own spot in the dark, a thread of light back to the lantern, and a wingbeat that drifts between a top-down and a side view.
- **Small moths are subagents** circling the session that started them. Supervisor agents are a size up.
- **A moth that needs you lands on the lantern**, folds its wings, and turns indigo. The flame, paper, and glow all shift to violet.
- **Waiting on agents isn't the same as waiting on you.** A session whose turn ended while its background agents keep running stays in the air. If it also asked you something, it lands.
- **Hover a session's moth** for its name, what it's doing right now, your last prompt, the question it's asking, and what each of its agents is working on. The hover area stays put while the moth wanders, so the card holds still.
- **A landed session's card says what it needs from you**: its "You:" line, the PRs and other links it mentioned (clickable), and how many questions it asked. Clicking the card opens the session.
- **Click a moth** to jump to that session's tab in iTerm2. Clicking "N need you" in the footer opens whichever session has waited longest, then the next.
- **Moths grow restless.** A landed moth now and then fans its wings or slowly flutters them while it waits; after 15 minutes it grows restless, fidgets more, and sometimes hops off the paper.
- **The Dock app's icon shows how many sessions need you.**
- **Threads pulse** with a little glow each time a session or one of its agents runs a tool.
- **Each project gets a faint tint**, a little different per session, so you can tell moths apart at a glance.
- **Fireflies** hang around a session's moth, one per open PR it owns (up to ten). A moth lands on the slice of the lantern facing its home, like a slice of pie, so the lines never cross. While it's landed a dotted line in its thread colour ties it to one of its fireflies back home. Only PRs the session (or one of its agents, in any worktree) created with `gh pr create` count, plus its branch's PR when it's the only session in that folder; a PR it just mentions never does. Without GitHub status, a fly appears when the You: line points at one of those.
- **With GitHub status on**, fireflies show what each PR needs: green is ready to merge, red (blinking faster) is failing checks, orange is changes requested, amber is a draft, and blue is waiting on review. Merged ones drift off. Reviews requested from you hover by the lantern, and the footer links to them.
- **A singed moth** (grey, dark edge) means the turn ended with an API error.
- **"quiet"** in the footer treats everything as snoozed until 8am, on every display.
- **Right-click a waiting moth** to snooze it. It rests on the lantern in pale indigo and stops turning the light violet until the session does something new.
- **Pick a lantern** at the bottom of the page: the book-page barrel, a round chōchin, or a brass Moroccan lantern. The choice is shared, so every window, the iTerm2 panel, and the screensaver switch together.
- **Open windows update themselves.** When `index.html` changes, every Lantern window (the iTerm2 panel, the Dock app, the screensaver) reloads on its own.
- **Any window shape works.** The scene stretches to fill wide, tall, or square windows, with the lantern staying the same size in the middle.

## How it works

Claude Code hooks send every session event to a small Node server (no dependencies). The server keeps track of sessions and subagents and streams them to the page with Server-Sent Events. The page is one HTML file that animates an inline SVG.

When the server starts, it rebuilds the sessions you already have open from their transcripts in `~/.claude/projects`, so a restart doesn't lose them.

## Setup

You need macOS and Node 18 or later.

```bash
npx claude-lantern
```

That's the whole setup. It:

- backs up `~/.claude/settings.json` and adds one async `curl` hook per event, tagged `#lantern`. If the server isn't running, the hook gives up after a second and stays quiet, so Claude Code never waits on it.
- starts the server now and at every login, and restarts it if it crashes (a launchd agent, `com.lantern.server`). It runs from `~/Library/Application Support/Lantern`, or in place if you run the installer from a git checkout.
- builds and installs the screensaver, if you have Xcode's command line tools. Without them it skips that step; run `xcode-select --install`, then run the installer again.
- adds the iTerm2 panel script, if you have iTerm2.
- opens <http://127.0.0.1:7717>.

Running it again is safe: it replaces what it installed last time. To undo all of it (your settings get backed up first):

```bash
npx claude-lantern uninstall
```

### Working on Lantern

Clone the repo and run the installer from it, so the server runs your checkout:

```bash
git clone https://github.com/DaceExMachina/lantern.git ~/projects/lantern
```

```bash
node ~/projects/lantern/install.js
```

Restart the server after you change `server.js`:

```bash
launchctl kickstart -k gui/$(id -u)/com.lantern.server
```

To see every state without real sessions:

```bash
node ~/projects/lantern/fake.js
```

To type-check the JavaScript (including the page's inline script) with TypeScript, no build step involved:

```bash
npm install && npm run check
```

### Put it in your Dock

Open the page in Safari and choose File > Add to Dock. The moth icon comes with it. An indigo version of the icon is in `icon-indigo.svg` and `icon-indigo.png`.

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

The first time you click a moth, macOS asks whether `node` can control iTerm2. Allow it.

## GitHub status (optional)

Click **GitHub** in the footer, then **Connect an account**. Lantern shows a code; enter it at github.com/login/device and approve the Claude Lantern GitHub App. It can only read pull requests, checks and statuses, and only on accounts and orgs where it's installed (the panel links to installing it; an org admin may need to approve). The token is kept in your macOS Keychain, and you can connect more than one account. Disconnecting removes it from the Keychain; revoke the app in your GitHub settings to cut it off completely.

Every two minutes Lantern asks GitHub, once per account, for your open PRs and reviews requested from you. Merged and closed PRs drop out. A session's own PRs are the ones it created plus its branch's PR, when it's the only session in that folder.

If you'd rather use your own `gh` instead, with no account connected, turn that on with:

```bash
curl -H 'Content-Type: application/json' -d '{"github":true}' http://127.0.0.1:7717/settings
```

It runs `gh pr view` and `gh search prs` read-only from each session's folder, and only in folders that are git repos.

## Settings

Set `LANTERN_PORT` to use a port other than 7717. The hooks, the server, and the demo script read it; change the address in `iterm/lantern.py` and `screensaver/LanternView.swift` to match.

The chosen lantern is saved in `settings.json` next to the server.

## License

MIT. See [LICENSE](LICENSE).
