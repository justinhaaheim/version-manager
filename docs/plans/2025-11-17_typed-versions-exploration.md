# Typed Versions Exploration

**Date:** 2025-11-17
**Goal:** Provide better TypeScript typing for `versions` object based on `version-manager.json` config

## Current Problem

```typescript
// Current type (types.ts)
versions: z.record(z.string(), z.string()).default({});

// Results in:
type DynamicVersion = {
  versions: Record<string, string>; // All keys optional!
};

// When using:
const version = validateDynamicVersion(rawVersion);
version.versions.runtime; // Type: string | undefined 😞
version.versions.pancake; // Type: string | undefined 😞
```

## Options

### Option 1: Generate .d.ts File

Generate `dynamic-version.local.d.ts` alongside JSON:

```typescript
// dynamic-version.local.d.ts (GENERATED)
export interface DynamicVersionLocal {
  baseVersion: string;
  branch: string;
  buildNumber: string;
  dirty: boolean;
  dynamicVersion: string;
  generationTrigger: 'git-hook' | 'cli';
  timestamp: string;
  timestampUnix: number;
  versions: {
    runtime: string; // ✅ Required!
    pancake: string; // ✅ Required!
  };
}

// Consumer usage:
import version from './dynamic-version.local.json';
import type {DynamicVersionLocal} from './dynamic-version.local';

const typedVersion = version as DynamicVersionLocal;
typedVersion.versions.runtime; // Type: string ✅
```

**Implementation:**

- Add flag to `generateFileBasedVersion()`: `generateTypes?: boolean`
- Generate .d.ts file with explicit interface
- Update reader.ts to provide type-safe import

**Pros:**

- Best TypeScript experience
- Zero runtime overhead
- Natural import pattern

**Cons:**

- Need to manage additional generated file
- TypeScript-only (no runtime validation)
- Gitignore needs `*.local.d.ts`

### Option 2: Export Type-Safe Getter Function

Generate `dynamic-version.local.ts` with getter:

```typescript
// dynamic-version.local.ts (GENERATED)
import rawVersion from './dynamic-version.local.json';

export interface Versions {
  runtime: string;
  pancake: string;
}

export interface DynamicVersionTyped {
  baseVersion: string;
  // ... other fields
  versions: Versions;
}

export function getDynamicVersion(): DynamicVersionTyped {
  // Runtime validation with Zod
  return rawVersion as DynamicVersionTyped;
}

// Consumer usage:
import {getDynamicVersion} from './dynamic-version.local';

const version = getDynamicVersion();
version.versions.runtime; // Type: string ✅
```

**Pros:**

- Single generated file
- Can add runtime validation
- Type-safe by default

**Cons:**

- Changes import pattern (function instead of JSON import)
- Still need to manage generated .ts file

### Option 3: Dynamic Zod Schema

Generate Zod schema at runtime based on config:

```typescript
// In reader.ts or new file
import {z} from 'zod';
import {readVersionManagerConfig} from './version-generator';

export function createDynamicVersionSchema() {
  const config = readVersionManagerConfig();

  // Build versions schema with known keys as required
  const versionKeys = Object.keys(config.versions);
  const versionsShape: Record<string, z.ZodString> = {};

  for (const key of versionKeys) {
    versionsShape[key] = z.string();
  }

  return z.object({
    baseVersion: z.string(),
    branch: z.string(),
    // ... other fields
    versions: z.object(versionsShape),
  });
}

// Consumer usage:
import rawVersion from './dynamic-version.local.json';
import {createDynamicVersionSchema} from '@justinhaaheim/version-manager';

const DynamicVersionSchema = createDynamicVersionSchema();
type DynamicVersion = z.infer<typeof DynamicVersionSchema>;

const version = DynamicVersionSchema.parse(rawVersion);
version.versions.runtime; // Type: string ✅
```

**Pros:**

- Runtime validation + TypeScript types
- No generated files
- Consistent with current Zod-based architecture

**Cons:**

- Requires reading config file on import
- More complex type inference
- Consumer needs extra setup step

## Recommendation

**Option 1 (.d.ts generation)** seems best for most use cases:

1. ✅ Best developer experience (full intellisense)
2. ✅ Zero runtime overhead
3. ✅ Natural import pattern
4. ✅ Fits naturally into existing generation workflow
5. ✅ Can be optional (flag to enable/disable)

**Implementation plan:**

1. Add `--types` flag to CLI (default: true)
2. Generate .d.ts alongside .json
3. Update gitignore template to include `*.local.d.ts`
4. Provide both runtime validation (Zod) and compile-time types (.d.ts)

## Next Steps

- [x] Wait for user approval on approach ✅ Approved Option 1
- [x] Implement .d.ts generation ✅ COMPLETED
  - [x] Create generateTypeDefinitions() function in version-generator.ts
  - [x] Integrate into generateVersionFile(), installCommand, bumpCommand, watchCommand
  - [x] Add --types flag to CLI (default: true)
  - [x] Update gitignore check to include \*.local.d.ts
  - [x] Update watcher.ts to support type generation
  - [x] Add \*.local.d.ts to eslint ignore patterns
- [x] Test locally ✅ Works perfectly!
- [ ] Update documentation (if needed)

## Implementation Notes

### generateTypeDefinitions() Function

Will generate a .d.ts file with:

1. Import base DynamicVersion type from the package
2. Create interface extending/overriding with explicit versions shape
3. Write to output path with .d.ts extension

```typescript
// dynamic-version.local.d.ts (example output)
import type {DynamicVersion} from '@justinhaaheim/version-manager';

export interface DynamicVersionLocal extends Omit<DynamicVersion, 'versions'> {
  versions: {
    runtime: string;
    pancake: string;
  };
}

declare const version: DynamicVersionLocal;
export default version;
```

## Implementation Summary

Successfully implemented TypeScript definition file generation for dynamic-version.local.json!

**What was implemented:**

1. **New function**: `generateTypeDefinitions()` in version-generator.ts
   - Takes output path and version keys
   - Generates .d.ts file with explicit version types
   - Uses `Omit<DynamicVersion, 'versions'>` to override the versions property

2. **CLI flag**: `--types` / `--no-types` (default: true)
   - Available on all commands: default, install, bump, watch
   - When enabled, generates .d.ts alongside .json

3. **Gitignore updates**: Automatically adds `*.local.d.ts` to .gitignore
   - Smart detection - only adds if not already present
   - Only adds when `--types` is enabled
   - Works in both interactive and non-interactive modes

4. **ESLint ignore**: Added `*.local.d.ts` to eslint.config.js ignores

5. **Watcher support**: Updated startWatcher() to also generate types on file changes

**Generated .d.ts file example:**

```typescript
import type {DynamicVersion} from '@justinhaaheim/version-manager';

export interface DynamicVersionLocal extends Omit<DynamicVersion, 'versions'> {
  versions: {
    runtime: string; // ✅ Explicitly typed!
    pancake: string; // ✅ Explicitly typed!
  };
}

declare const version: DynamicVersionLocal;
export default version;
```

**Consumer usage:**

```typescript
import version from './dynamic-version.local.json';
// TypeScript will use the .d.ts file automatically!

version.versions.runtime; // Type: string ✅
version.versions.pancake; // Type: string ✅
```

**All tests pass:**

- ✅ Generates .d.ts by default
- ✅ Respects --no-types flag
- ✅ Updates gitignore correctly
- ✅ All TypeScript/ESLint/Prettier checks pass
