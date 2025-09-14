# Versioning Guide

## Overview

This project uses a comprehensive version tracking system that provides granular control over different aspects of the application versioning. This system replaces the problematic EAS fingerprinting approach with manual version management for better control and fewer false positives.

## Version Types

### 1. Code Version (`codeVersion`)

The main application version that increments with every meaningful code change.

- **When to increment**: Every commit that changes application behavior, UI, or logic
- **Format**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Used for**: Tracking code changes, displaying to users, changelog

### 2. Build Number (`buildNumber`)

A monotonically increasing integer for each build submitted to the App Store.

- **When to increment**: Every build that goes to TestFlight or App Store
- **Format**: Integer (converted to string in JSON for consistency)
- **Used for**: iOS build identification, App Store requirements

### 3. Runtime Version (`runtimeVersion`)

Defines the native runtime compatibility boundary for over-the-air updates.

- **When to increment**: Only when making breaking native changes
- **Format**: Semantic versioning
- **Used for**: OTA update compatibility
- **Examples of breaking changes**:
  - Adding/removing native dependencies
  - Changing iOS permissions or entitlements
  - Modifying app.json/app.config.ts native configuration
  - Updating Expo SDK version

### 4. Release Version (`releaseVersion`)

The public-facing version shown in the App Store.

- **When to increment**: Major releases, marketing milestones
- **Format**: Semantic versioning
- **Used for**: App Store display, marketing

## Using the Version Manager

### Quick Commands

```bash
# Increment versions for a new build (TestFlight/App Store)
bun run version:bump-for-build

# Increment versions for an OTA update (EAS Update)
bun run version:bump

# Interactive mode for manual changes
bun run version:interactive

# Show current versions
bun run version:show
```

### Detailed Usage

#### Building for TestFlight/App Store

```bash
# Automatically increments codeVersion and buildNumber
bun run version:bump-for-build
bun run build:preview  # or build:production
```

#### Releasing an OTA Update

```bash
# Automatically increments codeVersion only
bun run version:bump
bun run eas:update:preview
```

#### Making Breaking Native Changes

```bash
# Use interactive mode to manually update runtimeVersion
bun run version:interactive
# Select option to update runtime version
# Provide description of breaking changes
```

## Workflow Examples

### Example 1: Bug Fix Update

You've fixed a bug in the medication parsing logic.

```bash
# This increments codeVersion only (e.g., 0.1.32 to 0.1.33)
bun run version:bump
git add .
git commit -m "Fix medication parsing for compound entries"
bun run eas:update:preview
```

### Example 2: New Feature Build

You've added a new visualization feature that requires a fresh build.

```bash
# This increments both codeVersion and buildNumber
bun run version:bump-for-build
bun run build:preview
```

### Example 3: Native Dependency Update

You've added a new native module for camera access.

```bash
# Use interactive mode
bun run version:interactive
# Choose: Update runtime version
# Enter new version (e.g., increment from current)
# Enter description: "Added camera module for medication photo capture"

# Now do the build
bun run version:bump-for-build
bun run build:preview
```

### Example 4: Major Release

Preparing version 1.0.0 for App Store release.

```bash
# Use interactive mode
bun run version:interactive
# Update releaseVersion to 1.0.0
# Update codeVersion to 1.0.0
# Increment buildNumber
# Consider updating runtimeVersion if there are breaking changes
```

## Version Display

During development, version information is displayed in the app via the `VersionDisplay` component, showing:

- Code Version
- Build Number
- Runtime Version
- Update Channel
- Latest commit information

This component only appears when `showAppVersion` is `true` in the app configuration (development and preview builds).

## Important Notes

### Breaking Change Warning

When you change the `runtimeVersion`, existing app installations will no longer receive OTA updates. Users must download a new build from TestFlight or the App Store. Plan these changes carefully.

### Git Integration

The version manager integrates with git to:

- Track which branch and commit each version was created on
- Warn about uncommitted changes before version bumps
- Store version history for debugging

### Version History

The system maintains a history of the last 50 version changes in `projectVersions.json`, including:

- Timestamp of change
- Git branch and commit
- Type of change (build/update)
- Update channel (if applicable)

## Troubleshooting

### "Uncommitted changes" warning

The version manager warns about uncommitted changes to ensure clean version bumps. Either:

1. Commit your changes first
2. Use `--force` flag to override (not recommended)

### Runtime version conflicts

If you accidentally increment the runtime version:

1. Use interactive mode to revert it
2. Ensure all team members are aware of the current runtime version
3. Document the false increment in your commit message

### Version history cleanup

If the version history becomes corrupted:

1. Backup `projectVersions.json`
2. Manually edit the `codeVersionHistory` object
3. Keep only valid entries with proper structure

## Migration from Fingerprinting

This system replaces the previous EAS fingerprint-based approach. Key differences:

- **Manual control**: You decide when versions change
- **No false positives**: No unexpected version bumps from file modifications
- **Clear boundaries**: Explicit runtime compatibility versions
- **Better traceability**: Git integration and history tracking

Existing builds using fingerprints will not receive updates after migration. Plan a coordinated release to move all users to the new versioning system.
