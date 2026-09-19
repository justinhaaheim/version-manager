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
2. **version-manager.json** (committed): Configuration — `versionCalculationMode`, `versionMode`, the `versions` map, and the `branchSuffix` / `mergeDriver` knobs. Every field is optional, and so is the file
3. **dynamic-version.local.json** (gitignored): Generated file with `baseVersion`, `dynamicVersion`, `buildNumber`, `commitsSince` and the `versions` map — written in `dynamic-file` mode only
4. **version.jsonl** (committed, `event-log` mode only): An append-only log — one JSON object per commit — from which the version is DERIVED. Nothing stores a computed version in this mode
5. **Git hooks**: Automatically regenerate version file on git operations (`dynamic-file` mode), write the version into package.json before the commit (`package-json` mode), or append one commit event to version.jsonl before the commit (`event-log` mode)

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

The tool provides five main commands, plus two entry points git calls rather than a human: the `--pre-commit` flag (the `package-json` mode hook) and the hidden `merge-driver <ancestor> <ours> <theirs>` subcommand.

### 1. Generate Version File (default)
```bash
npx @justinhaaheim/version-manager [options]
bun run test:local  # For local development
```
- Generates `dynamic-version.local.json` with computed versions — in `dynamic-file` mode, or when `--output` is passed explicitly
- Does NOT create `version-manager.json` when it is missing: the file is optional, `createDefaultVersionManagerConfig()` has no callers, and the defaults are used instead
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
- In `dynamic-file` mode: installs post-commit, post-checkout, post-merge and post-rewrite hooks, adds the lifecycle scripts (prebuild, predev, prestart), and generates the initial version file
- In `package-json` mode: installs a `pre-commit` hook and NOTHING else — no post-* hooks, no lifecycle scripts, no gitignore entries, no generated file. It also registers the merge driver, but only when `mergeDriver.enabled` is on
- Does NOT remove the other mode's hooks, scripts or generated file when the mode changes
- Works with standard .git/hooks and Husky

**Scripts added** (`dynamic-file` mode; the lifecycle four are skipped in `package-json` mode):
- `dynamic-version` and `dynamic-version:generate` - Generate version file
- `dynamic-version:install` - Reinstall git hooks and scripts
- `dynamic-version:install-scripts` - Update scripts only
- `prepare` - Regenerate after `npm install`, with `--no-fail`
- `prebuild` - Auto-regenerate version before `npm run build`
- `predev` - Auto-regenerate version before `npm run dev`
- `prestart` - Auto-regenerate version before `npm run start`

The three `pre*` scripts are written as a bare `npx @justinhaaheim/version-manager`, with no `--silent --no-fail` — the flagged versions are commented out in `script-manager.ts`.

**Options:**
- `--increment-patch`: Increment patch version with each commit (deprecated in favor of file-based system)
- `--silent, -s`: Suppress console output
- `--fail/--no-fail`: Exit with error code on failures

### 3. Bump Version
```bash
npx @justinhaaheim/version-manager bump [options]
```
- Increments the version in `package.json` based on the current computed version
- Regenerates `dynamic-version.local.json`
- Optionally commits the change

**Options:**
- `[versions..]` (positional): Custom version names from the `versions` map to sync, e.g. `bump runtime`
- `--major`: Bump major version (e.g., 1.2.3 → 2.0.0)
- `--minor`: Bump minor version (e.g., 1.2.3 → 1.3.0)
- `--patch`: Bump patch version (e.g., 1.2.3 → 1.2.4) - **default**
- `--commit, -c`: Auto-commit the version change
- `--tag, -t`: Create git tag (requires --commit)
- `--push, -p`: Push commit and tag to remote (requires --commit)
- `--message, -m`: Custom commit message (only with --commit)

