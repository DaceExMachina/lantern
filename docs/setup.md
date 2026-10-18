# Setting up Lantern

The [README](../README.md#install) has the one-line install. This page covers the details and the other ways to run it.

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

- **Hooks.** It backs up `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`) and adds one async `curl` hook per Claude Code event, each tagged `#lantern`. If Lantern isn't running, a hook gives up after a second and stays quiet, so Claude Code never waits on it.
- **The app and the screensaver.** It builds both from source with Xcode's command line tools, signs them for your Mac alone (no Apple developer account needed), and installs them in `~/Applications` and `~/Library/Screen Savers`. The app opens at login.
- **The iTerm2 panel.** If you have iTerm2, it copies the panel script into iTerm2's AutoLaunch folder. See [the iTerm2 toolbelt](#the-iterm2-toolbelt) to switch it on.
- **Your checkout.** The app serves the page (`index.html` and `page/`) from the folder you cloned, so keep it, and a `git pull` brings new looks without a rebuild.

Running it again is safe: it replaces what it installed last time. To undo all of it (your Claude Code settings get backed up first):

```bash
node lantern/install.js uninstall
```

## Download the app instead

Each [GitHub release](https://github.com/DaceExMachina/lantern/releases) has a prebuilt `Lantern.zip` for Apple silicon Macs on macOS 13 or later. On an Intel Mac, use the installer, which builds it for you. Unzip it and move `Lantern.app` to `~/Applications`. The app runs the server, but Claude Code still needs the hooks that send it your sessions, and those come from the installer. Without Xcode's command line tools, the installer keeps the app you downloaded and adds just the hooks and the iTerm2 panel.

The download isn't signed with a paid Apple developer ID, so macOS blocks it the first time:

1. Open `Lantern.app`. macOS says it can't check it for malicious software. Click Done.
2. Open System Settings > Privacy & Security, scroll down to Security, and click Open Anyway next to the Lantern message.
3. Confirm with your password or Touch ID. After that it opens normally.

Building it yourself with the installer skips all of this, because an app built on your own Mac isn't quarantined.

## Terminals and click to focus

Clicking a moth brings its session to the front:

| Where the session runs | What a click does |
|---|---|
| iTerm2 | Selects its tab. Sessions from before a Lantern restart are matched by tab title. |
| Terminal | Selects its tab, found by the session's tty. |
| The Claude desktop app | Opens that session in the app. |
| VS Code, Cursor and other VS Code forks | Brings forward the window with the session's folder, or opens one. |
| WezTerm | Activates its pane with `wezterm cli`. |
| kitty | Focuses its window with `kitten @`, if `allow_remote_control` and `listen_on` are set in kitty.conf. Otherwise it brings kitty forward. |
| Ghostty and anything else | Brings the terminal app forward. |

The first click in iTerm2 or Terminal makes macOS ask whether Lantern can control it. Allow it. Sessions started before you installed or updated Lantern send less detail, so a click may only bring their app forward until they're restarted.

Using a terminal Lantern doesn't know yet? [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-terminal) explains where to add it.

## The iTerm2 toolbelt

1. Turn on iTerm2's Python API (Settings > General > Magic).
2. The installer copies `iterm/lantern.py` to `~/Library/Application Support/iTerm2/Scripts/AutoLaunch/`. If you installed iTerm2 afterwards, run the installer again.
3. Run it once from Scripts > AutoLaunch > lantern.py, and accept the Python runtime download.
4. Choose View > Toolbelt > Show Toolbelt, then tick Lantern.

## The screensaver

Choose Lantern in System Settings > Wallpaper > Screen Saver (it's listed under Other). It shows the live page full screen, so the app needs to be running.

With more than one display, the biggest one gets the lantern and the others get just the background and drifting specks. The lantern's light carries on across onto the other displays, lined up with where they really sit. To pick which lantern it shows, choose one in any other Lantern window.

## GitHub status

GitHub status is optional. It colours fireflies by what each PR needs and brings in [stale PRs](guide.md#fireflies-and-stale-prs).

Open the settings menu (the sliders icon at the bottom right), then **Connect an account** under GitHub. Lantern shows a code: enter it at github.com/login/device and approve the Claude Lantern GitHub App. The app can only read pull requests, checks and statuses, and only on accounts and orgs where it's installed (the panel links to installing it, and an org admin may need to approve). The token is kept in your macOS Keychain, and you can connect more than one account. Disconnecting removes it from the Keychain. To cut it off completely, revoke the app in your GitHub settings.

Every two minutes Lantern asks GitHub, once per account, for your open PRs and the reviews requested from you. Merged and closed PRs drop out.

If you'd rather use your own `gh`, with no account connected, turn that on with:

```bash
curl -H 'Content-Type: application/json' -d '{"github":true}' http://127.0.0.1:7717/settings
```

It runs read-only `gh api graphql` queries from each session's folder, and only in folders that are git repos, so each folder uses whichever account `gh` picks there. Lantern looks for `gh` at `LANTERN_GH`, then `~/.local/bin/gh`, then Homebrew's.

## Settings

Lantern keeps its settings in `settings.json` in `~/Library/Application Support/Lantern`. The settings menu manages most of them. A few are only set by hand, and the app reads them when it starts, so quit and reopen it after an edit:

| Setting | Default | What it does |
|---|---|---|
| `port` | `7717` | The server's port. Run the installer with `LANTERN_PORT=7718` to set it: it writes it here and points the hooks, the iTerm2 panel and the screensaver at it. |
| `claudeDir` | `~/.claude` | Claude Code's config folder. The installer writes it from `CLAUDE_CONFIG_DIR`. |
| `quietEnd` | `"08:00"` | When "quiet" ends, as `"HH:MM"` in your local time. |
| `supervisorPattern` | `"supervisor\|orchestrat"` | A regular expression, ignoring case, for agent types that fly as supervisors (a size up). |

`LANTERN_PORT` in the environment still wins, for example `open --env LANTERN_PORT=7718 ~/Applications/Lantern.app`.

## Known limits

- **Lantern is macOS only.** The app, the server inside it, the screensaver and click to focus all need a Mac, and the installer refuses to run anywhere else.
- **Claude Code versions.** Tested with 2.1.302. The installer registers hooks for newer events such as `PermissionRequest` and `PostCompact`, which a much older Claude Code may not know (see [troubleshooting](troubleshooting.md#claude-code-complains-about-the-hooks)).
- **The prebuilt app is Apple silicon only.** On an Intel Mac, the installer builds it from source.
- **The screensaver leans on WebKit settings Apple doesn't document.** It's tested on macOS 26.
- **GitHub status is github.com only.** A session owns a PR when it ran `gh pr create` in Bash, so PRs opened through an MCP tool or the website aren't linked to a session.
- **Resuming a ghost moth's session opens iTerm2**, whatever terminal you use.
- **The card reads English.** Any sentence ending in "?" counts as a question (a full-width "？" doesn't), and the `**You:**` and `**Blocker:**` footer lines are matched in English.
