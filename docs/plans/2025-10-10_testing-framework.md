# Testing Framework Implementation Plan

**Date:** 2025-10-10
**Status:** In Progress
**Goal:** Create a lean, focused integration test suite for the version-manager CLI tool
**Last Updated:** 2025-10-10 (evening session)

---

## 🎯 Current Status Summary

### ✅ Completed (2025-10-10)

**Phase 1: Foundation (ALL DONE)**

- ✅ Created `tests/helpers/test-repo.ts` - Full TestRepo class with git operations
- ✅ Created `tests/helpers/cli-runner.ts` - CLI execution and result parsing
- ✅ Created `tests/helpers/assertions.ts` - Custom Zod-based assertions
- ✅ Created `tests/helpers/repo-fixtures.ts` - Programmatic repo setup functions
- ✅ Created `tests/scripts/create-fixtures.ts` - Fixture generation script (kept for reference)
- ✅ Added Zod schemas to `src/types.ts` as single source of truth
- ✅ Fixed all lint errors (62 → 0) with proper type safety

**Phase 2: Tests (MOSTLY COMPLETE)**

- ✅ `tests/smoke.test.ts` - 6 smoke tests, all passing
- ✅ `tests/integration/version-generation.test.ts` - 11 tests, all passing
  - No config file scenarios
  - add-to-patch mode (5 commits: 0.1.0 → 0.1.5)
  - append-commits mode (5 commits: 0.1.0 → 0.1.0+5)
  - Build number from environment
  - Custom output paths
  - Runtime version handling
  - Semver validation
- ✅ `tests/integration/git-hooks.test.ts` - 18 tests, all passing (1 skipped)
  - Husky installation (fresh install, already installed, package manager detection)
  - Hook creation (all 4 hooks, correct directory, executable, correct format)
  - Hook updates (append, replace, multiple matches warning)
  - Script installation (adds scripts, preserves existing)
  - CLI flags (--silent, --increment-patch, --no-fail)
  - Error handling
  - Hook execution test (skipped - requires complex npm link setup)
- ⏳ `tests/integration/cli-commands.test.ts` - TODO (Lower priority)

**Test Results:**

```
✅ 35 tests passing
✅ 1 test skipped (hook execution - requires npm link complexity)
✅ 0 lint errors
✅ Zod validation for type safety
✅ Tests run in ~19 seconds
✅ npm link setup in pretest/posttest scripts
```

### 🚨 CRITICAL ARCHITECTURAL ISSUE DISCOVERED

**Git Hooks Implementation Not Aligned with Requirements**

Current implementation (`src/git-hooks-manager.ts`):

- Defaults to `.git/hooks` directory
- Has Husky detection as fallback
- Modifies `.git/hooks` directly if Husky not detected

**Required approach:**

- ✅ MUST ALWAYS use Husky for git hooks
- ✅ Install Husky if not already present
- ✅ Create hooks in `.husky/` directory only
- ❌ NEVER modify `.git/hooks` directly

**Impact on Testing:**

- Should we refactor `git-hooks-manager.ts` FIRST, then write tests?
- OR write tests for current implementation, then refactor?

**Recommendation:** Refactor first, then test the correct implementation.

### 📋 Husky-First Refactor Plan

**What needs to change in `src/git-hooks-manager.ts`:**

1. **Check for Husky installation:**

   ```typescript
   function isHuskyInstalled(): boolean {
     // Check node_modules/.bin/husky exists
     // OR check package.json for husky dependency
   }
   ```

2. **Install Husky if missing:**

   ```typescript
   function ensureHuskyInstalled(): void {
     if (!isHuskyInstalled()) {
       // Run: npm install --save-dev husky
       // Run: npx husky init
     }
   }
   ```

3. **Always use `.husky/` directory:**

   ```typescript
   function getHuskyHooksPath(): string {
     // Always return join(process.cwd(), '.husky')
     // Remove git config core.hooksPath detection
   }
   ```

4. **Create/update hooks in `.husky/` only:**
   - Remove all `.git/hooks` logic
   - Simplify to only handle `.husky/` files
   - Keep the smart line replacement logic

