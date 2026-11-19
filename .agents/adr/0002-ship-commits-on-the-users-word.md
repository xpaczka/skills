# ship commits on the user's word, at an autonomy the user picks

`ship` used to rest on one rule: the user commits, and ship stops after every chunk. Each chunk cost a review, a manual commit, a `/clear` and a `/ship next`, so a six-chunk feature took dozens of human steps whether or not the user wanted to read every chunk. The tannin repo's fork of `ship` replaced that rule, and this repo adopts its design.

## Decision

- Commits happen only on the user's word, and the user chooses how often to give it. Each feature has an `autonomy` level, asked in grilling (default `autonomy_default: review`, switched with `/ship mode`):
  - `chunk`: ship hands off each chunk and asks 'Commit & continue' / 'Commit & pause' / 'Changes needed' / 'Commit & go auto'.
  - `review`: ship commits each green chunk and continues; the user triages the review.
  - `auto`: as `review`, plus ship triages the review itself and opens the PR.
- Every level still stops for grilling, plan approval, structural amendments, a blocked chunk, a failing commit hook and tracker write previews.
- `/ship next [message]` commits the handed-off chunk (with the user's own edits) and continues.
- Never `--no-verify`, `amend`, `rebase`, `reset` or `stash`; a failing hook stops ship.
- In a parallel wave, each subagent commits its chunk inside its own detached worktree under `SHIP_HOME`. That commit never touches the feature branch; the main thread cherry-picks it without committing and then commits under the feature's autonomy.
- One thread: a fresh subagent implements each chunk, the main thread re-runs the checks, and phases continue in the same turn with no `/clear`.

## Considered Options

- **Keep "the user commits"**: rejected. It is the safest option, but users who trust the plan pay for every chunk with manual steps, and the handoff snapshot and rework metric existed mostly to measure that cost.
- **One fixed level for everyone**: rejected. Some features deserve a per-chunk read and others do not; the level is per feature and switchable mid-feature.
- **`auto` without a stop at a failing hook**: rejected. A hook is the repo's own guard, and bypassing it would hide exactly the failures the user most needs to see.
