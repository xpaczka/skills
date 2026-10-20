---
name: ship
description: Ship a feature as grill → plan → small chunks the user reviews and commits → independent review, with state kept on disk between sessions.
disable-model-invocation: true
argument-hint: "<task text | ISSUE-ID | path.md> [--quick]  ·  next | status | review | pr | history | stats | setup | clean"
---

# ship

You drive one feature through fixed phases while the user keeps control of every commit. All workflow state lives in a **state file** outside the repo, so any invocation can start from a cleared context: read the state file first, update it before you end the turn.

## Hard rules

- **The user commits.** Never run `git commit`, `amend`, `rebase`, `reset`, `push`, `stash`/`stash pop`, or `checkout` of files. `scripts/snapshot.sh` (an unreferenced snapshot commit through a throwaway index) and `git switch -c` for a new feature branch are allowed. The only push is `/ship pr`, after the user approves the preview.
- **Nothing lands in the repo.** Every ship file goes under `SHIP_HOME`.
- **Tracker writes only when the state's `tracker_writes` allows them**, and preview each one before sending.
- **Stop after every chunk.** The user reviews, commits, and runs `/ship` or `/ship next`.
- **Settled stays settled.** Decisions and the approved plan in the state file are not reopened unless the user asks; a plan that breaks goes through an amendment (see chunk phase).

## Locate state

Run `scripts/locate.sh` (in this skill's folder) from inside the repo, once per invocation. It prints `ship_home`, `repo_root`, `repo_key`, `branch`, the global config, repo config and state file paths with `exists`/`missing`, the current `phase`, and the records folder. Use those values; do not re-derive them.

- `SHIP_HOME` = `$SHIP_HOME`, else `~/.agents/ship`. Repo key = origin's `<owner>-<repo>` lowercased, else the repo folder name. State file = `repos/<key>/work/<branch with "/" → "-">.md`.
- Config = global config overlaid by repo config; schema in [CONFIG-FORMAT.md](CONFIG-FORMAT.md). State schema: [STATE-FORMAT.md](STATE-FORMAT.md).

If the repo config is missing, run [SETUP.md](SETUP.md) first, then continue with the requested subcommand (`status`, `clean`, `history` and `stats` do not need it).

## Subcommands

Read only the file the row names, then follow it.

| Invocation | Read |
|---|---|
| `/ship <task text \| ISSUE-ID \| path.md> [--quick]` | [GRILL.md](GRILL.md). If an unfinished state file exists for this branch, ask: resume it, or start the new feature on a new branch. |
| `/ship` (no arguments) | Resume: the file for the state's `phase` (table below). No state file → say so and show the start command. |
| `/ship next` | [CHUNK.md](CHUNK.md) |
| `/ship status` | Inline, below |
| `/ship review` | [REVIEW.md](REVIEW.md) (also starts an extra review round on request) |
| `/ship pr [--draft \| --ready]` | [PR.md](PR.md) |
| `/ship history [query]` | [HISTORY.md](HISTORY.md) |
| `/ship stats` | [STATS.md](STATS.md) |
| `/ship setup` | [SETUP.md](SETUP.md) (re-detects facts, re-asks decisions) |
| `/ship clean [ID]` | Inline, below |

| State `phase` | Read |
|---|---|
| `grilling` | [GRILL.md](GRILL.md) |
| `planning` | [PLAN.md](PLAN.md) |
| `implementing` | [CHUNK.md](CHUNK.md) |
| `reviewing` | [REVIEW.md](REVIEW.md) |
| `finishing` | [FINISH.md](FINISH.md) |
| `done` | Report done; offer `/ship pr` and `/ship clean`. |

### status

Print, without doing any other work: feature ID and title, branch, phase, each chunk with its status, open review findings, and the exact next command. No state file for this branch → "No feature in progress on `<branch>`." plus the start command.

### clean

- `/ship clean`: delete the current branch's state file. If its phase is not `done`, confirm first: this abandons the feature's live state.
- `/ship clean <ID>`: delete that feature's record and `.metrics.json` from `records/`, after confirming.
- Delete only inside `SHIP_HOME`.

## Phase transitions

On every phase change, set `phase` in the state frontmatter and append `- <phase> <UTC time from date -u +%FT%TZ>` to the state's **Timeline**. `/ship stats` uses the Timeline to split cost by phase.

## Harness capabilities

| If the harness has… | do | else |
|---|---|---|
| a plan mode | enter it for planning; approve through its UI | write the plan to the state file; approve in chat |
| subagents | run reviewers and `executor: subagent` chunks in subagents | run them inline, each starting from only its brief |
| per-subagent reasoning effort | set it as the review phase says | skip it |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |
| context clearing | end phase handoffs with "`/clear`, then `/ship`" | end with "start a new chat, then `/ship`" |

## Dependencies

Each phase that uses one of these skills carries a short fallback for when it is missing.

- `grilling`, `tdd`, `pr`: `npx skills add mattpocock/skills -s grilling -s tdd -s pr -g`
- `thermo-nuclear-code-quality-review`: `npx skills add https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review -g`

## End of every turn

The state file is saved, and your last line names the next action and its exact command.
