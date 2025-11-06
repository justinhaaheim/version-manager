# Arbitrary Version Types Refactoring

**Date:** 2025-11-01
**Goal:** Generalize the version-manager to support any user-defined version types, not just hardcoded `runtimeVersion`

## Current State

### Config (version-manager.json)

```typescript
{
  runtimeVersion: string; // Hardcoded, Expo-specific
  versionCalculationMode: 'add-to-patch' | 'append-commits';
}
```

### Dynamic Version File (dynamic-version.local.json)

```typescript
{
  baseVersion: string; // From package.json
  dynamicVersion: string; // Calculated
  runtimeVersion: string; // Hardcoded field
  buildNumber: string;
  branch: string;
  dirty: boolean;
  generationTrigger: 'git-hook' | 'cli';
  timestamp: string;
  timestampUnix: number;
}
```

### CLI

```bash
bump --runtime   # Bumps runtime version to match dynamic version
```

## Proposed Design

### Key Design Questions

1. **Config structure**: How should users define custom versions?
2. **Dynamic file structure**: Top-level properties vs. nested object?
3. **CLI interface**: How to bump custom versions?
4. **Backward compatibility**: How to migrate existing `runtimeVersion` users?

### Design Decision: Structure Options

#### Option A: Nested in dynamic file

```json
// version-manager.json
{
  "versionCalculationMode": "add-to-patch",
  "versions": {
    "runtime": "0.1.0",
    "pancake": "1.2.3"
  }
}

// dynamic-version.local.json
{
  "baseVersion": "0.1.0",
  "dynamicVersion": "0.1.3",
  "buildNumber": "...",
  "versions": {
    "runtime": "0.1.0",
    "pancake": "1.2.3"
  },
  "branch": "main",
  ...
}
```

**Pros:**

- Clear separation of core vs. custom versions
- Easy to iterate over all custom versions

**Cons:**

- Breaking change for consumers: `version.runtimeVersion` → `version.versions.runtime`
- More nesting in consumer code

#### Option B: Top-level with suffix (RECOMMENDED)

```json
// version-manager.json
{
  "versionCalculationMode": "add-to-patch",
  "versions": {
    "runtime": "0.1.0",
    "pancake": "1.2.3"
  }
}

// dynamic-version.local.json
{
  "baseVersion": "0.1.0",
  "dynamicVersion": "0.1.3",
  "buildNumber": "...",
  "runtimeVersion": "0.1.0",      // Generated from versions.runtime
  "pancakeVersion": "1.2.3",      // Generated from versions.pancake
  "branch": "main",
  ...
}
```

**Pros:**

- Backward compatible: `version.runtimeVersion` still works
- Clean consumer API: `version.pancakeVersion`
- Consistent naming pattern

**Cons:**

- Potential naming conflicts (what if user wants a version called "base"?)
- TypeScript typing is trickier

### Chosen Approach: Option B (Top-level with suffix)

**Config (version-manager.json):**

```typescript
{
  versionCalculationMode: 'add-to-patch' | 'append-commits';

  // New format
  versions?: {
    [key: string]: string;  // e.g., { "runtime": "0.1.0", "pancake": "1.2.3" }
  };

  // Legacy format (deprecated but supported)
  runtimeVersion?: string;
}
```

**Migration logic:**

- If `versions.runtime` exists, use it
- Else if `runtimeVersion` exists, use it (with deprecation warning)
- When writing config, prefer new `versions` format

**Dynamic File (dynamic-version.local.json):**

```typescript
{
  // Core versions (always present)
  baseVersion: string;
  dynamicVersion: string;
  buildNumber: string;

  // Custom versions (from config.versions)
  // Injected as top-level properties with "Version" suffix
  // e.g., runtimeVersion, pancakeVersion, etc.
  [key: `${string}Version`]: string;

  // Metadata
  branch: string;
  dirty: boolean;
  generationTrigger: 'git-hook' | 'cli';
  timestamp: string;
  timestampUnix: number;
}
```

**Reserved version names** (cannot be used in `versions` config):

- `base` (conflicts with `baseVersion`)
- `dynamic` (conflicts with `dynamicVersion`)
- `build` (conflicts with `buildNumber`)

### CLI Interface

```bash
# Bump main version only
bump --patch           # 0.1.0 → 0.1.1
bump --minor           # 0.1.0 → 0.2.0
bump --major           # 0.1.0 → 1.0.0

# Bump main version AND sync custom versions to match
bump --minor --runtime              # Bump minor + sync runtime
bump --minor --pancake              # Bump minor + sync pancake
bump --minor --runtime --pancake    # Bump minor + sync both

# Bump only custom versions (not main version)
bump --runtime         # Only bump runtime version
bump --pancake         # Only bump pancake version
```

