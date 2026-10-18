# Lantern guide

What everything on screen means. For installing and settings, see [setup](setup.md).

- [Moths and the lantern](#moths-and-the-lantern)
- [Cards, clicks and snooze](#cards-clicks-and-snooze)
- [Fireflies and stale PRs](#fireflies-and-stale-prs)
- [Session text on the barrel](#session-text-on-the-barrel)
- [Picking a lantern](#picking-a-lantern)
- [Stats, goals, badges and the recap](#stats-goals-badges-and-the-recap)
- [Quiet hours](#quiet-hours)
- [The app](#the-app)

## Moths and the lantern

- **The flame and glow** grow brighter with every working session. Five or more is fully lit.
- **Big moths are sessions.** Each one has its own spot in the dark, a thread of light back to the lantern, and a wingbeat that drifts between a top-down and a side view.
- **Small moths are subagents** circling the session that started them. Supervisor agents are a size up: agent types matching `supervisor` or `orchestrat`, or your own `supervisorPattern` (see [settings](setup.md#settings)).
- **Side sessions orbit their parent.** A session the Claude desktop app started from another session flies as a satellite around that session's moth, a little smaller and untethered. While its parent is alive it reports back to the parent, not to you: when it finishes it keeps orbiting (its card says "reported back") and never turns the lantern violet. The parent's card lists its side sessions like its agents.
- **A moth that needs you lands on the lantern**, folds its wings, and turns indigo. The flame, paper and glow all shift to violet.
- **Waiting on agents isn't the same as waiting on you.** A session whose turn ended while its background agents keep running stays in the air. If it also asked you something, it lands.
- **Landed moths grow restless.** Now and then one takes a slow breath while it waits, opening its wings and closing them again. After 15 minutes it grows restless and sometimes hops off the paper.
- **Threads pulse** with a little glow each time a session or one of its agents runs a tool.
- **Each project gets a faint tint**, a little different per session, so you can tell moths apart at a glance.
- **A singed moth** (grey, with a dark edge) means the turn ended with an API error.
- **Any window shape works.** The scene stretches to fill wide, tall or square windows, and the lantern stays the same size in the middle.

## Cards, clicks and snooze

- **Hover a session's moth** for its name, what it's doing right now, your last prompt, the question it's asking, and what each of its agents is working on. The hover area stays put while the moth wanders, so the card holds still.
- **A landed session's card says what it needs from you**: its "You:" line, the links it mentioned (clickable), how many questions it asked, and one line per PR with its state and title. The "You:" line is a `**You:**` line from a status footer if your sessions write one, otherwise the last paragraph of the final message. Clicking the card opens the session.
- **Click a moth** to bring that session to the front: its terminal tab, or the session itself in the Claude desktop app. [Setup](setup.md#terminals-and-click-to-focus) lists what a click does in each terminal.
- **"N need you"** in the footer opens whichever session has waited longest, then the next.
- **Right-click a waiting moth** to snooze it. It rests on the lantern in pale indigo, now and then breathing out z's, and stops turning the light violet until the session does something new. Right-click again to snooze it for good, so new activity never wakes it (handy for a chat you only drop into now and then), and once more to wake it. Right-clicking a moth that isn't waiting snoozes it for good straight away.
- **Forgot what something means?** "What's what?" at the bottom of the settings menu has a short version of this guide.

## Fireflies and stale PRs

- **Fireflies** hang around a session's moth, one per open PR it owns (up to ten). Hovering the cluster shows the session's card too, PRs and all.
- **Which PRs count:** the ones the session (or one of its agents, in any worktree) created with `gh pr create`, plus its branch's PR when it's the only session in that folder. A PR it only mentions never counts. Without GitHub status, a firefly appears when the "You:" line points at one of those.
- **Landed moths keep in touch.** A moth lands on the slice of the lantern facing its home, so the lines never cross. While it's landed, a dotted line in its thread colour ties it to one of its fireflies back home.
- **With GitHub status on**, fireflies show what each PR needs: green is ready to merge, red (blinking faster) is failing checks, orange is changes requested, amber is a draft, and blue is waiting on review. Merged ones drift off. Reviews requested from you hover by the lantern, and the footer links to them. [Setup](setup.md#github-status) explains how to turn it on.
- **Stale PRs drift as wisps**, low in the scene. They're your open PRs that no session owns and nobody has touched for a week, shown as pale ghost fireflies in a washed-out shade of their PR colour. The oldest drift lowest and dimmest, and now and then one slowly brightens and fades again. Up to 30 drift, and the rest gather into a faint cloud with a count. Hover one for what it needs and which session made it, and click to open it. When one gets touched again, it rises away.
- **Ghost moths** drift behind the wisps: the old sessions that made some of them, when Lantern can still find their transcripts. Hover one for its dead PRs, or click it to resume that session in a new iTerm2 tab (iTerm2 only for now).
- Stale PRs need GitHub status, and "show stale PRs" in the settings menu turns them off.

## Session text on the barrel

On the book-page barrel, paragraphs your sessions wrote wrap round the paper like print on a drum. They squeeze as they turn toward the sides and vanish round the back, on the rows between the wires. A new one fades in every twenty seconds or so, lingers for about a minute and fades out, overlapping the others. Some are printed on the inside, mirrored. They read best near the flame.

Only plain sentences make it. Anything with code, a link or path, a number, a name (a capitalised word past the first) or talk to or about you is dropped, and the words are only held in memory. Besides the sessions running now, Lantern reads the newest few transcripts when it starts, ended sessions too. With nothing to show, the paper stays blank.

Turn it off with "show session text" in the settings menu. The words fade out, and Lantern stops reading and keeping them until you turn it back on.

## Picking a lantern

The settings menu (the sliders icon at the bottom right) offers three lanterns: the book-page barrel, a round chōchin, and a brass Moroccan lantern. The choice is shared, so every window, the iTerm2 panel and the screensaver switch together. The same menu holds "notify me", the stale PR and session text switches, and GitHub.

## Stats, goals, badges and the recap

**Stats** (the chart button beside the settings button) shows how your day is going, read from the app's event log.

- **Warm moths** is the headline: the share of your sessions' time not spent waiting on you. A snoozed wait still counts as waiting.
- Below it are how long the lantern stayed warm, how quickly you answered, PRs merged and in flight, and stale PRs.
- **The day ribbon** runs from your first session to now in three strips: the lantern (warm, violet, or dim in quiet hours), the share of moths flying (warm when they all are, violet when they've all landed), and how many sessions were alive, with the working ones darker. Ticks along the top mark sessions starting. The week before sits underneath as mini ribbons.
- **Goals:** fireflies in flight at most N, a median answer time within N minutes, and warm moths at least N%. Each is off until it has a number, and glows warm when you're on track. Goals live in the shared settings, so every window sees them.
- **Badges** come from the log too: Warm all day, Clear night, Small batches, Revived, Ghostbuster, Séance, Lights Out, warm streaks, Haunted, Restless spirits, Light Pollution, Swarm Season, Hive Mind, Purple Rain, Ghosted and Snooze Button Champion. They aren't sorted into good or bad, so what each one means is up to you. The panel shows this week's, and **All badges** lists every one. Hover or tap a badge for what it is, how to earn it, and when you last did (a tap keeps it open).

**The daily recap** opens by itself when quiet hours start, or as yesterday's recap the first time you look at the lantern the next day, whichever comes first. It opens once per day across every window, and never in the iTerm2 panel or the screensaver. It shows the day's ribbon, warm moths, lantern warm time, answer time, fireflies merged and left open, the stale PR change, the badges earned that day, your warm streak, and the day's sessions as a small constellation (one star per session, bigger the longer it ran). With "notify me" on, it sends a notification too. Click a day in the stats panel's week, or **recap** next to Today, to see any day of the past week.

## Quiet hours

**"quiet"** in the footer treats everything as snoozed until 8am, or your `quietEnd` (see [settings](setup.md#settings)), on every display. Click it again to end quiet early.

## The app

The installer puts `Lantern.app` in `~/Applications`. It's a plain window around the page, with the moth as its Dock icon and a badge counting the sessions that need you. It remembers where you left its window, and links open in your default browser. Drag it to your Dock to keep it there.

- **The server is part of the app**, so there's nothing else to run.
- **Closing the window keeps Lantern running**, so the hooks still have a server and the Dock badge keeps counting. Click the Dock icon to bring the window back.
- **Quitting the app stops the server.** Until you open it again, the hooks quietly do nothing.
- **It opens at login**, so the server is there before your first session. Turn that off in System Settings > General > Login Items.
- **Open windows update themselves.** When the page changes, every Lantern window (the app, the iTerm2 panel, the screensaver) reloads on its own.
- **Your data** (settings, the GitHub status cache and the stats log, `stats.sqlite`) lives in `~/Library/Application Support/Lantern`.
