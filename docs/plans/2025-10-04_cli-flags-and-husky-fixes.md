# CLI Flags and Husky Hook Improvements

## Goal

1. Add CLI flags to control output and exit behavior
2. Fix deprecated Husky boilerplate
3. Make hooks append-only (don't overwrite existing hooks)

## Plan

### 1. Add `--no-fail` CLI flag (--silent already exists!)

- Add `--no-fail` flag parsing in src/index.ts
- Wrap main() try-catch to always exit 0 when --no-fail is used
- Still print errors to stderr, but exit successfully

### 2. Update hook generation in git-hooks-manager.ts

- Remove Husky v9 deprecated boilerplate lines (lines 96-97, 108-109)
- Update command to use `--silent --no-fail` instead of `>/dev/null || true`
- Already has append logic! Just need to fix the boilerplate issue

### 3. Update existing hooks manually

- Update all 4 hooks (post-commit, post-checkout, post-merge, post-rewrite)
- Remove lines 1-2 (deprecated boilerplate)
- Change line 5: `bun run test:local >/dev/null || true` → `bun run test:local --silent --no-fail`

## Implementation Notes

- CLI tool is in `src/index.ts`
- Hook installation logic is in `src/git-hooks-manager.ts`
- Current hooks use `>/dev/null || true` which should be replaced with `--silent --no-fail`

## Completed

✅ Added `--no-fail` flag to CLI (src/index.ts:46, 77-79, 269, 278)
✅ Removed deprecated Husky v9 boilerplate from all hook generation code
✅ Updated hook generation to use `--silent --no-fail` instead of `>/dev/null || true`
✅ Updated all 4 existing hook files (post-commit, post-checkout, post-merge, post-rewrite)
✅ All checks pass (bun run signal)
