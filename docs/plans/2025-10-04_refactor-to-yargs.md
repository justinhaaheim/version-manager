# Refactor CLI to use yargs

## Goal

Replace manual argument parsing with yargs for better CLI UX, validation, and help generation.

## Benefits

- Automatic help generation with better formatting
- Built-in validation and error messages
- Support for aliases, defaults, and type checking
- Better developer experience
- Industry standard approach

## Plan

### 1. Install yargs

- Add yargs and @types/yargs as dependencies
- Run `bun add yargs && bun add -D @types/yargs`

### 2. Refactor src/index.ts

- Replace manual arg parsing loop with yargs
- Define options with proper types, descriptions, aliases
- Remove custom `printHelp()` function (yargs handles this)
- Keep all existing functionality intact

### 3. Options to define

- `--install` (boolean)
- `--install-scripts` (boolean)
- `--increment-patch` (boolean)
- `-o, --output <path>` (string)
- `-s, --silent` (boolean)
- `--no-fail` (boolean)
- `-h, --help` (boolean, auto-handled by yargs)

### 4. Test

- Run `bun run signal` to ensure no issues
- Test various flag combinations manually
- Ensure help output looks good

## Implementation Notes

- yargs provides TypeScript types out of the box
- Can use `.strict()` to catch unknown arguments
- `.version()` can auto-read from package.json
- Need to import from 'yargs/yargs' for proper TypeScript support

## Completed

✅ Installed yargs@18.0.0 and @types/yargs@17.0.33
✅ Refactored src/index.ts to use yargs
✅ Removed custom printHelp() function
✅ All options working with proper types and aliases
✅ Help output is professional and well-formatted
✅ Version flag automatically reads from package.json
✅ Strict mode catches unknown arguments
✅ All tests pass (bun run signal)
✅ Manual testing confirms all flags work correctly:

- --help / -h
- --version / -v
- --install
- --install-scripts
- --increment-patch
- --output / -o
- --silent / -s
- --no-fail
- Unknown flags properly rejected

## Phase 2: Commands vs Flags

### Goal

Refactor to use commands instead of flags for better UX (like `npm install`, not `npm --install`)

### Structure

- **Default command**: Generate version file
- **`install` command**: Install git hooks + scripts
- **`install-scripts` command**: Add/update scripts only

### Flags behavior

- Global flags: `--output`, `--silent`, `--no-fail` (work on all commands)
- Command-specific: `--increment-patch` (only on install)
- Pass-through: `install --silent --no-fail` → hooks run with those flags

### Benefits

- More intuitive (`version-manager install` vs `version-manager --install`)
- Industry standard pattern
- Better help organization
- Cleaner command-specific options

### Implementation

- Use yargs `.command()` for each command
- Default command handler for version generation
- Move install logic to command handlers
- Update git-hooks-manager to accept silent/noFail parameters

## Phase 2 Completed

✅ Refactored to command-based CLI (install, install-scripts, default)
✅ Updated git-hooks-manager.ts to accept silent and noFail parameters
✅ Hooks now use flags based on install command (pass-through behavior)
✅ Fixed all TypeScript/ESLint errors
✅ Tested all commands and flag combinations:

- `npx version-manager` → generates version file (verbose)
- `npx version-manager --silent` → generates quietly
- `npx version-manager install` → installs with verbose hooks (can fail)
- `npx version-manager install --silent` → installs with silent hooks
- `npx version-manager install --no-fail` → installs with no-fail hooks
- `npx version-manager install --silent --no-fail` → installs with both flags
- `npx version-manager install --increment-patch` → installs with patch increment
- `npx version-manager install-scripts` → adds/updates scripts only

Hook behavior verification:

- No flags → `bun run test:local` (verbose, can fail)
- `--silent` → `bun run test:local --silent`
- `--silent --no-fail` → `bun run test:local --silent --no-fail`
