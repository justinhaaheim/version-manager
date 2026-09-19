import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {countCommitsSinceRef, isFileTrackedByGit} from '../../src/git-utils';
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

  /**
   * Finding F1: this used to return a bare null for all three failure causes,
   * so the caller's warning could only ever blame one of them.
   */
  describe('countCommitsSinceRef', () => {
    /** Run `body` with the process cwd inside `dir`, always restoring it. */
    const inDirectory = async <T>(
      dir: string,
      body: () => Promise<T>,
    ): Promise<T> => {
      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        return await body();
      } finally {
        process.chdir(originalCwd);
      }
    };

    test('counts the commits a branch has of its own', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');
      const baseBranch = repo
        .runGit('rev-parse --abbrev-ref HEAD')
        .stdout.trim();
      repo.createBranch('feat-x');
      repo.writeFile('b.txt', 'b\n');
      repo.makeCommit('one');
      repo.writeFile('c.txt', 'c\n');
      repo.makeCommit('two');

      const result = await inDirectory(repo.getPath(), () =>
        countCommitsSinceRef(baseBranch),
      );

      expect(result).toEqual({count: 2, outcome: 'counted', ref: baseBranch});
    });

    test('a branch identical to its base counts a REAL zero', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');
      const baseBranch = repo
        .runGit('rev-parse --abbrev-ref HEAD')
        .stdout.trim();
      repo.createBranch('feat-x');

      const result = await inDirectory(repo.getPath(), () =>
        countCommitsSinceRef(baseBranch),
      );

      // 0 is an answer here, and must be reported as one — not as a failure,
      // and never the other way round (critical rule 6).
      expect(result).toEqual({count: 0, outcome: 'counted', ref: baseBranch});
    });

    test('a ref that does not exist reports "unresolved"', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');

      const result = await inDirectory(repo.getPath(), () =>
        countCommitsSinceRef('no-such-branch'),
      );

      expect(result).toEqual({outcome: 'unresolved', ref: 'no-such-branch'});
    });

    test('a ref name we refuse to pass to git reports "rejected-name"', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');

      const result = await inDirectory(repo.getPath(), () =>
        countCommitsSinceRef('main branch'),
      );

      // Distinct from 'unresolved': the fix is in the config, not the repo.
      expect(result).toEqual({outcome: 'rejected-name', ref: 'main branch'});
    });

    test('git failing reports "git-failed" and carries git own message', async () => {
      const outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-nogit-'));

      try {
        const result = await inDirectory(outsideRepo, () =>
          countCommitsSinceRef('main'),
        );

        expect(result.outcome).toBe('git-failed');
        if (result.outcome === 'git-failed') {
          expect(result.detail).toContain('not a git repository');
        }
      } finally {
        fs.rmSync(outsideRepo, {force: true, recursive: true});
      }
    });
  });
});
