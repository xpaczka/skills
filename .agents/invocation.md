# Model-invoked vs user-invoked

Every `SKILL.md` is split by one axis, **invocation**: who can reach it.

- **User-invoked**: reachable **only by the human typing its name**. Set `disable-model-invocation: true` in the frontmatter (Claude Code) and `policy.allow_implicit_invocation: false` in `agents/openai.yaml` (Codex). The `description` is **human-facing**: a one-line summary for a person browsing slash commands, with no trigger list.
- **Model-invoked**: reachable by **model or user**. The default: omit `disable-model-invocation` and the `policy` block. The `description` is **model-facing**: what the skill is, then one trigger per branch ("Use when the user wants…, mentions…"), leading word first. The test for staying model-invoked: _could the model usefully reach for this on its own?_

Each harness hides a user-invoked skill from the model in its own way, so nothing but the human can fire it, including another skill. A user-invoked skill may call model-invoked skills, never another user-invoked one.

Every skill carries `agents/openai.yaml` beside its `SKILL.md` with the Codex picker metadata, `interface.display_name` and `interface.short_description`, plus the `policy` line for user-invoked skills. Keep the pair in sync: a skill is user-invoked in both harnesses or in neither. `scripts/check.sh` enforces both.

## Dependencies between skills

A skill's own step that runs another skill says so with the tool: `Call the Skill tool with "grilling"`. Naming the tool fires it far more reliably than a `/grilling` dropped into prose, and the bare name assumes no harness's trigger syntax. Never link into another skill's folder (`../other/FILE.md`); material a skill owns is reached by calling that skill.

The Skill tool takes one skill per call. A step that needs two is two calls: `Call the Skill tool twice, for "grilling" and "tdd"`.

This only works for a **model-invoked** target. When a step depends on a user-invoked skill, address the human: "tell the user to run `/<name>`".

Prose that names skills for a human to pick from (the README catalog, a list of next commands) invokes nothing, so it keeps `/name` labels.

### Exception: reading a user-invoked skill by path

A subagent may follow a user-invoked external skill's instructions by reading its `SKILL.md` from disk when telling the human to run it would break the calling workflow. The step searches the harnesses' skill install folders for that `SKILL.md`, passes its path to the subagent, and gives a fallback for when nothing is found. The one use today: `ship`'s review phase ([REVIEW.md](../skills/ship/REVIEW.md), step 5) hands `thermo-nuclear-code-quality-review` to its quality reviewer this way, and owns the search order.

External skills also need an install line and a fallback: see [authoring.md](authoring.md#dependencies-on-external-skills).
