# Runtime Version Improvements

## Plan (2025-09-01)

Improve runtime version management by linking it to codeVersion when native changes occur.

## Concept

When native dependencies or configuration changes (requiring a new runtime), we:

1. Bump the codeVersion using `--major` or `--minor` flags
2. Use that new codeVersion as the new runtimeVersion
3. This creates a natural link: runtime 0.2.0 was built from code version 0.2.0

## Tasks

### 1. Add Major/Minor Version Flags

- Add `--major` and `--minor` CLI flags to version manager
- These should work for regular code version bumps
- Can be combined with runtime version updates

### 2. Add Runtime Version Bump

- Add `--update-runtime` flag that sets runtimeVersion = codeVersion
- Typically used with `--major` or `--minor` for breaking changes
- Example: `bun run version:bump --minor --update-runtime`

### 3. Update Build Scripts

- Add version bumps to build scripts that create new builds
- Scripts to update:
  - `build:development` → add version bump
  - `build:preview` → add version bump
  - `build:production` → add version bump
  - `build:eas:*` variants → add version bump

### 4. Implementation Details

#### CLI Examples:

```bash
# Minor version bump with runtime update (for native changes)
bun run version:bump --minor --update-runtime

# Major version bump
bun run version:bump --major

# Regular patch bump (existing)
bun run version:bump
```

#### Package.json Script Updates:

```json
// Before
"build:development": "APP_VARIANT=development bun run build:ios:device"

// After
"build:development": "bun run version:bump-for-build && APP_VARIANT=development bun run build:ios:device"
```

## Benefits

1. **Clear relationship**: Runtime version directly corresponds to the code version it was built from
2. **Semantic meaning**: Major/minor/patch for runtime follows same rules as code
3. **No ambiguity**: Runtime 0.2.0 means "built from code 0.2.0"
4. **Natural progression**: Both versions move forward together when needed