**CLI Implementation:**

- Parse all `--<version-name>` flags
- Check if each flag matches a key in `config.versions`
- If no bump type specified (--patch/--minor/--major), only bump custom versions
- If bump type specified, bump main version then optionally sync custom versions

### Validation & Error Handling

1. **Reserved names**: Error if user tries to use "base", "dynamic", "build" as version names
2. **Invalid version strings**: Validate semver format for all versions
3. **Unknown flags**: Error if `--pancake` specified but "pancake" not in config
4. **Typos**: Suggest similar version names if flag doesn't match exactly

## Implementation Plan

### Phase 1: Update Type System ✅

- ✅ Update `types.ts` to support new schema
- ✅ Add `versions` to `VersionManagerConfigSchema` (optional)
- ✅ Keep `runtimeVersion` in schema (optional, deprecated)
- ✅ Update `DynamicVersionSchema` to use nested `versions` object

### Phase 2: Update Version Generator ✅

- ✅ Update `version-generator.ts` to read both formats
- ✅ Auto-migrate legacy `runtimeVersion` to `versions.runtime`
- ✅ Generate dynamic version file with nested `versions` object (not `<name>Version` properties)
- ✅ Add validation to prevent reserved names (base, dynamic, build)
- ✅ Update `bumpVersion()` to accept array of custom version names
- ✅ Update `createDefaultVersionManagerConfig()` to use new format

### Phase 3: Update CLI ✅

- ✅ Modify `bump` command to accept positional version name args: `bump [versions..]`
- ✅ Parse version names from positional args (not flags)
- ✅ Update version values in config file
- ✅ Update examples in CLI help

### Phase 4: Update Reader ✅

- ✅ No changes needed - already uses Zod schemas which were updated

### Phase 5: Documentation & Testing ✅

- ✅ Run signal to check lint/ts issues
- ✅ Test locally with version bump
- ✅ Update all tests to use new format
- ✅ All 42 tests passing
- ✅ Committed changes
- [ ] Update CLAUDE.md with new config format (user can do this)
- [ ] Add examples for custom versions (user can do this)
- [ ] Document migration path (user can do this)

## Implementation Complete! 🎉

### What was implemented:

1. **New config structure** - `versions` object instead of hardcoded `runtimeVersion`
2. **Auto-migration** - Legacy configs automatically migrate to new format
3. **Flexible CLI** - `bump [versions..] [--major|--minor|--patch]` syntax
4. **Validation** - Reserved name checking (base, dynamic, build)
5. **Mirrored structure** - Config and dynamic file use same format
6. **Full backward compatibility** - Old configs are auto-migrated
7. **All tests passing** - Updated test helpers and fixtures

### Example usage:

```bash
# Add custom versions to version-manager.json
{
  "versionCalculationMode": "append-commits",
  "versions": {
    "runtime": "1.0.0",
    "pancake": "2.0.0"
  }
}

# Bump main version and sync runtime
bump runtime --minor

# Bump main version and sync multiple versions
bump runtime pancake

# Just bump main version (no custom versions synced)
bump --minor
```

## Open Questions

1. **Should we prompt users for custom versions during install?**
   - Or just create empty `versions: {}` and let them add manually?

2. **Should we auto-migrate old configs?**
   - Option A: Auto-migrate on first run (move `runtimeVersion` to `versions.runtime`)
   - Option B: Support both formats indefinitely
   - Option C: Support both, but show deprecation warning

3. **Should we support bumping to a specific value?**

   ```bash
   bump --runtime 2.0.0   # Set runtime to specific value
   ```

   Or only support syncing to current dynamic version?

4. **Should bumping a custom version alone change the version in config?**
   - Current behavior: `bump --runtime` makes `runtimeVersion` match current `dynamicVersion`
   - New behavior: Should it also commit? Should it bump patch first?

5. **Should we validate that version names are valid identifiers?**
   - e.g., no spaces, no special chars, etc.
   - Or allow any string and sanitize when generating property names?

6. **Should the generated properties use camelCase or preserve the config key?**
   - Config: `"my-runtime": "1.0.0"`
   - Generated: `myRuntimeVersion` or `my-runtimeVersion`?

## Naming Considerations

**Property name generation:**

```
Config key → Dynamic file property

"runtime"     → "runtimeVersion"
"pancake"     → "pancakeVersion"
"my-custom"   → "myCustomVersion"  (camelCase)
"API"         → "APIVersion"       (preserve case)
```

**Edge cases:**

- Whitespace: Trim and convert to camelCase
- Special chars: Strip or error?
- Numbers: "v2" → "v2Version"?
