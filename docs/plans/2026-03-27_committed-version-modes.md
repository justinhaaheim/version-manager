# Package-JSON Version Mode

## Problem

The current mode generates a gitignored `dynamic-version.local.json`. This works well but:

- Requires the repo to be set up correctly
- CI pipelines need to be configured to generate the file
- The version in `package.json` never changes automatically

## Goal

Add a new `package-json` version mode where the `dynamicVersion` is **mirrored to `package.json`** on every commit via a **pre-commit hook**. This means `package.json` always has the correct computed version, with zero CI/consumer setup.

## How It Works

1. Pre-commit hook fires
2. Generate version data (same as current `generateFileBasedVersion()`, but with commitsSince + 1)
3. Write `dynamic-version.local.json` (gitignored, for full metadata — same as today)
4. Mirror `dynamicVersion` to `package.json` `version` field
5. Run `npm i` / `bun i` to update lockfile
6. Stage `package.json` + lockfile
7. Commit proceeds with updated version

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

### Off-by-One Handling

At pre-commit time, the commit hasn't happened yet:

1. `generateFileBasedVersion()` counts N commits since last `package.json` version change
2. We know this commit is about to happen, so use N+1
3. Recalculate `dynamicVersion` with N+1
4. Write the result

**Important subtlety**: After writing the new version to `package.json`, the "last commit where package.json version changed" is still the old one (the write is uncommitted). So the count is still relative to the same base. This is correct — the +1 accounts for the commit that's about to include this new version.

**Self-healing**: If the file gets out of sync, the next commit recalculates from scratch and corrects it.

### Merge Conflicts

When merging branches that both incremented `package.json` version:

- `package.json` will have a merge conflict in the `version` field
- User resolves it (pick either side — doesn't matter which)
- On the merge commit, the pre-commit hook recalculates the correct version
- **No merge driver needed** — the pre-commit hook is the source of truth

### What About `add-to-patch` Mode?

With `add-to-patch`, the version in `package.json` changes every commit (e.g., `0.1.3` → `0.1.4`). But the base version detection (`findLastCommitWhereFieldChanged`) finds the last commit where the version changed — which is every commit. This would make commitsSince always 1.

**This is actually correct!** In `package-json` mode with `add-to-patch`:

- Base version is whatever was set by the last `bump` command
- Each commit increments patch by 1
- `findLastCommitWhereFieldChanged` finds the _previous_ commit (where the hook last changed it)
- commitsSince = 1, so we get base + 1... but wait, the base is already incremented

**Problem**: The base version keeps shifting because _every_ commit changes `package.json`. We need to track the "real" base version separately.

**Solution**: In `package-json` mode, store the base version in `version-manager.json` (e.g., under `versions.base` or a dedicated field like `baseVersion`). The pre-commit hook counts commits since that base was last set (i.e., since `version-manager.json` `baseVersion` last changed), not since `package.json` version last changed. Then `bump` updates the `baseVersion` in `version-manager.json`.

Wait — actually, the current system already uses `package.json` as the base. For `package-json` mode, we need a stable reference point. Two options:

**Option A**: Track base version in `version-manager.json` as a new field `baseVersion`. Count commits since that field last changed. `bump` updates this field.

**Option B**: Instead of counting commits since `package.json` version changed, count commits since `version-manager.json` `baseVersion` changed. This decouples the base from the auto-incremented package.json version.

**Going with Option A** — it's the cleanest separation. In `package-json` mode:

- `version-manager.json` has `baseVersion: "0.1.0"` (set by `bump` or manually)
- Pre-commit hook counts commits since `baseVersion` last changed in `version-manager.json`
- Writes computed version to `package.json`
- `package.json` version is always the _computed_ version, not the base

### Post-checkout/merge/rewrite Hooks

Still useful in `package-json` mode:

- After switching branches, the `package.json` version should reflect the new branch's state
- These hooks regenerate `dynamic-version.local.json` AND update `package.json`
- But they don't stage or commit (that's only the pre-commit hook's job)

Actually — should post-checkout update `package.json`? If you switch to a branch, the `package.json` from that branch already has its own version. Modifying it would create dirty state. **Better to only update `package.json` in the pre-commit hook.** Post-checkout/merge/rewrite only update `dynamic-version.local.json`.

## Implementation Plan

### 1. Types (`src/types.ts`)

- Add `VersionModeSchema = z.enum(['dynamic-file', 'package-json'])`
- Add optional `versionMode` to `VersionManagerConfigSchema` (defaults to `'dynamic-file'`)
- Add optional `baseVersion` to `VersionManagerConfigSchema` (used only in `package-json` mode)

### 2. Version Generator (`src/version-generator.ts`)

- Add `'main'` to `RESERVED_VERSION_NAMES`
- Export `calculateCodeVersion()` (currently private, needed by pre-commit logic)
- Add `generatePreCommitVersion()` function:
  - In `package-json` mode: counts commits since `baseVersion` last changed in `version-manager.json`
  - Adds 1 to commitsSince
  - Recalculates dynamicVersion
  - Returns adjusted DynamicVersion

### 3. Git Hooks Manager (`src/git-hooks-manager.ts`)

- Support installing `pre-commit` hook
- `installGitHooks()` reads `versionMode` from config:
  - `dynamic-file`: current behavior (post-commit/checkout/merge/rewrite)
  - `package-json`: pre-commit hook + post-checkout/merge/rewrite (for .local.json only)
- Pre-commit hook command uses a new `--pre-commit` CLI flag

### 4. CLI (`src/index.ts`)

- Add `--pre-commit` flag to default (generate) command
- When `--pre-commit`:
  1. Read config, check `versionMode`
  2. Generate version with +1 commitsSince
  3. Write `dynamic-version.local.json`
  4. Update `package.json` version field
  5. Run lockfile update (`npm i` / `bun i`)
  6. Stage `package.json` + lockfile
- Update `install` command to branch on versionMode

### 5. Bump Command Updates

- In `package-json` mode, `bump` should:
  - Update `baseVersion` in `version-manager.json`
  - Update `package.json` version to the new base
  - Run lockfile update

### 6. Tests

- Unit tests for the +1 commit count logic
- Unit tests for `package-json` mode version calculation with `baseVersion`
- Integration tests:
  - Pre-commit hook increments version in `package.json`
  - Multiple commits produce incrementing versions
  - `bump` resets the base correctly

## Files to Modify

1. `src/types.ts` — VersionMode schema, baseVersion field
2. `src/version-generator.ts` — generatePreCommitVersion(), export calculateCodeVersion()
3. `src/git-hooks-manager.ts` — pre-commit hook support, versionMode-aware installation
4. `src/index.ts` — --pre-commit flag, install command changes
5. `src/script-manager.ts` — may need lockfile update helper
6. Tests (new + modified)