5. **Update hook template:**

   ```bash
   #!/usr/bin/env sh
   . "$(dirname -- "$0")/_/husky.sh"

   # Dynamic version generator
   npx @justinhaaheim/version-manager --silent
   ```

**Benefits:**

- ✅ Consistent approach across all projects
- ✅ Hooks are committed to repo (better team collaboration)
- ✅ Standard tool, well-maintained
- ✅ Works with CI/CD systems
- ✅ Simpler codebase (remove .git/hooks complexity)

---

## Overview

The version-manager is fundamentally a tool that integrates git operations, file system changes, and CLI interactions. Therefore, we're prioritizing **integration tests over unit tests** - testing with real git repositories in isolated temporary directories rather than heavily mocked unit tests.

## Core Testing Philosophy

- **Real git repos**: Use pre-created fixture repos to test actual git integration
- **Integration-first**: Test components working together, not in isolation
- **CLI as subprocess**: Run the actual CLI to test the full user experience
- **Fast fixtures**: Pre-created tar.gz repos for consistent, fast test setup

---

## Test Directory Structure

```
tests/
├── integration/
│   ├── version-generation.test.ts    # Core version calculation logic
│   ├── git-hooks.test.ts             # Hook installation and execution
│   └── cli-commands.test.ts          # All CLI commands and flags
├── fixtures/
│   ├── git-repos/
│   │   ├── repo-no-tags.tar.gz
│   │   ├── repo-with-v0.1.0-tag.tar.gz
│   │   ├── repo-5-commits-after-tag.tar.gz
│   │   └── repo-dirty-state.tar.gz
│   └── configs/
│       ├── add-to-patch-mode.json
│       └── append-commits-mode.json
├── helpers/
│   ├── test-repo.ts       # Manage test repository lifecycle
│   ├── cli-runner.ts      # Execute CLI commands
│   └── assertions.ts      # Custom test assertions
└── scripts/
    └── create-fixtures.ts # One-time: generate fixture repos
```

---

## Update: Programmatic Repo Creation Approach

**Decision (2025-10-10):** Instead of using pre-created tar.gz fixtures, we're using **programmatic repo creation** for better flexibility and transparency:

- ✅ Easier to iterate on repo structures
- ✅ More transparent - see exactly what's being created in code
- ✅ Simpler setup - no tar.gz generation step needed
- ⏱️ Can optimize with tar.gz later if performance becomes an issue

See `tests/helpers/repo-fixtures.ts` for setup helpers like:

- `setupRepoWithTag()`
- `setupRepoWithCommitsAfterTag()`
- `setupRepoDirtyState()`

---

## Implementation Plan

### Phase 1: Foundation (Helpers & Fixtures)

#### 1.1 Create Test Helpers

**`tests/helpers/test-repo.ts`**

```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {execSync} from 'child_process';

export class TestRepo {
  private tempDir: string;

  constructor() {
    // Create unique temp directory outside project
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-test-'));
  }

  // Extract a fixture repo into this temp dir
  async extractFixture(fixtureName: string): Promise<void>;

  // Get absolute path to the test repo
  getPath(): string;

  // Run version-manager CLI in this repo
  async runCli(command: string): Promise<CliResult>;

  // Read a file from the repo
  readFile(relativePath: string): string;

  // Check if file exists in repo
  fileExists(relativePath: string): boolean;

  // Make a commit (for testing hooks)
  makeCommit(message: string): void;

  // Modify a file to create dirty state
  dirtyFile(path: string): void;

  // Cleanup temp directory
  cleanup(): void;
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: any; // Parsed if stdout is JSON
}
```

**`tests/helpers/cli-runner.ts`**

```typescript
import {execSync} from 'child_process';

// Execute the version-manager CLI as a subprocess
export async function runCli(
  command: string,
  cwd: string,
  options?: {silent?: boolean},
): Promise<CliResult>;

// Parse version file if it exists
export function parseVersionFile(repoPath: string): DynamicVersion | null;
```

