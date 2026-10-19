# Contributing to Lantern

Thanks for pitching in. Small, focused pull requests are the easiest to review, and CI type-checks and tests each one.

## How it fits together

Claude Code's hooks send every session event to a small server inside Lantern.app. The server tracks sessions and subagents and streams them to the page over Server-Sent Events, and the page animates an inline SVG over a WebGL background.

| Where | What |
|---|---|
| `index.html` | The page's markup and styles. It loads the scripts in `page/`. |
| `page/*.js` | One classic script per part of the scene (moths, lanterns, fireflies, the card, stats and so on). They share globals and load in the order `index.html` lists them, with `main.js` last to wire everything up. |
| `page-globals.d.ts`, `tsconfig.page.json` | Type-check the page scripts as one program, with no build step. |
| `app/Server.swift` | The server: state, hook events, the HTTP and SSE plumbing. |
| `app/Transcripts.swift` | Reading hook payloads and transcripts, and rebuilding sessions from them. |
| `app/Terminals.swift` | Finding a session's terminal tab and bringing it to the front. |
| `app/GitHub.swift` | GitHub status: PRs, accounts and sign-in. |
| `app/Stats.swift` | The event log behind the stats panel. Its schema is described at the top of the file. |
| `app/main.swift` | The app's window, Dock badge and login item. |
| `screensaver/`, `iterm/` | The screensaver and the iTerm2 toolbelt panel. Both show the page served by the app. |
| `scripts/` | `npm run preview` and `npm run snapshots`. |
| `install.js` | The installer: hooks, building the app and screensaver, the iTerm2 panel. |
| `fake.js` | Plays every lantern state without real sessions, on a throwaway lantern (see below). |
| `test/` | The tests and the snapshots (see below). |

On startup, the server rebuilds your open sessions from their transcripts in `~/.claude/projects` (or under `CLAUDE_CONFIG_DIR`), so a restart doesn't lose them.

## Work in a worktree

Lantern.app serves the page straight from the checkout you installed from, and every open window reloads whenever `index.html` or a script in `page/` changes. Edit that checkout and your live lantern changes under you mid-edit. Work in a separate worktree instead:

```bash
git worktree add ../lantern-my-change -b my-change
```

## Previewing a change

To try a branch with your real sessions, PRs and session text, run this in its worktree:

```bash
npm run preview
```

It builds the branch's server without the app's window, hands it a copy of your settings, PR cache and stats from `~/Library/Application Support/Lantern`, and prints a URL on a spare port. Page options go after `--`, as in `npm run preview -- style=chochin`. Edits to `index.html` or `page/` reload the page by themselves. After changing `app/`, stop it with Ctrl-C and run it again.

The preview reads `~/.claude` and never writes there. Snoozes and settings you change in it stay in its copy, which is deleted when it stops. Two things do reach the outside world: it polls GitHub on its own while it runs, and clicking a moth really does bring that session's terminal to the front. Claude Code's hooks only talk to the app, so the preview finds sessions from their processes and transcripts, and a session's state can differ from what the app shows.

To see every lantern state without real sessions, start a throwaway copy of the app on a spare port with an empty data folder of its own, then point `fake.js` at it:

```bash
open -n -a Lantern --env LANTERN_PORT=7718 --env LANTERN_DATA="$(mktemp -d)"
```

```bash
LANTERN_PORT=7718 node fake.js
```

`fake.js` won't run against your real lantern on 7717, because fake sessions would haunt its stats forever.

## Changing the server or the app

After changing anything in `app/`, rebuild and reinstall the app, then quit Lantern and reopen it:

```bash
sh app/build.sh
```

macOS treats every rebuild of an app signed on your own Mac as a new app, so it will ask again whether Lantern may control iTerm2 or Terminal. The screensaver has its own `sh screensaver/build.sh`.

## Checks and tests

```bash
npm install && npm run check && npm test
```

`npm run check` type-checks the JavaScript, both the Node scripts and the page, with TypeScript. There's no build step.

`npm test` uses Node's built-in test runner. It needs macOS, because it builds the Swift server with `swiftc`. `test/server.test.js` runs the server without its window on a spare port, with a temporary home folder of its own, and replays the hook events in `test/replay/`. Each replay file is a list of requests to send, plus `expect` steps holding the sessions the page should have by that point.

When you change what the server does on purpose, `UPDATE=1 npm test` rewrites the `expect` steps to match. Read the diff before you commit it. If the server needs a new Swift file, add it to the `swiftc` lists in `app/build.sh` and `test/server.test.js`.

### Snapshots

```bash
npm run snapshots
```

This checks that the page still looks the same. It renders a few scenes in WebKit and compares them pixel by pixel with the pictures in `test/snapshots/`: each lantern, the second screen's ambient view, and a hover card. The scenes are deterministic, with a seeded `Math.random`, a clock that only moves when the script steps it, and a made-up event stream (`test/snapshots/fixture.js`) that has sessions in every state, every PR colour, satellites, subagents, review fireflies, stale wisps and ghosts, and session text on the barrel. The candle's scene also catches a scorched moth: the fixture moves its wall clock so sess-alpha's scorch lands just before the last picture. WebKit runs in a window that is never shown, so nothing pops up or takes focus.

Run it before and after a change that shouldn't change what you see, like a refactor or a speedup. When a scene differs, it says how many pixels, and writes the new picture and a diff (the differences in red) to `test/snapshots/out/`. When you change the look on purpose, refresh the pictures, then look at them before you commit:

```bash
npm run snapshots -- --update
```

It needs macOS, so it isn't part of `npm test` or CI. The pictures were made on a Retina Mac, and a Mac with a different screen may draw a few pixels differently. If a scene fails before you've changed anything, run `--update` on main first and compare against that.

CI ([`.github/workflows/check.yml`](.github/workflows/check.yml)) runs the type check and the tests on every pull request and push to main, and makes sure the app and the screensaver compile.

## Adding a terminal

Each terminal needs its own way of bringing a session forward. The hook already sends `TERM_PROGRAM`, the terminal app's bundle id and a few terminal-specific ids with every event (see `COMMAND` in `install.js`). Add a case for your terminal next to the others in `focusElsewhere` in `app/Terminals.swift`, and a row to the table in [docs/setup.md](docs/setup.md#terminals-and-click-to-focus).

## Writing docs and UI text

Keep it plain and friendly, and leave em dashes out of docs and UI copy. The [README](README.md) stays short, so new detail goes in [docs/guide.md](docs/guide.md) or [docs/setup.md](docs/setup.md).
