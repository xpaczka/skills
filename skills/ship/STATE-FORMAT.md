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
autonomy: review                # chunk | review | auto; /ship mode <level> switches it
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
- depends_on: []                  # chunks that must be committed first; ready chunks run in parallel
- commit_message: `feat(ABC-123): serialize invoices to CSV`
- commit:                        # short SHA, filled when the chunk is committed

## Amendments

- chunk 2: what changed, why, approved by user

## Review

### Round 1
- R1.1 [thermo · blocker] `src/invoices/csv.ts:42`: finding → remedy (accepted → chunk 5)
- R1.2 [verify:correctness · medium] `src/invoices/csv.ts:57`: finding → fix (correctness-001; rejected (contradicts the locale decision))
- 2 pre-existing issues in touched files, see `.verify/issues.json`

