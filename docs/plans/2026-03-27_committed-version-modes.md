# Package-JSON Version Mode

**Date**: 2026-03-27

## Problem

The current mode generates a gitignored `dynamic-version.local.json`. This works well but:

- Requires the repo to be set up correctly
- CI pipelines need to be configured to generate the file
- The version in `package.json` never changes automatically

## Goal

Add a new `package-json` version mode where the `dynamicVersion` is **mirrored to `package.json`** on every commit via a **pre-commit hook**. This means `package.json` always has the correct computed version, with zero CI/consumer setup.

## Design

### Config

New optional field `versionMode` in `version-manager.json`:

```json
{
  "versionCalculationMode": "add-to-patch",
  "versionMode": "package-json",
  "versions": {}
}
```

- `'dynamic-file'` (default) — current behavior, fully backward compatible
- `'package-json'` — mirror to package.json via pre-commit hook

### Version Calculation (Pre-Commit)

Same git-traversal approach as current mode, no new config fields needed. Git history is the source of truth.

**Algorithm:**

1. Read current version from `package.json`
2. Find last commit where `package.json` version changed → `i` commits ago
3. Add 1 for the current (about-to-happen) commit → `i + 1`
4. Calculate new version based on mode:

**`add-to-patch`**: Current version is `X.Y.Z`, changed `i` commits ago → `X.Y.(Z + i + 1)`

**`append-commits`**: Current version is `X.Y.Z+N` (or `X.Y.Z` if no suffix):

- If has `+N`: → `X.Y.Z+(N + i + 1)`
- If no `+N`: → `X.Y.Z+(i + 1)`

5. Write new version to `package.json`
6. Run `npm i` / `bun i` to update lockfile
7. Stage `package.json` + lockfile
8. Also regenerate `dynamic-version.local.json` (for full metadata)

### Self-Healing

If commits are skipped (`--no-verify`), the next hook run sees a larger `i` value and jumps ahead correctly. Example:

- `0.1.0+3`, skip 2 commits → `0.1.0+(3 + 2 + 1)` = `0.1.0+6` ✓

### Bumping

`bump` sets a clean version (e.g., `0.2.0`), stripping any `+N` suffix. The next commit starts incrementing from there.

### Manual Edits

If the user directly edits the version in `package.json`, the hook treats that as the new starting point and increments from there. No special handling needed.

### Merge Conflicts

- `package.json` may conflict on the version field
- User resolves it (pick either side — doesn't matter which)
- On the merge commit, the pre-commit hook recalculates the correct version
- **No merge driver needed** — the pre-commit hook is the source of truth

### Post-checkout/merge/rewrite Hooks

These only update `dynamic-version.local.json` (same as current mode). They do NOT modify `package.json` — that would create unexpected dirty state after branch switches. Only the pre-commit hook writes to `package.json`.

## Implementation Plan

### 1. Types (`src/types.ts`)

- [ ] Add `VersionModeSchema = z.enum(['dynamic-file', 'package-json'])`
- [ ] Add optional `versionMode` to `VersionManagerConfigSchema` (defaults to `'dynamic-file'`)

### 2. Version Generator (`src/version-generator.ts`)

- [ ] Add `'main'` to `RESERVED_VERSION_NAMES`
- [ ] Export `calculateCodeVersion()` (currently private)
- [ ] New `calculatePreCommitVersion()` function:
  - Reads current package.json version
  - Finds last commit where it changed, counts commits since
  - Applies the +1 and mode-specific calculation
  - Returns the new version string
- [ ] New `generatePreCommitVersionData()` function:
  - Calls `calculatePreCommitVersion()`
  - Builds full `DynamicVersion` object with the pre-commit version
  - Returns `GenerateVersionResult`

### 3. Git Hooks Manager (`src/git-hooks-manager.ts`)

- [ ] Add `'pre-commit'` to supported hooks
- [ ] `installGitHooks()` reads `versionMode` from config:
  - `dynamic-file`: current behavior (post-commit/checkout/merge/rewrite)
  - `package-json`: **pre-commit** hook + post-checkout/merge/rewrite (for .local.json only)
- [ ] Pre-commit hook command uses a new CLI flag (e.g., `--pre-commit`)

### 4. CLI (`src/index.ts`)

- [ ] Add `--pre-commit` flag to default (generate) command
- [ ] When `--pre-commit`:
  1. Generate version with pre-commit calculation
  2. Write `dynamic-version.local.json`
  3. Update `package.json` version field
  4. Detect package manager, run lockfile update
  5. Stage `package.json` + lockfile + `dynamic-version.local.json` (if output path is known)

### 5. Script Manager (`src/script-manager.ts`)

- [ ] Add `updateLockfile()` helper (runs `npm i` / `bun i`)
- [ ] Add `stageFiles()` helper (runs `git add` on specific files)

### 6. Install Command Updates

- [ ] When `versionMode` is `package-json`:
  - Install pre-commit hook
  - Still install post-checkout/merge/rewrite for .local.json
  - Still set up .gitignore for .local.json
  - Do NOT add `dynamic-version.local.json` to committed files

### 7. Bump Command Updates

- [ ] Works same as current — updates `package.json` with clean version
- [ ] Strips any `+N` suffix before applying bump
- [ ] For `package-json` mode: also run lockfile update after bump

### 8. Tests

- [ ] Unit: `calculatePreCommitVersion()` for both modes
- [ ] Unit: +N parsing and incrementing
- [ ] Unit: skip/self-healing behavior
- [ ] Integration: pre-commit hook in temp git repo
- [ ] Integration: multiple commits produce incrementing versions
- [ ] Integration: bump resets base correctly
- [ ] Integration: skipped commits self-heal

## Files to Modify

1. `src/types.ts` — VersionMode schema
2. `src/version-generator.ts` — pre-commit version calculation
3. `src/git-hooks-manager.ts` — pre-commit hook support
4. `src/index.ts` — --pre-commit flag, install changes
5. `src/script-manager.ts` — lockfile/staging helpers
6. `tests/` — new test files
