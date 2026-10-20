# Setup phase

Runs once per repo (automatically when the repo config is missing) or on `/ship setup`. You find the **facts** yourself; you ask the user only the **decisions**. Keys and their meaning: [CONFIG-FORMAT.md](CONFIG-FORMAT.md).

## 1. Detect facts

Look these up; do not ask the user for any of them.

- **default_branch** — `git symbolic-ref --short refs/remotes/origin/HEAD` without the `origin/` prefix; else whichever of `main` / `master` exists.
- **checks** — the exact typecheck, lint and test commands. Prefer what CI runs (`.github/workflows/*`, other CI config), then task runners (`package.json` scripts, `Makefile`, `justfile`, `pyproject.toml`, `Cargo.toml`). Use the package manager the lockfile implies. Leave a check empty when the repo has none.
- **branch_convention** — first from written rules (`CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `docs/agents/`); else infer a pattern from `git branch -a --sort=-committerdate --format='%(refname:short)' | head -30`; else `<id>-<slug>`.
- **commit_style** — from `git log -30 --format=%s`: `conventional` when most subjects match `type(scope): subject`; otherwise one line describing the style, with a real example.
- **pr.host** — from the origin URL (github / bitbucket / gitlab / other).
- **pr.template** — the first that exists, case-insensitive: `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, `docs/pull_request_template.md`, `pull_request_template.md`.
- **tracker** — the first that applies:
  1. `docs/agents/issue-tracker.md` exists → `kind` from its content, `how` = that path.
  2. Issue IDs in recent branch names or commit subjects (e.g. `ABC-123`, `#123`) **and** a matching tracker connector is available in this harness → that `kind`, `how` = the connector's name.
  3. GitHub remote, `gh` installed, issues referenced as `#123` → `github`, `how: gh`.
  4. Otherwise `none`.

Done when every fact key has a value or is deliberately empty.

## 2. Ask the decisions

Show the detected facts as one compact block, then ask in a single round (structured question UI if the harness has one):

1. **PR default** — `draft` or `ready`. Recommend the global value, or `draft` if there is none.
2. **Default tracker writes** — `none`, `comment`, or `comment+status`. Recommend the global value, or `none`. Skip when `tracker.kind` is `none`.
3. **Corrections** — "Is any detected fact wrong?" Apply what the user corrects.
4. Only when `SHIP_HOME/config.yml` does not exist: **save answers 1–2 as global defaults** for future repos? Recommend yes.

## 3. Write

- Write `SHIP_HOME/repos/<key>/config.yml` from the YAML block in [CONFIG-FORMAT.md](CONFIG-FORMAT.md), every key filled.
- If the user agreed in question 4, write `SHIP_HOME/config.yml` with the decision keys only.
- Print one line: where the config is, and how to change it (`/ship setup`).

Done when the repo config exists with every key. Then continue with the subcommand the user originally ran; a bare `/ship setup` ends here.
