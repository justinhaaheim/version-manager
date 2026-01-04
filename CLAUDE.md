# CLAUDE.md

## Project Overview

@justinhaaheim/version-manager is a file-based version tracking system for JavaScript/TypeScript projects. It uses git history to automatically calculate version numbers based on commits since the last version change.

### Key Features

- **File-based versioning**: Uses `package.json` version field as the base version (standard npm version)
- **Automatic version calculation**: Tracks commits since last `package.json` version change
- **Two calculation modes**:
  - `add-to-patch`: Adds commit count to patch version (e.g., 1.3.0 + 5 commits → 1.3.5)
  - `append-commits`: Appends commit count as metadata (e.g., 1.3.0 + 5 commits → 1.3.0+5)
- **Git hooks integration**: Auto-generates version file on commits, checkouts, merges, rebases
- **Runtime version support**: Track OTA update compatibility separately from dynamic version

### How It Works

1. **package.json** (committed): Standard npm version field is the base version
2. **version-manager.json** (committed): Configuration with `runtimeVersion` and `versionCalculationMode`
3. **dynamic-version.local.json** (gitignored): Generated file with `baseVersion`, `dynamicVersion`, `runtimeVersion`, and `buildNumber`
4. **Git hooks**: Automatically regenerate version file on git operations

## Development Commands

### Code Quality (ALWAYS RUN AFTER CHANGES)
- `bun run signal` - Run all checks sequentially (TypeScript, ESLint, Prettier)
- `bun run ts-check` - TypeScript compilation check (no emit)
- `bun run lint` - ESLint with max 0 warnings
- `bun run lint:fix` - Auto-fix ESLint issues
- `bun run prettier` - Format code with Prettier

### Local Testing
- `bun run test:local` - Run the CLI locally (generates dynamic-version.local.json)
- `bun run test:local:help` - Show CLI help
- `bun run test:local:install` - Test the install command locally

## CLI Commands

The tool provides five main commands:

### 1. Generate Version File (default)
```bash
npx @justinhaaheim/version-manager [options]
bun run test:local  # For local development
```
- Generates `dynamic-version.local.json` with computed versions
- Prompts to create `version-manager.json` if missing
- Prompts to add `*.local.json` to .gitignore if missing

**Options:**
- `--output, -o <path>`: Output file path (default: ./dynamic-version.local.json)
- `--silent, -s`: Suppress console output
- `--fail/--no-fail`: Exit with error code on failures (default: true)

### 2. Install Git Hooks and Scripts
```bash
npx @justinhaaheim/version-manager install [options]
bun run test:local:install  # For local development
```
- Installs git hooks (post-commit, post-checkout, post-merge, post-rewrite)
- Adds scripts to package.json (including prebuild, predev, prestart hooks)
- Generates initial version file
- Works with standard .git/hooks and Husky

**Scripts added:**
- `dynamic-version:generate` - Generate version file
- `dynamic-version:install` - Reinstall git hooks and scripts
- `dynamic-version:install-scripts` - Update scripts only
- `prebuild` - Auto-regenerate version before `npm run build`
- `predev` - Auto-regenerate version before `npm run dev`
- `prestart` - Auto-regenerate version before `npm run start`

**Options:**
- `--increment-patch`: Increment patch version with each commit (deprecated in favor of file-based system)
- `--silent, -s`: Suppress console output
- `--fail/--no-fail`: Exit with error code on failures

### 3. Bump Version
```bash
npx @justinhaaheim/version-manager bump [options]
```
- Increments version in `version-manager.json` based on current computed version
- Regenerates `dynamic-version.local.json`
- Optionally commits the change

**Options:**
- `--major`: Bump major version (e.g., 1.2.3 → 2.0.0)
- `--minor`: Bump minor version (e.g., 1.2.3 → 1.3.0)
- `--patch`: Bump patch version (e.g., 1.2.3 → 1.2.4) - **default**
- `--runtime, -r`: Also update runtimeVersion to match dynamicVersion
- `--commit, -c`: Auto-commit the version change
- `--tag, -t`: Create git tag (requires --commit)
- `--push, -p`: Push commit and tag to remote (requires --commit)
- `--message, -m`: Custom commit message (only with --commit)

**Examples:**
```bash
npx @justinhaaheim/version-manager bump                    # Bump patch (default)
npx @justinhaaheim/version-manager bump --minor            # Bump minor version
npx @justinhaaheim/version-manager bump --commit           # Bump and commit
npx @justinhaaheim/version-manager bump --runtime          # Bump code + runtime
npx @justinhaaheim/version-manager bump --commit --tag     # Bump, commit, and tag
npx @justinhaaheim/version-manager bump -c -t -p           # Bump, commit, tag, and push
```

