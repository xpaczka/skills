---
name: ship
description: Ship a feature in one thread as grill → plan → small chunks, each built by a subagent, that the user commits with one click or ship commits at the autonomy the user picks → independent review, with state kept on disk outside the repo.
disable-model-invocation: true
argument-hint: "<task text | ISSUE-ID | path.md> [--quick]  ·  next [message] | mode <chunk|review|auto> | status [--all] | review | pr | history | setup | clean"
---

# ship

You drive one feature through fixed phases in one thread, stopping for the user as often as the feature's autonomy level says. The main thread grills, plans and reviews; a subagent implements each chunk, so the thread stays small. All workflow state lives in a **state file** outside the repo, so any invocation can resume after compaction or in a new chat: read the state file first, update it before you end the turn.

## Hard rules

- **Commits happen only on the user's word.** The user commits, answers 'Commit & …' at a chunk handoff, runs `/ship next`, or chose `review` or `auto` autonomy, which lets you commit each green chunk; those are the only times you run `git add` and `git commit`. Never run `amend`, `rebase`, `reset`, `push`, `stash`/`stash pop`, `checkout` of files, or a commit with `--no-verify`. `git switch -c` or `git worktree add -b` for a new feature branch is allowed. The only push is the one `/ship pr` makes.
- **Nothing ship writes lands in the repo.** Every ship file goes under `SHIP_HOME`.
- **Tracker writes only when the state's `tracker_writes` allows them**, and preview each one before sending.
- **Stop where the autonomy level says** (below), and always at the stops every level shares.
- **Settled stays settled.** Decisions and the approved plan in the state file are not reopened unless the user asks; a plan that breaks goes through an amendment (see chunk phase).

## Autonomy

The state's `autonomy` (chosen in grilling, default `autonomy_default`; a state file without it means `chunk`) sets where ship stops:

| `autonomy` | after each green chunk | review findings | after finish |
|---|---|---|---|
| `chunk` | hand off and ask (see chunk phase) | the user triages | ask 'Open PR' / 'Not now' |
| `review` | commit, print one progress line, continue | the user triages | ask 'Open PR' / 'Not now' |
| `auto` | commit, print one progress line, continue | ship triages by its recommendations, at most 2 rounds | run `/ship pr` |

Every level stops for: grilling questions, plan approval, a structural amendment, a chunk blocked after three failed attempts, a failing commit hook, and each tracker write preview.

## Locate state

Run `scripts/locate.sh` (in this skill's folder) from inside the repo, once per invocation. It prints `ship_home`, `repo_root`, `repo_key`, `branch`, the global config, repo config and state file paths with `exists`/`missing`, the current `phase`, and the records folder. Use those values; do not re-derive them.

- `SHIP_HOME` = `$SHIP_HOME`, else `~/.agents/ship`. Repo key = origin's `<owner>-<repo>` lowercased, else the main checkout's folder name, so every worktree of a repo shares its state. State file = `repos/<key>/work/<branch with "/" → "-">.md`.
- Config = global config overlaid by repo config; schema in [CONFIG-FORMAT.md](CONFIG-FORMAT.md). State schema: [STATE-FORMAT.md](STATE-FORMAT.md).

If the repo config is missing, run [SETUP.md](SETUP.md) first, then continue with the requested subcommand (`status`, `clean` and `history` do not need it).

## Subcommands

Read only the file the row names, then follow it.

| Invocation | Read |
|---|---|
| `/ship <task text \| ISSUE-ID \| path.md> [--quick]` | [GRILL.md](GRILL.md). If an unfinished state file exists for this branch, ask: resume it, or start the new feature on a new branch. |
| `/ship` (no arguments) | Resume: the file for the state's `phase` (table below). No state file → say so and show the start command. |
| `/ship next [message]` | [CHUNK.md](CHUNK.md): commits the handed-off chunk, then implements the next |
| `/ship mode <chunk \| review \| auto>` | Set the state's `autonomy`, say so, then resume as `/ship` does |
| `/ship status [--all]` | Inline, below |
| `/ship review` | [REVIEW.md](REVIEW.md) (also starts an extra review round on request) |
| `/ship pr [--draft \| --ready]` | [PR.md](PR.md) |
| `/ship history [query]` | [HISTORY.md](HISTORY.md) |
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

Print, without doing any other work: feature ID and title, branch, phase, autonomy, each chunk with its status, open review findings, and the exact next command. No state file for this branch → "No feature in progress on `<branch>`." plus the start command.

`/ship status --all`: one line per state file in `SHIP_HOME/repos/<key>/work/`: feature, branch, phase, autonomy, chunks committed of total, the worktree that has the branch checked out (`git worktree list`), and the next command. Read only the frontmatter and chunk statuses.

### clean

- `/ship clean`: delete the current branch's state file. If its phase is not `done`, confirm first: this abandons the feature's live state.
- `/ship clean <ID>`: delete that feature's record from `records/`, after confirming.
- Delete only inside `SHIP_HOME`.

## Phase transitions

On every phase change, set `phase` in the state frontmatter.

## Harness capabilities

| If the harness has… | do | else |
|---|---|---|
| a plan mode | enter it for planning; approve through its UI | write the plan to the state file; approve in chat |
| subagents | implement every chunk in a fresh subagent; run reviewers in subagents | run them inline, each starting from only its brief |
| a worktree tool | enter a new feature's worktree with it | ask the user to open a session in the worktree |
| per-subagent reasoning effort | set it as the review phase says | skip it |
| a structured question UI | use it for multiple-choice questions and every stop | numbered plain-text questions, plus the command to type |

Phases follow each other in the same thread; never suggest clearing the context between them.

## Dependencies

Each phase that uses one of these skills carries a short fallback for when it is missing. A skill installed through a plugin is listed under a prefix (`mattpocock-skills:grilling`): match on the name after the colon before deciding it is missing.

- `grilling`, `tdd`, `pr`: `npx skills add mattpocock/skills -s grilling -s tdd -s pr -g`
- `thermo-nuclear-code-quality-review`: `npx skills add https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review -g`
- `verify` (optional): a repo's own review skill in `.claude/skills/verify/` or `.agents/skills/verify/`; without it, the review phase runs its two reviewers.
- `create-pr` (optional): from the commerce-ui-dev Claude Code plugin; without it, `/ship pr` writes and opens the PR itself.

## End of every turn

The state file is saved, and the turn ends with the stop's question, or a last line naming the next action and its exact command.
