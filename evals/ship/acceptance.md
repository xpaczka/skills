# ship acceptance run

A manual end-to-end check on real code, to complement the automated evals: do it once before relying on `ship`, and again after significant changes. About two hours of your time.

## Prepare

- **Tickets**: two Markdown tickets in `~/.agents/ship/acceptance/tickets/`, kept outside this repo because they describe a private codebase:
  - `TEST-1-<slug>.md`, **easy**: one area, 1–2 chunks, no data-model change.
  - `TEST-2-<slug>.md`, **complex**: spans data, logic and UI, needs at least one real decision during grilling, changes existing code, lists `TEST-1` as related.
- **Target repo**: clean, on the default branch, its checks passing. `ship` is installed, and your old manual workflow (grilling skill, plan mode, thermo-nuclear review) still works.
- **Timer**: note the start and end time (UTC, `date -u +%FT%TZ`) of every arm below.

## 1. TEST-1 A/B

Two worktrees from the default branch, one per arm. **Run the ship arm first**: whatever you learn about the ticket then favours the manual arm, which keeps the comparison conservative.

```sh
git worktree add ../<repo>-ship   -b TEST-1-ship
git worktree add ../<repo>-manual -b TEST-1-manual
```

**Arm A (ship)**, in `../<repo>-ship`:

1. `/ship ~/.agents/ship/acceptance/tickets/TEST-1-<slug>.md --quick`
2. Follow it to the end: review and commit every chunk yourself, `/ship review`, triage, `/ship` to finish. Do not open a PR.

**Arm B (manual)**, in `../<repo>-manual`:

1. Your usual flow: grilling session, then `/plan Implement TEST-1 (<ticket text>). Split into commitable chunks; after each, stop, suggest a commit message and list the remaining chunks.`
2. Before reviewing each chunk, run `~/.agents/skills/ship/scripts/snapshot.sh` and note the hash; after committing, count your rework with `git diff --numstat <hash> HEAD`.
3. Finish with your usual thermo-nuclear review in a fresh session, and fix what you accept.

**Same final review for both**: in a fresh session per worktree, run the thermo-nuclear review on `<default branch>..HEAD` and count blocker and high findings. This is the quality comparison; it does not change either branch.

## 2. TEST-2 (ship only)

In a new worktree, `/ship ~/.agents/ship/acceptance/tickets/TEST-2-<slug>.md` with full grilling. Tick each path as it happens:

- [ ] grilling cites TEST-1's record as related work;
- [ ] `/clear` (or a new chat) mid-feature, then `/ship` resumes at the right step;
- [ ] a plan amendment (if none happens naturally, tell the agent mid-chunk that one of the plan's assumptions is false);
- [ ] `/ship next` refuses while a chunk is uncommitted;
- [ ] review produces at least one fix chunk, then finish writes the record;
- [ ] `/ship pr --draft` shows a preview; decline it;
- [ ] `/ship stats --tokens` reports both features.

**Cursor**: after TEST-2's first committed chunk, open the worktree in Cursor and run `/ship status` and `/ship next` once there: the skill is listed, state resolves, the handoff has the same shape, nothing is committed. Continue in Claude Code.

**Tracker read**: in a repo with a configured tracker, `/ship <real issue ID>`; confirm it fetched the issue body, then stop and `/ship clean`. Nothing is written to the tracker.

## 3. Results

Token counts per arm, using the times you noted:

```sh
node ~/.agents/skills/ship/scripts/stats.mjs --window <worktree path> <start> <end>
```

| Metric | ship | manual |
|---|---|---|
| Wall time | | |
| Tokens (input + cache + output) | | |
| Your messages | | |
| Rework lines (sum over chunks) | | |
| Chunks: planned → committed | | |
| Final review: blockers / highs | | |
| Checks green at every commit | | |

Ship is worth keeping when it is no worse on rework and final-review findings, and clearly better on at least one of tokens, your messages or wall time. Record the outcome, without project details, under a **## Acceptance** heading in [README.md](README.md), and turn every problem into a change in the skill or a new eval case.

## 4. Clean up

```sh
git worktree remove ../<repo>-ship && git worktree remove ../<repo>-manual   # and the TEST-2 worktree
git branch -D TEST-1-ship TEST-1-manual <TEST-2 branch>
```

`/ship clean TEST-1` and `/ship clean TEST-2` remove their records if you do not want them in `/ship history`.
