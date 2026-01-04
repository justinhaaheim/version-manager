# Output Defaults & Gitignore Guard

**Date:** 2026-01-04
**Status:** Complete

## Goals

1. Change default output to compact (single line)
2. Fix bug: running generate-only command shouldn't modify .gitignore
3. Add guard: never modify files that aren't gitignored; print warnings instead
4. Improve help menu to make output format flags more discoverable

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

## Files Modified

1. `src/index.ts` - Extracted gitignore logic, added guard, changed default format
2. `src/git-utils.ts` - Added `isFileTrackedByGit()` function

## Testing Done

- `bun run test:local` shows compact single-line output
- `bun run test:local --verbose` shows full dashboard
- Signal check passes (ts-check, lint, prettier)
