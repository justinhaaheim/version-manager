# File-Based Versioning System Migration

**Date:** 2025-10-08
**Model:** Claude Sonnet 4.5

## Goal

Replace the current git tag-based versioning system with a file-based versioning system that:

- Uses `version-manager.json` as the source of truth (committed to repo)
- Tracks commits since last `codeVersionBase` field change (not since last git tag)
- Supports two version calculation modes: "add-to-patch" and "append-commits"
- Generates `dynamic-version.local.json` with computed versions

## Current System (Tag-Based)

- Uses `git describe --always --tags --dirty` as source of truth
- Parses tag format like `v0.2.11-5-g3a7f9b2-dirty`
- Has `--increment-patch` flag to add commit count to patch version
- Generates `dynamic-version.local.json` with fields:
  - `describe`, `branch`, `dirty`, `timestamp`, `humanReadable`, `components`, `version`

## New System (File-Based)

### Three Storage Mechanisms

1. **version-manager.json** (committed):
   - `codeVersionBase`: Last explicitly set code version (e.g., "1.3.0")
   - `runtimeVersion`: Current runtime version for OTA compatibility
   - `versionCalculationMode`: "add-to-patch" | "append-commits"

2. **dynamic-version.local.json** (gitignored, generated):
   - `codeVersion`: Computed version based on calculation mode
   - `runtimeVersion`: Copied from version-manager.json
   - `buildNumber`: (Phase 2) Timestamp from BUILD_NUMBER env var

3. **BUILD_NUMBER** (Phase 2): Environment variable with timestamp

### Version Calculation Modes

**Mode A: "add-to-patch"**

- Base "1.3.0" + 5 commits → "1.3.5"
- Adds commit count to patch version

**Mode B: "append-commits"**

- Base "1.3.0" + 5 commits → "1.3.0+5"
- Appends commit count as metadata

### Algorithm

```typescript
function getCodeVersion() {
  const {
    codeVersionBase,
    versionCalculationMode,
  } = require('../version-manager.json');

  // Find last commit where codeVersionBase VALUE changed
  const lastCommit = findLastCommitWhereFieldChanged(
    'version-manager.json',
    'codeVersionBase',
  );

  // Count commits since then
  const commitsSince = countCommitsBetween(lastCommit, 'HEAD');

  if (commitsSince === 0) {
    return codeVersionBase;
  }

  if (versionCalculationMode === 'add-to-patch') {
    const [major, minor, patch] = codeVersionBase.split('.').map(Number);
    return `${major}.${minor}.${patch + commitsSince}`;
  } else if (versionCalculationMode === 'append-commits') {
    return `${codeVersionBase}+${commitsSince}`;
  }

  // Fallback
  const [major, minor, patch] = codeVersionBase.split('.').map(Number);
  return `${major}.${minor}.${patch + commitsSince}`;
}
```

## Phase 1 Tasks

- [x] Create scratchpad document
- [x] Update src/types.ts with new interfaces
- [x] Add git utilities to track codeVersionBase field changes
- [x] Update src/version-generator.ts to use file-based versioning
- [x] Create version-manager.json initialization logic
- [x] Update src/index.ts to initialize version-manager.json
- [x] Test the implementation
- [x] Run signal checks

## Testing Results

✅ Successfully tested both version calculation modes:

- **add-to-patch mode**: Base 0.1.0 + 1 commit → 0.1.1
- **append-commits mode**: Base 0.1.0 + 1 commit → 0.1.0+1

✅ All lint, TypeScript, and formatting checks pass

## Phase 1 Complete

The file-based versioning system is now fully implemented and working:

1. ✅ `version-manager.json` config file support
2. ✅ Tracks commits since last `codeVersionBase` change (not just file changes)
3. ✅ Two version calculation modes working correctly
4. ✅ `dynamic-version.local.json` generation with new format
5. ✅ CLI prompts to create config if missing
6. ✅ Git hooks integrate seamlessly
7. ✅ All code quality checks pass

## Phase 2 (Deferred)

- BUILD_NUMBER support using cross-env
- CLI commands for version bumping
- Runtime version management commands

## Implementation Notes

### Key Challenge: Tracking Field Value Changes

Need to parse git history of version-manager.json to find when `codeVersionBase` **value** changed:

- Can't just track file changes (file might change for other reasons)
- Need to parse JSON from git history
- Compare `codeVersionBase` values between commits

### Approach

1. Get git log for version-manager.json: `git log --format=%H -- version-manager.json`
2. For each commit, read the file content: `git show <commit>:version-manager.json`
3. Parse JSON and extract `codeVersionBase`
4. Find first commit where value differs from current
5. Count commits from there to HEAD

### Edge Cases

- version-manager.json doesn't exist → create with defaults
- Not in git repo → use base version as-is
- No commits since last change → use base version (0 commits)
- Invalid versionCalculationMode → fallback to "add-to-patch"

## Testing Plan

1. Create test version-manager.json with base version
2. Make some commits
3. Run version generator
4. Verify computed version matches expected
5. Test both calculation modes
6. Test edge cases
