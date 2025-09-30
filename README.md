# @justinhaaheim/version-manager

Generate unique version identifiers for every commit in your React/React Native projects. Easily identify which exact version of code is running during development, especially with multiple branches and dev servers.

Also includes a comprehensive version tracking system for JavaScript/TypeScript projects with support for semantic versioning, build numbers, runtime versions, and release versions.

## Features

### Version Generation (generate-version)

- 🔍 **Unique version for every commit** - Uses `git describe` with branch info
- 🏷️ **Human-readable format** - Shows meaningful versions like "0.2.11+5 (feature-auth)"
- ⚠️ **Dirty state indicator** - Asterisk (\*) shows uncommitted changes
- 🌲 **Branch awareness** - Always know which branch the code is from
- 📦 **Zero dependencies for generation** - Lightweight and fast
- 🔧 **Zero config** - Works out of the box with any git repository
- 💻 **TypeScript ready** - Full type definitions included

### Version Management (version-manager)

- **Multiple Version Types**: Track code versions, build numbers, runtime versions, and release versions independently
- **Git Integration**: Automatically records branch and commit information with each version change
- **Version History**: Maintains a history of version changes with timestamps and metadata
- **Schema Validation**: Uses Zod for robust schema validation of version files
- **Interactive CLI**: User-friendly interactive mode for version management
- **Programmatic API**: Use as a library in your build scripts

## Installation

```bash
npm install --save-dev @justinhaaheim/version-manager
# or
yarn add -D @justinhaaheim/version-manager
# or
bun add -D @justinhaaheim/version-manager
```

## Quick Start - Version Generation

No installation required! Run directly with npx:

```bash
npx @justinhaaheim/version-manager generate-version
```

This creates a `package-versions.json` file in your project root:

```json
{
  "describe": "v0.2.11-5-g3a7f9b2-dirty",
  "branch": "feature-auth",
  "dirty": true,
  "timestamp": "2024-12-20T19:45:30.123Z",
  "humanReadable": "0.2.11+5 (feature-auth) *",
  "components": {
    "baseVersion": "0.2.11",
    "commitsSince": 5,
    "shortHash": "3a7f9b2"
  }
}
```

## Quick Start - Version Management

1. Initialize your project with a `projectVersions.json` file:

```json
{
  "codeVersion": "1.0.0",
  "buildNumber": "1",
  "runtimeVersion": "1.0.0",
  "releaseVersion": "1.0.0",
  "codeVersionHistory": {},
  "runtimeVersions": {}
}
```

2. Use the CLI:

```bash
# Interactive mode
npx version-manager

# Bump code version (for OTA updates)
npx version-manager --bump

# Bump for a new build (increments both code version and build number)
npx version-manager --bump-for-build

# Show current versions
npx version-manager --show
```

## Version Types Explained

### Code Version (`codeVersion`)

The main application version that increments with every meaningful code change.

- **When to increment**: Every commit that changes application behavior, UI, or logic
- **Format**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Used for**: Tracking code changes, displaying to users, changelog

### Build Number (`buildNumber`)

A monotonically increasing integer for each build submitted to app stores.

- **When to increment**: Every build that goes to TestFlight, App Store, or other distribution
- **Format**: Integer (stored as string)
- **Used for**: iOS/Android build identification, app store requirements

### Runtime Version (`runtimeVersion`)

Defines the native runtime compatibility boundary for over-the-air updates.

- **When to increment**: Only when making breaking native changes
- **Format**: Semantic versioning
- **Used for**: OTA update compatibility
- **Breaking changes include**:
  - Adding/removing native dependencies
  - Changing app permissions or entitlements
  - Modifying native configuration
  - Updating SDK versions

### Release Version (`releaseVersion`)

The public-facing version shown in app stores.

- **When to increment**: Major releases, marketing milestones
- **Format**: Semantic versioning
- **Used for**: App store display, marketing

## Version Generation Usage

### Generate Version CLI

```bash
npx @justinhaaheim/version-manager generate-version [options]

Options:
  -o, --output <path>  Output file path (default: ./package-versions.json)
  -s, --silent         Suppress console output
  -h, --help           Show help
```

### Integration with Build Scripts

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "npx @justinhaaheim/version-manager generate-version && vite",
    "build": "npx @justinhaaheim/version-manager generate-version && vite build",
    "start": "npx @justinhaaheim/version-manager generate-version && react-scripts start"
  }
}
```

### Using in React Components

```tsx
// VersionDisplay.tsx
import versionInfo from '../package-versions.json';

export const VersionDisplay = () => {
  // Only show in development
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 4,
        right: 4,
        padding: '2px 8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.8)',
        color: versionInfo.dirty ? '#ffaa00' : '#00ff00',
        borderRadius: 3,
        pointerEvents: 'none',
        zIndex: 9999,
      }}>
      {versionInfo.humanReadable}
    </div>
  );
};
```

### TypeScript Support for Version Generation

Add type declarations to your project:

```typescript
// types/package-versions.d.ts
declare module '*/package-versions.json' {
  export interface VersionInfo {
    describe: string;
    branch: string;
    dirty: boolean;
    timestamp: string;
    humanReadable: string;
    components: {
      baseVersion: string;
      commitsSince: number;
      shortHash: string;
    } | null;
  }

