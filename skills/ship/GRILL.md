# Grill phase

Turns a ticket into settled **Decisions** in the state file. Entry: `/ship <input> [--quick]` (new feature, steps 1–6) or a resume with `phase: grilling` (read the state's Decisions, then continue at step 5 from the questions still open).

## 1. Resolve the ticket

| Input | Ticket body | `feature` | `source` |
|---|---|---|---|
| Path to an existing `.md` file | The file's content | Issue-ID prefix of the filename (`[A-Z][A-Z0-9]+-[0-9]+`), else the filename as a slug | `file` |
| An issue ID (`ABC-123`, `#123`) | Fetch it as `config.tracker.how` says: follow that doc, use that connector, or `gh issue view`. If fetching fails, ask the user to paste the body. | The ID | `config.tracker.kind` |
| Anything else | The text | Kebab-case slug, ≤ 5 words | `text` |

Collect issue IDs the ticket links or mentions; step 4 uses them.

## 2. Branch

- On `default_branch`: build the name from `branch_convention` and run `git switch -c <name>`. If the tree has uncommitted changes, ask first; they would move to the new branch.
- On another branch: ask "Use `<branch>` as the feature branch?" If no, ask which branch to create.
- `base_commit` = `git merge-base HEAD <default_branch>`.

## 3. Create the state file

Create it from [STATE-FORMAT.md](STATE-FORMAT.md): frontmatter filled, `phase: grilling`, `quick` set, the ticket body verbatim under **Ticket**, the first **Timeline** entry. Replace every example value from the template; keep the section headings.

## 4. Pull in related work

Search `SHIP_HOME/repos/<key>/records/` for the ticket's ID, its linked IDs, and 3–5 key domain terms from the ticket. For each relevant record, read its **Decisions** and **Notes for future work**, then add a **Related work** bullet naming the decision this feature inherits.

Inherited decisions count as already settled. If the ticket contradicts one, that conflict is the first question in step 5.

## 5. Grill

Facts (what the code does, which APIs exist, versions) are yours to find; dispatch subagents for them when the harness has subagents. Decisions are the user's.

- **Full** (`quick: false`): call the `grilling` skill. Brief it with the ticket, the inherited decisions as "already settled", and what you know about the codebase.
  - Fallback when `grilling` is missing: ask every open decision whose prerequisites are settled as one numbered round; give your recommended answer for each, worded so "yes" accepts it. Repeat until no decision is open and the user confirms you share an understanding.
- **Quick** (`quick: true`): one round of the 2–3 decisions where a wrong guess would waste a whole chunk, each with a recommended answer.
- **Tracker writes**: when `source` is a tracker and `tracker.kind` is not `none`, add a question to the first round: "Tracker writes for this feature: none / comment / comment+status?", recommending `tracker_writes_default`. Otherwise set `tracker_writes: none`.

After **each** round, write the newly settled decisions into **Decisions** before asking the next round, so a cleared or compacted context loses nothing.

## 6. Close

Decisions are written for a planner who never saw this conversation:

- one bullet per decision: **what** — **why**, plus the alternative rejected when there was one;
- an **Out of scope** bullet listing what the user excluded;
- constraints the user mentioned in passing (deadlines, files not to touch, compatibility).

Done when the user has confirmed the shared understanding (full) or answered the round (quick), and every decision is in the state file. Then set `phase: planning`, append the Timeline entry, and end with:

> Grilling done — N decisions saved. `/clear`, then `/ship` to plan.

(Use the capability table's wording when the harness cannot clear context.)
