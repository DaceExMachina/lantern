# Troubleshooting

## Nothing shows up

The hooks give up silently when the server isn't there, so a lantern with no moths usually means the app isn't running. Open `~/Applications/Lantern.app`, then send a prompt in any session: its moth should fly in. Quitting the app stops the server, and closing its window doesn't.

To check the server directly, open <http://127.0.0.1:7717>. If that loads but sessions never appear, check that `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`) has hooks ending in `#lantern`, and run the installer again if not. Sessions started before the install pick up the hooks once they're restarted.

## macOS asks again whether Lantern can control iTerm2 or Terminal

An app signed on your own Mac counts as a new app each time it's built, so after the installer or `app/build.sh` rebuilds Lantern, macOS asks again the next time you click a moth. Allow it. If you clicked Don't Allow, turn Lantern back on in System Settings > Privacy & Security > Automation.

## Port 7717 is taken

While something else holds the port, the app keeps trying every few seconds and shows whatever answers there. To see what's holding it:

```bash
lsof -i :7717
```

To move Lantern to another port, run the installer with `LANTERN_PORT` set. It points the hooks, the iTerm2 panel and the screensaver at the new port:

```bash
LANTERN_PORT=7718 node lantern/install.js
```

## macOS won't open the downloaded app

The prebuilt `Lantern.zip` isn't signed with a paid Apple developer ID. Open it once, click Done, then click Open Anyway in System Settings > Privacy & Security. [Setup](setup.md#download-the-app-instead) has the steps. Installing with the installer avoids this, because an app built on your Mac isn't quarantined.

## Claude Code complains about the hooks

The installer registers hooks for newer events such as `PermissionRequest`, `StopFailure` and `PostCompact`. A much older Claude Code may not know them and reject the settings file. Update Claude Code (Lantern is tested with 2.1.302). To take the hooks back out in the meantime, run `node lantern/install.js uninstall`.

## A landed moth's card is thin, with no "You:" line

The card's "You:" line comes from a `**You:**` line in a status footer, if your sessions write one. Without it, the card falls back to the last paragraph of the session's final message, and any sentence ending in "?" counts as a question. For a sharper card, ask Claude in your CLAUDE.md to end each turn with a footer that has a `**You:**` line saying what you need to do next, and `**Blocker:**` for questions that stop the work.
