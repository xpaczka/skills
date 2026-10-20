# Review phase

Two independent reviewers read the feature's diff the way a colleague would: they know **what** was asked (Ticket, Decisions) but not the developer's **how** (Plan, handoffs, this conversation), so they judge the code instead of inheriting its structure. Build their briefs from the state sections verbatim, without your own commentary. They report; the user decides. Entry: `/ship review`, or `/ship` with `phase: reviewing`.

## 1. Prepare

1. Uncommitted changes would escape the review: if `git status --porcelain` is not empty, ask the user to commit them or say "review anyway".
2. If `git log <base_commit>..HEAD` is empty, there is nothing to review; say so and stop.
3. Add 1 to `review_rounds` and open `### Round R` under **Review**.
4. **Effort** (only when the harness lets you set a subagent's reasoning effort). Ladder: `low < medium < high < xhigh < max`.
   - Configured effort: the first value found in the harness settings, most specific file first. For Claude Code: `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`; in each, `modelSettings.<current model>.effortLevel`, then `effortLevel`.
   - Reviewer effort = configured + `config.review_effort_bump` levels, capped at `max`. Nothing configured → `xhigh`.
5. **Thermo-nuclear skill**: the first `thermo-nuclear-code-quality-review/SKILL.md` found under `~/.agents/skills/`, `~/.claude/skills/`, `~/.cursor/skills/`, then the repo's `.agents/skills/` and `.claude/skills/`. Pass its **path**: the skill is user-invoked, so the reviewer reads the file instead of invoking it.

## 2. Run the reviewers

In parallel subagents when the harness has them; otherwise one after the other, each starting from only its brief. Both briefs share:

> Review the changes in `git diff <base_commit>...HEAD` (commits: `git log --oneline <base_commit>..HEAD`). Read whatever code you need; do not edit any file. Report at most 10 findings, highest conviction first, each exactly as:
> `- severity: blocker|high|medium|low · file: path:line · finding: <one sentence> · remedy: <one or two sentences>`
> If nothing clears the bar, reply `No findings.`

**(a) Thermo-nuclear (code quality)**: paste the state's **Ticket** and **Decisions** as "what was asked; judge whether the structure is warranted by it, and never propose dropping a decided behaviour", then: "Read `<skill path>` and apply it to these changes." If the skill was not found, use its core prompt instead:

> Perform a deep code quality audit of the current branch's changes. Rethink how to structure / implement the changes to meaningfully improve code quality without impacting behavior. Work to improve abstractions, modularity, reduce Spaghetti code, improve succinctness and legibility. Be ambitious, if there is a clear path to improving the implementation that involves restructuring some of the codebase, go for it. Be extremely thorough and rigorous. Measure twice, cut once.

**(b) Spec conformance**: paste the state's **Ticket**, **Decisions** and **Amendments** (user-approved changes to what was asked), then: "Check the changes against these only: requirements missing or half-done, decisions implemented differently, work beyond the decisions (scope creep), anything listed as out of scope that was touched, amendments not reflected. Ignore code style and structure."

## 3. Report

Number every finding `R<round>.<n>`, blockers first, then by severity, labelled with its axis:

```
R1.1 [thermo · blocker] path:line — finding → remedy
R1.2 [spec · high] path:line — finding → remedy
```

Give a recommendation for each: accept blockers and highs unless one contradicts a **Decision** (say which, and recommend rejecting it, since decisions are settled), and judge medium and low on cost versus value. Write every finding into the round, update `metrics.review` (`findings`, `by_axis`, `by_severity`), and ask the user which to accept.

## 4. Triage into fix chunks

Done when every finding is marked `accepted → chunk K` or `rejected — <user's reason>`.

- Group accepted findings into chunks: related findings share one chunk, and every chunk follows the plan phase's chunk rules (fields, green, tests, size). Append them to **Chunks** with `kind: review-fix`, `status: pending`. Add the accepted count to `metrics.review.accepted`.
- Fix chunks planned → set `phase: implementing`; end with "N fix chunks planned. `/ship next` to start."
- Nothing accepted → set `phase: finishing`; end with "No fixes needed. `/ship` to finish."
