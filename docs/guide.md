# Lantern guide

What everything on screen means. Installing and settings live in [setup](setup.md).

- [Moths and the lantern](#moths-and-the-lantern)
- [Cards, clicks and snooze](#cards-clicks-and-snooze)
- [Fireflies and stale PRs](#fireflies-and-stale-prs)
- [Session text on the paper](#session-text-on-the-paper)
- [Picking a lantern](#picking-a-lantern)
- [Stats, badges and the recap](#stats-badges-and-the-recap)
- [Quiet hours](#quiet-hours)
- [The app](#the-app)

## Moths and the lantern

The flame grows brighter with every session that's working, and five or more lights it fully.

Each big moth is a session. It keeps its own patch of the dark, trails a thread of light back to the lantern, and its wingbeat drifts between a top-down and a side view. Small moths are subagents, circling the session that started them. Supervisor agents fly a size up: any agent type matching `supervisor` or `orchestrat`, or your own `supervisorPattern` (see [settings](setup.md#settings)).

Side sessions orbit their parent. When the Claude desktop app starts one session from another, the new one flies as a slightly smaller, untethered satellite around its parent's moth. While the parent is alive, the side session reports to it instead of to you. So when it finishes, it keeps orbiting, its card says "reported back", and it never turns the lantern violet. The parent's card lists its side sessions alongside its agents.

When a session needs you, its moth lands on the lantern, folds its wings and turns indigo, and the flame, paper and glow all shift to violet. A session that's only waiting on its own background agents stays in the air. If it also asked you something, it lands.

Landed moths get fidgety. Now and then one takes a slow breath, opening its wings and closing them again. After 15 minutes it gets restless and sometimes hops off the paper.

On the pillar candle, a moth whose PR has failing checks (its red firefly) flies too close to the flame about once a minute. There's a puff and a few sparks as it touches, then it darts about with its wing tips smoking and its wings a little charred, and settles back down. The whole thing takes about 20 seconds, and it keeps at it until the checks pass. Only a session's own moth drifting near home gets scorched, side sessions included. A landed moth, one flying off and a subagent never do, and a moth that lands before it reaches the flame skips it. It needs [GitHub status](setup.md#github-status) on, and quiet hours don't stop it. Every window scorches the same moth at the same moment.

A few smaller things to watch for:

- Threads pulse with a little glow each time a session or one of its agents runs a tool.
- Each project gets a faint tint, slightly different per session, so you can tell moths apart.
- A singed moth (grey) means the turn ended with an API error.

The scene stretches to fill any window shape, wide, tall or square, and the lantern stays the same size in the middle.

## Cards, clicks and snooze

Hover a session's moth for its card. The top says what it needs from you: its questions, and its "You:" line (from a `**You:**` status footer, or else the last paragraph of its final message). Below, under Running, are its agents and the shell commands it left going, then its PRs as chips, or as a list with the arrow. Click an agent to read it in full. The hover area stays put while the moth wanders, so the card holds still while you read.

Click the card's header to open the session, or its status to snooze it.

To keep a session in view, click the pin on its card. It opens in full in a sidebar on the right, and you can pin as many as you like. Click a pin again to let that session go. When a pinned session ends, it stays there, dimmed. Pins need a window at least 800 pixels wide.

Click a moth to bring its session to the front: its terminal tab, or the session itself in the Claude desktop app. [Setup](setup.md#terminals-and-click-to-focus) lists what a click does in each terminal. "N need you" in the footer opens whichever session has waited longest, then the next one. "N snoozed" and "N sleeping" step through their sessions the same way.

Right-click a waiting moth, or shift-click it, to snooze it. It rests on the lantern in pale indigo, breathing out the odd z, and stops turning the light violet until the session does something new. Right-click or shift-click again and it's sleeping: snoozed for good, so new activity never wakes it. That's handy for a chat you only drop into now and then. A third one wakes it. On a moth that isn't waiting, the first one puts it to sleep. The footer counts snoozed and sleeping sessions separately.

Forgot what something means? "What's what?" at the bottom of the settings menu has the short version of this page.

## Fireflies and stale PRs

Fireflies hang around a session's moth, one for each open PR it owns, up to ten. Hover the cluster and you get the session's card, PRs and all. They're always lit, each one slowly brightening and dimming on its own rhythm, and their glow lights the air behind the lantern and moths.

A session owns a PR when it, or one of its agents in any worktree, created it with `gh pr create`. It also owns its branch's PR when it's the only session in that folder. Merely mentioning a PR doesn't count. Without GitHub status, a firefly appears when the "You:" line points at one of those PRs.

A moth lands on the side of the lantern facing its home, as high up the paper as its home sits round the lantern, so landed moths spread out and their threads don't cross. While it's landed, a dotted line in its thread colour ties it to one of its fireflies back home.

With [GitHub status](setup.md#github-status) on, fireflies show what each PR needs:

| Colour | PR |
|---|---|
| Green | Ready to merge |
| Red, pulsing faster | Failing checks |
| Orange | Changes requested |
| Amber | Draft |
| Blue | Waiting on review |

A new PR's firefly flies in from the window edge nearest its moth. When one turns green it flashes. When a PR merges, its firefly flares and shakes, loops, then zooms off the window on the side away from its moth. A closed PR's firefly dims and drifts off the nearest edge. Reviews requested from you hover by the lantern, and the footer links to them.

Stale PRs are your open PRs that no session owns and nobody has touched for a week. They drift low in the scene as wisps, pale ghost fireflies in a washed-out shade of their PR colour. The oldest sit lowest and dimmest, and every so often one slowly brightens and fades again. Up to 30 drift on their own, and the rest gather into a faint cloud with a count. Hover a wisp for what it needs and which session made it, or click to open it. When someone touches the PR again, its wisp rises away.

Ghost moths drift behind the wisps: pale, nearly see-through moths for the old sessions that made some of those PRs, flapping like the living ones. Their wisps circle them. Up to eight show, the most recently active first, and older ones sit lower and fainter. Hover one for its card: the session, when it was last active, and its stale PRs. Click it to resume that session in a new iTerm2 tab, running `claude --resume` in its folder (iTerm2 only, for now).

Stale PRs need GitHub status, and "show stale PRs" in the settings menu hides them.

## Session text on the paper

On the book-page barrel and the round chōchin, paragraphs your sessions wrote wrap round the paper like print on a drum or a globe. They squeeze as they turn toward the sides and vanish round the back, on the rows between the wires. On the chōchin they also squash toward the top and bottom, where the paper curves away. A new one fades in every twenty seconds or so and lingers for about a minute, overlapping the others. Some are printed on the inside, mirrored. They read best near the flame.

Only plain sentences make it onto the paper. Lantern drops anything with code, a link or path, a number, a name (a capitalised word past the first), or talk to or about you, and it keeps the words in memory only. Besides the sessions running now, it reads the newest few transcripts when it starts, ended sessions included. With nothing to show, the paper stays blank.

"show session text" in the settings menu turns it off. The words fade out, and Lantern stops reading and keeping them until you turn it back on.

## Picking a lantern

The settings menu (the compass icon at the bottom right) has four lanterns: the book-page barrel, a round chōchin, a brass Moroccan lantern and a pillar candle. The barrel is the default. Every window, the iTerm2 panel and the screensaver share the choice, so they all switch together.

The pillar candle is ivory wax on a bronze altar candlestick, wound with a grapevine and purple grapes, on a marble pedestal the vine climbs. It stands on its own foot, so it has no string or chain and doesn't sway in the wind. Moths that need you land on the wax. Its bare flame throws sparks, like the Moroccan's, and the room below the candle's rim sits in its shade. The flame shines on the candlestick too, with glints on the brass that slide as it leans and brighten as it flickers, a reflection in the molten pool at the crown, a highlight on each grape's near side and a warm patch on the marble round the foot. The air above it shimmers and carries dust up, and every minute or two a thin curl of smoke leaves its tip and fades over about 6 seconds, at the same moment in every window. It has no paper, so it shows no session text.

The same menu holds "notify me", the stale PR and session text switches (session text is greyed out on the Moroccan and the candle), the barrel's ribbon colour (a handful of swatches, greyed out on the other lanterns), quiet from, quiet until and the day rollover, and GitHub.

## Stats, badges and the recap

The chart button beside the settings button opens your stats, read from the app's event log.

A day in the stats starts at midnight, or at the time in "day rollover" in the settings menu. Set it later, say to 8am, and work past midnight still counts toward the day it belongs to: a day running from 8am Saturday to 8am Sunday is Saturday. Everything that counts days goes by it: the panel's today and week, badges, warm streaks, and the recap's today and yesterday.

The headline is two numbers. **Lantern warmth** is the share of the time Lantern ran, outside quiet hours, that no session was waiting on you. **Moths flying** is the share of your sessions' time, added up across sessions, not spent waiting on you, so two sessions running for an hour count as two hours. A snoozed or sleeping wait still counts as waiting. Below the graph you'll find how quickly you answered, PRs merged and in flight, and stale PRs.

The day ribbon runs from your first session to now in three strips. The top one counts the sessions alive, stacked by state in the moths' own colours: whitish for working, indigo for waiting, the paler purple of a snoozed moth for waits you snoozed (by hand or with quiet hours), the same purple for waits left sleeping (the panel counts them as snoozed), and the near-grey of a resting idle moth for the rest. The middle blends those colours by the share of moths flying. The bottom one is the lantern itself: warm, violet, or dim in quiet hours. Ticks along the bottom mark sessions starting. Hover the ribbon, or touch and drag along it, and a line follows you while the headline and legend show that moment: the lantern's state (warm, waiting or quiet) and the share of moths flying up top, and the time and sessions working, waiting, snoozed or sleeping, and idle below. Away from it, they show the day's totals. The week before sits underneath as mini ribbons.

Badges come from the log too: Warm all day, Clear night, Small batches, Revived, Ghostbuster, Séance, Lights Out, warm streaks, Haunted, Restless spirits, Light Pollution, Swarm Season, Hive Mind, Purple Rain, Ghosted and Snooze Button Champion. None of them are sorted into good or bad, so what each one means is up to you. The panel shows this week's, and **All badges** lists every one. Hover or tap a badge for what it is, how to earn it and when you last did. A tap keeps it open.

When you earn a badge, a swarm of fireflies in the lantern's colours flies in from the sides and packs into a glowing pill near the top with its name, holds for a few seconds, then scatters back out. Click the pill to open the stats panel on that badge. Several badges play one after another. There's no flash in quiet hours or on the screensaver, and the iTerm2 panel shows a smaller one with just the name. To see it without earning anything, open the page with `?demoBadge=hive_mind` (a comma-separated list plays a queue) or run `lanternBadge('hive_mind')` in the console. A few knobs can be added there too. Two speeds, in screen pixels per millisecond as they look in a 1024x768 window: `flySpeed` for flying in and off (0.4 by default) and `swarmSpeed` for the slow drift round the pill (0.002). And `jostle` for how much they swirl and wander about while the pill holds (1 by default). For example: `?demoBadge=hive_mind&flySpeed=0.3&jostle=2`. A slower fly speed takes longer to arrive, so the flash runs longer.

The daily recap opens by itself when quiet hours start. If you miss that, it shows up as yesterday's recap the first time you look at the lantern the next day. It opens once a day across all your windows, and never in the iTerm2 panel or the screensaver. You get the day's ribbon, lantern warmth and moths flying, answer time, fireflies merged and left open, how the stale PR count changed, the badges you earned, your warm streak, and the day's sessions as a small constellation, one star per session, bigger the longer it ran. The recap's ribbon has the same hover line and legend as the stats panel. In the constellation, a session sits higher and whiter the more of its time it spent not waiting on you, and lower and more indigo the more it waited. Hover a star for that session's day in a card just below the recap: when it ran, how warm it was, its waits, its PRs and its folder. Click or tap a star to pin its card, so you can click its PRs or its title (which takes you to the session while it's still running). Click the star again, click empty space or press Escape to let it go. With "notify me" on, it sends a notification too. To see any day of the past week, click it in the stats panel's week, or click **recap** next to Today.

## Quiet hours

The moon in the footer snoozes everything on every display until 8am, or the time in "quiet until" in the settings menu. Switch "quiet until" off and quiet lasts until you click the moon again. Either way, click it to end quiet early. Stale PRs' wisps and ghost moths keep drifting through it.

To have quiet come on by itself every night, switch "quiet from" on in the settings menu and pick a time. It works with no window open, since the app does it. It ends at "quiet until", or when you click the moon if that's off. If quiet is already on by then, it stays as it is, and if you end it early, it stays off until the next night.

## The app

The installer puts `Lantern.app` in `~/Applications`. It's a plain window around the page, with the moth as its Dock icon and a badge counting the sessions that need you. It remembers where you left its window, and links open in your default browser. Drag it to your Dock to keep it there.

The server lives inside the app, so there's nothing else to run. Closing the window keeps it running, so the hooks still have somewhere to report and the Dock badge keeps counting. Click the Dock icon to bring the window back. Quitting the app stops the server, and until you open it again the hooks quietly do nothing. It opens at login so the server is up before your first session. You can turn that off in System Settings > General > Login Items.

When the page changes, every Lantern window (the app, the iTerm2 panel, the screensaver) reloads on its own.

Your settings, the GitHub status cache and the stats log (`stats.sqlite`) live in `~/Library/Application Support/Lantern`.