**`tests/helpers/assertions.ts`**

```typescript
// Custom assertions for version-manager

export function assertValidVersionJson(json: any): void {
  expect(json).toHaveProperty('codeVersion');
  expect(json).toHaveProperty('runtimeVersion');
  // Add more structure validation
}

export function assertSemver(version: string): void {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  expect(version).toMatch(semverRegex);
}

export function assertHookExists(hookPath: string): void {
  expect(fs.existsSync(hookPath)).toBe(true);
  const stats = fs.statSync(hookPath);
  expect(stats.mode & 0o111).toBeTruthy(); // Executable bit
}

export function assertHookContainsCommand(
  hookPath: string,
  command: string,
): void {
  const content = fs.readFileSync(hookPath, 'utf-8');
  expect(content).toContain(command);
}
```

#### 1.2 Create Fixture Repos Script

**`tests/scripts/create-fixtures.ts`**

This script will:

1. Create temp directories
2. Initialize git repos with various states
3. Tar/gzip each repo
4. Save to `tests/fixtures/git-repos/`

Fixtures to create:

- **repo-no-tags.tar.gz**: Just `git init` + 1 commit
- **repo-with-v0.1.0-tag.tar.gz**: Initial commit tagged as v0.1.0
- **repo-5-commits-after-tag.tar.gz**: v0.1.0 tag + 5 more commits
- **repo-dirty-state.tar.gz**: Tag + modified file not staged

#### 1.3 Create Config Fixtures

**`tests/fixtures/configs/add-to-patch-mode.json`**

```json
{
  "codeVersionBase": "0.1.0",
  "runtimeVersion": "0.1.0",
  "versionCalculationMode": "add-to-patch"
}
```

**`tests/fixtures/configs/append-commits-mode.json`**

```json
{
  "codeVersionBase": "0.1.0",
  "runtimeVersion": "0.1.0",
  "versionCalculationMode": "append-commits"
}
```

---

### Phase 2: Integration Tests

#### 2.1 Version Generation Tests

**`tests/integration/version-generation.test.ts`**

Test scenarios:

- ✅ **No config, no tags**: Should generate default version "0.1.0"
- ✅ **With config, no commits since base**: Should return codeVersionBase
- ✅ **With config, 5 commits since base, add-to-patch mode**: Should return "0.1.5"
- ✅ **With config, 5 commits since base, append-commits mode**: Should return "0.1.0+5"
- ✅ **Dirty working directory**: Should handle gracefully
- ✅ **Different branch**: Should include branch info (if applicable)
- ✅ **Runtime version**: Should always match config
- ✅ **Build number from env**: Should include BUILD_NUMBER if set

```typescript
import {test, expect, describe, beforeEach, afterEach} from 'bun:test';
import {TestRepo} from '../helpers/test-repo';
import {assertValidVersionJson, assertSemver} from '../helpers/assertions';

describe('Version Generation', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('generates default version when no config exists', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');
    const result = await repo.runCli('');

    expect(result.exitCode).toBe(0);
    expect(repo.fileExists('dynamic-version.local.json')).toBe(true);

    const version = JSON.parse(repo.readFile('dynamic-version.local.json'));
    assertValidVersionJson(version);
    expect(version.codeVersion).toBe('0.1.0');
    expect(version.runtimeVersion).toBe('0.1.0');
  });

  test('calculates version with add-to-patch mode', async () => {
    await repo.extractFixture('repo-5-commits-after-tag');
    // Copy config fixture to repo
    repo.writeFile(
      'version-manager.json',
      fs.readFileSync('tests/fixtures/configs/add-to-patch-mode.json', 'utf-8'),
    );

    const result = await repo.runCli('');
    expect(result.exitCode).toBe(0);

    const version = JSON.parse(repo.readFile('dynamic-version.local.json'));
    expect(version.codeVersion).toBe('0.1.5'); // 0.1.0 + 5 commits
  });

  test('calculates version with append-commits mode', async () => {
    await repo.extractFixture('repo-5-commits-after-tag');
    repo.writeFile(
      'version-manager.json',
      fs.readFileSync(
        'tests/fixtures/configs/append-commits-mode.json',
        'utf-8',
      ),
    );

    const result = await repo.runCli('');
    expect(result.exitCode).toBe(0);

    const version = JSON.parse(repo.readFile('dynamic-version.local.json'));
    expect(version.codeVersion).toBe('0.1.0+5'); // 0.1.0 + 5 commits appended
  });

  // More tests...
});
```

