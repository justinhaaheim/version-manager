# Output Defaults & Gitignore Guard

**Date:** 2026-01-04
**Status:** Complete

## Goals

1. Change default output to compact (single line)
2. Fix bug: running generate-only command shouldn't modify .gitignore
3. Add guard: never modify files that aren't gitignored; print warnings instead
4. Improve help menu to make output format flags more discoverable
5. Show derivation context for add-to-patch mode

## Implementation Summary

### Step 1: Change Default Output Format ✅

- Changed fallback in `generateVersionFile()` from `'normal'` to `'compact'`
- Output now defaults to single-line: `📦 0.4.6+1 🌿main 💾✓`

### Step 2: Move Gitignore Logic to Install Only ✅

- Extracted gitignore check/update logic from `generateVersionFile()` into new `ensureGitignoreEntries()` function
- Only called from `installCommand()`, not from `generateVersionFile()`
- `generateVersionFile()` now focuses solely on generating the version file

### Step 3: Add Guard for Tracked Files ✅

- Added `isFileTrackedByGit(filepath)` utility to `git-utils.ts`
- `ensureGitignoreEntries()` checks if .gitignore is tracked before modifying
- If tracked, prints warning: `⚠️  Skipping .gitignore update: file is tracked in git. Please add [files] manually.`

### Step 4: Improve Help Menu ✅

- Added epilog to yargs:
  ```
  Output verbosity:
    (default)   Single-line summary
    --verbose   Full status dashboard with details
    --silent    No output (for scripts/hooks)
  ```

### Step 5: Show Derivation for Add-to-Patch Mode ✅

- For `append-commits` mode: `📦 0.4.6+2` (derivation already visible in version)
- For `add-to-patch` mode: `📦 0.4.8 (0.4.6+2)` (shows how 0.4.8 was derived)
- Updated `formatCompact()` in output-formatter.ts

## Files Modified

1. `src/index.ts` - Extracted gitignore logic, added guard, changed default format
2. `src/git-utils.ts` - Added `isFileTrackedByGit()` function
3. `src/output-formatter.ts` - Added derivation context for add-to-patch mode
4. `CLAUDE.md` - Updated testing section with current test structure

## Tests Added

- `tests/unit/output-formatter.test.ts` - Unit tests for all output formats
- `tests/unit/git-utils.test.ts` - Unit tests for `isFileTrackedByGit()`
- `tests/integration/cli-output.test.ts` - Integration tests for CLI output

## Testing Done

- All 46 stable tests pass
- Signal check passes (ts-check, lint, prettier)

## Commits

1. `cbd5299` - Initial implementation (gitignore guard, default compact output)
2. `2ed0e01` - Doc updates
3. `2ff16fe` - Derivation for add-to-patch mode, tests added