**Examples:**
```bash
npx @justinhaaheim/version-manager bump                    # Bump patch (default)
npx @justinhaaheim/version-manager bump --minor            # Bump minor version
npx @justinhaaheim/version-manager bump --commit           # Bump and commit
npx @justinhaaheim/version-manager bump runtime            # Bump code + sync versions.runtime
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
  branch-suffix.ts          # The branchSuffix knob: sanitising, counting, applying
  generated-file-policy.ts  # Whether this mode writes dynamic-version.local.json at all
  event-log.ts              # event-log mode: the schemas, the parse, THE DERIVATION. Pure
  event-log-mode.ts         # event-log mode: the appends, to the working tree and the index
  version-reader.ts         # Public API for event-log mode: readVersion(), no git, no file
  version-math.ts           # calculateCodeVersion, alone, so the reader pulls in no git
  gitattributes.ts          # One idempotent .gitattributes line, without clobbering
  json-text-edit.ts         # Surgical text edits to one JSON value, formatting preserved
  merge-driver.ts           # The package.json merge driver and its registration
  output-formatter.ts       # Rendering the CLI's version output
  git-utils.ts             # Git commands (describe, log, commit tracking)
  git-hooks-manager.ts     # Git hook installation/update logic
  script-manager.ts        # package.json script management
  metro-plugin.ts          # Metro bundler plugin for auto-regeneration
  watcher.ts               # File watcher for auto-regeneration
  reader.ts                # Public API for reading version files
  types.ts                 # Zod schemas and the types inferred from them

docs/
  plans/                   # Historical planning documents. Do NOT add to these:
                           # beads replaced them (see the critical rules)
```

### File Responsibilities (Detailed)

**index.ts** (CLI)
- Entry point when run as `npx @justinhaaheim/version-manager`
- Uses yargs for command parsing
- Commands: default (generate), install, install-scripts, bump, watch, and the hidden `merge-driver` that git invokes
- The `--pre-commit` flag on the default command is the `package-json` mode hook
- Handles the .gitignore prompt (there is no version-manager.json prompt)
- Orchestrates calls to other modules
- Includes `require.main === module` check for direct execution

**version-generator.ts** (Core Logic)
- `generateFileBasedVersion()`: Main function for file-based versioning
- `generatePreCommitVersionData()`: The `package-json` mode computation, run from the pre-commit hook
- `getVersionMode()` / `isMergeDriverEnabled()`: Read one knob each out of version-manager.json
- `createDefaultVersionManagerConfig()`: Writes a default version-manager.json — exported but with NO callers; nothing creates that file today
- `parseGitDescribe()`: Parses git describe output (legacy, still used internally)
- `calculateCodeVersion()`: Implements both calculation modes
- `formatHumanReadable()`: Legacy function for human-readable versions
- `generateVersion()`: Legacy tag-based version generation (kept for compatibility)

**branch-suffix.ts** (The `branchSuffix` knob)
- `sanitizeBranchName()`: The exact sanitisation rules documented in the README
- `applyBranchSuffix()` / `stripPrerelease()`: Put the prerelease on, and take whatever prerelease is there off
- `isSuffixExemptBranch()`: Main branches and detached HEAD get no suffix
- `decideBranchSuffix()`: Turns two commit measurements into a decision, or into a warning when neither measurement worked — a failed count never becomes a `0`

**generated-file-policy.ts** (Does this mode write a file at all?)
- `shouldWriteGeneratedFiles()`: THE decision, in one place — `package-json` mode writes nothing unless `--output` was passed explicitly
- `resolveOutputPathOption()`: Distinguishes "the user typed --output" from "nobody typed anything", which a yargs default would erase
- `writeGeneratedFiles()`: Writes the JSON and its .d.ts, or returns nulls meaning deliberately-not-written

**json-text-edit.ts** (Surgical JSON edits)
- `findTopLevelStringValueSpan()` / `replaceTopLevelStringValue()`: Replace one top-level string value in JSON *text*
- Used instead of parse-and-stringify so formatting, key order and every other byte of package.json survive a version bump

**merge-driver.ts** (package.json merge driver)
- `runMergeDriver()`: The driver git invokes; takes OUR version and hands the rest to `git merge-file`
- `registerMergeDriver()`: Writes the .gitattributes line and the git config entries, driver key first
- Registered by `install` only in `package-json` mode AND only when `mergeDriver.enabled` is on

