# merge-parent-branch evals

Each case runs `/merge-parent-branch` in a sandboxed repo built by its `scaffold.sh` (generated from `_fixture/fixture.sh` + the case's `setup.sh`; edit those, then run `scripts/sync-eval-fixtures.sh`). The fixture pushes `main`, `develop` (cut from `main`) and the feature branch (cut from `develop`) to a bare `origin` inside `.git/`.

The resolution and verification cases pass `develop` as the argument; in the resolution cases each side commits a change that conflicts with the other, in the verification case the merge is clean but breaks. Each case is one prompt, so a run ends at the approval gate: graders check that nothing was committed, pushed, stashed, rebased, reset or aborted, that the merge is still in progress with every resolution staged, the resolved files themselves, and the gate report. The commit and push after "yes" are checked by hand with `/merge-parent-branch` on a real branch.

The detection case passes no argument, so its run ends at the parent confirmation, before any merge.

```sh
scripts/eval.sh merge-parent-branch                              # all cases, 3 runs each
scripts/eval.sh merge-parent-branch --case fix-vs-refactor --runs 1 --keep-temp
```

Requires a working `/usr/bin/git` and Node 22 or later: the sandbox ignores your `PATH`.

| Case | develop | branch | Expected outcome |
|---|---|---|---|
| fix-vs-refactor | rounds `finalPrice`'s discount to whole cents and caps it at 100% | extracts `discountCents` from `finalPrice` and reuses it in `cartSavings` | the extracted `discountCents` with the rounding and the cap inside it, so `cartSavings` gets the fix too |
| features-same-hunk | invoice import: an import, a route and a menu entry | CSV export: an import, a route and a menu entry at the same spots | both features, each with its import, route and menu entry |
| clean-merge-rename | renames `subtotal` to `cartSubtotal` | adds a receipt that imports `subtotal`; `test/format.test.mjs` already fails on every tip | the receipt imports `cartSubtotal`, staged inside the merge; the `formatCents` failure reported as pre-existing, left unfixed |
| detect-parent | adds `formatCents` | cut from `develop`; `main` and `release/1.0` sit at the same distance | proposes `develop` with the reflog as evidence, waits for yes, runs no merge |

## Baseline

Claude Opus 5.5, Sonnet judge, 1 run per case, 2026-10-22: score 1.00, $1.13. detect-parent is from a rerun after DETECT.md pinned its confirmation lines; the first run paraphrased `Parent:` and failed only `names-develop`.

| Case | Checks | Score | Cost/run | Turns |
|---|---|---|---|---|
| fix-vs-refactor | the fix lands inside the extracted helper; staged, merge left in progress, gate report, no commit or push | 1.00 | $0.36 | 17 |
| features-same-hunk | both imports, routes and menu entries kept; staged, merge left in progress, gate report, no commit or push | 1.00 | $0.31 | 15 |
| clean-merge-rename | the receipt imports `cartSubtotal`, no alias for `subtotal`; tests rerun on both tips; `formatCents` left as is and reported pre-existing | 1.00 | $0.30 | 9 |
| detect-parent | runs `context.sh parent`, names `develop` with its evidence, asks for yes; no merge, commit or push | 1.00 | $0.16 | 5 |

Wall time is not part of the baseline: with `-j 4`, three runs stalled about 9 minutes in the same window, outside any tool the skill runs.

`reads-conflict-context` is the one to watch: while the call lived only in RESOLVE.md, runs resolved correctly by hand with `git show` and skipped `context.sh conflicts`; it is now a SKILL.md step.
