# Troubleshooting

## Nothing shows up

An empty lantern usually means the app isn't running, because the hooks give up silently when there's no server to talk to. Open `~/Applications/Lantern.app` and send a prompt in any session, and its moth should fly in. Closing the app's window leaves the server running, but quitting the app stops it.

To check the server directly, open <http://127.0.0.1:7717>. If that loads but sessions never show up, look in `~/.claude/settings.json` (or the one in `CLAUDE_CONFIG_DIR`) for hooks ending in `#lantern`. No hooks? Run the installer again. Sessions that were already running when you installed only pick up the hooks after a restart.

## macOS asks again whether Lantern can control iTerm2 or Terminal

macOS treats an app signed on your own Mac as a new app every time it's rebuilt. So after the installer or `app/build.sh` rebuilds Lantern, the next click on a moth brings the question back. Allow it. If you clicked Don't Allow, switch Lantern back on in System Settings > Privacy & Security > Automation.

## Port 7717 is taken

While something else holds the port, the app retries every few seconds and shows whatever answers there in the meantime. To find the culprit:

```bash
lsof -i :7717
```

To move Lantern instead, run the installer with `LANTERN_PORT` set. It points the hooks, the iTerm2 panel and the screensaver at the new port:

```bash
LANTERN_PORT=7718 node lantern/install.js
```

## macOS won't open the downloaded app

The prebuilt `Lantern.zip` isn't signed with a paid Apple developer ID, so macOS balks the first time. Open it once, click Done, then click Open Anyway in System Settings > Privacy & Security. [Setup](setup.md#download-the-app-instead) walks through it. The installer avoids this altogether, because macOS doesn't quarantine an app built on your own Mac.

## Claude Code complains about the hooks

The installer registers hooks for newer events such as `PermissionRequest`, `StopFailure` and `PostCompact`, and a much older Claude Code may reject a settings file that mentions them. Update Claude Code (Lantern is tested with 2.1.302). Until you can, `node lantern/install.js uninstall` takes the hooks back out.

## A landed moth's card is thin, with no "You:" line

The card's "You:" line comes from a `**You:**` line in a status footer, if your sessions write one. Without a footer, the card falls back to the last paragraph of the session's final message and counts any sentence ending in "?" as a question. For a sharper card, add a line to your CLAUDE.md asking Claude to end each turn with a footer: a `**You:**` line saying what you need to do next, and `**Blocker:**` for questions that stop the work.
