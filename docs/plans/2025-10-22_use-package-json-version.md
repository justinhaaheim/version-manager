# Use package.json version instead of codeVersionBase

**Date:** 2025-10-22 (continued 2025-10-23)
**Status:** ✅ Complete

## Goal

Refactor the version-manager to use the standard `version` field from `package.json` as the base version for calculations, instead of requiring a separate `codeVersionBase` field in `version-manager.json`. The `runtimeVersion` will remain in `version-manager.json`.

**Note:** No backward compatibility - this is a breaking change. `codeVersionBase` will be completely removed.

## Motivation

- **Better npm integration**: Aligns with standard npm package versioning conventions
- **Single source of truth**: Package version lives in the standard location
- **Reduced duplication**: No need to maintain version in two places
- **Better for npm packages**: More natural workflow for publishing packages
- **Simpler**: No backward compatibility complexity

## Changes Required

### 1. Type Definitions (src/types.ts)

- [ ] Remove `codeVersionBase` from `VersionManagerConfigSchema`

```typescript
export const VersionManagerConfigSchema = z.object({
  runtimeVersion: z.string(),
  versionCalculationMode: VersionCalculationModeSchema,
});
```

### 2. version-generator.ts

- [ ] Add function to read `version` from package.json
- [ ] Update `generateFileBasedVersion()` to:
  - Read version from package.json
  - Track changes to package.json's version field (not version-manager.json's codeVersionBase)
  - Use package.json version for calculations
- [ ] Update `createDefaultVersionManagerConfig()` to exclude codeVersionBase
- [ ] Update `bumpVersion()` to:
  - Read current version from package.json
  - Update package.json's version field (instead of codeVersionBase)
  - Preserve package.json formatting

### 3. git-utils.ts

- [x] No changes needed - `findLastCommitWhereFieldChanged()` already works with any file/field

### 4. CLI (src/index.ts)

- [ ] Update bump command to:
  - Stage both package.json and version-manager.json when committing
  - Validate package.json exists before running
- [ ] Update install command prompts/validation

### 5. script-manager.ts

- [ ] Add function to read package.json version
- [ ] Add function to update package.json version while preserving formatting

### 6. Tests

Update test fixtures and assertions:

- [ ] `tests/helpers/repo-fixtures.ts`:
  - Add package.json creation to all setup functions
  - Include version field in package.json
- [ ] `tests/integration/version-generation.test.ts`:
  - Update tests to expect package.json tracking
  - Add tests for backward compatibility (when codeVersionBase exists)
  - Add tests for missing package.json error handling

### 7. Documentation

- [ ] Update CLAUDE.md:
  - Core data structures section
  - Version calculation algorithm section
  - Version bumping workflow section
- [ ] Update README.md:
  - Installation instructions
  - Usage examples
  - Configuration reference

## Implementation Plan

### Phase 1: Core Changes (Make it work)

1. Update types to remove codeVersionBase entirely
2. Add package.json reading/writing functions to script-manager.ts
3. Update version generation logic
4. Update bump command logic
5. Update CLI prompts and validation

### Phase 2: Tests & Documentation

6. Update all test fixtures
7. Update integration tests
8. Update documentation
9. Update this project's own version-manager.json

## Edge Cases to Handle

1. **Missing package.json**: Error with helpful message
2. **Missing version field**: Error with helpful message
3. **Both codeVersionBase and package.json version**: Use codeVersionBase with deprecation warning
4. **Version format validation**: Ensure valid semver
5. **Commit tracking**: Switch from tracking version-manager.json changes to package.json changes

## Testing Strategy

1. Test with package.json version (only path)
2. Test error cases (missing package.json, missing version field, invalid versions)
3. Test both calculation modes
4. Test bump command updates package.json correctly
5. Test git tracking follows package.json version changes

## Notes

- The `runtimeVersion` stays in version-manager.json (it's conceptually different from code version)
- Git tracking logic switches from monitoring version-manager.json's codeVersionBase to package.json's version
- The bump command becomes more powerful - it updates the standard package.json version
- This is a **breaking change** - users will need to update their configuration
- New version-manager.json format:
  ```json
  {
    "runtimeVersion": "0.1.0",
    "versionCalculationMode": "append-commits"
  }
  ```

## Completion Summary

✅ **Completed on 2025-10-23**

### What Was Done

**Phase 1: Migration to package.json** (Commit: 689c0e5)

- Removed `codeVersionBase` from `VersionManagerConfigSchema`
- Added `getPackageVersion()` and `updatePackageVersion()` to script-manager.ts
- Updated `generateFileBasedVersion()` to read from package.json and track package.json version changes
- Updated `bumpVersion()` to modify package.json instead of version-manager.json
- Updated CLI validation to require package.json
- Updated git staging to stage package.json
- All 35 tests passed

**Phase 2: Rename to dynamicVersion and add baseVersion** (Commit: 9e206ae)

- Renamed `codeVersion` to `dynamicVersion` in DynamicVersionSchema
- Added `baseVersion` field containing raw package.json version
- Updated `generateFileBasedVersion()` to populate both fields
- Updated `bumpVersion()` to use dynamicVersion
- Updated CLI output to display both base and dynamic versions
- Updated reader.ts example

**Test Updates** (Commit: 32cc52b)

- Removed `codeVersionBase` from all fixture configs
- Updated repo-fixtures helpers to create package.json with version
- Renamed `codeVersion` to `dynamicVersion` in all test assertions
- Updated git-hooks tests to create package.json before version-manager.json
- Replaced BUILD_NUMBER env var tests with build number format tests
- Fixed lint-staged config to only run ESLint on src files
- All 35 tests passing

**Documentation Updates** (Commit: 08c4d73)

- Updated CLAUDE.md with new field names and structures
- Updated README.md to reference package.json as base version source
- Updated all code examples and TypeScript interfaces

**Final Fix** (Commit: 5e3ed38)

- Fixed test for repos without version-manager.json to create package.json
- All 35 tests passing

### New Schema

**DynamicVersion (dynamic-version.local.json)**

```typescript
{
  baseVersion: string; // NEW - raw version from package.json
  dynamicVersion: string; // RENAMED from codeVersion
  runtimeVersion: string;
  buildNumber: string; // ALWAYS generated (not from env)
  branch: string;
  dirty: boolean;
  generationTrigger: 'git-hook' | 'cli';
  timestamp: string;
}
```

**VersionManagerConfig (version-manager.json)**

```typescript
{
  runtimeVersion: string;
  versionCalculationMode: 'add-to-patch' | 'append-commits';
}
```

// Note: codeVersionBase removed - now uses package.json version field
