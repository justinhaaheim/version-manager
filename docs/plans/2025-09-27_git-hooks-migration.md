# Git Hooks Migration Plan

Date: 2025-09-27

## Overview

Migrating the version-manager from package-versions.json to dynamic-version.local.json with git hooks integration.

## Key Changes Required

1. ✅ Rename output file from package-versions.json to dynamic-version.local.json
2. ✅ Add git hooks manager for automatic updates
3. ✅ Update main entry point with installation flow
4. ✅ Add reader module for importing version info
5. ✅ Support optional patch version incrementing
6. ✅ Add proper error handling and user prompts
7. ✅ Update package.json exports and configuration

## Work Plan

### Phase 1: Core Infrastructure

- [x] Review current codebase structure
- [ ] Create git-hooks-manager.ts
- [ ] Update version-generator.ts for optional patch incrementing
- [ ] Create reader.ts module

### Phase 2: Main Entry Point Updates

- [ ] Refactor index.ts with new installation flow
- [ ] Add user prompts for gitignore
- [ ] Add --install and --increment-patch flags

### Phase 3: Package Configuration

- [ ] Update package.json with new exports
- [ ] Add proper TypeScript types
- [ ] Update build configuration

### Phase 4: Testing & Verification

- [ ] Test git hooks installation
- [ ] Test version generation with both modes
- [ ] Test reader module import
- [ ] Verify gitignore handling

## Notes

- Need to preserve existing functionality while adding new features
- Git hooks should be non-invasive and handle failures gracefully
- The .local.json pattern ensures files aren't committed
