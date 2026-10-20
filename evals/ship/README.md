# ship evals

Five cases run `ship` in a sandboxed repo built by each case's `scaffold.sh` (generated from `_fixture/fixture.sh` + the case's `setup.sh`; edit those, then run `scripts/sync-eval-fixtures.sh`).

```sh
scripts/eval.sh ship                              # all cases, 3 runs each (~$5, ~6 min)
scripts/eval.sh ship --case status-resume --runs 1 --keep-temp
```

Requires a working `/usr/bin/git`: the sandbox ignores your `PATH`.

The manual end-to-end check on real code is in [acceptance.md](acceptance.md).

## Baseline

Claude Opus 5.5, Sonnet judge, 3 runs per case, 2026-10-20: score 0.97, $4.79, 6 min.

| Case | Checks | Score | Cost/run | Turns |
|---|---|---|---|---|
| status-resume | resumes from state, reports, changes nothing | 1.00 | $0.12 | 3 |
| next-dirty-tree | refuses while the last chunk is uncommitted | 1.00 | $0.15 | 6 |
| next-implements-chunk | one chunk, verified, snapshot, handoff, no commit | 1.00 | $0.27 | 12 |
| plan-from-decisions | complete, vertical chunks that respect the Decisions | 0.89 | $0.27 | 8 |
| review-planted-issues | both reviewers catch a planted spec and quality issue | 0.95 | $0.79 | 3 |

Review briefs: reviewers that know what was asked (Ticket, Decisions) but not the Plan beat diff-only reviewers in an A/B: same catches, 6 vs 7–13 findings, 0 vs up to 3 contradicting a Decision.
