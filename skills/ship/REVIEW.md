# Review phase

Reviewers read the feature's diff the way a colleague would: they know **what** was asked (Ticket, Decisions) but not the developer's **how** (Plan, handoffs, this conversation), so they judge the code instead of inheriting its structure. The repo's own `verify` skill reviews when the repo has one; otherwise two independent reviewers do. They report; the user decides, or under `auto` autonomy ship applies its own recommendations. Entry: `/ship review`, or `/ship` with `phase: reviewing`.

## 1. Prepare

1. Uncommitted changes would escape the review: if `git status --porcelain` is not empty, ask the user to commit them or say "review anyway".
2. If `git log <base_commit>..HEAD` is empty, there is nothing to review; say so and stop.
3. Add 1 to `review_rounds` and open `### Round R` under **Review**.
4. Pick the reviewer: the repo's own verify skill when `<repo root>/.claude/skills/verify/SKILL.md` or `<repo root>/.agents/skills/verify/SKILL.md` exists (step 2a), else ship's two reviewers (step 2b).

## 2a. The repo's verify skill

1. Write the spec to `SHIP_HOME/repos/<key>/work/<state file name>.spec.md`: the state's **Ticket**, **Decisions** (with **Out of scope**) and **Amendments**, verbatim under those headings, without your own commentary. Overwrite it every round.
2. Run verify yourself, not from a subagent: it starts its own subagents, and a subagent cannot. It is usually user-invoked, so read its SKILL.md and follow it, with `$ARGUMENTS` set to `--base <base_commit> --spec <spec file>`, resolving its relative links from that file's folder. Let it finish; it writes `.verify/issues.json`.
3. Its result becomes findings:
   - **A deterministic check failed** (verify stopped before its reviewers): one finding, `[verify · blocker]`, naming the failing command and the relevant output. Report it alone; the next round reviews the rest once it is fixed.
   - **Every issue with `introduced: true`**: map `must` → `blocker`, `should` → `medium`, `suggest` → `low`, label it `verify:<reviewer>`, and keep the verify id so a fix chunk can read the issue's `problem`, `evidence`, `fix` and `touches`.
   - **Issues with `introduced: false`** were there before this feature: not findings. Add one line to the round: `- N pre-existing issues in touched files, see .verify/issues.json`.

Continue at step 3.

## 2b. Ship's two reviewers

1. **Effort** (only when the harness lets you set a subagent's reasoning effort). Ladder: `low < medium < high < xhigh < max`.
   - Configured effort: the first value found in the harness settings, most specific file first. For Claude Code: `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`; in each, `modelSettings.<current model>.effortLevel`, then `effortLevel`.
   - Reviewer effort = configured + `config.review_effort_bump` levels, capped at `max`. Nothing configured → `xhigh`.
2. **Thermo-nuclear skill**: the first `thermo-nuclear-code-quality-review/SKILL.md` found under `~/.agents/skills/`, `~/.claude/skills/`, `~/.cursor/skills/`, then the repo's `.agents/skills/` and `.claude/skills/`. Pass its **path**: the skill is user-invoked, so the reviewer reads the file instead of invoking it.
3. Run both in parallel subagents when the harness has them; otherwise one after the other, each starting from only its brief. Build the briefs from the state sections verbatim, without your own commentary. Both share:

> Review the changes in `git diff <base_commit>...HEAD` (commits: `git log --oneline <base_commit>..HEAD`). Read whatever code you need; do not edit any file. Report at most 10 findings, highest conviction first, each exactly as:
> `- severity: blocker|high|medium|low · file: path:line · finding: <one sentence> · remedy: <one or two sentences>`
> If nothing clears the bar, reply `No findings.`

**(a) Thermo-nuclear (code quality)**: paste the state's **Ticket** and **Decisions** as "what was asked; judge whether the structure is warranted by it, and never propose dropping a decided behaviour", then: "Read `<skill path>` and apply it to these changes." If the skill was not found, use its core prompt instead:

> Perform a deep code quality audit of the current branch's changes. Rethink how to structure / implement the changes to meaningfully improve code quality without impacting behavior. Work to improve abstractions, modularity, reduce Spaghetti code, improve succinctness and legibility. Be ambitious, if there is a clear path to improving the implementation that involves restructuring some of the codebase, go for it. Be extremely thorough and rigorous. Measure twice, cut once.

**(b) Spec conformance**: paste the state's **Ticket**, **Decisions** and **Amendments** (user-approved changes to what was asked), then: "Check the changes against these only: requirements missing or half-done, decisions implemented differently, work beyond the decisions (scope creep), anything listed as out of scope that was touched, amendments not reflected. Ignore code style and structure."

## 3. Report

Number every finding `R<round>.<n>`, blockers first, then by severity, labelled with its axis (and verify id, if any):

```
R1.1 [thermo · blocker] path:line: finding → remedy
R1.2 [verify:spec · medium] path:line: finding → fix (spec-001)
```

Give a recommendation for each: accept blockers and highs unless one contradicts a **Decision** (say which, and recommend rejecting it, since decisions are settled), and judge medium and low on cost versus value. Write every finding into the round, then:

- `chunk` or `review` autonomy: ask with the structured question UI: 'Accept recommendations' / 'Accept all' / 'Reject all'; the user's own text picks findings one by one.
- `auto` autonomy: apply your recommendations without asking. In round 2, accept only blockers; every other finding stays open, marked `open (round 2, passed to the PR)`. A rejected finding records your reason. Never start a round 3.

## 4. Triage into fix chunks

Done when every finding is marked `accepted → chunk K`, `rejected (<reason>)` or, under `auto` round 2, `open`.

- Group accepted findings into chunks: related findings share one chunk, and every chunk follows the plan phase's chunk rules (fields, green, tests, size). Name the finding numbers, and verify ids if any, in each chunk's goal. Append them to **Chunks** with `kind: review-fix`, `status: pending`.
- Fix chunks planned → set `phase: implementing`, say "N fix chunks planned.", and continue with [CHUNK.md](CHUNK.md) in the same turn.
- Nothing accepted → set `phase: finishing`, say "No fixes needed.", and continue with [FINISH.md](FINISH.md) in the same turn.
