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
- **Click a moth** to jump to that session's tab in iTerm2.
- **Right-click a waiting moth** to snooze it. It rests on the lantern in pale indigo and stops turning the light violet until the session does something new.
- **Pick a lantern** at the bottom of the page: the book-page barrel, a round chōchin, or a brass Moroccan lantern. The choice is shared, so every window, the iTerm2 panel, and the screensaver switch together.
- **Any window shape works.** The scene stretches to fill wide, tall, or square windows, with the lantern staying the same size in the middle.

## How it works

Claude Code hooks send every session event to a small Node server (no dependencies). The server keeps track of sessions and subagents and streams them to the page with Server-Sent Events. The page is one HTML file that animates an inline SVG.

When the server starts, it rebuilds the sessions you already have open from their transcripts in `~/.claude/projects`, so a restart doesn't lose them.

## Setup

You need macOS and Node.

```bash
git clone https://github.com/DaceExMachina/lantern.git ~/projects/lantern
```

```bash
node ~/projects/lantern/install.js
```

```bash
node ~/projects/lantern/server.js
```

Then open <http://127.0.0.1:7717>.

`install.js` backs up `~/.claude/settings.json` and adds one async `curl` hook per event, tagged `#lantern`. If the server isn't running, the hook gives up after a second and stays quiet, so Claude Code never waits on it.

To remove the hooks:

```bash
node ~/projects/lantern/install.js uninstall
```

To see every state without real sessions:

```bash
node ~/projects/lantern/fake.js
```

### Start it on login

Copy `launchd.plist.example` to `~/Library/LaunchAgents/com.lantern.server.plist`, fill in the two paths, and load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lantern.server.plist
```

Restart it after you change `server.js`:

```bash
launchctl kickstart -k gui/$(id -u)/com.lantern.server
```

### Put it in your Dock

Open the page in Safari and choose File > Add to Dock. The moth icon comes with it. An indigo version of the icon is in `icon-indigo.svg` and `icon-indigo.png`.

### Put it in iTerm2's toolbelt

1. Turn on iTerm2's Python API (Settings > General > Magic).
2. Copy `iterm/lantern.py` to `~/Library/Application Support/iTerm2/Scripts/AutoLaunch/`.
3. Run it once from Scripts > AutoLaunch > lantern.py, and accept the Python runtime download.
4. Choose View > Toolbelt > Show Toolbelt, then tick Lantern.

### Use it as your screensaver

You need Xcode's command line tools.

```bash
~/projects/lantern/screensaver/build.sh
```

That builds `Lantern.saver` from source and installs it in `~/Library/Screen Savers`. Then choose Lantern in System Settings > Wallpaper > Screen Saver (it's listed under Other). It shows the live page full screen, so the server needs to be running.

With more than one display, the biggest one gets the lantern and the others get just the background and drifting specks. The lantern's rays carry on across onto the other displays, lined up with where they really sit. To pick which lantern it shows, choose one in any other Lantern window.

### Click to focus iTerm2

The first time you click a moth, macOS asks whether `node` can control iTerm2. Allow it.

## Settings

Set `LANTERN_PORT` to use a port other than 7717. The hooks, the server, and the demo script read it; change the address in `iterm/lantern.py` and `screensaver/LanternView.swift` to match.

The chosen lantern is saved in `settings.json` next to the server.
