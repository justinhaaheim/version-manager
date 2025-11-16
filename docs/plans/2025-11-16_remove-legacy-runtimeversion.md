# Remove Legacy runtimeVersion Format

## Goal

Make the migration from `runtimeVersion` to `versions: {runtime: "X.Y.Z"}` more explicit and remove the old format from types to make it a TypeScript error.

## Current State Analysis

### Migration Logic (version-generator.ts:27-50)

- `migrateConfigIfNeeded()` function exists
- Checks if `versions` object has keys, if not and `runtimeVersion` exists, migrates
- Returns `{config, migrated}` to indicate if migration occurred
- Migration writes file only if `migrated && existsSync(configPath)` (line 268-272)

### Type Definitions (types.ts:9-16)

```typescript
export const VersionManagerConfigSchema = z.object({
  // Legacy field - auto-migrated to versions.runtime
  runtimeVersion: z.string().optional(), // ← Still present in schema
  versionCalculationMode: VersionCalculationModeSchema,
  versions: z.record(z.string(), z.string()).default({}),
});
```

### Test Fixtures (OLD FORMAT)

- `tests/fixtures/configs/add-to-patch-mode.json` - has `runtimeVersion`
- `tests/fixtures/configs/append-commits-mode.json` - has `runtimeVersion`
- `tests/fixtures/configs/custom-base-version.json` - has `runtimeVersion`

### Test Helpers (NEW FORMAT)

- `tests/helpers/repo-fixtures.ts` - Already uses new format! ✅
- Uses `versions: {runtime: runtimeVersion}` in all helpers

### Integration Tests

- Tests expect `version.versions.runtime` to exist
- Tests are written for new format ✅

## Issues Identified

1. **TypeScript still allows old format** - `runtimeVersion` is optional in schema
2. **Migration may not be writing** - Only writes if `existsSync(configPath)` in some paths
3. **Test fixtures use old format** - 3 JSON files still have `runtimeVersion`
4. **No explicit migration tests** - No tests verifying migration behavior

## Plan

### 1. Remove `runtimeVersion` from Types

- Remove from `VersionManagerConfigSchema` in types.ts
- This makes it a TypeScript error to use old format

### 2. Create Explicit Migration Function

- Keep migration logic but make it more explicit
- Log warnings when old format detected
- Provide clear migration instructions

### 3. Update Test Fixtures

- Convert all 3 JSON files to new format

### 4. Add Migration Tests

- Test migration from old → new format
- Test that new format passes through unchanged
- Test migration writes file back
- Test migration logging/warnings

### 5. Update Documentation

- Update CLAUDE.md if needed
- Add migration guide for users

## Implementation Order

1. ✅ Create scratchpad
2. ✅ Add migration tests first (TDD approach)
3. ✅ Remove `runtimeVersion` from schema
4. ✅ Update migration logic to handle type changes
5. ✅ Update test fixtures
6. 🔄 Run tests - PAUSED (4 failing migration tests)
7. Update documentation

## NEW REQUIREMENTS (2025-11-16)

### User Feedback - Refactor Interactive/Non-Interactive Modes

**Core Issues:**

- `--silent` is confusing - should only suppress output, not control prompts
- Default generate mode should NEVER prompt
- Need explicit `--non-interactive` flag
- Config file should use defaults if missing, not prompt to create
- .gitignore should add specific filename, not glob pattern

**Decisions Made:**

1. Flag: `--non-interactive` / `-n` (assumes defaults for prompts)
2. `--silent` only suppresses output, doesn't affect prompts
3. Fix hardcoded output path TODO now
4. Use `@inquirer/prompts` library
5. Add `dynamic-version.local.json` (not `*.local.json`) to .gitignore by default

### Updated Implementation Plan

#### Phase 1: Fix Migration Tests ✅ COMPLETE

- ✅ Debugged migration issue - new schema was too permissive
- ✅ Added `.strict()` to VersionManagerConfigSchema to reject unknown fields
- ✅ All 5 migration tests passing
- ✅ All 48 tests passing
- ✅ Committed: 3a7b331

#### Phase 2: Refactor Interactive Modes ✅ COMPLETE

1. ✅ Add `@inquirer/prompts` dependency
2. ✅ Add `--non-interactive` / `-n` flag to globalOptions
3. ✅ Separate `silent` (output) from `nonInteractive` (prompts)
4. ✅ Update `generateVersionFile()`:
   - ✅ Remove config creation prompt entirely
   - ✅ Use defaults if version-manager.json missing
   - ✅ .gitignore: prompt in interactive mode (default=add), warn in non-interactive
   - ✅ Change from `*.local.json` to `dynamic-version.local.json`
5. ✅ Fix hardcoded output path (line 306)
6. ✅ Update `installScriptsCommand()` to use inquirer + handle non-interactive
7. ✅ Update help text for `--non-interactive`
8. ✅ Update tests for new .gitignore pattern (added `--non-interactive` flags)
9. ✅ Update tests for new .gitignore pattern in fixtures
10. ✅ Update git-hooks-manager.ts to recognize new pattern
11. ✅ All 48 tests passing
12. ✅ All signal checks (TS/lint/prettier) passing

#### Phase 3: Defer

- Refactor to use prompts library (line 26) - DONE in Phase 2
- Extract git commands to git-utils (line 320) - LATER
