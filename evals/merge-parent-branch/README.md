# merge-parent-branch evals

Two cases run `/merge-parent-branch develop` in a sandboxed repo built by each case's `scaffold.sh` (generated from `_fixture/fixture.sh` + the case's `setup.sh`; edit those, then run `scripts/sync-eval-fixtures.sh`). The fixture pushes `main`, `develop` and the feature branch to a bare `origin` inside `.git/`, then each side commits a change that conflicts with the other.

Each case is one prompt, so a run ends at the approval gate: graders check that nothing was committed, pushed, stashed, rebased, reset or aborted, that the merge is still in progress with every resolution staged, the resolved files themselves, and the gate report. The commit and push after "yes" are checked by hand with `/merge-parent-branch` on a real branch.

```sh
scripts/eval.sh merge-parent-branch                              # all cases, 3 runs each
scripts/eval.sh merge-parent-branch --case fix-vs-refactor --runs 1 --keep-temp
```

Requires a working `/usr/bin/git` and Node 22 or later: the sandbox ignores your `PATH`.

| Case | develop | branch | Expected resolution |
|---|---|---|---|
| fix-vs-refactor | rounds `finalPrice`'s discount to whole cents and caps it at 100% | extracts `discountCents` from `finalPrice` and reuses it in `cartSavings` | the extracted `discountCents` with the rounding and the cap inside it, so `cartSavings` gets the fix too |
| features-same-hunk | invoice import: an import, a route and a menu entry | CSV export: an import, a route and a menu entry at the same spots | both features, each with its import, route and menu entry |

## Baseline

Claude Opus 5.5, Sonnet judge, 1 run per case, 2026-10-22: score 1.00, $0.47, 2 min.

| Case | Checks | Score | Cost/run | Turns |
|---|---|---|---|---|
| fix-vs-refactor | the fix lands inside the extracted helper; staged, merge left in progress, gate report, no commit or push | 1.00 | $0.24 | 9 |
| features-same-hunk | both imports, routes and menu entries kept; staged, merge left in progress, gate report, no commit or push | 1.00 | $0.23 | 10 |

`reads-conflict-context` is the one to watch: an earlier run of features-same-hunk resolved both files correctly without running `context.sh conflicts` and failed only that grader.