**output-formatter.ts** (CLI output)
- `formatVersionOutput()`: Renders the silent / compact / normal / verbose forms
- `OutputFormat` and `VersionOutputData`: the shapes the CLI passes in

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
2. Read `version-manager.json` for `versionCalculationMode`, `versionMode` and the knobs
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

### Version modes and the two knobs

**The README is the source of truth for all three. Read it before changing any of them, and put behaviour changes there rather than duplicating them here.**

- **`versionMode`** — `dynamic-file` (default) writes the computed version to the gitignored generated file after the fact, via `post-*` hooks. `package-json` writes it into the `version` field of `package.json` *before* the commit, via a `pre-commit` hook, so the committed `package.json` carries the real version and a consumer needs neither `.git` nor a generated file. `package-json` mode is for linear history: amend double-bumps, rebase never re-runs the hook, and an auto-merge commit keeps a stale version. `event-log` commits an append-only `version.jsonl` — one line per commit — and DERIVES the version from it, storing it nowhere; merges union the lines (`version.jsonl merge=union`, a git built-in needing no config), so there is no policy to choose and nothing that can go stale. See "Version Modes: where the computed version ends up" and "`event-log` mode (opt-in)" in the README.
- **`branchSuffix`** — off by default. Adds a semver prerelease naming the branch (`0.32.3-feat-x.3`) on branches that are not in `mainBranches`. While it is on, **version-manager owns the prerelease segment**: every computation strips whatever prerelease it finds and re-applies its own, so a hand-authored `1.0.0-beta.1` is discarded. That is what stops the suffix compounding when it is committed and read back in `package-json` mode. See "Branch Name Suffix (opt-in)" in the README.
- **`mergeDriver`** — off by default, and it needs `versionMode: 'package-json'` as well. Registers a git merge driver that resolves `package.json` version conflicts to OURS. It is off by default because a registered driver whose *command* cannot run turns a merge into a conflict with no markers in it, which an author can stage away and lose the other side. See "The package.json merge driver" in the README.

When you add a knob: declare it in `VersionManagerConfigSchema` (the schema is `.strict()`, so an undeclared field makes the whole config fail to parse and silently read as absent), give it a Zod default, add it to both config literals in `version-generator.ts`, and default it to the safe side.

## Core Data Structures

### VersionManagerConfig (version-manager.json)
```typescript
{
  versionCalculationMode: 'add-to-patch' | 'append-commits';
  versionMode: 'dynamic-file' | 'event-log' | 'package-json';  // default 'dynamic-file'
  versions: Record<string, string>;                    // e.g., {runtime: "0.1.0"}; default {}
  branchSuffix: {enabled: boolean; mainBranches: string[]};  // default {false, ['main','master']}
  mergeDriver: {enabled: boolean};                     // default {enabled: false}
  outputFormat?: 'silent' | 'compact' | 'normal' | 'verbose';
}
```
- **Committed to git** - Configuration for the calculation mode, the version mode and the knobs
- The schema is `.strict()`: an unknown field makes the whole file fail the current schema
- Every field above is optional in the file; the Zod defaults fill in what is missing
- The legacy shape — a top-level `runtimeVersion` — is still accepted by `LegacyVersionManagerConfigSchema`, migrated to `versions.runtime`, and rewritten to disk with a message. It is NOT rejected; it is migrated
- Base version is stored in the standard `package.json` version field

