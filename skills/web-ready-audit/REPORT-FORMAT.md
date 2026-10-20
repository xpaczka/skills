# Report format

The audit's only output, written in chat. No file is written.

```md
## web-ready-audit: <target>

- **Target**: <url> (from the argument | from `<file:line>` | local build, no production URL found)
- **App**: `<path>` (<stack, or "unrecognized">); head from <file or API>; build `<command>`; serve `<command>` | static
- **Runtime**: <installed> (declared <version> in `<file>` | none declared)<; mismatch: build may differ from production>
- **Layers**: source ✔ · build ✔ | ✘ | skipped (<reason>) · typecheck ✔ | ✘ | none · lint ✔ | ✘ | none · runtime: live <url> | local `<command>` on :<port> | emitted HTML in `<folder>` | skipped (<reason>)
- **Tool**: probe.mjs on <runtime and version> | <fallback tool> (unverified: <facts>)
- **Pages**: <N> URLs found (<sitemap M>, <links K>), <C> checked; not covered: <templates or routes, or "none">
- **Not verifiable**: <check: reason>, ...
- **Not verified locally**: <deploy-only checks>, ... (local runs only)

### Blocker (<n>)

1. **<short title>**: <what is wrong, with the observed value>.
   Evidence: `<file:line>` | <url>
   Fix: <one line>

### Should fix (<n>)

...

### Nice to have (<n>)

...

### Verify yourself

- <an open question the scan raised, and how to check it>
```

## Rules

- Every tier heading appears; an empty tier reads "None found."
- Within a tier, order findings by category in the SKILL.md table order, then by how many pages they affect.
- One finding per cause: when the same cause hits several pages, list it once and name the pages (or the count and two examples).
- Evidence quotes the observed value (the canonical URL, the robots line, the header) so the reader need not re-run anything.
- "Verify yourself" holds only questions this scan raised. Omit the section when there are none.
- End with one line: the count per tier.
