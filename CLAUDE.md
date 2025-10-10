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

The tool provides three main commands:

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

### 2. Install Git Hooks
```bash
npx @justinhaaheim/version-manager install [options]
bun run test:local:install  # For local development
```
- Installs git hooks (post-commit, post-checkout, post-merge, post-rewrite)
- Adds scripts to package.json
- Generates initial version file
- Works with standard .git/hooks and Husky

**Options:**
- `--increment-patch`: Increment patch version with each commit (deprecated in favor of file-based system)
- `--silent, -s`: Suppress console output
- `--fail/--no-fail`: Exit with error code on failures

### 3. Install Scripts Only
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

To bump the base version manually:

1. Edit `version-manager.json` and update `codeVersionBase` (e.g., from "0.1.0" to "0.2.0")
2. Commit the change: `git add version-manager.json && git commit -m "Bump version to 0.2.0"`
3. The next commit after this will calculate from the new base (e.g., 0.2.1 with one commit)

To update runtime version (only when native changes require it):
1. Edit `runtimeVersion` in `version-manager.json`
2. Commit the change