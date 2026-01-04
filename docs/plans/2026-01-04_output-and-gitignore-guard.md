# Output Defaults & Gitignore Guard

**Date:** 2026-01-04
**Status:** In Progress

## Goals

1. Change default output to compact (single line)
2. Fix bug: running generate-only command shouldn't modify .gitignore
3. Add guard: never modify files that aren't gitignored; print warnings instead
4. Improve help menu to make output format flags more discoverable

## Problem Analysis

### Issue 1: Default Output Too Verbose

- Current default: `normal` format (multi-line tree-style)
- Desired default: `compact` format (single line)
- Flags exist: `--compact`, `--verbose`, `--silent`

### Issue 2: Gitignore Modified Outside Install

Location: `src/index.ts` `generateVersionFile()` function (lines 115-179)

- The gitignore check/update logic runs on EVERY command including the default generate command
- This caused issues during a rebase because every checkout was modifying .gitignore
- Should only happen during `install` command

### Issue 3: No Guard Against Modifying Tracked Files

- Currently the tool can modify .gitignore even if it's a tracked file
- This is dangerous during rebases, merges, etc.
- Need to check if a file is gitignored before modifying it
- If not gitignored, print a warning and skip the modification

## Implementation Plan

### Step 1: Change Default Output Format

- [x] In `output-formatter.ts`, the formats are already defined correctly
- [x] In `index.ts`, change the default format from `null` (falling back to config or 'normal') to `'compact'`
- Actually: Keep CLI default as null, but change the fallback in `generateVersionFile()` from 'normal' to 'compact'

### Step 2: Move Gitignore Logic to Install Only

- [ ] Extract gitignore check/update logic from `generateVersionFile()` into a separate function
- [ ] Only call this function from `installCommand()`, not from `generateVersionFile()`
- [ ] The `generateVersionFile()` function should focus solely on generating the version file

### Step 3: Add Guard for Tracked Files

- [ ] Create a utility function `isFileGitignored(filepath)` in `git-utils.ts`
- [ ] Before modifying any file (like .gitignore), check if it's gitignored
- [ ] If the file we want to modify is NOT gitignored (i.e., it's tracked), print a warning and skip
- [ ] Warning format: `⚠️  Skipping update to [filename]: file is tracked in git`

### Step 4: Improve Help Menu

- [ ] Add descriptive epilog to yargs showing output format examples
- [ ] Make `--verbose` more prominent in help

## Files to Modify

1. `src/index.ts` - Move gitignore logic, add guard
2. `src/git-utils.ts` - Add `isFileGitignored()` function
3. `src/output-formatter.ts` - No changes needed (formats already correct)

## Testing

- Run `bun run test:local` to verify compact output is default
- Run `bun run test:local --verbose` to verify verbose still works
- During a rebase, verify no files are modified by the generate command
- Verify install command still works and updates gitignore appropriately
