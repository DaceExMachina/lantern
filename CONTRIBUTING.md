# Contributing to Lantern

Thanks for helping. Small, focused pull requests are easiest to review. CI type-checks and tests every one.

## How it fits together

Claude Code hooks send every session event to a small server inside Lantern.app. The server keeps track of sessions and subagents and streams them to the page with Server-Sent Events. The page animates an inline SVG over a WebGL background.

| Where | What |
|---|---|
| `index.html` | The page's markup and styles. It loads the scripts in `page/`. |
| `page/*.js` | One classic script per part of the scene (moths, lanterns, fireflies, the card, stats and so on). They share globals and load in the order `index.html` lists them, with `main.js` last to wire everything up. |
| `page-globals.d.ts`, `tsconfig.page.json` | Type-check the page scripts as one program, with no build step. |
| `app/Server.swift` | The server: hook events, sessions, transcripts, GitHub status, click to focus. |
| `app/Stats.swift` | The event log behind the stats panel. Its schema is described at the top of the file. |
| `app/main.swift` | The app's window, Dock badge and login item. |
| `screensaver/`, `iterm/` | The screensaver and the iTerm2 toolbelt panel. Both show the page served by the app. |
| `install.js` | The installer: hooks, building the app and screensaver, the iTerm2 panel. |
| `fake.js` | Plays every lantern state without real sessions: `node fake.js`. |
| `test/` | The tests (see below). |

When the server starts, it rebuilds the sessions you already have open from their transcripts in `~/.claude/projects` (or under `CLAUDE_CONFIG_DIR`), so a restart doesn't lose them.

## Work in a worktree

Lantern.app serves the page straight from the checkout you installed from, and every open window reloads when `index.html` or a script in `page/` changes. Editing that checkout changes your live lantern mid-edit, so always work in a separate worktree:

```bash
git worktree add ../lantern-my-change -b my-change
```

## Previewing a change

To preview a branch's page with your real sessions and PRs, run the older Node server from the worktree on a spare port, mirroring the app:

```bash
LANTERN_PORT=7718 LANTERN_MIRROR=http://127.0.0.1:7717 node server.js
```

Then open <http://127.0.0.1:7718>. It serves the branch's page and takes everything else live from the app, and snoozes, settings and clicks in the preview go nowhere. This is a stopgap: a preview built on the Swift server is coming and will replace it.

To see every state without real sessions, point `fake.js` at the preview: `LANTERN_PORT=7718 node fake.js`.

## Changing the server or the app

After changing anything in `app/`, rebuild and reinstall the app, then quit Lantern and open it again:

```bash
sh app/build.sh
```

Rebuilding makes macOS ask again whether Lantern can control iTerm2 or Terminal, because an app signed on your own Mac counts as a new app each time it's built. The screensaver has its own `sh screensaver/build.sh`.

## Checks and tests

```bash
npm install && npm run check && npm test
```

- `npm run check` type-checks the JavaScript (the Node scripts and the page) with TypeScript. There's no build step.
- `npm test` uses Node's built-in test runner and needs macOS, because it builds the Swift server with `swiftc`. `test/server.test.js` runs the server without its window on a spare port, with its own temporary home folder, and replays the hook events in `test/replay/`. Each replay file is a list of requests to send, with `expect` steps holding the sessions the page should have by then.
- After changing what the server does on purpose, `UPDATE=1 npm test` rewrites the `expect` steps from what it does now. Read the diff before committing it.
- If the server needs a new Swift file, add it to the `swiftc` lists in `app/build.sh` and `test/server.test.js`.

CI ([`.github/workflows/check.yml`](.github/workflows/check.yml)) runs the type check and the tests on every pull request and push to main, and makes sure the app and the screensaver compile.

## Adding a terminal

Click to focus works per terminal. The hook already sends `TERM_PROGRAM`, the terminal app's bundle id and a few terminal-specific ids with every event (see `COMMAND` in `install.js`). `focusElsewhere` in `app/Server.swift` is where each terminal gets its own way of bringing a session forward: add a case there next to the others, and a row to the table in [docs/setup.md](docs/setup.md#terminals-and-click-to-focus).

## Writing docs and UI text

Keep it plain and friendly, and skip em dashes in docs and UI copy. The [README](README.md) stays short: new detail goes in [docs/guide.md](docs/guide.md) or [docs/setup.md](docs/setup.md).
