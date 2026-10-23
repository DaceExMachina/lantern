# Lantern

A paper lantern for macOS that glows with your Claude Code sessions. Claude Code's hooks post events to a small Swift server inside Lantern.app (`app/`), which streams sessions to a web page (`index.html`, `src/`), which Vite builds into `dist/`, over Server-Sent Events. See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout, previewing and tests.

## Session state

State is decided in one place. Handlers and seeding record facts, `derive()` in `app/Server.swift` works out the state, and `check()` settles unclear events from Claude Code's status file, live agents and tasks, and the transcript. For a state bug, follow "Fixing a session-state bug" in [CONTRIBUTING.md](CONTRIBUTING.md#fixing-a-session-state-bug). `test/state-writes.test.js` fails if code outside `derive()` assigns `state`.

## Setup

- The page is a Vite app in TypeScript. The scene (SVG, WebGL, `frame()`) is plain ES modules in `src/scene/`: `src/main.ts` loads `src/wiring.ts`, which loads them, and state more than one module writes lives in `src/scene/live.ts`. The chrome around it is Vue 3 single-file components in `src/components/` (`<script setup lang="ts">`), reading one Pinia store (`src/stores/lantern.ts`) that `src/events.ts` and the scene's `chrome.update` feed. The scene never imports Vue or Pinia.
- Vite builds the page into `dist/` (not committed), and Lantern.app serves `dist/` and keeps it built with `vite build --watch`. Node 20.19 or 22.12 and up. Vitest runs the page's tests and `vue-tsc` checks the types.
- Run `install` (Dace's wrapper around `npm ci`, or `npm i` when you changed dependencies) in a fresh worktree, and in the main checkout after pulling a change to `package-lock.json`. The app doesn't install dependencies itself, and a failed build keeps serving the last good `dist/`.
- Before a PR, run `npm test`, `npm run check`, `npm run build`, `npm run snapshots` and `swiftc -typecheck app/*.swift`. A PR that changes the look refreshes the pictures with `npm run snapshots -- --update`.
- `npm run preview` serves the branch through a Vite dev server (hot reload), in front of the preview's Swift server.

## Rules

- The main checkout is live: Lantern.app serves the page from it. Work in a git worktree, never edit, commit or switch branches there.
- Never write to Dace's Lantern data or to `~/.claude`. Tests and `npm run preview` use a temp home or a copy of the data folder. While the app runs, snoozing, sleeping or waking a moth in a preview changes the real app, so never do that in a preview that follows the app: QA it on a throwaway app on a spare port instead, as CONTRIBUTING describes for `fake.js`.
- Run headless. Anything you launch must never take focus: `.prohibited` activation policy, an off-screen window that is never ordered front, and an exit within 120 seconds (the existing harnesses in `test/saver/main.swift` and `scripts/snapshots.swift` do this). No visible browser windows. Relaunch the app with `open -g`.
- UI chrome (the footer, menus, cards, stats, recap, tips, dev panel and flash pill) takes its colours, spacing, radii, type, shadows and layers from the design tokens in index.html's `:root`, listed under [Design tokens](CONTRIBUTING.md#design-tokens). No raw hex, `rgb()` or px spacing there: if no token fits, add one to `:root` and to that list, never a one-off value. Scene art (the lanterns, moths, fireflies, wisps, smoke and shaders) keeps its own palettes in `src/scene/*.ts`. `test/tokens.spec.js` enforces both.
- UI: give a button bar's padding to its buttons: hit areas fill the bar and touch, and the hover visual stays the size of the content ("Button bars" in CONTRIBUTING.md).
- TypeScript in `src/` avoids casts: no `as` (except `as const`), non-null `!`, `any`, `@ts-ignore` or `@ts-expect-error`. Narrow with guards, `in`, `instanceof` and validating parsers for server JSON, and prefer generics (`shallowRef<Stats | null>(null)`). Where a cast is the idiom, put `// cast: why` on its line. `test/types-casts.test.js` enforces it.
- Every new test must prove it can fail: break the line it guards, confirm it goes red, then restore it.
- Never load scripts, styles or fonts from a CDN at runtime. Bundle them.
- Never move an element that's already in the page (`appendChild` or `insertBefore` of a connected node) in code that runs again and again. WebKit keeps the old renderer every time, so a move per frame leaks for as long as the element lives (moth wings reordered that way leaked about 700 renderers a minute). Change what fixed elements draw instead. `test/moves.spec.js` checks the scene's frames.
- No em dashes in docs or UI copy.
