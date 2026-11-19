# Chunk phase

Settles the handed-off chunk, has a subagent implement the next one, and hands it to the user. Entry: `/ship next [message]`, `/ship` with `phase: implementing`, a 'Commit & …' answer at a handoff, or the next chunk under `review`/`auto` autonomy.

## 1. Settle the previous chunk

If a chunk has `status: handed-off`:

1. **Uncommitted changes** (`git status --porcelain` is not empty): the user's `/ship next`, 'Commit & …' answer, or `review`/`auto` autonomy is their word to commit. Commit the whole working tree, their own edits since the handoff included: `git add -A`, then `git commit` with the message from the arguments, else the chunk's `commit_message`. If a hook fails, show its output and stop; never retry with `--no-verify`.
2. **Clean tree, HEAD moved**: the user committed.
3. **Clean tree, HEAD unchanged**: the chunk's changes are gone. Ask: redo it, skip it, or amend the plan.

After 1 or 2, set the chunk's `commit` to HEAD's short SHA and `status: committed`, and save the state file; if it came from a parallel wave, remove its worktree (2b, step 4).

Then pick what runs next:

- a chunk from a parallel wave is waiting (`in-progress`, its worktree from step 2b exists) → integrate it (2b, step 3);
- otherwise the **ready** chunks are the `pending` ones whose `depends_on` chunks are all committed. Two or more ready, and the harness has subagents → run a wave (2b). Otherwise take the lowest-numbered ready chunk to step 2.

If no chunk is `pending` or `in-progress`:

- `review_rounds` is 0 → set `phase: reviewing` and continue with [REVIEW.md](REVIEW.md) in the same turn.
- otherwise (these were review fixes), under `auto` → after round 1, set `phase: reviewing` and continue with [REVIEW.md](REVIEW.md) for round 2; after round 2, set `phase: finishing` and continue with [FINISH.md](FINISH.md).
- otherwise, under `chunk` or `review` → ask "Finish" / "Another review round". Finish: set `phase: finishing` and continue with [FINISH.md](FINISH.md). Another round: set `phase: reviewing` and continue with [REVIEW.md](REVIEW.md).

## 2. Implement in a subagent

Set the chunk `status: in-progress`. Brief one fresh subagent for it, review-fix chunks included. The brief is the subagent's whole context, so it carries:

- the chunk entry, the **Decisions** it touches, the **Plan**'s approach and checks, and any **Amendments**;
- the scope rule: stay inside the chunk's goal; work a later chunk or another decision covers stays out even when it seems to belong here, reported as "left for chunk K";
- `kind: review-fix`: the findings the goal names, copied from the state's **Review**; for each verify id, read that issue from `.verify/issues.json` (its `problem`, `evidence`, `fix` and `touches`) before changing code, and set its `status: fixed` once fixed;
- `tdd: yes`: Call the Skill tool with "tdd"; the seams were approved with the plan. Fallback: one failing test per behaviour through a listed seam, the minimum code to pass it, repeat; refactor only while green;
- run the acceptance commands and checks until green; never commit, stash or reset;
- on a **structural** deviation (below), stop and report it instead of working around it;
- report back: what changed and why, deviations, the risky spots as `path:line`, and the check results.

Without subagents, do the same inline, starting from only that brief.

## 2b. Parallel wave

1. Take up to 3 ready chunks, lowest-numbered first, and set each `in-progress`. For each, run `git worktree add --detach SHIP_HOME/repos/<key>/worktrees/<state file name>-chunk-<N> HEAD` and install dependencies there with the lockfile's package manager.
2. Brief one subagent per chunk at once, as in step 2, with two differences: it works only inside its worktree, and once green it commits the chunk there with its `commit_message`. That commit never touches the feature branch.
3. Integrate in chunk order, one chunk at a time, after its subagent returns. Take `<sha>` = the worktree's HEAD; uncommitted changes there mean the subagent did not finish, so treat it as a conflict.
   - Check for a conflict first: `git merge-tree --write-tree --merge-base <sha>^ HEAD <sha>` exits 1 on one (git 2.40 or later, for `--merge-base`). On a conflict, remove the worktree, set the chunk back to `pending`, and it runs again later in a fresh subagent on top of the branch.
   - Otherwise `git cherry-pick --no-commit <sha>` puts the chunk in the working tree. Continue with step 4, then step 5, as for any chunk.
4. Once the chunk is committed, run `git worktree remove --force <path>` (the folder holds only ship's integrated copy and installed dependencies).

## 3. Deviations

- **Small** (a renamed helper, an extra file, a different internal approach with the same outcome): fine; list it under Deviations in the handoff.
- **Structural** (a plan assumption is false, a decision is missing, the chunk must split or merge, later chunks change): propose an amendment to the user: what changes, why, and the effect on later chunks. Once the user approves, append it to **Amendments**, update **Chunks** (new chunks get `kind: amendment`), then brief a subagent again.

## 4. Verify

Re-run the chunk's `acceptance` commands and every configured `check` yourself; a subagent's report is not proof. On a failure, hand the output back to the subagent (or a fresh one briefed with it) and rerun. After three failed attempts at the same failure, stop and hand off as **blocked**, explaining what fails and what was tried, whatever the autonomy.

## 5. Hand off

Under `review` or `auto` autonomy, a green chunk is not handed off: set `status: handed-off`, run step 1, print one line, `Chunk N/M committed <sha> <subject>` plus its deviations if any, and continue with the next chunk in the same turn. Under `chunk`:

1. Set `status: handed-off`, save the state file.
2. Reply in this shape, and nothing longer:

```
### Chunk N/M: <title> (checks green)
**What and why**
- …
**Deviations**: none | - …
**Look closely at**
- `path:line`: why it is risky
**Commit message**
<commit_message, updated if the chunk changed>
**Remaining**
N+1. <title> · N+2. <title> · …
```

3. Ask with the structured question UI, so the user clicks instead of typing. Edits they make in their editor while it is open get committed too:
   - **Commit & continue**: run step 1, then the next chunk, in the same turn.
   - **Commit & pause**: run step 1, then end with "`/ship next` to continue."
   - **Changes needed**: the user's text says what. Brief a subagent with it, then verify and hand off again.
   - **Commit & go auto**: set `autonomy: auto` (or `review` if the user's text names it), then as Commit & continue.

Without a question UI, end with "`/ship next` commits and continues; or say what to change."