#### 2.2 Git Hooks Tests

**`tests/integration/git-hooks.test.ts`**

Test scenarios:

- ✅ **Fresh install**: Creates all 4 hooks (post-commit, post-checkout, post-merge, post-rewrite)
- ✅ **Update existing hook**: Replaces version-manager line correctly
- ✅ **Hooks are executable**: Verify 755 permissions
- ✅ **Hook actually runs**: Make a commit, verify version file updates
- ✅ **Husky detection**: Handles .husky directory correctly
- ✅ **Multiple existing commands**: Warns user if multiple matches found

```typescript
describe('Git Hooks Installation', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('installs all 4 hooks in fresh repo', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');

    const result = await repo.runCli('install --silent');
    expect(result.exitCode).toBe(0);

    const hooksDir = path.join(repo.getPath(), '.git', 'hooks');
    assertHookExists(path.join(hooksDir, 'post-commit'));
    assertHookExists(path.join(hooksDir, 'post-checkout'));
    assertHookExists(path.join(hooksDir, 'post-merge'));
    assertHookExists(path.join(hooksDir, 'post-rewrite'));
  });

  test('hook actually runs on commit', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');
    await repo.runCli('install --silent');

    // Make a change and commit
    repo.writeFile('test.txt', 'hello');
    repo.makeCommit('test commit');

    // Verify version file was regenerated
    expect(repo.fileExists('dynamic-version.local.json')).toBe(true);
  });

  test('updates existing hook without duplicating', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');

    // Install once
    await repo.runCli('install --silent');

    // Install again with different flags
    await repo.runCli('install --silent --increment-patch');

    const hookPath = path.join(repo.getPath(), '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');

    // Should only have one version-manager command
    const matches = content.match(/npx @justinhaaheim\/version-manager/g);
    expect(matches?.length).toBe(1);
    expect(content).toContain('--increment-patch');
  });

  // More tests...
});
```

#### 2.3 CLI Commands Tests

**`tests/integration/cli-commands.test.ts`**

Test scenarios:

- ✅ **Default command** (just `npx version-manager`): Generates file only
- ✅ **install command**: Installs hooks and scripts
- ✅ **install-scripts command**: Only adds scripts to package.json
- ✅ **--silent flag**: Suppresses output
- ✅ **--no-fail flag**: Always exits 0 even on errors
- ✅ **--output flag**: Custom output path
- ✅ **Error handling**: Not a git repo, missing permissions

```typescript
describe('CLI Commands', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('default command generates version file', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');

    const result = await repo.runCli('');
    expect(result.exitCode).toBe(0);
    expect(repo.fileExists('dynamic-version.local.json')).toBe(true);
  });

  test('install command installs hooks and scripts', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');
    repo.writeFile('package.json', JSON.stringify({name: 'test'}));

    const result = await repo.runCli('install --silent');
    expect(result.exitCode).toBe(0);

    // Verify hooks
    assertHookExists(path.join(repo.getPath(), '.git', 'hooks', 'post-commit'));

    // Verify scripts added to package.json
    const pkg = JSON.parse(repo.readFile('package.json'));
    expect(pkg.scripts).toHaveProperty('dynamic-version');
  });

  test('--output flag changes output location', async () => {
    await repo.extractFixture('repo-with-v0.1.0-tag');

    const result = await repo.runCli('--output custom-version.json');
    expect(result.exitCode).toBe(0);
    expect(repo.fileExists('custom-version.json')).toBe(true);
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
  });

  test('--no-fail always exits 0', async () => {
    // Create non-git directory
    const result = await repo.runCli('--no-fail');
    expect(result.exitCode).toBe(0); // Even though it's not a git repo
  });

  // More tests...
});
```

