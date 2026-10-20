---
feature: ABC-123                # issue ID, or a slug for free-text tasks
title: Invoice CSV export
branch: ABC-123-invoice-csv-export
repo_key: owner-repo
base_commit: 0000000            # HEAD when the branch was created
phase: grilling                 # grilling | planning | implementing | reviewing | finishing | done
quick: false
source: github                  # linear | jira | github | file | text
source_ref: ABC-123             # issue ID, URL, or file path
tracker_writes: none            # none | comment | comment+status, chosen for this feature
review_rounds: 0
---

# ABC-123: Invoice CSV export

## Ticket

The issue body, verbatim (or the task text). Link to the source.

## Related work

- `ABC-118`: why it is related; the decision from its record this feature relies on.

## Decisions

Settled during grilling. One bullet each: **what**: **why** (and the alternative rejected).

- Dates use the user's locale: accountants open the file in Excel, which misreads ISO dates in their locale. Rejected: ISO 8601 (correct but unreadable for them).

## Plan

The approved plan: approach, key files, risks, and the checks every chunk runs.

## Chunks

### 1. CSV serializer for invoices
- status: pending                # pending | in-progress | handed-off | committed
- kind: plan                     # plan | amendment | review-fix
- goal: one sentence
- files: `src/invoices/csv.ts`, `src/invoices/csv.test.ts`
- acceptance: `<checks.test> src/invoices`
- tdd: yes (seams: `toCsv(invoices)`)
- executor: main (core logic the user will want to read closely)
- commit_message: `feat(ABC-123): serialize invoices to CSV`
- handoff_snapshot:              # scripts/snapshot.sh output at handoff
- commit:                        # the user's commit SHA, filled by the next /ship next

## Amendments

- chunk 2: what changed, why, approved by user

## Review

### Round 1
- R1.1 [thermo · blocker] `src/invoices/csv.ts:42`: finding → remedy (accepted → chunk 5)

## Metrics

```json
{
  "chunks_planned": 0,
  "chunks_shipped": 0,
  "amendments": 0,
  "verify_failures": {},
  "rework_lines": {},
  "user_turns": {},
  "review": { "findings": 0, "accepted": 0, "by_axis": {}, "by_severity": {} }
}
```

Per-chunk maps are keyed by chunk number.

## Timeline

- grilling 2026-10-20T09:00:00Z
