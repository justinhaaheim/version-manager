# Metro Plugin Implementation - 2025-10-26

## Goal

Implement a Metro bundler plugin that auto-regenerates the version file during development without causing infinite rebuild loops.

## Problem to Solve

- We want the version file to regenerate on every Metro bundle
- But writing the file triggers Metro's file watcher → new rebuild → infinite loop
- Git hooks also regenerate the file, and Metro should detect those changes

## Solution Strategy

**Content-based writing**: Only write the file if its content has actually changed

### How It Works

1. Plugin runs during serialization (before bundle output)
2. Generate version data in memory
3. Compare with existing file content
4. Only write if different

### Why This Prevents Loops

- **Normal HMR**: Same version → no write → no watcher trigger → no loop ✅
- **After commit**: Git hook writes → Metro rebuilds → plugin generates same content → no extra write ✅
- **After checkout**: Git hook writes new version → Metro sees change → rebuilds with fresh data ✅

## Implementation Tasks

1. ✅ Create scratchpad
2. ✅ Refactor `generateFileBasedVersion()` to separate concerns
   - **Note**: Function already returned data object, no refactoring needed!
   - File writing happens in index.ts `generateVersionFile()` function
3. ✅ Create `src/metro-plugin.ts`
   - Simple content-comparison logic
   - Proper TypeScript types (MetroConfig, MetroSerializer)
   - No caching, no performance optimizations (keeping it simple)
4. ✅ Update package.json exports
   - Added `./metro-plugin` export pointing to `dist/metro-plugin.js`
5. ✅ Update CLAUDE.md docs
   - Added Metro plugin section to "Version File Regeneration"
   - Updated Codebase Structure with metro-plugin.ts
   - Added File Responsibilities documentation
6. ✅ Test locally
   - Built successfully with `bun run build`
   - All signal checks passed (TypeScript, ESLint, Prettier)
   - Verified dist/metro-plugin.\* files exist
7. ✅ Commit regularly (3 commits made)

## Design Notes

- Keep it simple: no caching, no git commands in plugin
- Let existing git hooks handle commit/checkout regeneration
- Plugin just ensures version is current during builds
- Blocklist NOT needed with this approach

## File Changes

- `src/version-generator.ts` - No changes needed (already returns data)
- `src/metro-plugin.ts` - New file ✅
- `package.json` - Add export for metro-plugin ✅
- `CLAUDE.md` - Document Metro plugin usage ✅
- `dist/metro-plugin.*` - Built artifacts ✅

## Conclusion

Metro plugin implementation completed successfully! Key accomplishments:

1. **Simple, elegant solution**: Content-based writing prevents loops without blocklists
2. **Type-safe implementation**: Proper TypeScript interfaces for Metro config
3. **Error handling**: Silently fails on errors to avoid breaking builds
4. **Well documented**: Added to CLAUDE.md with clear usage examples
5. **Tested**: All checks passing, build artifacts verified

The plugin integrates seamlessly with existing git hooks and build scripts, providing a third automatic regeneration method for React Native/Expo users.

### Usage Example

```javascript
// metro.config.js
const {getDefaultConfig} = require('expo/metro-config');
const {
  withVersionManager,
} = require('@justinhaaheim/version-manager/metro-plugin');

const config = getDefaultConfig(__dirname);
module.exports = withVersionManager(config);
```

### Next Steps (Future)

- Consider adding performance metrics to measure impact
- Test with different Metro configurations
- Gather user feedback from React Native/Expo developers
- Consider adding configuration options (custom output path, etc.)
