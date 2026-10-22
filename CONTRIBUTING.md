# Contributing to Lantern

Thanks for pitching in. Small, focused pull requests are the easiest to review, and CI type-checks and tests each one.

## How it fits together

Claude Code's hooks send every session event to a small server inside Lantern.app. The server tracks sessions and subagents and streams them to the page over Server-Sent Events, and the page animates an inline SVG over a WebGL background.

| Where | What |
|---|---|
| `index.html` | The page's markup and styles, and Vite's entry. It loads `src/main.ts`. |
| `src/main.ts` | The entry: it loads `wiring.ts` (the scene), then `expose.ts`, which puts the modules on `window.lanternModules` for the snapshot fixture and the console, then mounts the Vue chrome. |
| `src/wiring.ts` | The wiring: the event stream from the server, the controls, and the animation clock. |
| `src/scene/*.ts` | One ES module per part of the scene (moths, lanterns, fireflies, the card, stats and so on), each importing what it uses. |
| `src/types.ts` | The domain types (sessions, PRs, settings, `/stats`, moths and their hover areas), and the guards and parsers that check the server's JSON where it arrives (`wiring.ts`, `events.ts`), so nothing per frame checks it again. |
| `src/scene/live.ts` | The state more than one module writes, in one plain object: what the server sends, the settings, the moths, the hovered moth. Whatever only one module writes stays in that module. |
| `src/dev.ts` | The dev panel's controls. |
| `public/` | The icons, copied to `dist/` untouched. |
| `vite.config.mts`, `tsconfig*.json` | The Vite and Vitest config, and the TypeScript projects: Node scripts (`tsconfig.json`) and `src/` (`tsconfig.app.json`, strict, with the page's globals in `src/globals.d.ts`). |
| `app/Server.swift` | The server: state, hook events, the HTTP and SSE plumbing. |
| `app/Transcripts.swift` | Reading hook payloads and transcripts, and rebuilding sessions from them. |
| `app/Terminals.swift` | Finding a session's terminal tab and bringing it to the front. |
| `app/GitHub.swift` | GitHub status: PRs, accounts and sign-in. |
| `app/Stats.swift` | The event log behind the stats panel. Its schema is described at the top of the file. |
| `app/main.swift` | The app's window, Dock badge and login item. |
| `screensaver/`, `iterm/` | The screensaver and the iTerm2 toolbelt panel. Both show the page served by the app. |
| `scripts/` | `npm run preview` and `npm run snapshots`, and `serve.js`, which builds the page and serves it for the snapshots and the morph test. |
| `install.js` | The installer: hooks, building the page, the app and the screensaver, the iTerm2 panel. |
| `fake.js` | Plays every lantern state without real sessions, on a throwaway lantern (see below). |
| `test/` | The tests and the snapshots (see below). |

On startup, the server rebuilds your open sessions from their transcripts in `~/.claude/projects` (or under `CLAUDE_CONFIG_DIR`), so a restart doesn't lose them.

## Building the page

Vite builds the page into `dist/`, which isn't committed. It needs Node 20.19 or 22.12 and up.

```bash
npm install
npm run build
```

`install.js` runs both when you install from a checkout. Lantern.app then serves `dist/` and keeps it built: it runs `vite build --watch` in that checkout, so a saved change rebuilds within a second or two and every open window reloads. If a build fails, the last good `dist/` keeps being served and the error lands in the app's log. The app doesn't run `npm install` itself, so after a pull that changes `package-lock.json`, run `install` (or `npm install`) in that checkout.

## Work in a worktree

Lantern.app serves the page straight from the checkout you installed from. Edit that checkout and your live lantern changes under you mid-edit. Work in a separate worktree instead:

```bash
git worktree add ../lantern-my-change -b my-change
npm install
```

## Previewing a change

To try a branch with your real sessions, PRs and session text, run this in its worktree:

```bash
npm run preview
```

It builds the branch's server without the app's window, hands it a copy of your settings, PR cache and stats from `~/Library/Application Support/Lantern`, and prints a URL on a spare port. That URL is a Vite dev server, which serves the page and passes the server's endpoints (`/events`, `/settings`, `/snooze` and the rest) on to it. Page options go after `--`, as in `npm run preview -- style=chochin`. Edits to the page reload it by themselves. After changing `app/`, stop it with Ctrl-C and run it again.

The preview reads `~/.claude` and never writes there. Settings you change in it stay in its copy, which is deleted when it stops. Three things do reach the outside world: it polls GitHub on its own while it runs, clicking a moth really does bring that session's terminal to the front, and snoozing, sleeping or waking a moth changes it in the app. Claude Code's hooks only talk to the app, so while the app is running the preview shows the app's sessions, as the app sends them, and a snooze goes to the app too (one the app doesn't answer fails). If the app quits, the preview keeps showing its last sessions until the app is back. A preview started while the app is closed finds sessions once from their processes and transcripts, they don't change after that, and it doesn't start following the app when the app opens. It does not subscribe to lantern-pr unless you start it with `LANTERN_PR_URL` set.

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

