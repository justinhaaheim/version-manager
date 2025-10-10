# Testing Framework Implementation Plan

**Date:** 2025-10-10
**Status:** Planning
**Goal:** Create a lean, focused integration test suite for the version-manager CLI tool

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

### Phase 1: Foundation

- [ ] Create `tests/helpers/test-repo.ts`
- [ ] Create `tests/helpers/cli-runner.ts`
- [ ] Create `tests/helpers/assertions.ts`
- [ ] Create `tests/scripts/create-fixtures.ts`
- [ ] Run fixture creation script to generate repos
- [ ] Create config fixtures

### Phase 2: Tests

- [x] Write `tests/integration/version-generation.test.ts` - 11 tests, all passing
- [ ] Write `tests/integration/git-hooks.test.ts` - TODO
- [ ] Write `tests/integration/cli-commands.test.ts` - TODO

### Phase 3: Integration

- [ ] Add test scripts to package.json
- [ ] Update tsconfig.json
- [ ] Update .gitignore
- [ ] Update signal script to include tests
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
