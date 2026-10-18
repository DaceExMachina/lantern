# Portability audit

What only works on the original author's setup, and how to make each piece work for anyone. From an audit on 2026-10-17. File and line references are from that day: the page has since been split into `page/*.js`, so `index.html` line numbers for page logic have moved.

Severity is how bad it is for a stranger installing Lantern: **H** (broken or empty), **M** (degraded), **L** (cosmetic or rare). `Server.swift` means `app/Server.swift`; `server.js` repeats most of its logic.

## Known going in

| # | What | Where | Sev | Generic fix |
|---|---|---|---|---|
| K1 | Supervisor agents are agents whose type matches `/supervisor/i` (the author's `opus-supervisor` naming). Everyone else's agents render as small moths. | page state (`makeSubMoth` callers), `fake.js` | M | Detect it: an agent that spawns its own agents is a supervisor (hooks carry `agent_id` on nested events). Or a `supervisorPattern` setting. |
| K2 | The card's "You:" line and questions parse a CLAUDE.md status footer (`**You:**`, `**Blocker:**`). | `Server.swift` (forYou parsing), `server.js` | M | Without a `**You:**` line, fall back to the last paragraph of the final message (about 200 characters). Keep the `?` question detection. Optional `youPattern` setting; document the footer as optional. |
| K3 | Click to focus works only in iTerm2: the hook sends `ITERM_SESSION_ID` and the server drives iTerm with AppleScript, guessing tabs by the `(claude)` title suffix. | `install.js` hook command, `Server.swift` focus and tab lookup, `server.js` | H | A focus strategy per terminal, from env vars the hook sends (`TERM_PROGRAM`, `$TTY`, `$PPID`): Terminal.app by tty, Ghostty, WezTerm and kitty through their CLIs, VS Code by activating the app or a `vscode://` URI, the Claude desktop app by opening it. Otherwise activate the terminal app found from the pid's ancestors, or say in the card that it can't. |
| K4 | `gh` lookup prefers `~/.local/bin/gh` (the author's per-folder account wrapper). | `Server.swift`, `server.js` | L | `LANTERN_GH` (also in the settings file, since the app can't see shell env), then `command -v gh` through a login shell, then Homebrew. Document per-folder accounts as a feature. |
| K5 | Quiet hours end at a hardcoded 8am. | page (quiet button, help text) | M | `quietEnd` setting (default 08:00), optional quiet start; use it in all strings. |
| K6 | macOS only: app, screensaver, Keychain, AppleScript, launchd; the installer refuses other platforms. | everywhere | H off Mac | Document it. A cheap Linux path: the page plus `server.js` under systemd, token from `gh auth token` or an env var. |

## Claude Code integration (version-sensitive)

| What | Where | Sev | Fix |
|---|---|---|---|
| 13 hook events are registered, including `PermissionRequest`, `StopFailure`, `PostCompact`, plus `async: true`. An older Claude Code may reject unknown events, and a rejected settings file can stop hooks loading. | `install.js` | H | Document a minimum version, check `claude --version`, skip events the version doesn't know. |
| Undocumented hook fields are read (`background_tasks`, `last_assistant_message`, `agent_id`, `agent_type`, `notification_type`, `trigger`, `permission_mode`), some matched exactly (`agent_needs_input`, `idle_prompt`). | `Server.swift` hook handling | M | Reads already degrade to nothing (wrong state, not a crash). Log unknown values; document the tested version range. |
| Transcript format assumptions: `turn_duration`, `isCompactSummary`, `compact_boundary`, `<task-notification>`, `aiTitle`/`customTitle`, `custom-title.json`, `subagents/agent-*.meta.json`, `tool_use`/`tool_result` shapes. | `Server.swift` seeding | M | Only restart re-seeding and titles depend on them. One "transcript adapter", and a notice when parsing finds nothing. |
| The config dir is hardcoded to `~/.claude`; `CLAUDE_CONFIG_DIR` is ignored. | `Server.swift`, `install.js`, `server.js` | M | Honour `CLAUDE_CONFIG_DIR`, plus a `claudeDir` setting for the app. |
| The project folder name is rebuilt as "non-alphanumerics become dashes" to map processes to transcripts. Matches today's naming, but isn't a contract. | `Server.swift` | M | Prefer the transcript path from hook events; keep the rebuilt name for re-seeding only. |
| Live sessions are found by `ps` `comm == "claude"`. The Claude desktop app's binary shows a long path, so its sessions aren't found on restart; npm-installed `claude` may show as `node` (unverified). | `Server.swift`, `server.js` | M | Match on the basename. Hooks still cover these sessions, so this mainly affects restarts. |
| `cleanPrompt` strips markers from the author's skills and the desktop app. | `Server.swift` | L | Harmless elsewhere; leave it with a comment. |
| `$PPID` is assumed to be the Claude process. Under a wrapper shell the sweep can drop or keep the wrong session. | `install.js`, `Server.swift` sweep | L | Fall back to the timeout path when the pid isn't a `claude` process. |

## GitHub status

| What | Where | Sev | Fix |
|---|---|---|---|
| The GitHub App client id is baked in; no other app or GitHub Enterprise host. | `Server.swift`, `server.js` | L | Keep it as the public default (a device-flow client id isn't a secret); allow `githubClientId` and `githubHost` overrides; document the no-App options. |
| PR detection is github.com only, and PRs made through MCP tools or the web UI are missed. | `Server.swift` | M | Document the limit; optionally make the host a setting. |
| The README says `gh` mode runs `gh pr view` and `gh search prs`, but it runs `gh api graphql`. | `README.md` | L | Fix the README. |
| `gh` mode runs from each session's folder, so the account is whatever `gh` picks there. | `Server.swift` | L | Document it. |

## Installer and paths

| What | Where | Sev | Fix |
|---|---|---|---|
| The launchd plist bakes in `process.execPath`, so with nvm, switching Node versions breaks the server. | `install.js` | M | `/usr/bin/env node` or a stable resolved path; warn when it contains `.nvm`. |
| Logs go to `/tmp/lantern.log`, cleared on reboot. | `install.js` | L | `~/Library/Logs/Lantern.log`. |
| The iTerm toolbelt identifier is `com.dace.lantern`. | `iterm/lantern.py`, `install.js` | L | Rename to `com.lantern.panel` (keep the old label in the cleanup list). |
| Port 7717 is fixed in the app, screensaver and iTerm panel, so changing `LANTERN_PORT` silently breaks them. | `app/main.swift`, `screensaver/LanternView.swift`, `iterm/lantern.py` | M | One source of truth (the data folder's settings), written into the saver and panel by the installer. |
| The saver relies on private WebKit switches and the legacy screensaver sandbox; no tested macOS versions are listed. | `screensaver/LanternView.swift` | M | Document tested versions. |
| The login item is only registered when the app lives under `/Applications/`. | `app/main.swift` | L | Fine; document it. |
| The release zip is Apple silicon only (source builds work on Intel). | `README.md`, `app/build.sh` | L | Build a universal binary, or say so. |
| Without Xcode command line tools the installer silently drops the app, saver and iTerm panel. | `install.js` | M | List what was skipped in the end-of-install summary. |
| README examples assume `~/projects/lantern`. | `README.md` | L | Use `<clone-dir>`. |

## Locale and timing

| What | Where | Sev | Fix |
|---|---|---|---|
| English only: footer, help text, the `?` question test (a full-width `？` doesn't count), `Blocker:`. Quiet hours use local time, which is right. | page, `Server.swift` | L | Document; optionally accept `？`. |
| A seeded session only comes back if its transcript moved in the last 15 minutes; unconfirmed ones expire after 20. | `Server.swift` | L | Settings candidates. |

## Proposed settings

In `settings.json` in the data folder, next to `style`, `github`, `quietUntil` and `snoozedForGood`.

| Setting | Default | In the menu? |
|---|---|---|
| `quietEnd` (and optional `quietStart`) | `08:00` | Yes, a time picker |
| `supervisorPattern` | `supervisor\|orchestrat` | Advanced |
| `youPattern` | `**You:**` | Advanced, or a "Parse a status footer" toggle |
| `terminal` | auto (from `TERM_PROGRAM`) | Yes: "Click opens: iTerm2 / Terminal / Ghostty / WezTerm / VS Code / none" |
| `port` | 7717 | Config only, written everywhere by the installer |
| `claudeDir` | `~/.claude` (or `CLAUDE_CONFIG_DIR`) | Config only |
| `ghPath`, `githubHost`, `githubClientId` | autodetect, `github.com`, built in | Config only |
| `expireMinutes`, `seedRecentMinutes` | 20, 15 | Config only |

## Suggested order

1. K3, a terminal focus strategy (the biggest gap for anyone not on iTerm2).
2. K2, the footer fallback for the hover card.
3. One source for the port, and the settings file above.
4. A "Works with" section in the README, once the above lands, so it describes what ships.
