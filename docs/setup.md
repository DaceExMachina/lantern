# Setting up Lantern

The [README](../README.md#install) has the one-line install. This page has the details, plus the other ways to run Lantern.

- [What the installer does](#what-the-installer-does)
- [Download the app instead](#download-the-app-instead)
- [Terminals and click to focus](#terminals-and-click-to-focus)
- [The iTerm2 toolbelt](#the-iterm2-toolbelt)
- [The screensaver](#the-screensaver)
- [GitHub status](#github-status)
- [Settings](#settings)
- [Known limits](#known-limits)

## What the installer does

```bash
git clone https://github.com/DaceExMachina/lantern && node lantern/install.js
```

First it backs up `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`) and adds an async `curl` hook, tagged `#lantern`, for every Claude Code event. If Lantern isn't running, a hook gives up after a second without a peep, so Claude Code never waits on it.

Then it builds the app and the screensaver from source with Xcode's command line tools. It signs them for your Mac alone, so you don't need an Apple developer account, installs them in `~/Applications` and `~/Library/Screen Savers`, and sets the app to open at login.

If you have iTerm2, it also copies the panel script into iTerm2's AutoLaunch folder. [The iTerm2 toolbelt](#the-iterm2-toolbelt) covers switching it on.

The app serves the page (`index.html` and `page/`) straight from the folder you cloned, so keep that folder. A `git pull` brings in new looks without a rebuild.

Running the installer again is safe, since it replaces whatever it installed last time. To undo all of it (your Claude Code settings get backed up first):

```bash
node lantern/install.js uninstall
```

## Download the app instead

Each [GitHub release](https://github.com/DaceExMachina/lantern/releases) has a prebuilt `Lantern.zip` for Apple silicon Macs on macOS 13 or later. Unzip it and move `Lantern.app` to `~/Applications`. To cut a new release, run the release workflow from the repo's Actions tab: it bumps the version and attaches a fresh `Lantern.zip`. On an Intel Mac, use the installer, which builds the app for you.

The app runs the server, but Claude Code still needs hooks to tell it about your sessions, and only the installer adds those. Run it after you've moved the app in. Without Xcode's command line tools, it keeps the app you downloaded and adds just the hooks and the iTerm2 panel.

The download isn't signed with a paid Apple developer ID, so macOS blocks it the first time you open it:

1. Open `Lantern.app`. macOS says it can't check it for malicious software. Click Done.
2. Open System Settings > Privacy & Security, scroll down to Security, and click Open Anyway next to the Lantern message.
3. Confirm with your password or Touch ID. After that it opens normally.

The installer skips all of this, because macOS doesn't quarantine an app built on your own Mac.

## Terminals and click to focus

Clicking a moth brings its session to the front. How it does that depends on where the session runs:

| Where the session runs | What a click does |
|---|---|
| iTerm2 | Selects its tab. Sessions from before a Lantern restart are matched by tab title. |
| Terminal | Selects its tab, found by the session's tty. |
| The Claude desktop app | Opens that session in the app. |
| VS Code, Cursor and other VS Code forks | Brings forward the window with the session's folder, or opens one. |
| WezTerm | Activates its pane with `wezterm cli`. |
| kitty | Focuses its window with `kitten @`, if `allow_remote_control` and `listen_on` are set in kitty.conf. Otherwise it brings kitty forward. |
| Ghostty and anything else | Brings the terminal app forward. |

The first click in iTerm2 or Terminal makes macOS ask whether Lantern may control it. Say yes. Sessions started before you installed or updated Lantern send less detail, so until you restart them, a click may only bring their app forward.

Using a terminal Lantern doesn't know yet? [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-terminal) shows where to add it.

## The iTerm2 toolbelt

1. Turn on iTerm2's Python API (Settings > General > Magic).
2. The installer copies `iterm/lantern.py` to `~/Library/Application Support/iTerm2/Scripts/AutoLaunch/`. If you installed iTerm2 afterwards, run the installer again.
3. Run it once from Scripts > AutoLaunch > lantern.py, and accept the Python runtime download.
4. Choose View > Toolbelt > Show Toolbelt, then tick Lantern.

## The screensaver

Choose Lantern in System Settings > Wallpaper > Screen Saver, under Other. It shows the live page full screen, so the app has to be running.

With more than one display, the biggest gets the lantern and the rest get the background and drifting specks. The light spills across onto the other displays, lined up with where they actually sit. The screensaver shows whichever lantern you picked in any other Lantern window.

If the page stops drawing (the server isn't answering, its web process crashed, or the GPU reset), the screensaver loads it again, waiting a little longer each time, up to 30 seconds. To see what it did, for example after a black screen:

```sh
log show --predicate 'subsystem == "com.lantern.screensaver"' --last 1h
```

The screensaver and the page are updated together, so after updating Lantern, run the installer again (or `sh screensaver/build.sh` from the same checkout the app serves the page from).

## GitHub status

GitHub status is optional. Turn it on and fireflies take on the colour of what each PR needs, and [stale PRs](guide.md#fireflies-and-stale-prs) show up.

Open the settings menu (the sliders icon at the bottom right) and click **Connect an account** under GitHub. Lantern shows a code. Enter it at github.com/login/device and approve the Claude Lantern GitHub App.

The app can only read pull requests, checks and statuses, and only on accounts and orgs where it's installed. The panel links to installing it, and an org admin may need to approve. Lantern keeps the token in your macOS Keychain, and you can connect more than one account. Disconnecting deletes the token from the Keychain. To cut Lantern off completely, revoke the app in your GitHub settings.

Every two minutes Lantern asks GitHub, once per account, for your open PRs and the reviews requested from you. Merged and closed PRs drop out.

Rather use your own `gh`? With no account connected, turn it on with:

```bash
curl -H 'Content-Type: application/json' -d '{"github":true}' http://127.0.0.1:7717/settings
```

It runs read-only `gh api graphql` queries from each session's folder, and only in folders that are git repos, so each folder uses whichever account `gh` picks there. Lantern looks for `gh` at `LANTERN_GH`, then `~/.local/bin/gh`, then Homebrew's.

## Settings

Lantern keeps its settings in `settings.json` in `~/Library/Application Support/Lantern`, and the settings menu handles most of them, including quiet from, quiet until, the day rollover (when a stats day starts), and the ribbon colour. You set the few below by hand. The app reads them at startup, so quit and reopen it after an edit.

| Setting | Default | What it does |
|---|---|---|
| `port` | `7717` | The server's port. Run the installer with `LANTERN_PORT=7718` to set it: it writes it here and points the hooks, the iTerm2 panel and the screensaver at it. |
| `claudeDir` | `~/.claude` | Claude Code's config folder. The installer writes it from `CLAUDE_CONFIG_DIR`. |
| `supervisorPattern` | `"supervisor\|orchestrat"` | A regular expression, ignoring case, for agent types that fly as supervisors (a size up). |

`LANTERN_PORT` in the environment beats the file, as in `open --env LANTERN_PORT=7718 ~/Applications/Lantern.app`.

## Known limits

- **Lantern is macOS only.** The app, its server, the screensaver and click to focus all need a Mac, and the installer won't run anywhere else.
- **Claude Code versions.** Tested with 2.1.302. The installer registers hooks for newer events such as `PermissionRequest` and `PostCompact`, which a much older Claude Code may not know (see [troubleshooting](troubleshooting.md#claude-code-complains-about-the-hooks)).
- **The prebuilt app is Apple silicon only.** On an Intel Mac, the installer builds it from source.
- **The screensaver leans on WebKit settings Apple doesn't document.** It's tested on macOS 26.
- **GitHub status is github.com only.** A session owns a PR when it ran `gh pr create` in Bash, so PRs opened through an MCP tool or the website aren't linked to a session.
- **Resuming a ghost moth's session opens iTerm2**, whatever terminal you use.
- **The card reads English.** Any sentence ending in "?" counts as a question (a full-width "？" doesn't), and the `**You:**` and `**Blocker:**` footer lines are matched in English.
