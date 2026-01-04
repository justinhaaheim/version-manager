import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {isFileTrackedByGit} from '../../src/git-utils';
import {TestRepo} from '../helpers/test-repo';

/**
 * Unit tests for git-utils functions
 */
describe('Git Utils', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
    repo.initGit();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('isFileTrackedByGit', () => {
    test('returns true for tracked files', async () => {
      // Create and commit a file
      repo.writeFile('tracked.txt', 'content');
      repo.makeCommit('Add tracked file');

      // Change to repo directory and check
      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('tracked.txt');
        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test('returns false for untracked files', async () => {
      // Create a file but don't commit it
      repo.writeFile('untracked.txt', 'content');

      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('untracked.txt');
        expect(result).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test('returns false for gitignored files', async () => {
      // Create .gitignore that ignores certain files
      repo.writeFile('.gitignore', 'ignored.txt\n');
      repo.makeCommit('Add gitignore');

      // Create an ignored file
      repo.writeFile('ignored.txt', 'content');

      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('ignored.txt');
        expect(result).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test('returns false for non-existent files', async () => {
      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('does-not-exist.txt');
        expect(result).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test('returns true for .gitignore itself when tracked', async () => {
      // Create and commit .gitignore
      repo.writeFile('.gitignore', '*.log\n');
      repo.makeCommit('Add gitignore');

      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('.gitignore');
        expect(result).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
