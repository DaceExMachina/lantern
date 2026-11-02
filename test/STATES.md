# Session states

Every case that decides what a session (a moth) shows: its `state` (working, paused, waiting, idle, or gone) and its `note`. Each row names the test that pins it down, in `test/server.test.js`. Rows named `state table: …` are rows of `STATE_TABLE` there: hook events posted in order to one server, and this file is their index. `test/states.test.js` fails when a test named here doesn't exist, or a `STATE_TABLE` row isn't listed here.

A state bug adds a row here (and its test) or corrects one. A row the code gets wrong today is a `test.todo` with what it should show, marked **suspected bug**.

How it's decided: hook events record facts (`turn`, `awaits`, the tasks and agents a turn handed over to), `derive()` in `app/Server.swift` turns them into the state, `check()` settles events that don't say (from Claude Code's status file), and `reap()` ends sessions. Seeding after a restart (`seedSession` in `app/Transcripts.swift`) records the same facts from the transcript.

Words used below:
- **UPS**: a UserPromptSubmit hook. **Stop**, **ask**: a Stop whose last message is a plain sentence, or a question.
- **Task**: a background shell or Monitor the session's own transcript started. Fresh while younger than `TASK_FRESH_MS` (30 min).
- **Agent**: a subagent the turn handed over to that's still alive. Fresh while heard from within `AGENT_FRESH_MS` (5 min).
- **Status**: Claude Code's own `sessions/<pid>.json`: busy, idle, or shell (idle with a background shell running).
- **Expiry**: for a session with no known process, `EXPIRE_MS` (20 min) of quiet, or `WAITING_EXPIRE_MS` (3 h) while a hook left it waiting.

## A turn and how it ends

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| A prompt starts a turn | UPS | working | `state table: a prompt` |
| A tool runs | PreToolUse | working | `state table: a tool call` |
| The turn finishes | UPS, Stop | waiting, "Finished its turn" | `state table: a finished turn` |
| The turn ends on a question | UPS, ask | waiting, "Asks: …" | `state table: a turn ending on a question` |
| Card, prompt and activity through a whole turn | SessionStart, UPS, tool, Stop | waiting | `a turn: start, prompt, tool, stop leaves it waiting with its card` |
| A question or a **Blocker:** line | UPS, Stop | waiting, the question as note | `a turn that asks a question or names a Blocker is waiting, with the question as its note` |
| The API fails | UPS, StopFailure | waiting, "Turn ended with an API error" | `state table: an API error` |
| It asks permission | UPS, PermissionRequest | waiting, "Wants permission to use Bash" | `state table: a permission request` |
| A permission prompt notification | UPS, Notification permission_prompt | waiting, its message | `state table: a permission prompt` |
| A dialog asks me something | UPS, Notification elicitation_dialog | waiting, its message | `state table: a question in a dialog` |
| Permission granted, the tool runs | UPS, PermissionRequest, PostToolUse | working | `state table: a tool call after a permission request` |
| The idle nudge after a finished turn | UPS, Stop, idle_prompt | waiting, "Claude is waiting" | `state table: an idle nudge after a turn` |
| Any other notification | UPS, Stop, auth_success | waiting, note kept | `state table: some other notification` |
| Claude Code starts at its prompt | SessionStart startup | idle | `state table: a session start` |
| A resume after a turn | UPS, Stop, SessionStart resume | idle, old note kept | `state table: a session start after a turn` |
| SessionEnd | SessionEnd | gone | `SessionEnd removes the session` |

### Hooks arriving out of order

Hooks are posted async, so a queued prompt's UPS can land before the previous turn's Stop.

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| The old turn's Stop lands after the new prompt | UPS p1, UPS p2, Stop p1 | working | `state table: a late Stop from the turn before` |
| The old turn's API error lands late | UPS p1, UPS p2, StopFailure p1 | working | `state table: a late API error from the turn before` |
| Then the new turn's own Stop | … Stop p2 (ask) | waiting, "Asks: …" | `state table: the new turn's own Stop` |
| A Stop whose prompt's UPS was lost | UPS p1, Stop p2 | waiting | `state table: a Stop from a prompt whose UPS was lost` |
| A Stop with no prompt_id | UPS p1, Stop | waiting | `state table: a Stop with no prompt_id after a prompt with one` |
| A Stop after a restart mid-turn | PreToolUse, Stop p1 | waiting | `state table: a Stop with no prompt seen (a restart mid-turn)` |

## Background tasks

A turn that ends with its own task open hands over to it (`awaits`): paused while the task is fresh, a finished turn waiting on me once it isn't. A `lantern-pr watch` is a standing listener for the session's PRs, so it never counts as open work.

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| The turn ends with a task running | UPS, Stop listing b1 | paused, "Waiting on 1 background task" | `state table: a turn ending with a task running`, `a background shell task younger than the threshold keeps its session working` |
| It ends on a question with a task running | UPS, ask listing b1 | waiting, "Asks: … (1 background task still running)" | `state table: a question with a task running` |
| The idle nudge while paused on a task | … idle_prompt | paused, unchanged | `state table: an idle nudge while waiting on a task` |
| A new prompt while paused | … UPS | working | `state table: a new prompt after waiting on a task` |
| A subagent fires while paused on a task | … agent PreToolUse | paused | `state table: a subagent firing while waiting on a task` |
| The task goes past fresh, no agent heard | Stop listing b1, time | waiting, "Finished its turn (1 background task still running)" | `a background task open past the threshold with no agent activity waits on me after the sweep, and stays old across turns` |
| The task's transcript line says it started 2 h ago | Stop on a fresh server | waiting, "Finished its turn (1 background task still running)" | `a background task the transcript says started two hours ago waits on me at its first Stop on a fresh server` |
| The task's start reaches the card | Stop listing b1 | paused, with its description and start | `a background task's start reaches the page with its description, and goes when the session moves on` |
| A task the session's transcript didn't start | Stop listing b9 | waiting, "Finished its turn" | `state table: a Stop listing a task the session didn't start`, `a background task the transcript didn't start is looked up once, not at every Stop` |
| A finished subagent and its shell still listed (the 7791 zombie) | Stop listing both | waiting | `Stop ignores a finished subagent and the shell task it started (the 7791 zombie), and counts the session's own task by its real age` |
| A Monitor the session started | Stop listing the Monitor | paused | `Stop counts a Monitor the session started (its launch carries taskId)` |
| A `lantern-pr watch` running, fresh | Stop listing `lantern-pr watch --owner x` | waiting, "Finished its turn" | `state table: a turn ending with a lantern-pr watch running`, `a fresh lantern-pr watch isn't open work: a turn ending with only that running is a finished turn` |
| A `lantern-pr watch` run by its full path | Stop listing `/…/bin/lantern-pr watch` | waiting, "Finished its turn" | `state table: a turn ending with a lantern-pr watch run by its full path` |
| A watch beside a dev server | Stop listing both | paused, "Waiting on 1 background task" | `a fresh lantern-pr watch isn't open work: a turn ending with only that running is a finished turn` |
| Only a watch open, its agents done (the demo's last Stop) | Stop listing the watch and finished agents | waiting, "Finished its turn" | `a turn ending with its four agents done and only its lantern-pr watch open is a plain finished turn (the demo's last Stop)` |
| jwt's restarted watch, seeded and on its Stop | transcript, then Stop listing the watch | waiting | `jwt's restarted lantern-pr watch leaves its finished turn waiting, seeded and on its Stop` |

## Agents

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| The turn ends with an agent running | UPS, agent event, Stop listing it | paused, "Waiting on 1 agent" | `state table: a turn ending with an agent running`, `a turn that ends with background agents running is paused, and their activity keeps it paused` |
| It ends on a question with an agent running | UPS, agent event, ask listing it | waiting, "Asks: … (1 agent still running)" | `state table: a question with an agent running` |
| A Stop lists an agent that already finished | UPS, Stop listing an agent not alive | waiting | `state table: a Stop listing an agent that already finished` |
| The agent keeps firing, then goes quiet past fresh | agent events, time | paused, then waiting "Finished its turn (1 agent still running)", paused again when it fires | `a background agent that keeps firing hook events keeps its session working, waits on me once quiet, and wakes again` |
| The idle nudge on that quiet handover | … idle_prompt, then the agent fires | waiting, note kept; paused when it fires (logged as resumed, not answered) | `an idle nudge on a quiet handover keeps it a finished turn the agent can still wake, and the wake isn't an answer` |
| The agent is inside one long tool call | agent PreToolUse, no PostToolUse, time | paused past the agent freshness, waiting once its tool returns | `an agent in the middle of a long tool call keeps its session paused past the agent freshness` |
| The awaited agent is dropped | Stop listing it, agent quiet past the check | waiting, "Finished its turn" | `a turn whose awaited agent is dropped is a finished turn waiting on me` |
| An agent known only from its transcript keeps writing | transcript writes, stalled server | paused | `an agent known only from its transcript keeps its session paused while it keeps writing, across a stalled server` |
| A subagent fires after a finished turn | UPS, Stop, agent event | waiting | `state table: a subagent firing after a finished turn` |
| A quiet agent the turn didn't hand over to | Stop, agent found by the sweep | waiting | `the sweep finds a quiet agent the hooks never announced, in a session that is waiting on me` |
| A subagent asks permission | UPS, agent PermissionRequest | waiting, "Wants permission to use Bash" | `state table: a subagent asking for permission` |
| **Suspected bug**: a subagent works again after I granted it, mid-turn | UPS, agent PermissionRequest, agent PostToolUse | should be working; shows waiting until the main thread moves | `state table: a subagent working again after its permission was granted, mid-turn` |
| **Suspected bug**: a background agent works again after I granted it | Stop listing it, agent PermissionRequest, agent PostToolUse | should be paused, "Waiting on 1 agent"; shows waiting | `state table: a background agent working again after its permission was granted` |
| Agent lifetimes: expiry, finished turn, hand-back, no transcript | agent transcripts, time | its agents list | `a subagent quiet past the expiry is dropped by the sweep, and comes back when it fires again`, `a subagent whose transcript ends in a finished turn is dropped once quiet, long before the expiry`, `a subagent whose transcript ends in a hand-back is dropped once quiet, long before the expiry`, `an agent whose hand-back shares its message with other calls is finished`, `a hooked agent with no transcript stays while it was just heard from, then goes` |

## Compaction

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| A manual /compact runs | UPS, Stop, PreCompact manual | working | `state table: a manual compact, started` |
| It finishes | … PostCompact | idle | `state table: a manual compact, done`, `a manual /compact ends idle, an automatic one leaves the session as it was` |
| Then its SessionStart | … SessionStart compact | idle | `state table: a manual compact, then its session start` |
| A manual /compact while paused on a task | … PreCompact, PostCompact, SessionStart | paused | `state table: a manual compact while waiting on a task` |
| A manual /compact while paused on agents (jwt) | Stop listing agents, compact, status busy/shell/idle | paused, then idle once status says idle | `a manual /compact while agents run leaves the session paused on them (the jwt compaction)` |
| A /compact that never reports back, then a turn | PreCompact, UPS, Stop | waiting | `state table: a lost manual compact, then a turn` |
| … then a question | PreCompact, UPS, ask | waiting, "Asks: …" | `state table: a lost manual compact, then a question` |
| … then a permission request | PreCompact, UPS, PermissionRequest | waiting | `state table: a lost manual compact, then a permission request` |
| … while paused on a task, then the idle nudge | PreCompact, idle_prompt | paused | `state table: a lost manual compact while waiting on a task, then an idle nudge` |
| … then the idle nudge | PreCompact, idle_prompt | waiting, "Claude is waiting" | `state table: an idle nudge after a lost manual compact` |
| A /compact after the idle nudge | idle_prompt, compact | idle | `state table: a manual compact after an idle nudge` |
| The idle nudge after a /compact | compact, idle_prompt | waiting, "Claude is waiting" (open question: the /compact answered the wait, see the PR) | `state table: an idle nudge after a manual compact` |
| An automatic compaction mid-turn | UPS, PreCompact auto, PostCompact | working | `state table: an automatic compact mid-turn`, `state table: an automatic compact mid-turn, then its session start`, `an automatic compaction in the middle of a turn keeps the session working until its Stop` |
| An automatic compaction after a turn | UPS, Stop, compaction | waiting | `state table: an automatic compact after a turn`, `an automatic compaction on a finished turn with no turn after it leaves the session waiting` |
| A prompt after an automatic compaction | … UPS, Stop | working, then waiting | `a prompt after an automatic compaction is a working turn as usual` |

## Interrupts and Claude Code's own status

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| Esc mid-turn (no Stop), status idle or shell, hooks quiet past the lag | UPS, tool, status idle | working, then idle | `a working session lands once Claude Code says idle (or shell) and the hooks have gone quiet: an Esc interrupt, a cancelled /compact` |
| Esc on a new prompt while paused on an agent | … status shell | paused, "Waiting on 1 agent" | same test |
| A /compact cancelled before it reported back | PreCompact, status idle | idle | same test |
| Esc with no status file (older Claude Code) | UPS, nothing after | working until the expiry | `state table: a prompt` |
| An ended process left an idle status, another process still runs | two pids, one exits | working | `an ended process's leftover idle status doesn't land a session still running elsewhere` |
| An idle process beside one with a status Claude Code added later | compaction check | idle | `check() reads an idle process beside one with an unrecognised status as idle` |

## Restart: seeding and adoption

After a restart, sessions come back from their transcripts (recent ones) and from running `claude` processes (with their pids).

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| Transcript with no turn line at all | transcript | idle | `a restart seeds a transcript with no turn line anywhere as at its prompt` |
| Transcript ending in a compaction | transcript | idle | `a restart seeds a session whose transcript ends in a compaction as at its prompt, however much the compaction re-injected after it` |
| Finished turn, then a task notification nobody answered | transcript | waiting | `a transcript ending on an unanswered task notification seeds as waiting, not working` |
| Non-turn lines after the last turn (rename, local commands, attachments) | transcript | waiting after a finished turn, working mid-turn | `a transcript ending on lines that aren't a turn seeds from the last turn: waiting after a finished one, working mid-turn` |
| Desktop transcripts: finished, interrupted, side-session event, typed prompt | transcript | waiting, idle, waiting, working | `desktop transcripts seed from their own turn ends: finished waits, an interrupt idles, a side-session event isn't a prompt` |
| A turn that carried on after an interrupt or a compaction | transcript | working | `a turn that carries on after an interrupt or a compaction reads as still going` |
| A live process: its status wins over the transcript | status idle/busy/none, transcript | idle, waiting, working, paused (live agent) | `a live session seeds from Claude Code's own status when it gives one, and from its transcript when not` |
| Finished turn with its own task still open (the PR-watch restart) | transcript | paused while fresh, waiting once ended, past fresh, or when it's a `lantern-pr watch` | `a seeded session waiting on its own background shell is paused, not landed (the PR-watch restart)` |
| A session in the app and a terminal at once | two processes | working, both pids | `a session running in the Claude app and a terminal at once seeds busy, with both processes, and stays until both end` |
| A long-quiet session whose process is alive | process, day-old transcript | waiting, with its pid | `a long-quiet session whose claude process is alive is seeded with that process` |
| A quiet Claude app session | process named by a path with spaces | waiting | `a quiet Claude app session is seeded with its process, though ps names it by a path with spaces` |
| A running session the lantern missed | adoption pass | waiting, with its pid | `a running session the lantern missed is adopted with its process on the next pass` |
| Adoption never overrides what a hook said | hook Stop, transcript mid-turn | waiting | `adoption never overrides the state a hook gave a session with what its transcript says` |
| A `claude` with no session record yet | process, old transcript in its folder | not brought back | `a claude with no session record yet does not bring back the finished session in its folder` |
| A stale sessions record (pid reused) | procStart mismatch | not brought back | `a sessions record whose process start differs from the running pid's is stale and ignored` |
| A session that closed just before the restart | transcript ending on `cost-state` | not brought back; brought back if resumed since | `a restart doesn't seed a session that closed just before it, and does seed one resumed since` |

## Processes and expiry

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| Every process ended, no SessionEnd | pids exit | gone at the next sweep | `a session running in the Claude app and a terminal at once seeds busy, with both processes, and stays until both end` |
| One of two processes ended | one pid exits | stays, with the other pid | `adoption adds a known session's other process to it instead of re-reading its transcript` |
| No known process, not waiting, quiet past the expiry | hooks only (working, idle) | gone | `a session with no known process goes once quiet past the expiry, or the longer one while a hook left it waiting` |
| No known process, waiting by a hook | Stop, quiet past the expiry | stays until the waiting expiry, then gone | same test |
| Seeded from a transcript alone, waiting | seeded, quiet past the expiry | gone (it never proved it's alive) | same test |
| Closed, no process known, its transcript ends on the exit write (`cost-state`) | hooks without pids, then the transcript's last line | gone at the next sweep | `a session with no process known goes on the next sweep once its transcript says it closed; one still running, or with a live process, stays` |
| Killed before it could write that (no `cost-state`) | hooks without pids, quiet | gone at the expiry | `a session with no known process goes once quiet past the expiry, or the longer one while a hook left it waiting` |
| A new session in the same iTerm tab | hooks with the tab id | the old one gone | `a new session in the same iTerm tab replaces the old one, and other tabs are left alone` |
| … while the old one's process still runs | hooks with the tab id | both stay | `a new session in a tab leaves the session there alone while its process still runs` |

## Side sessions

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| A side session whose parent is alive | app session files | waiting, `parent` set (the page and stats treat it as reporting back, not waiting on me) | `a side session with a live parent points at it` |
| Its parent ends | parent SessionEnd | waiting, `parent` gone (waiting on me again) | `a side session whose parent ended stops pointing at it` |

## Snooze and sleep

Snoozing doesn't change the state: a snoozed session is still waiting, with `snoozed` (and `forGood` for sleep) set.

| Situation | Inputs | Shows | Test |
|---|---|---|---|
| Snooze, then a new turn ends the snooze; sleep outlasts turns; wake | /snooze true, UPS, Stop, /snooze always, /snooze false | waiting with snoozed, then not; asleep stays snoozed | `snooze, snooze for good, and wake` |
| A snooze survives a restart, and new activity still ends it | /snooze, restart, UPS | waiting snoozed, then snoozed false | `a snooze survives a restart, and new activity after it still ends the snooze` |
