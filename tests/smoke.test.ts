import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {setupRepoWithVersionConfig} from './helpers/repo-fixtures';
import {TestRepo} from './helpers/test-repo';

/**
 * Smoke test to verify test infrastructure is working
 */
describe('Test Infrastructure', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('can create and cleanup test repo', () => {
    const repoPath = repo.getPath();
    expect(repoPath).toBeTruthy();
    expect(repoPath).toContain('vm-test-');
  });

  test('can initialize git repo programmatically', () => {
    setupRepoWithVersionConfig(repo);

    // Verify .git directory exists
    expect(repo.fileExists('.git')).toBe(true);

    // Verify README exists
    expect(repo.fileExists('README.md')).toBe(true);
  });

  test('can run CLI in test repo', async () => {
    setupRepoWithVersionConfig(repo);

    const result = await repo.runCli('--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('version-manager');
  });

  test('can write and read files in test repo', () => {
    repo.writeFile('test.txt', 'hello world');

    expect(repo.fileExists('test.txt')).toBe(true);

    const content = repo.readFile('test.txt');
    expect(content).toBe('hello world');
  });

  test('can make commits', () => {
    repo.initGit();
    repo.writeFile('test.txt', 'initial');
    repo.makeCommit('Initial commit');

    repo.writeFile('test.txt', 'updated');
    repo.makeCommit('Update file');

    // If no error thrown, commits worked
    expect(true).toBe(true);
  });

  test('can create git tags', () => {
    repo.initGit();
    repo.writeFile('test.txt', 'content');
    repo.makeCommit('Initial commit');
    repo.createTag('v1.0.0');

    // Tag creation doesn't throw = success
    expect(true).toBe(true);
  });
});
