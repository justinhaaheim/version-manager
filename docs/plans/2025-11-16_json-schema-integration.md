# JSON Schema Integration

**Date:** 2025-11-16
**Status:** ✅ Complete

## Goal

Add JSON Schema support for better IDE autocomplete and validation of config files.

## Current State

- ✅ Zod schemas exist in `src/types.ts` for runtime validation:
  - `VersionManagerConfigSchema` - for version-manager.json
  - `DynamicVersionSchema` - for dynamic-version.local.json
- ✅ Runtime validation is working (used in version-generator.ts:69)
- ❌ No JSON Schema files exist
- ❌ No `$schema` properties in JSON files for IDE support

## Files to Update

- `version-manager.json` - Config file (committed to git)
- `dynamic-version.local.json` - Generated file (gitignored)

## Implementation Options

### Option A: Use zod-to-json-schema library

**Pros:**

- Automatic conversion from existing Zod schemas
- Single source of truth (Zod schemas)
- Schemas stay in sync automatically

**Cons:**

- Adds a new dependency
- Build-time conversion needed
- May not support all Zod features perfectly

### Option B: Manual JSON Schema files

**Pros:**

- No new dependencies
- Full control over schema format
- More predictable

**Cons:**

- Need to maintain two schemas (Zod + JSON Schema)
- Risk of schemas getting out of sync
- More work to implement and maintain

### Option C: Hybrid approach

**Pros:**

- Keep existing Zod for runtime validation
- Generate JSON Schema files at build time for IDE support
- Publish schemas to a public URL or include in package

**Cons:**

- Still needs a conversion library (or manual maintenance)

## Recommended Approach

**Option A** - Use `zod-to-json-schema` library because:

1. Single source of truth (DRY principle)
2. Schemas auto-sync when Zod schemas change
3. Minimal maintenance burden
4. Well-tested library

## Implementation Summary

### What Was Done

✅ Used Zod 4's native `z.toJSONSchema()` instead of third-party library
✅ Created `/scripts/generate-schemas.ts` to auto-generate JSON Schema files
✅ Generated schemas stored in `/schemas` directory
✅ Added schemas to published package (in `package.json` files array)
✅ Added `generate-schemas` script to prebuild process
✅ Added `$schema` property to all generated JSON files:

- `version-manager.json` (via `writeVersionManagerConfig()` helper)
- `dynamic-version.local.json` (in CLI, metro-plugin, and watcher)

### Key Decisions

- **No third-party library needed**: Zod 4 has native JSON Schema support
- **Relative paths for $schema**: `./node_modules/@justinhaaheim/version-manager/schemas/...`
- **Schemas bundled in package**: Included in npm publish via `files` array
- **Build-time generation**: Schemas generated before TypeScript compilation

### Files Modified

- `scripts/generate-schemas.ts` - New script to generate schemas
- `src/version-generator.ts` - Added `writeVersionManagerConfig()` helper
- `src/index.ts` - Added $schema to dynamic version output
- `src/metro-plugin.ts` - Added $schema to metro plugin output
- `src/watcher.ts` - Added $schema to watcher output
- `package.json` - Added generate-schemas script and schemas to files
- `tsconfig.json` - Added scripts/\*_/_.ts to includes
- `version-manager.json` - Added $schema property to this project's config

### Benefits

✅ IDE autocomplete for both config files
✅ Inline validation errors in VSCode/editors
✅ Auto-sync with Zod schemas (single source of truth)
✅ No manual schema maintenance needed
