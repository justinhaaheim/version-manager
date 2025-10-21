# Add Build Number and Metadata Fields

**Date:** 2025-10-20

## Goal

Add auto-generated `buildNumber`, `timestamp`, and `generationTrigger` fields to the dynamic-version.local.json file.

## Requirements

### 1. Build Number

- **Type:** string
- **Purpose:** iOS app submission build number
- **Constraints:** Max 18 characters, 1-3 periods, non-negative integers
- **Format:** `YYYYMMDD.HHmmss.SS` (year-month-day.hour-minute-second.hundredths)
- **Length:** 8 + 1 + 6 + 1 + 2 = 18 characters (exactly at iOS limit)
- **Generation:** Auto-generated fresh each time dynamic-version.local.json is created
- **Example:** `20251020.143245.67`

### 2. Timestamp

- **Type:** string
- **Purpose:** Debugging - know when file was generated
- **Format:** ISO 8601 (e.g., `2025-10-20T14:32:45.123Z`)
- **Generation:** `new Date().toISOString()`

### 3. Generation Trigger

- **Type:** enum string
- **Purpose:** Debugging - know what triggered the regeneration
- **Possible values:**
  - `"git-hook"` - Triggered by git hooks (post-commit, post-checkout, etc.)
  - `"cli"` - Triggered by manual CLI invocation
  - `"npm-script"` - Triggered by npm lifecycle scripts (prebuild, predev, prestart)

## Implementation Plan

### Phase 1: Update Type Definitions (types.ts)

- [ ] Update `DynamicVersionSchema` to add:
  - `buildNumber: z.string()` (required, always generated)
  - `timestamp: z.string()` (required)
  - `generationTrigger: z.enum(['git-hook', 'cli', 'npm-script'])`
- [ ] TypeScript types auto-update via z.infer

### Phase 2: Update Version Generator (version-generator.ts)

- [ ] Add `generationTrigger` parameter to `generateFileBasedVersion()`
- [ ] Implement `generateBuildNumber()` helper function:
  - Get current date/time
  - Format as `YYYYMMDD.HHmmss.SS`
  - Validate length is ≤ 18 chars
- [ ] Add buildNumber, timestamp, and generationTrigger to returned DynamicVersion object
- [ ] Remove or keep BUILD_NUMBER env var? **Decision: Keep as override option**

### Phase 3: Update Reader (reader.ts)

- [ ] Change function name from `getVersion()` to `readDynamicVersion()`
- [ ] Update to read `DynamicVersion` type instead of `VersionInfo`
- [ ] Add Zod validation using `DynamicVersionSchema.safeParse()`
- [ ] Keep the nice error handling for missing file
- [ ] Export both the function and the type

### Phase 4: Update Callers

- [ ] Update index.ts CLI to pass appropriate trigger value
- [ ] Update git hooks to pass `"git-hook"`
- [ ] Update package.json scripts to use appropriate trigger

### Phase 5: Testing

- [ ] Test with `bun run test:local`
- [ ] Verify build number format is correct
- [ ] Verify timestamp is ISO 8601
- [ ] Verify trigger is captured correctly
- [ ] Run signal to check for errors

## Design Decisions

### Why auto-generate buildNumber instead of using BUILD_NUMBER env var?

- **Simplicity:** No need to configure CI/CD to set BUILD_NUMBER
- **Consistency:** Every build gets a unique, sortable build number
- **Fallback:** Keep BUILD_NUMBER as an override for CI/CD systems that need specific formats

### Build Number Format Details

Using date/time ensures:

- ✅ Uniqueness (down to 1/100th second)
- ✅ Sortability (chronological)
- ✅ Human-readable (can see when build was made)
- ✅ No coordination needed across machines/developers
- ✅ Fits iOS requirements exactly

### Generation Trigger Values

- Simple enum keeps it clear
- Can add more values later if needed
- Helps debug when version file is stale

## Current Status

- **Phase:** ✅ Complete
- **Blockers:** None
- **Next Step:** Test in consuming projects

## Implementation Summary

### Completed Changes

1. **types.ts**: Added new fields to `DynamicVersionSchema`
   - `buildNumber: z.string()` - Auto-generated iOS-compatible build number
   - `timestamp: z.string()` - ISO 8601 timestamp of generation
   - `generationTrigger: z.enum(['git-hook', 'cli'])` - Source of generation
   - `branch: z.string()` - Current git branch
   - `dirty: z.boolean()` - Whether there are uncommitted changes
   - Created `GenerationTriggerSchema` and exported `GenerationTrigger` type

2. **version-generator.ts**:
   - Added `generateBuildNumber()` function that creates iOS-compatible format: `YYYYMMDD.HHmmss.SS`
   - Updated `generateFileBasedVersion()` to accept `generationTrigger` parameter (defaults to 'cli')
   - Gets branch and dirty status from git
   - Populates all new fields in returned `DynamicVersion` object
   - Removed dependency on `BUILD_NUMBER` environment variable

3. **reader.ts**: Complete rewrite for browser/React Native compatibility
   - Removed Node.js `fs` module usage (was causing issues in browser/RN)
   - Now exports `validateDynamicVersion()` function that uses Zod to validate imported JSON
   - Re-exports types (`DynamicVersion`, `GenerationTrigger`) for consumer convenience
   - Users now import the JSON directly and optionally validate it

4. **index.ts**: Added `--git-hook` flag
   - Added to `globalOptions` with `hidden: true` (internal use only)
   - Updated `generateVersionFile()`, `installCommand()`, and `bumpCommand()` to accept and pass the flag
   - All command handlers now pass the flag to `generateFileBasedVersion()`

5. **git-hooks-manager.ts**: Git hooks now use `--git-hook` flag
   - Added `--git-hook` to the command that's installed in all git hooks
   - Ensures version files generated by hooks have `generationTrigger: "git-hook"`

### Test Results

✅ **Manual Testing**

- `bun run test:local` - Works, generates version with `generationTrigger: "cli"`
- `bun run test:local --git-hook` - Works, generates version with `generationTrigger: "git-hook"`
- Build number format verified: `20251021.010811.45` (18 characters, correct format)
- Timestamp format verified: `2025-10-21T08:08:11.452Z` (ISO 8601)
- Branch and dirty fields populated correctly

✅ **Code Quality**

- TypeScript: ✅ No errors in src files
- ESLint: ✅ No errors in src files
- Prettier: ✅ All files formatted correctly

### Example Output

```json
{
  "branch": "main",
  "buildNumber": "20251021.010811.45",
  "codeVersion": "0.1.15",
  "dirty": true,
  "generationTrigger": "git-hook",
  "runtimeVersion": "0.1.0",
  "timestamp": "2025-10-21T08:08:11.452Z"
}
```

### Consumer Usage

Projects can now import and validate the version file like this:

```typescript
import rawVersion from './dynamic-version.local.json';
import {validateDynamicVersion} from '@justinhaaheim/version-manager';

const version = validateDynamicVersion(rawVersion);
// TypeScript knows the shape, Zod validates at runtime
// Throws if invalid - perfect for catching issues during development

console.log(version.codeVersion); // "0.1.15"
console.log(version.buildNumber); // "20251021.010811.45"
console.log(version.branch); // "main"
console.log(version.dirty); // true
console.log(version.timestamp); // "2025-10-21T08:08:11.452Z"
```
