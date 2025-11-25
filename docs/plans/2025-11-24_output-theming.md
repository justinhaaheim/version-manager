# Output Theming Implementation

## Goal

Add beautiful, customizable output formatting for the `generate` command with three verbosity levels:

- **verbose** (Option A: Status Dashboard) - Full details with section dividers
- **normal** (Option E: Minimal Emoji) - Tree-style compact but informative
- **compact** (Option F: Ultra Compact) - Single line

Plus the existing `--silent` flag for no output.

## Selected Designs

### Verbose (Status Dashboard)

```
📦 version-manager

   🔢 0.4.4+2
   ─────────────────────────
   📌 base      0.4.4
   🔄 commits   +2
   🏷️  runtime   0.3.1
   🌿 branch    main
   🔨 build     20251124.015536.11

   💾 → dynamic-version.local.json
```

### Normal (Minimal Emoji) - DEFAULT

```
📦 0.4.4+2 (🌿 main)
   └─ 📌 0.4.4 + 🔄 2 commits
   └─ 🏷️  runtime 0.3.1
   └─ 🔨 20251124.015536.11
💾 → dynamic-version.local.json
```

### Compact (Ultra Compact)

```
📦 0.4.4+2 🌿main 💾✓
```

## Implementation Plan

### 1. Create `src/output-formatter.ts`

New module with:

- `OutputVerbosity` type: `'silent' | 'compact' | 'normal' | 'verbose'`
- `VersionOutputData` interface for formatter input
- Three formatter functions: `formatVerbose()`, `formatNormal()`, `formatCompact()`
- Main `formatVersionOutput()` function that dispatches to correct formatter

### 2. Update `src/index.ts`

- Add `--verbose` / `-v` flag for verbose output
- Add `--compact` flag for compact output
- Keep existing `--silent` / `-s` flag
- Replace inline `console.log` statements with call to formatter
- Pass verbosity to formatter

### 3. Update `src/version-generator.ts`

- Ensure `generateFileBasedVersion()` returns all data needed for formatting:
  - `commitsSince` (currently calculated but not returned)
  - Already returns: `baseVersion`, `dynamicVersion`, `runtimeVersion`, `buildNumber`, `branch`, `dirty`

### 4. Handle Edge Cases

- Dirty working tree indicator (`*` or similar)
- Custom versions display (multiple runtime versions)
- Missing optional fields (no runtime version, no dts file)
- Very long branch names (truncation?)

## Files to Modify

1. `src/output-formatter.ts` - NEW FILE
2. `src/index.ts` - Add flags, use formatter
3. `src/version-generator.ts` - Return `commitsSince`
4. `src/types.ts` - Add `OutputVerbosity` type if needed

## Current Progress

- [x] Create `output-formatter.ts` with three formatters
- [x] Update `version-generator.ts` to return `commitsSince`
- [x] Update `index.ts` to add CLI flags
- [x] Update `index.ts` to use formatter instead of inline logs
- [x] Test all three verbosity levels
- [x] Run `bun run signal` to verify no lint/ts issues

## Implementation Complete

All three output modes are now working:

### Normal (default)

```
📦 0.4.4+2 * (🌿 main)
   └─ 📌 0.4.4 + 🔄 2 commits
   └─ 🏷️  runtime 0.3.1
   └─ 🔨 20251124.022043.82
💾 → ./dynamic-version.local.json
📘 → ./dynamic-version.local.d.ts
```

### Verbose (`--verbose`)

```
📦 version-manager

   🔢 0.4.4+2 *
   ─────────────────────────
   📌 base      0.4.4
   🔄 commits   +2
   🏷️  runtime  0.3.1
   🌿 branch    main
   🔨 build     20251124.022044.30

   💾 → ./dynamic-version.local.json
   📘 → ./dynamic-version.local.d.ts
```

### Compact (`--compact`)

```
📦 0.4.4+2* 🌿main 💾✓
```

### Silent (`--silent`)

No output (existing behavior)

## Config-Based Output Format

You can set a default output format in `version-manager.json`:

```json
{
  "versionCalculationMode": "append-commits",
  "outputFormat": "compact",
  "versions": {}
}
```

Valid values: `"silent"`, `"compact"`, `"normal"`, `"verbose"`

CLI flags (`--silent`, `--compact`, `--verbose`) override the config setting.

## TypeScript Definition Files (.d.ts)

When you import the generated JSON file in TypeScript:

```typescript
import version from './dynamic-version.local.json';
```

TypeScript automatically applies the `.d.ts` file if it exists, giving you:

- **Full autocomplete** for all fields
- **Type safety** for custom versions
- **Proper typing** instead of `any`

The `.d.ts` file is generated alongside the `.json` file when `--types` is enabled (default).
The output only shows the `.d.ts` line when types are actually generated.
