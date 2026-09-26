import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  countCommitsBetween,
  countCommitsSinceRef,
  findLastCommitWhereFieldChanged,
  getCurrentBranch,
  isFileTrackedByGit,
  readFieldFromCommit,
} from '../../src/git-utils';
import {inDirectory} from '../helpers/in-directory';
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
        expect(result).toEqual({outcome: 'measured', tracked: true});
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
        expect(result).toEqual({outcome: 'measured', tracked: false});
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
        expect(result).toEqual({outcome: 'measured', tracked: false});
      } finally {
        process.chdir(originalCwd);
      }
    });

    test('returns false for non-existent files', async () => {
      const originalCwd = process.cwd();
      process.chdir(repo.getPath());
      try {
        const result = await isFileTrackedByGit('does-not-exist.txt');
        expect(result).toEqual({outcome: 'measured', tracked: false});
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
        expect(result).toEqual({outcome: 'measured', tracked: true});
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

  /**
   * version-manager-70i.18.1, S3 and F3: the four states, each a distinct
   * answer. The exit codes these rest on were measured and are recorded on
   * the bead.
   */
  describe('getCurrentBranch', () => {
    test('a normal branch reads its name', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');
      repo.createBranch('feat/x');

      const result = await inDirectory(repo.getPath(), getCurrentBranch);

      expect(result).toEqual({branch: 'feat/x', outcome: 'read'});
    });

    test('an unborn branch reads its REAL name, not "HEAD" (F3)', async () => {
      // No commits at all. `git rev-parse --abbrev-ref HEAD`, the old
      // command, fails here, and the old catch reported "HEAD".
      repo.runGit('symbolic-ref HEAD refs/heads/trunk');

      const result = await inDirectory(repo.getPath(), getCurrentBranch);

      expect(result).toEqual({branch: 'trunk', outcome: 'read'});
    });

    test('a detached HEAD reads the literal "HEAD" (D6)', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');
      repo.runGit('checkout --detach');

      const result = await inDirectory(repo.getPath(), getCurrentBranch);

      expect(result).toEqual({branch: 'HEAD', outcome: 'read'});
    });

    test('a git failure is the failure member, never "HEAD"', async () => {
      const outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-nogit-'));

      try {
        const result = await inDirectory(outsideRepo, getCurrentBranch);

        expect(result.outcome).toBe('git-failed');
        if (result.outcome === 'git-failed') {
          expect(result.detail).toContain('git symbolic-ref');
          expect(result.detail).toContain('not a git repository');
        }
      } finally {
        fs.rmSync(outsideRepo, {force: true, recursive: true});
      }
    });
  });

  /** version-manager-70i.18.1, S2: "never committed" is a real answer. */
  describe('findLastCommitWhereFieldChanged', () => {
    test('an unborn branch is "never-committed", not a failure', async () => {
      const result = await inDirectory(repo.getPath(), () =>
        findLastCommitWhereFieldChanged('package.json', 'version'),
      );

      expect(result).toEqual({outcome: 'never-committed'});
    });

    test('a file that was never committed is "never-committed"', async () => {
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('base');

      const result = await inDirectory(repo.getPath(), () =>
        findLastCommitWhereFieldChanged('package.json', 'version'),
      );

      expect(result).toEqual({outcome: 'never-committed'});
    });

    test('finds the commit where the value last changed', async () => {
      repo.writeFile('package.json', '{"version": "1.0.0"}\n');
      repo.makeCommit('one');
      repo.writeFile('package.json', '{"version": "1.1.0"}\n');
      repo.makeCommit('two');
      const bump = repo.runGit('rev-parse HEAD').stdout.trim();
      repo.writeFile('a.txt', 'a\n');
      repo.makeCommit('three');

      const result = await inDirectory(repo.getPath(), () =>
        findLastCommitWhereFieldChanged('package.json', 'version'),
      );

      expect(result).toEqual({commit: bump, outcome: 'found'});
    });
  });

  /** S1, S2, S6, S7: outside a repository every one reports the failure. */
  describe('a git failure is its own outcome', () => {
    let outsideRepo: string;

    beforeEach(() => {
      outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-nogit-'));
    });

    afterEach(() => {
      fs.rmSync(outsideRepo, {force: true, recursive: true});
    });

    test('countCommitsBetween() is never 0 on failure (S1)', async () => {
      const result = await inDirectory(outsideRepo, () =>
        countCommitsBetween('HEAD~1', 'HEAD'),
      );

      expect(result.outcome).toBe('git-failed');
    });

    test('findLastCommitWhereFieldChanged() is never "never-committed" on failure (S2)', async () => {
      const result = await inDirectory(outsideRepo, () =>
        findLastCommitWhereFieldChanged('package.json', 'version'),
      );

      expect(result.outcome).toBe('git-failed');
    });

    test('readFieldFromCommit() is never a null value on failure (S6)', async () => {
      const result = await inDirectory(outsideRepo, () =>
        readFieldFromCommit('HEAD', 'package.json', 'version'),
      );

      expect(result.outcome).toBe('git-failed');
    });

    test('isFileTrackedByGit() is never "untracked" on failure (S7)', async () => {
      const result = await inDirectory(outsideRepo, () =>
        isFileTrackedByGit('.gitignore'),
      );

      expect(result.outcome).toBe('git-failed');
    });
  });
});
