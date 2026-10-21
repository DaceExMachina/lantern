# Lantern

A paper lantern for macOS that glows with your Claude Code sessions. Claude Code's hooks post events to a small Swift server inside Lantern.app (`app/`), which streams sessions to a web page (`page/`, `index.html`) over Server-Sent Events. See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout, previewing and tests.

## Session state

State is decided in one place. Handlers and seeding record facts, `derive()` in `app/Server.swift` works out the state, and `check()` settles unclear events from Claude Code's status file, live agents and tasks, and the transcript. For a state bug, follow "Fixing a session-state bug" in [CONTRIBUTING.md](CONTRIBUTING.md#fixing-a-session-state-bug). `test/state-writes.test.js` fails if code outside `derive()` assigns `state`.

## House rules

- The main checkout is live: Lantern.app serves the page from it. Work in a git worktree, never edit, commit or switch branches there.
- Never write to Dace's Lantern data or to `~/.claude`. Tests and `npm run preview` use a temp home or a copy of the data folder. While the app runs, snoozing, sleeping or waking a moth in a preview changes the real app, so never do that in a preview that follows the app: QA it on a throwaway app on a spare port instead, as CONTRIBUTING describes for `fake.js`.
- Run headless. Anything you launch must never take focus: `.prohibited` activation policy, an off-screen window that is never ordered front, and an exit within 120 seconds (the existing harnesses in `test/saver/main.swift` and `scripts/snapshots.swift` do this). No visible browser windows. Relaunch the app with `open -g`.
- UI chrome (the footer, menus, cards, stats, recap, tips, dev panel and flash pill) takes its colours, spacing, radii, type, shadows and layers from the design tokens in index.html's `:root`, listed under [Design tokens](CONTRIBUTING.md#design-tokens). No raw hex, `rgb()` or px spacing there: if no token fits, add one to `:root` and to that list, never a one-off value. Scene art (the lanterns, moths, fireflies, wisps, smoke and shaders) keeps its own palettes in `page/*.js`. `test/tokens.test.js` enforces both.
- UI: give a button bar's padding to its buttons: hit areas fill the bar and touch, and the hover visual stays the size of the content ("Button bars" in CONTRIBUTING.md).
- Before a PR, run `npm test`, `npm run check`, `npm run snapshots` and `swiftc -typecheck app/*.swift`. A PR that changes the look refreshes the pictures with `npm run snapshots -- --update`.
