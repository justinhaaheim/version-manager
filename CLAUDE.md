# CLAUDE.md

## Project Overview

@justinhaaheim/version-manager is a file-based version tracking system for JavaScript/TypeScript projects. It uses git history to automatically calculate version numbers based on commits since the last version change.

### Key Features

- **File-based versioning**: Uses `version-manager.json` as source of truth (committed to repo)
- **Automatic version calculation**: Tracks commits since last `codeVersionBase` change
- **Two calculation modes**:
  - `add-to-patch`: Adds commit count to patch version (e.g., 1.3.0 + 5 commits → 1.3.5)
  - `append-commits`: Appends commit count as metadata (e.g., 1.3.0 + 5 commits → 1.3.0+5)
- **Git hooks integration**: Auto-generates version file on commits, checkouts, merges, rebases
- **Runtime version support**: Track OTA update compatibility separately from code version

### How It Works

1. **version-manager.json** (committed): Configuration with `codeVersionBase`, `runtimeVersion`, `versionCalculationMode`
2. **dynamic-version.local.json** (gitignored): Generated file with computed `codeVersion` and `runtimeVersion`
3. **Git hooks**: Automatically regenerate version file on git operations

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

The tool provides four main commands:

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
- `--runtime, -r`: Also update runtimeVersion to match codeVersion
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

## Codebase Structure

```
src/
  index.ts                  # CLI entry point, yargs command definitions
  version-generator.ts      # Core version calculation logic
  git-utils.ts             # Git commands (describe, log, commit tracking)
  git-hooks-manager.ts     # Git hook installation/update logic
  script-manager.ts        # package.json script management
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
- Three commands: default (generate), install, install-scripts
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
- `findLastCommitWhereFieldChanged()`: Find commit where a JSON field value changed
- `countCommitsBetween()`: Count commits between two refs
- All functions use `execSync` with proper error handling

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

1. Read `version-manager.json` for `codeVersionBase` and `versionCalculationMode`
2. Find last commit where `codeVersionBase` **value** changed (not just file modification)
3. Count commits from that point to HEAD
4. Calculate version based on mode:
   - `add-to-patch`: Parse semver, add commits to patch number
   - `append-commits`: Append commits as metadata (+N)
5. Include `BUILD_NUMBER` env var if present

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
  codeVersionBase: string;           // e.g., "0.1.0" - Base version for calculations
  runtimeVersion: string;            // e.g., "0.1.0" - OTA update compatibility version
  versionCalculationMode: 'add-to-patch' | 'append-commits';
}
```
- **Committed to git** - Source of truth for version configuration
- Modified manually by developers when bumping base versions

### DynamicVersion (dynamic-version.local.json)
```typescript
{
  codeVersion: string;               // e.g., "0.1.3" or "0.1.0+3" - Computed version
  runtimeVersion: string;            // e.g., "0.1.0" - Copied from config
  buildNumber?: string;              // e.g., "1234567890" - From BUILD_NUMBER env var
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
- `yargs` (18.0.0) - CLI argument parsing

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
const { codeVersion, runtimeVersion, buildNumber } = readDynamicVersion();
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

### Manual Testing
Use the `test:local` commands to test changes locally before publishing:
```bash
bun run test:local           # Test version generation
bun run test:local:install   # Test full installation
bun run test:local:help      # Test help output
```

### Automated Testing (TODO)
- Integration tests with temporary git repositories
- Test both calculation modes
- Test git hook installation scenarios
- Test CLI commands and flags

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

1. Edit `version-manager.json` and update `codeVersionBase` (e.g., from "0.1.0" to "0.2.0")
2. Commit the change: `git add version-manager.json && git commit -m "Bump version to 0.2.0"`
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