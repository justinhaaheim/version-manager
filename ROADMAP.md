# Roadmap

## Vision

A reliable, zero-config version management tool that automatically tracks version numbers from git history, with clear output and predictable behavior.

## In Progress

- [2026-01-04 Output & Gitignore Guard](docs/plans/2026-01-04_output-and-gitignore-guard.md)

## Next Actions

1. **Change default output to compact single-line** - Currently defaults to multi-line 'normal' format; should default to compact for cleaner terminal output
2. **Fix gitignore update happening outside install command** - Running `npx @justinhaaheim/version-manager` (generate only) shouldn't modify .gitignore; only `install` should
3. **Add guard to prevent modifying non-gitignored files** - Never modify tracked files; print warning instead
4. **Improve help menu clarity** - Make `--verbose` and other output flags more discoverable

## Backlog

- Add automated testing framework (see docs/plans/2025-10-10_testing-framework.md)
- Consider adding `--json` output mode for programmatic use
- Metro plugin improvements
