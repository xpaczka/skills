# Plan phase

Turns settled **Decisions** into approved, commitable **Chunks**. Entry: `phase: planning`. The state's Ticket, Related work and Decisions are your whole brief; do not re-ask anything they settle.

## 1. Explore

Enter the harness plan mode if it has one; otherwise stay read-only until approval. Find what the decisions touch: the files to change, existing helpers and patterns to reuse, how the repo tests similar code, and the configured `checks`. Use subagents for broad searches when the harness has them, so file dumps stay out of your context.

If exploring reveals a decision the state does not settle, never guess it silently: draft the plan assuming your recommended answer, and list each such question above the draft with that answer, so one reply settles the questions and approves the plan. Add the answers to **Decisions**.

## 2. Draft

**Approach**: 3–6 bullets: the shape of the solution, key files, what is reused, risks.

**Chunks**: order them so dependencies come first and the first chunk proves the riskiest assumption (a tracer bullet). Every chunk:

- is a **vertical slice**, observable behaviour end to end where possible; never "all types, then all logic, then all UI";
- leaves every configured check **green** on its own;
- ships its **tests in the same chunk**;
- stays reviewable in 10–15 minutes: roughly ≤ 400 changed lines, split it otherwise;
- fills every field of a chunk in [templates/state.md](../templates/state.md):
  - `acceptance`: the exact commands that prove the chunk works;
  - `tdd`: `yes` for logic with rules, branches, parsing or state, listing the **seams** (the public functions or endpoints the tests drive); `no` with a reason for wiring, UI and config;
  - `executor`: `subagent` only for mechanical high-volume work whose acceptance commands fully define done (codemods, bulk renames, generated fixtures), or for exploration-heavy work whose raw output the user does not need; otherwise `main`. Always give the reason;
  - `commit_message`: in `config.commit_style`; with `conventional`, use the feature ID as the scope.

## 3. Approve

Present the approach, then every chunk in this shape, every field filled (no summary table: the user approves the flags, not only the titles):

```
### N. <title>
- goal: …
- files: …
- acceptance: `…`
- tdd: yes — seams: … | no — <reason>
- executor: main | subagent — <reason>
- commit: `…`
```

Use the plan-mode approval UI if the harness has one, else ask for approval in chat. Revise until the user approves. Approval also confirms each `tdd: yes` chunk's seams, so the `tdd` skill does not ask again.

## 4. Persist

Done when the state file holds the approved plan, after leaving plan mode:

- **Plan**: approach, key files, risks, and the checks every chunk runs;
- **Chunks**: every chunk with `status: pending`, `kind: plan`;
- `metrics.chunks_planned` = the number of chunks;
- `phase: implementing` and its Timeline entry.

End with:

> Plan saved — N chunks. `/clear`, then `/ship next` to start chunk 1.
