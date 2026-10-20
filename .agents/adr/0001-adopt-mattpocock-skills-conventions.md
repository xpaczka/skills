# Adopt mattpocock/skills conventions, keep this repo's stricter rules

This repo follows the structure and authoring patterns of [mattpocock/skills](https://github.com/mattpocock/skills) as of commit `5beb35b` (2026-10-19), so its skills read and install like the wider ecosystem. Where this repo's own rules were already stricter, they stay on top. Every rule a script can check lands in `scripts/check.sh`, because unchecked rules drift.

## Adopted

- Guidelines in root `AGENTS.md` with `CLAUDE.md` as `@AGENTS.md`, topic docs in `.agents/*.md`, ADRs in `.agents/adr/`. `AGENTS.md` rather than `CLAUDE.md` is the source because Cursor and Codex read it too.
- Reference files flat beside `SKILL.md` with UPPERCASE names, runtime templates as `*-FORMAT.md`; only `scripts/` and `agents/` as subfolders.
- `agents/openai.yaml` on every skill, paired with the user- vs model-invoked split.
- Skill-to-skill calls worded `Call the Skill tool with "<name>"`, one skill per call; a user-invoked skill is never called, the human is told to run it. No relative links into another skill's folder.
- No em-dashes in tracked files (only `evals/*/results/` is exempt).
- README catalog as **User-invoked** / **Model-invoked** lists.

## Kept from this repo

- Line budgets: `SKILL.md` at most 120 lines, other skill `.md` files at most 150.
- The harness-capability table, so skills degrade outside Claude Code.
- A 2 to 3 line fallback wherever a skill depends on an external skill.
- Zero-dependency bundled scripts (POSIX shell or Node 22 or later).
- Per-skill eval suites in `evals/<skill>/`.
- `.editorconfig` formatting rules, enforced by `scripts/check.sh`.

## Considered Options

- **Bucket folders** (`engineering/`, `productivity/`, `misc/`, `in-progress/`, `deprecated/`): rejected. A personal repo this size gains nothing from the nesting.
- **Subfolders for file families** (`phases/`, `templates/`): rejected for upstream's flat UPPERCASE files.
- **Linking into or telling the user to run a user-invoked reviewer**: rejected for one documented exception. `ship`'s review phase passes `thermo-nuclear-code-quality-review`'s `SKILL.md` path to a subagent, because asking the human to run it would break the phase.
- **Skipped for now**: per-skill docs pages, `SCOPE.md` / `.out-of-scope/`, issue templates and triage labels, changesets / `CHANGELOG.md` / `package.json` / version sync / `.agents/install-block.md`, a router skill, `GLOSSARY.md`, the plugin `skills` array and `marketplace.json`. Revisit when the repo has more than a handful of skills or outside users.