---

### Phase 3: Package.json Scripts & CI Integration

#### 3.1 Add Test Scripts

**Update `package.json`:**

```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:fixtures": "bun tests/scripts/create-fixtures.ts",
    "signal": "bun run ts-check && bun run lint && bun run prettier-check && bun run test"
  }
}
```

#### 3.2 Update tsconfig.json

Ensure tests are compiled:

```json
{
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests/fixtures"]
}
```

#### 3.3 Update .gitignore

```
# Test fixtures (binary files)
tests/fixtures/git-repos/*.tar.gz

# Temp test artifacts
tests/tmp/
```

---

## Testing Workflow

### One-time Setup

```bash
# Generate fixture repos
bun run test:fixtures
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/integration/version-generation.test.ts

# Watch mode during development
bun test --watch

# Full quality check (includes tests)
bun run signal
```

---

## Open Questions / Decisions

### ✅ Decided: Use Bun's test runner

- Fast, built-in, handles TypeScript natively
- Good enough for our needs

### ✅ Decided: Skip unit tests

- Tool is fundamentally about integration
- Integration tests provide better value

### ✅ Decided: Pre-created fixture repos

- Faster than creating repos in every test
- Consistent starting state
- One-time cost to create

### 🤔 To Decide: How to handle interactive prompts?

Options:

1. Only test with `--silent` flag (skip prompts)
2. Mock stdin to simulate user input
3. Add a `--yes` flag to auto-accept prompts

**Recommendation**: Option 1 for now - test non-interactive paths only.

### 🤔 To Decide: Test coverage target?

- Don't need 100% coverage
- Focus on critical paths: version generation, hook installation
- **Recommendation**: Aim for ~80% coverage of core logic

---

## Implementation Checklist

### Phase 1: Foundation ✅ COMPLETE

- [x] Create `tests/helpers/test-repo.ts`
- [x] Create `tests/helpers/cli-runner.ts`
- [x] Create `tests/helpers/assertions.ts`
- [x] Create `tests/helpers/repo-fixtures.ts` (programmatic approach)
- [x] Create `tests/scripts/create-fixtures.ts` (kept for reference)
- [x] Create smoke tests
- [x] Add Zod validation throughout
- [x] Fix all lint errors

### Phase 2: Tests (MOSTLY COMPLETE)

- [x] Write `tests/smoke.test.ts` - 6 tests, all passing
- [x] Write `tests/integration/version-generation.test.ts` - 11 tests, all passing
- [x] ~~Refactor `src/git-hooks-manager.ts` to be Husky-first~~ - Already completed in earlier session
- [x] Write `tests/integration/git-hooks.test.ts` - 18 tests, all passing (1 skipped)
- [x] Add npm link setup to pretest/posttest scripts
- [x] Add Husky helper methods to TestRepo class
- [ ] Write `tests/integration/cli-commands.test.ts` - Lower priority

### Phase 3: Integration ✅ MOSTLY COMPLETE

- [x] Add test scripts to package.json
- [x] Update tsconfig.json
- [x] Update .gitignore
- [ ] Update signal script to include tests (if not already)
- [ ] Document testing in README

### Phase 4: Documentation

- [ ] Add "Testing" section to README
- [ ] Add comments to test files explaining scenarios
- [ ] Update CLAUDE.md with testing guidelines

---

## Success Criteria

✅ Tests run in < 5 seconds
✅ Tests are isolated (no cross-test pollution)
✅ Tests catch real regressions (not just mocks)
✅ Easy to add new test cases
✅ Clear failure messages when tests break

---

## Notes

- All tests run in isolated temp directories (outside project)
- No nested .git issues because temps are in /tmp
- Fixtures are reusable across multiple tests
- Tests actually execute the CLI as users would
- Focus on integration over unit tests for this tool

## Next Steps

1. Get approval on this plan
2. Start with Phase 1 (foundation)
3. Create one complete test file as a template
4. Iterate and expand coverage
