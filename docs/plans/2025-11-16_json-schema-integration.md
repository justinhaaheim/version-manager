# JSON Schema Integration

**Date:** 2025-11-16
**Status:** Planning

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

## Tasks

- [ ] Research `zod-to-json-schema` compatibility
- [ ] Add `zod-to-json-schema` as dev dependency
- [ ] Create build script to generate JSON Schema files
- [ ] Store schemas in `/schemas` directory
- [ ] Update version generation to add `$schema` property to output
- [ ] Update createDefaultVersionManagerConfig to add `$schema` property
- [ ] Consider hosting schemas publicly or bundling with package
- [ ] Update documentation

## Questions

- Should schemas be included in published package?
- Should we host schemas on a public URL (like schemastore.org)?
- Or use relative file paths for `$schema` property?