`npm run check` runs `vue-tsc` over two projects: the Node scripts and the TypeScript in `src/`.

`npm test` runs Node's built-in test runner over `test/*.test.js`, then Vitest over `test/*.spec.js` (with happy-dom). The page's tests are Vitest ones: they import what they test from `src/`, over index.html's markup, which `test/setup.js` lays out before each file (`test/page.js` also stands in for WebGL). A test that needs a page of its own calls `layOut()` and `vi.resetModules()`, then imports `src/` again. New tests go in `.spec.js` files. It needs macOS, because it builds the Swift server with `swiftc`. `test/server.test.js` runs the server without its window on a spare port, with a temporary home folder of its own, and replays the hook events in `test/replay/`. Each replay file is a list of requests to send, plus `expect` steps holding the sessions the page should have by that point.

`test/saver.test.js` builds the screensaver and loads it in an off-screen window (`test/saver/main.swift`) to check it stops its page and quits when macOS ends the screensaver. That posts macOS's own "screensaver ended" notification to the whole Mac, so the test skips itself while a screensaver is running.

`test/morph.test.js` builds the page, serves it over http and loads it the same way (`test/morph/main.swift`) to check that a redraw of the card keeps keyboard focus, scroll, the element under the pointer and a press mid-click, since only a real browser has those.

When you change what the server does on purpose, `UPDATE=1 npm test` rewrites the `expect` steps to match. Read the diff before you commit it. If the server needs a new Swift file, add it to the `swiftc` lists in `app/build.sh` and `test/server.test.js`.

### Fixing a session-state bug

A session's state is decided in one place. Handlers and seeding only record facts (the turn, its background tasks and agents), `derive()` in `app/Server.swift` works out the state from them, and `check()` settles events that don't say what the session is doing by looking at Claude Code's status file, the live agents and tasks, and the transcript. So a state bug gets fixed there, with a test:

1. Capture the real case as a fixture under `test/fixtures/`: the transcript lines, status files and hook payloads that produced it. Sanitize them and redact free text.
2. Write a test that replays the fixture and fails on the current code.
3. Fix it by recording a new fact or by changing `derive()` or `check()`. Never set `state` in a handler. `test/state-writes.test.js` fails if you do.
4. Mutation-check the test: break the line the fix guards, confirm the test fails, then put it back.
5. Get an independent audit before you merge.

The zombie and jwt tests in `test/server.test.js` (fixtures in `test/fixtures/zombie` and `test/fixtures/jwt`) are the model.

### Snapshots

```bash
npm run snapshots
```

This checks that the page still looks the same. It builds the page, serves the build over http, and renders a few scenes of it in WebKit and compares them pixel by pixel with the pictures in `test/snapshots/`: each lantern, the second screen's ambient view, a hover card, and the chrome (the settings menu with its help open, the stats panel, a recap, a card and the dev panel) at full width, a phone's width (375) and the iTerm2 panel's (300). A wider window (1100) docks two sessions in the pinned sidebar, and checks the scene refitted to the room left beside it. The chrome scenes read a made-up stats log from the fixture's `statsLog`. The scenes are deterministic, with a seeded `Math.random`, a clock that only moves when the script steps it, and a made-up event stream (`test/snapshots/fixture.js`) that has sessions in every state, every PR colour, satellites, subagents, review fireflies, stale wisps and ghosts, and session text on the barrel. The candle's scene also catches a scorched moth. The fixture moves its wall clock so sess-alpha touches the flame half a second before the last picture, and picks a scorch where the candle's smoke is 2 to 3.5 seconds into its curl then. WebKit runs in a window that is never shown, so nothing pops up or takes focus.

Run it before and after a change that shouldn't change what you see, like a refactor or a speedup. When a scene differs, it says how many pixels, and writes the new picture and a diff (the differences in red) to `test/snapshots/out/`. When you change the look on purpose, refresh the pictures, then look at them before you commit:

```bash
npm run snapshots -- --update
```

It needs macOS, so it isn't part of `npm test` or CI. The pictures were made on a Retina Mac, and a Mac with a different screen may draw a few pixels differently. If a scene fails before you've changed anything, run `--update` on main first and compare against that.

CI ([`.github/workflows/check.yml`](.github/workflows/check.yml)) runs the build, the type check and the tests on every pull request and push to main, and makes sure the app and the screensaver compile.

## Design tokens