### DynamicVersion (dynamic-version.local.json)
```typescript
{
  _generated: string;                // "This file is auto-generated by ... Do not edit."
  baseVersion: string;               // e.g., "0.1.0" - Raw version from package.json
  dynamicVersion: string;            // e.g., "0.1.3" or "0.1.0+3" - Computed version
  versions: Record<string, string>;  // e.g., {runtime: "0.1.0"} - Copied from config
  buildNumber: string;               // e.g., "20251023.143245.67" - Generated timestamp
  commitsSince: number;              // Commits since the base version last changed
  branch: string;                    // e.g., "main" - Current git branch
  dirty: boolean;                    // true if uncommitted changes
  generationTrigger: 'git-hook' | 'cli';  // What triggered generation
  timestamp: string;                 // Date#toString(), not ISO 8601
  timestampUnix: number;             // Date.now()
}
```
- **Gitignored** - Generated by CLI, never committed
- Regenerated on git operations (commit, checkout, merge, rebase)
- Consumed by app.config.js, build scripts, app code
- **`dynamic-file` mode only.** In `package-json` mode nothing writes this file unless `--output` is passed explicitly

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
const { baseVersion, dynamicVersion, versions, buildNumber } = readDynamicVersion();
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
- **No version-manager.json**: The Zod defaults apply — `append-commits`, `dynamic-file`, both knobs off. The base version still comes from `package.json`
- **Invalid calculation mode**: Falls back to "add-to-patch"
- **Invalid semver in base**: Returns base version as-is (no calculation)
- **buildNumber**: Always generated from the clock, in the iOS-compatible timestamp format. Nothing reads a `BUILD_NUMBER` environment variable

### File Operations
- **Missing .gitignore**: Prompts user to add `*.local.json`
- **Missing version-manager.json**: Nothing is created and nothing is asked; the defaults are used
- **Corrupted JSON**: The config is reported as unreadable and the defaults are used, which means a typo'd knob reads as off. Check the warning
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
  - `branch-suffix.test.ts` - Sanitising, stripping, applying, and the n decision
  - `json-text-edit.test.ts` - The surgical JSON value replacer
  - `merge-driver.test.ts` - The driver's fallbacks, and the mergeDriver config knob
  - `generated-file-policy.test.ts` - Which mode writes a file
  - `pre-commit-version.test.ts` - The pre-commit version arithmetic
  - `version-replacement-guard.test.ts` - The post-condition that a replacement took
  - `event-log.test.ts` - Parsing the log, and the derivation, with no git at all
- `tests/integration/` - Integration tests with temporary git repos
  - `version-generation.test.ts` - Core version calculation tests
  - `package-json-mode.test.ts` - The whole of `package-json` mode, including its measured limitations
  - `branch-suffix.test.ts` - The suffix end to end, through real commits
  - `merge-driver.test.ts` - Real git merges, and the knob that gates registration
  - `event-log-mode.test.ts` - Real git merges of `version.jsonl`, install, bump, the reader
  - `generated-file-policy.test.ts` - What install writes in each mode
  - `cli-output.test.ts` - CLI output format tests
  - `config-migration.test.ts` - Config migration tests
  - `git-hooks.test.ts` - Hook installation tests (may be flaky)
  - `watcher.test.ts` - File watcher tests (may be flaky)
- `tests/helpers/` - Test utilities and fixtures
- `tests/smoke.test.ts` - Basic infrastructure tests
- `src/output-formatter.test.ts` - One test file lives beside its source rather than under `tests/`

New integration tests need an explicit per-test timeout of at least 20000ms: under full-suite load they otherwise hit bun's 5s default and report as failures.

### Quick Sanity Check (Local)
Use these commands for quick sanity checks during development:
```bash
bun run test:local           # Test version generation
bun run test:local:help      # Test help output
```

Note: These are NOT a substitute for proper automated tests.

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
1. Edit `versions.runtime` in `version-manager.json`
2. Commit the change

## Version File Regeneration

All of this is `dynamic-file` mode. In `package-json` mode there is no generated file to regenerate: a `pre-commit` hook writes the version into `package.json` instead, and none of the four post-\* hooks are installed. (The watcher and the metro plugin below have not been taught that yet and still write the file in both modes.)

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

**Note:** `prepare` carries `--no-fail`, but `prebuild` / `predev` / `prestart` are installed as a bare `npx @justinhaaheim/version-manager` today, so a failed generation DOES fail the build. The `--silent --no-fail` variants are sitting commented out in `script-manager.ts`.

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
