# Lantern guide

What everything on screen means. Installing and settings live in [setup](setup.md).

- [Moths and the lantern](#moths-and-the-lantern)
- [Cards, clicks and snooze](#cards-clicks-and-snooze)
- [Fireflies and stale PRs](#fireflies-and-stale-prs)
- [Session text on the barrel](#session-text-on-the-barrel)
- [Picking a lantern](#picking-a-lantern)
- [Stats, goals, badges and the recap](#stats-goals-badges-and-the-recap)
- [Quiet hours](#quiet-hours)
- [The app](#the-app)

## Moths and the lantern

The flame grows brighter with every session that's working, and five or more lights it fully.

Each big moth is a session. It keeps its own patch of the dark, trails a thread of light back to the lantern, and its wingbeat drifts between a top-down and a side view. Small moths are subagents, circling the session that started them. Supervisor agents fly a size up: any agent type matching `supervisor` or `orchestrat`, or your own `supervisorPattern` (see [settings](setup.md#settings)).

Side sessions orbit their parent. When the Claude desktop app starts one session from another, the new one flies as a slightly smaller, untethered satellite around its parent's moth. While the parent is alive, the side session reports to it instead of to you. So when it finishes, it keeps orbiting, its card says "reported back", and it never turns the lantern violet. The parent's card lists its side sessions alongside its agents.

When a session needs you, its moth lands on the lantern, folds its wings and turns indigo, and the flame, paper and glow all shift to violet. A session that's only waiting on its own background agents stays in the air. If it also asked you something, it lands.

Landed moths get fidgety. Now and then one takes a slow breath, opening its wings and closing them again. After 15 minutes it gets restless and sometimes hops off the paper.

A few smaller things to watch for:

- Threads pulse with a little glow each time a session or one of its agents runs a tool.
- Each project gets a faint tint, slightly different per session, so you can tell moths apart.
- A singed moth (grey, with a dark edge) means the turn ended with an API error.

The scene stretches to fill any window shape, wide, tall or square, and the lantern stays the same size in the middle.

## Cards, clicks and snooze

Hover a session's moth for its card: its name, what it's doing right now, your last prompt, any question it's asking, and what each of its agents is up to. The hover area stays put while the moth wanders, so the card holds still while you read.

A landed session's card says what it needs from you. You get its "You:" line, any links it mentioned (clickable), how many questions it asked, and one line per PR with its state and title. If your sessions end their turns with a status footer, the "You:" line comes from its `**You:**` line. Otherwise it's the last paragraph of the final message. Click the card to open the session.

Click a moth to bring its session to the front: its terminal tab, or the session itself in the Claude desktop app. [Setup](setup.md#terminals-and-click-to-focus) lists what a click does in each terminal. "N need you" in the footer opens whichever session has waited longest, then the next one.

Right-click a waiting moth to snooze it. It rests on the lantern in pale indigo, breathing out the odd z, and stops turning the light violet until the session does something new. Right-click again to snooze it for good, so new activity never wakes it. That's handy for a chat you only drop into now and then. A third right-click wakes it. On a moth that isn't waiting, the first right-click snoozes it for good.

Forgot what something means? "What's what?" at the bottom of the settings menu has the short version of this page.

## Fireflies and stale PRs

Fireflies hang around a session's moth, one for each open PR it owns, up to ten. Hover the cluster and you get the session's card, PRs and all.

A session owns a PR when it, or one of its agents in any worktree, created it with `gh pr create`. It also owns its branch's PR when it's the only session in that folder. Merely mentioning a PR doesn't count. Without GitHub status, a firefly appears when the "You:" line points at one of those PRs.

A moth lands on the slice of the lantern facing its home, so the threads never cross. While it's landed, a dotted line in its thread colour ties it to one of its fireflies back home.

With [GitHub status](setup.md#github-status) on, fireflies show what each PR needs:

| Colour | PR |
|---|---|
| Green | Ready to merge |
| Red, blinking faster | Failing checks |
| Orange | Changes requested |
| Amber | Draft |
| Blue | Waiting on review |

Merged ones drift off. Reviews requested from you hover by the lantern, and the footer links to them.

Stale PRs are your open PRs that no session owns and nobody has touched for a week. They drift low in the scene as wisps, pale ghost fireflies in a washed-out shade of their PR colour. The oldest sit lowest and dimmest, and every so often one slowly brightens and fades again. Up to 30 drift on their own, and the rest gather into a faint cloud with a count. Hover a wisp for what it needs and which session made it, or click to open it. When someone touches the PR again, its wisp rises away.

Ghost moths drift behind the wisps. They're the old sessions that made some of those PRs, when Lantern can still find their transcripts. Hover one to see its dead PRs, or click it to resume that session in a new iTerm2 tab (iTerm2 only, for now).

Stale PRs need GitHub status, and "show stale PRs" in the settings menu hides them.

## Session text on the barrel

On the book-page barrel, paragraphs your sessions wrote wrap round the paper like print on a drum. They squeeze as they turn toward the sides and vanish round the back, on the rows between the wires. A new one fades in every twenty seconds or so and lingers for about a minute, overlapping the others. Some are printed on the inside, mirrored. They read best near the flame.

Only plain sentences make it onto the paper. Lantern drops anything with code, a link or path, a number, a name (a capitalised word past the first), or talk to or about you, and it keeps the words in memory only. Besides the sessions running now, it reads the newest few transcripts when it starts, ended sessions included. With nothing to show, the paper stays blank.

"show session text" in the settings menu turns it off. The words fade out, and Lantern stops reading and keeping them until you turn it back on.

## Picking a lantern

The settings menu (the sliders icon at the bottom right) has three lanterns: the book-page barrel, a round chōchin and a brass Moroccan lantern. Every window, the iTerm2 panel and the screensaver share the choice, so they all switch together. The same menu holds "notify me", the stale PR and session text switches, and GitHub.

## Stats, goals, badges and the recap

The chart button beside the settings button opens your stats, read from the app's event log.

The headline is warm moths: the share of your sessions' time not spent waiting on you. A snoozed wait still counts as waiting. Below it you'll find how long the lantern stayed warm, how quickly you answered, PRs merged and in flight, and stale PRs.

The day ribbon runs from your first session to now in three strips. The top one is the lantern itself: warm, violet, or dim in quiet hours. The middle shows the share of moths flying, warm when they all are and violet when they've all landed. The bottom counts the sessions alive, with the working ones darker. Ticks along the top mark sessions starting, and the week before sits underneath as mini ribbons.

You can set three goals: fireflies in flight at most N, a median answer time within N minutes, and warm moths at least N%. Each stays off until you give it a number, and glows warm while you're on track. Goals live in the shared settings, so every window sees them.

Badges come from the log too: Warm all day, Clear night, Small batches, Revived, Ghostbuster, Séance, Lights Out, warm streaks, Haunted, Restless spirits, Light Pollution, Swarm Season, Hive Mind, Purple Rain, Ghosted and Snooze Button Champion. None of them are sorted into good or bad, so what each one means is up to you. The panel shows this week's, and **All badges** lists every one. Hover or tap a badge for what it is, how to earn it and when you last did. A tap keeps it open.

When you earn a badge, a swarm of fireflies flies in from the sides and packs into a glowing pill near the top with its name, holds for a few seconds, then scatters back out. Click the pill to open the stats panel on that badge. Several badges play one after another. There's no flash in quiet hours or on the screensaver, and the iTerm2 panel shows a smaller one with just the name. To see it without earning anything, open the page with `?demoBadge=hive_mind` (a comma-separated list plays a queue) or run `lanternBadge('hive_mind')` in the console.

The daily recap opens by itself when quiet hours start. If you miss that, it shows up as yesterday's recap the first time you look at the lantern the next day. It opens once a day across all your windows, and never in the iTerm2 panel or the screensaver. You get the day's ribbon, warm moths, lantern warm time, answer time, fireflies merged and left open, how the stale PR count changed, the badges you earned, your warm streak, and the day's sessions as a small constellation, one star per session, bigger the longer it ran. With "notify me" on, it sends a notification too. To see any day of the past week, click it in the stats panel's week, or click **recap** next to Today.

## Quiet hours

"quiet" in the footer snoozes everything on every display until 8am, or your `quietEnd` (see [settings](setup.md#settings)). Click it again to end quiet early.

## The app

The installer puts `Lantern.app` in `~/Applications`. It's a plain window around the page, with the moth as its Dock icon and a badge counting the sessions that need you. It remembers where you left its window, and links open in your default browser. Drag it to your Dock to keep it there.

The server lives inside the app, so there's nothing else to run. Closing the window keeps it running, so the hooks still have somewhere to report and the Dock badge keeps counting. Click the Dock icon to bring the window back. Quitting the app stops the server, and until you open it again the hooks quietly do nothing. It opens at login so the server is up before your first session. You can turn that off in System Settings > General > Login Items.

When the page changes, every Lantern window (the app, the iTerm2 panel, the screensaver) reloads on its own.

Your settings, the GitHub status cache and the stats log (`stats.sqlite`) live in `~/Library/Application Support/Lantern`.