The page has two kinds of look. The **UI chrome** (the footer, settings menu, cards, stats panel, recap, tips, dev panel and the badge's flash pill) is one design, and takes every colour, space, radius, type size, shadow and layer from the custom properties in index.html's `:root`. The **scene art** (the lantern drawings, moths, fireflies, wisps, smoke and the shaders) keeps its own palettes in the scene modules, because each tone is tuned against its neighbours in the drawing.

In UI CSS, write `var(--space-2)`, never `8px`, and `var(--ink-dim)`, never `#8F7FA6`. If nothing fits, add a token here and in `:root` rather than a one-off value. `test/tokens.spec.js` fails on a raw colour, a px value in spacing, radius, type or shadow, or a bare weight or z-index in UI CSS, in index.html's style attributes outside the scene's SVG, and in the UI modules (`src/dev.ts`, `src/wiring.ts`, and `card`, `github`, `notify`, `recap` and `stats` in `src/scene/`). Rules that predate the tokens are listed in `test/tokens-debt.json`. That list only shrinks: migrate a rule and the test tells you to delete its entry, and a new raw value anywhere fails. A new page module has to be named as UI or scene in the test.

| Group | Tokens |
|---|---|
| Night and surfaces | `--night` page background · `--surface` panels, menus and tips · `--surface-card` hover cards (with `--blur-glass`) · `--surface-raised` inputs and switches · `--surface-selected` a pressed switch · `--line` borders · `--line-soft` dividers |
| Ink | `--ink-strong` headings and values · `--ink-hover` hovered links and controls · `--ink` panel text · `--ink-soft` page text and sub-lines · `--ink-dim` labels · `--ink-faint` unearned and empty things |
| Accents | `--accent-violet` links and icons · `--accent-violet-line` link underlines · `--focus` focus outlines · `--accent` checked controls · `--accent-warm` the stats headline · `--accent-warm-ink` and `--accent-warm-surface` badges · `--warn-ink` warnings |
| Session states | `--state-working`, `--state-waiting`, `--state-snoozed`, `--state-idle`, and the lantern's `--lantern-warm`, `--lantern-violet`, `--lantern-quiet` |
| Hover card | `--state-waiting-chip` the "needs you" pill · `--error-surface` and `--error-ink` the error pill · `--surface-tray` the tray of work under the card · `--agents-surface`, `--agents-line`, `--agents-ink`, `--agents-ink-dim` the running agents' band, and the "waiting on agents" pill |
| PR needs | `--pr-ready`, `--pr-failing`, `--pr-changes`, `--pr-draft`, `--pr-in-review`, `--pr-review` (a review asked of you), `--pr-mention` |
| Spacing | `--space-0-5` 2px · `--space-1` 4px · `--space-1-5` 6px · `--space-2` 8px · `--space-3` 12px · `--space-4` 16px · `--space-5` 24px · `--space-6` 32px |
| Radius | `--radius-sm` 3px · `--radius-md` 6px controls · `--radius-lg` 10px panels and cards · `--radius-pill` |
| Type | `--font-serif` (Georgia) · `--font-mono` · `--text-xs` 11px labels · `--text-sm` 12.5px panel text · `--text-md` 14px · `--text-lg` 16px values · `--text-xl` 20px · `--text-display` 40px · `--weight-regular` and `--weight-bold` (Georgia has no other faces) · `--leading` · `--tracking-label` |
| Elevation and motion | `--shadow-lg` · `--rim` a swatch's pale rim · `--blur-glass` · `--z-tip`, `--z-flash`, `--z-overlay` · `--fade` · `--slide` the pinned sidebar opening · `--faded` the opacity of something unavailable or ended |
| Layout | `--dock-width` the pinned sidebar |

**Button bars:** the bar's padding belongs to its buttons. Each control is an outer button or link that fills its zone, out to the bar's edges and up to its neighbours, so the hit areas touch with no dead space. Where it has a visible part bigger than its content (a pill, a hover tint), that's a `.face` inside it, the size it would be anyway, lit with `button:hover .face` or `a:hover .face` wherever the pointer is in the zone. A control that's only an icon or text (the PR toggle) just takes the hover colour. The hover card's header, rows, chips and toggle work this way.

The session-state and PR colours are drawn by the scene too, so they live in two places: `:root`, and `MOTHS`, `RIBBON` and `WARM` (stats.ts and lanterns.ts) and `FLY` (fireflies.ts), where the scene blends them. The test fails if the two disagree, so change both together.

## Adding a terminal

Each terminal needs its own way of bringing a session forward. The hook already sends `TERM_PROGRAM`, the terminal app's bundle id and a few terminal-specific ids with every event (see `COMMAND` in `install.js`). Add a case for your terminal next to the others in `focusElsewhere` in `app/Terminals.swift`, and a row to the table in [docs/setup.md](docs/setup.md#terminals-and-click-to-focus).

## Writing docs and UI text

Keep it plain and friendly, and leave em dashes out of docs and UI copy. The [README](README.md) stays short, so new detail goes in [docs/guide.md](docs/guide.md) or [docs/setup.md](docs/setup.md).