  const versionInfo: VersionInfo;
  export default versionInfo;
}
```

### Version Format

The human-readable version format follows this pattern:

- **Tagged commits**: `0.2.11` (when exactly on a tag)
- **Commits after tag**: `0.2.11+5` (5 commits after v0.2.11)
- **Non-main branch**: `0.2.11+5 (feature-auth)`
- **Uncommitted changes**: `0.2.11+5 (feature-auth) *`
- **No tags yet**: `untagged (main)`

### Edge Cases

The package handles these scenarios gracefully:

- **No git tags yet**: Falls back to showing "untagged" with branch name
- **Not a git repository**: Shows clear error message
- **Detached HEAD state**: Shows "HEAD" as branch name
- **Uncommitted changes**: Adds "-dirty" suffix and asterisk to human-readable version

## Version Management CLI Usage

### Commands

```bash
# Interactive mode - presents a menu of options
npx version-manager

# Increment code version only (patch by default)
npx version-manager --bump
npx version-manager --bump --major
npx version-manager --bump --minor

# Increment both code version and build number
npx version-manager --bump-for-build

# Increment build number only
npx version-manager --build-only

# Update runtime version (use with caution)
npx version-manager --bump --minor --update-runtime

# Show current versions
npx version-manager --show

# Show version history
npx version-manager --history

# Repair corrupted version file
npx version-manager --repair
```

### Options

- `--bump, -b`: Increment code version only
- `--bump-for-build, -B`: Increment both code version and build number
- `--build-only`: Increment build number only
- `--major`: Bump major version (1.0.0 -> 2.0.0)
- `--minor`: Bump minor version (0.1.0 -> 0.2.0)
- `--update-runtime`: Update runtime version to match code version
- `--channel`: Specify update channel (development/preview/production)
- `--profile`: Specify build profile
- `--message, -m`: Add a message to the version history
- `--commit, -c`: Automatically commit the version changes
- `--show`: Show current versions
- `--history`: Show version history
- `--repair`: Attempt to repair invalid schema

## Programmatic API

```typescript
import {VersionManager} from '@justinhaaheim/version-manager';

const manager = new VersionManager({
  versionsFilePath: './projectVersions.json', // optional, defaults to cwd
});

// Read current versions
const versions = manager.readVersions();
console.log(versions.codeVersion);

// Increment versions
const newVersion = manager.incrementCodeVersion(versions.codeVersion, 'minor');
const newBuildNumber = manager.incrementBuildNumber(versions.buildNumber);

// Update and save
versions.codeVersion = newVersion;
versions.buildNumber = newBuildNumber;
manager.writeVersions(versions);

// Get git information
const gitInfo = manager.getGitInfo();
console.log(gitInfo.branch, gitInfo.commit);
```

## Integration Examples

### With package.json scripts

```json
{
  "scripts": {
    "version:bump": "version-manager --bump",
    "version:build": "version-manager --bump-for-build",
    "build:ios": "npm run version:build && xcodebuild ...",
    "release:ota": "npm run version:bump && eas update ..."
  }
}
```

### With Expo/React Native

```javascript
// app.config.js or app.config.ts
const versions = require('./projectVersions.json');

export default {
  version: versions.codeVersion,
  ios: {
    buildNumber: versions.buildNumber,
  },
  android: {
    versionCode: parseInt(versions.buildNumber),
  },
  runtimeVersion: versions.runtimeVersion,
};
```

### With CI/CD

```yaml
# GitHub Actions example
- name: Bump version for build
  run: npx version-manager --bump-for-build --commit

- name: Build app
  run: npm run build
```

## Version History

The tool maintains a history of version changes in the `codeVersionHistory` object within `projectVersions.json`. Each entry includes:

- Timestamp
- Git branch and commit hash
- Type of change (build/update)
- Optional channel, profile, and message

The history is automatically pruned to keep the last 50 entries to prevent file bloat.

## Troubleshooting

### Schema Validation Errors

If your `projectVersions.json` becomes corrupted:

```bash
npx version-manager --repair
```

This will attempt to salvage valid data and create a valid schema.

### Git Integration Issues

The tool will warn about uncommitted changes but will still allow version bumps. To check git status:

```bash
git status
```

### Version Conflicts

If you need to manually edit versions, ensure the `projectVersions.json` follows the schema:

```typescript
{
  codeVersion: string,      // Semantic version
  buildNumber: string,      // Numeric string
  runtimeVersion: string,   // Semantic version
  releaseVersion: string,   // Semantic version
  codeVersionHistory: {},   // Version history entries
  runtimeVersions: {}       // Runtime version entries
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © Justin Haaheim

## See Also

- [VERSIONING.md](./VERSIONING.md) - Detailed versioning guide and workflows
- [CLAUDE.md](./CLAUDE.md) - Development instructions and guidelines