### 4. Install Scripts Only
```bash
npx @justinhaaheim/version-manager install-scripts
```
- Only updates package.json scripts (doesn't touch git hooks)
- Prompts before overwriting existing scripts

### 5. Watch Files
```bash
npx @justinhaaheim/version-manager watch [options]
```
- Watches for file changes and auto-regenerates version file
- Alternative to Metro plugin for non-React Native projects
- Respects .gitignore patterns

**What it watches:**
- `.git/HEAD` and `.git/refs/**` - Git state changes (commits, checkouts, merges)
- `package.json` - Base version changes
- `version-manager.json` - Config changes
- All project files (excluding gitignored files)

**Options:**
- `--debounce <ms>`: Debounce delay in milliseconds (default: 2000)
- `--output, -o <path>`: Output file path (default: ./dynamic-version.local.json)
- `--silent, -s`: Suppress console output
- `--fail/--no-fail`: Exit with error code on failures

**Examples:**
```bash
npx @justinhaaheim/version-manager watch                    # Start with defaults
npx @justinhaaheim/version-manager watch --debounce 500     # Fast debounce
npx @justinhaaheim/version-manager watch --silent           # Silent mode
```

**Usage Tips:**
- Run in a separate terminal during development
- Press Ctrl+C to stop watching
- Useful for projects not using Metro bundler
- Debouncing prevents rapid regeneration during multi-file changes

## Codebase Structure

```
src/
  index.ts                  # CLI entry point, yargs command definitions
  version-generator.ts      # Core version calculation logic
  git-utils.ts             # Git commands (describe, log, commit tracking)
  git-hooks-manager.ts     # Git hook installation/update logic
  script-manager.ts        # package.json script management
  metro-plugin.ts          # Metro bundler plugin for auto-regeneration
  watcher.ts               # File watcher for auto-regeneration
  reader.ts                # Public API for reading version files
  types.ts                 # TypeScript type definitions

docs/
  plans/                   # Development planning documents
  prompts/                 # Guidelines for AI assistance
```

### File Responsibilities (Detailed)

**index.ts** (CLI)
- Entry point when run as `npx @justinhaaheim/version-manager`
- Uses yargs for command parsing
- Four commands: default (generate), install, install-scripts, bump
- Handles user prompts for .gitignore and version-manager.json
- Orchestrates calls to other modules
- Includes `require.main === module` check for direct execution

**version-generator.ts** (Core Logic)
- `generateFileBasedVersion()`: Main function for file-based versioning
- `createDefaultVersionManagerConfig()`: Creates version-manager.json with defaults
- `parseGitDescribe()`: Parses git describe output (legacy, still used internally)
- `calculateCodeVersion()`: Implements both calculation modes
- `formatHumanReadable()`: Legacy function for human-readable versions
- `generateVersion()`: Legacy tag-based version generation (kept for compatibility)

**git-utils.ts** (Git Operations)
- `isGitRepository()`: Check if cwd is a git repo
- `getGitDescribe()`: Run git describe command
- `getCurrentBranch()`: Get current branch name
- `hasUncommittedChanges()`: Check for uncommitted changes
- `findLastCommitWhereFieldChanged()`: Find commit where a JSON field value changed
- `countCommitsBetween()`: Count commits between two refs
- `readFieldFromCommit()`: Read a field value from a JSON file at a specific commit
- `execCommand()`: Helper to run git commands with async/await
- All functions use `execAsync` (promisified exec) with proper error handling

**git-hooks-manager.ts** (Hook Management)
- `installGitHooks()`: Install/update hooks for post-commit, post-checkout, post-merge, post-rewrite
- `checkGitignore()`: Verify *.local.json is ignored
- `getGitHooksPath()`: Detect custom hooks path (core.hooksPath) or .git/hooks
- Smart update logic: appends to new hooks, replaces matching lines in existing hooks
- Detects Husky and adjusts hook format accordingly
- Makes hooks executable with chmod 755

**script-manager.ts** (package.json Management)
- `readPackageJson()`: Read and parse package.json
- `addScriptsToPackageJson()`: Add dynamic-version scripts
- `hasExistingDynamicVersionScripts()`: Check for existing scripts
- `getConflictingScripts()`: Find scripts that would be overwritten
- `listDefaultScripts()`: Show added scripts to user
- Preserves package.json formatting when updating

**metro-plugin.ts** (Metro Bundler Integration)
- `withVersionManager()`: Metro config enhancer for auto-regeneration
- Runs during Metro's serialization phase
- Generates version data in memory and compares with existing file
- Only writes if content has changed (prevents rebuild loops)
- Silently fails on errors to avoid breaking builds
- Exported as `@justinhaaheim/version-manager/metro-plugin`

**watcher.ts** (File Watcher)
- `startWatcher()`: Main file watching function for auto-regeneration
- Uses chokidar for cross-platform file watching
- Watches git state (.git/HEAD, .git/refs), config files, and project files
- Respects .gitignore patterns automatically
- Debounces changes to prevent rapid regeneration
- Content-based writing (only writes if version changed)
- Graceful error handling and cleanup

**reader.ts** (Public API)
- Public export: `readDynamicVersion()`
- Reads dynamic-version.local.json
- Returns `DynamicVersion` object
- This is what consumers import when using as a library

**types.ts** (Type Definitions)
- Core interfaces for all data structures
- See "Core Data Structures" section below

## Key Implementation Details

### Version Calculation Algorithm

1. Read base version from `package.json` version field
2. Read `version-manager.json` for `versionCalculationMode` and `runtimeVersion`
3. Find last commit where `package.json` version field **value** changed (not just file modification)
4. Count commits from that point to HEAD
5. **Detect uncommitted version changes**: If the working tree version differs from the version at the last commit where it changed, treat as 0 commits (prevents showing `0.2.0+20` after bumping to `0.2.0` but before committing)
6. Calculate dynamic version based on mode:
   - `add-to-patch`: Parse semver, add commits to patch number
   - `append-commits`: Append commits as metadata (+N)
7. Generate build number automatically in iOS-compatible timestamp format

### Git Hook Management

- Detects Husky vs standard .git/hooks
- Smart update logic: appends to new hooks, replaces matching lines in existing hooks
- Warns if multiple version-manager commands found (manual intervention needed)
- Makes hooks executable (chmod 755)
- Respects `core.hooksPath` git config

## Core Data Structures

### VersionManagerConfig (version-manager.json)
```typescript
{
  runtimeVersion: string;            // e.g., "0.1.0" - OTA update compatibility version
  versionCalculationMode: 'add-to-patch' | 'append-commits';
}
```
- **Committed to git** - Configuration for runtime version and calculation mode
- Base version is now stored in standard `package.json` version field

### DynamicVersion (dynamic-version.local.json)
```typescript
{
  baseVersion: string;               // e.g., "0.1.0" - Raw version from package.json
  dynamicVersion: string;            // e.g., "0.1.3" or "0.1.0+3" - Computed version
  runtimeVersion: string;            // e.g., "0.1.0" - Copied from config
  buildNumber: string;               // e.g., "20251023.143245.67" - Generated timestamp
  branch: string;                    // e.g., "main" - Current git branch
  dirty: boolean;                    // true if uncommitted changes
  generationTrigger: 'git-hook' | 'cli';  // What triggered generation
  timestamp: string;                 // ISO 8601 timestamp
}
```
- **Gitignored** - Generated by CLI, never committed
- Regenerated on git operations (commit, checkout, merge, rebase)
- Consumed by app.config.js, build scripts, app code

### VersionInfo (Legacy)
```typescript
{
  branch: string;                    // Current git branch
  describe: string;                  // Raw git describe output
  dirty: boolean;                    // Uncommitted changes flag
  timestamp: string;                 // ISO 8601 timestamp
  humanReadable: string;             // e.g., "0.2.11+5 (feature-auth) *"
  components: {
    baseVersion: string;             // e.g., "0.2.11"
    commitsSince: number;            // e.g., 5
    shortHash: string;               // e.g., "3a7f9b2"
  } | null;
  version: string;                   // Computed version
}
```
- Legacy format from tag-based system
- Still used internally but not in public API

## Dependencies

**Runtime:**
- `chokidar` (^3.6.0) - File watching for watch command
- `yargs` (18.0.0) - CLI argument parsing
- `zod` (4.1.12) - Schema validation for version files

**Dev:**
- `typescript` (~5.8.3) - Type checking and compilation
- `eslint` (9.31.0) + `eslint-config-jha-react-node` - Linting
- `prettier` (3.6.2) - Code formatting
- `husky` (9.1.7) - Git hooks management (for this project itself)
- `lint-staged` (^14.0.1) - Run linters on staged files
- `concurrently` (8.2.1) - Run multiple commands in parallel

**Why so few runtime dependencies?**
- Faster installation in consumer projects
- Fewer supply chain security concerns
- Uses Node.js built-ins (fs, child_process, path) for most operations

## Design Decisions

### Why File-Based Instead of Tag-Based?

**Problem with tag-based:**
- Required creating git tags for every version bump
- Tags are global across branches (conflicts in multi-branch workflows)
- Can't easily track different version "tracks" (code vs runtime vs build)
- Hard to automate version bumps without polluting git history with tags

**Benefits of file-based:**
- Single source of truth in version-manager.json (committed)
- Versions track automatically based on commits since last manual bump
- Different version types (code, runtime, build) managed independently
- Works naturally in multi-branch workflows
- No git tag pollution

### Why Two Calculation Modes?

- `add-to-patch`: Natural for automated patch bumps (1.3.0 → 1.3.5)
- `append-commits`: Better for pre-release/dev builds (1.3.0+5)
- Different projects have different conventions - support both

### Why Git Hooks Instead of npm Scripts?

- Ensures version file stays in sync automatically
- Works even if developer forgets to run script
- Catches checkout/merge/rebase operations, not just commits
- Can be disabled with git flags if needed (--no-verify)

### Public API Design

**For consumers (using as library):**
```typescript
import { readDynamicVersion } from '@justinhaaheim/version-manager/reader';
const { baseVersion, dynamicVersion, runtimeVersion, buildNumber } = readDynamicVersion();
```

**For CLI users:**
```bash
npx @justinhaaheim/version-manager install
# Or use in package.json scripts
npm run dynamic-version:generate
```

**Separation:**
- `reader.ts` exports only the reading function (consumer API)
- `index.ts` exports nothing (CLI only)
- Main export points to `dist/reader.js`
- Bin entries point to `dist/index.js`

## Common Gotchas and Edge Cases

### Git Operations
- **Not a git repository**: Functions check with `isGitRepository()` first
- **No commits yet**: `countCommitsBetween()` returns 0
- **version-manager.json never changed**: Returns 0 commits (uses base version as-is)
- **Detached HEAD**: `getCurrentBranch()` returns "HEAD"
- **Custom hooks path**: Code checks `git config core.hooksPath`

### Hook Installation
- **Husky detected**: Adjusts hook format (no shebang needed)
- **Multiple version-manager commands**: Warns user to manually edit
- **Existing hooks**: Appends or replaces intelligently based on pattern matching
- **Development mode**: Detects `@justinhaaheim/version-manager` package name, uses `bun run test:local`

### Version Calculation
- **No version-manager.json**: Returns default "0.1.0"
- **Invalid calculation mode**: Falls back to "add-to-patch"
- **Invalid semver in base**: Returns base version as-is (no calculation)
- **BUILD_NUMBER not set**: buildNumber field omitted from output

### File Operations
- **Missing .gitignore**: Prompts user to add `*.local.json`
- **Missing version-manager.json**: Prompts user to create with defaults
- **Corrupted JSON**: Error thrown, user must fix manually
- **Output path doesn't exist**: Parent directory must exist (not created automatically)

## Module Organization
- **NO barrel files**: Never use `index.{ts,tsx,js,jsx}` files that only re-export other modules
- **Direct imports only**: Always import directly from the specific module file
- **No directory index pattern**: Don't create a directory with an index file when a single module file would suffice

## Testing

**ALWAYS prefer automated tests over manual testing.** One-off manual tests are not sustainable and don't catch regressions. If you find yourself testing something manually, consider whether that test should be added to the test suite.

### Running Tests
```bash
bun test                    # Run all tests
bun test tests/unit         # Run unit tests only
bun test tests/integration  # Run integration tests only
bun test <file>             # Run specific test file
```

### Test Structure
- `tests/unit/` - Pure unit tests (no git repos needed)
  - `output-formatter.test.ts` - Output formatting tests
  - `git-utils.test.ts` - Git utility function tests
- `tests/integration/` - Integration tests with temporary git repos
  - `version-generation.test.ts` - Core version calculation tests
  - `cli-output.test.ts` - CLI output format tests
  - `config-migration.test.ts` - Config migration tests
  - `git-hooks.test.ts` - Hook installation tests (may be flaky)
  - `watcher.test.ts` - File watcher tests (may be flaky)
- `tests/helpers/` - Test utilities and fixtures
- `tests/smoke.test.ts` - Basic infrastructure tests

### Quick Sanity Check (Local)
Use these commands for quick sanity checks during development:
```bash
bun run test:local           # Test version generation
bun run test:local:help      # Test help output
```

Note: These are NOT a substitute for proper automated tests.

## Important General Guidelines

Always follow the important guidelines in @docs/prompts/IMPORTANT_GUIDELINES_INLINED.md

Be aware that messages from the user may contain speech-to-text (S2T) artifacts. Ask for clarification if something seems ambiguous or inconsistent with other parts of the message/project, especially if it is consequential to the overall message. S2T Guidelines: @docs/prompts/S2T_GUIDELINES.md

## Version Bumping Workflow

### Automated Bumping (Recommended)

Use the `bump` command to automatically increment versions:

```bash
# Bump patch version (0.1.11 → 0.1.12)
npx @justinhaaheim/version-manager bump

# Bump minor version (0.1.11 → 0.2.0)
npx @justinhaaheim/version-manager bump --minor

# Bump major version (0.1.11 → 1.0.0)
npx @justinhaaheim/version-manager bump --major

# Bump and update runtime version too
npx @justinhaaheim/version-manager bump --minor --runtime

# Bump and auto-commit
npx @justinhaaheim/version-manager bump --commit
```

### Manual Bumping

To bump the base version manually:

1. Edit `package.json` and update the `version` field (e.g., from "0.1.0" to "0.2.0")
2. Commit the change: `git add package.json && git commit -m "Bump version to 0.2.0"`
3. The next commit after this will calculate from the new base (e.g., 0.2.1 with one commit)

To update runtime version (only when native changes require it):
1. Edit `runtimeVersion` in `version-manager.json`
2. Commit the change

## Version File Regeneration

The `dynamic-version.local.json` file is automatically regenerated in two ways:

### 1. Git Hooks (Automatic)
When git hooks are installed, the version file regenerates on:
- `post-commit` - After every commit
- `post-checkout` - When switching branches
- `post-merge` - After merging branches
- `post-rewrite` - After rebasing

### 2. Build Hooks (Automatic)
When scripts are installed via `install` command, npm lifecycle hooks regenerate the version before:
- `npm run build` - Via `prebuild` hook
- `npm run dev` - Via `predev` hook
- `npm run start` - Via `prestart` hook

This ensures the version file is always fresh when starting dev servers or building for production, even if you haven't committed recently.

**Note:** Build hooks use `--silent --no-fail` flags to avoid breaking builds if version generation encounters issues.

### 3. Metro Plugin (Automatic - React Native/Expo)
For React Native and Expo projects using Metro bundler, you can auto-regenerate the version file on every bundle without causing infinite rebuild loops:

**Setup:**
```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withVersionManager } = require('@justinhaaheim/version-manager/metro-plugin');

const config = getDefaultConfig(__dirname);
module.exports = withVersionManager(config);
```

**How it works:**
1. Plugin runs during Metro's serialization phase (before bundle output)
2. Generates version data in memory
3. Compares with existing file content
4. **Only writes if content has changed** - prevents rebuild loops

**Benefits:**
- ✅ Version file stays current during long dev sessions
- ✅ Git hooks still work - Metro detects their changes and rebuilds
- ✅ No infinite loops - content comparison prevents unnecessary writes
- ✅ Silently fails if version generation fails (won't break builds)

**Interaction with git hooks:**
- After commit: Git hook writes → Metro sees change → rebuilds with fresh version ✅
- After checkout: Git hook writes → Metro sees change → rebuilds ✅
- During HMR: Same version → no write → no rebuild → no loop ✅

### 4. File Watcher (Manual - Any Project)
For any project (not just React Native), you can run the file watcher in a separate terminal:

**Setup:**
```bash
# Run in a separate terminal during development
npx @justinhaaheim/version-manager watch

# Or with custom debounce
npx @justinhaaheim/version-manager watch --debounce 500
```

**How it works:**
1. Uses chokidar to watch git state, config files, and all project files
2. Respects .gitignore patterns automatically
3. Debounces changes (default 2000ms) to batch rapid file modifications
4. Only writes if version content changed (prevents unnecessary writes)

**Benefits:**
- ✅ Works with any build tool or framework
- ✅ Alternative to Metro plugin for non-React Native projects
- ✅ Respects .gitignore (won't trigger on build artifacts)
- ✅ Configurable debouncing prevents spam
- ✅ Clear console output shows when version was regenerated
- ✅ Graceful shutdown with Ctrl+C

**Use cases:**
- Webpack/Vite/Rollup projects during development
- Backend projects that use version info
- Any project where you want live version updates during development
- Projects using build tools other than Metro