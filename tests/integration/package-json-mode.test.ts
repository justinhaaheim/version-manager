import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {
  activateHooks,
  setupPackageJsonModeRepo,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for `versionMode: 'package-json'`.
 *
 * In this mode a pre-commit hook computes the next version and writes it into
 * package.json, so the committed package.json always carries the real version
 * and consumers need no generated file and no git history.
 *
 * Several tests below assert CURRENT behavior that is arguably wrong (amend
 * double-bumps, rebase does not re-run the hook, merges conflict). They are
 * marked as such so that a future fix flips a documented expectation rather
 * than discovering the behavior from scratch.
 */
describe('package-json version mode', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('hook installation', () => {
    test('installs a pre-commit hook and no post-commit hook', () => {
      setupPackageJsonModeRepo(repo);
      activateHooks(repo);

      expect(repo.fileExists('.husky/pre-commit')).toBe(true);
      expect(repo.fileExists('.husky/post-checkout')).toBe(true);
      expect(repo.fileExists('.husky/post-merge')).toBe(true);
      expect(repo.fileExists('.husky/post-rewrite')).toBe(true);

      // post-commit belongs to dynamic-file mode only
      expect(repo.fileExists('.husky/post-commit')).toBe(false);
    });

    test('pre-commit hook carries the --pre-commit flag', () => {
      setupPackageJsonModeRepo(repo);
      activateHooks(repo);

      expect(repo.readFile('.husky/pre-commit')).toContain('--pre-commit');
    });

    test('switching back to dynamic-file mode leaves the pre-commit hook live', () => {
      // DOCUMENTS A BUG: installGitHooks() only writes the hooks for the
      // current mode; it never removes hooks belonging to the other mode. A
      // repo that switches package-json -> dynamic-file keeps mutating
      // package.json on every commit forever.
      setupPackageJsonModeRepo(repo);
      activateHooks(repo);
      expect(repo.fileExists('.husky/pre-commit')).toBe(true);

      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            versionCalculationMode: 'add-to-patch',
            versionMode: 'dynamic-file',
            versions: {},
          },
          null,
          2,
        ) + '\n',
      );
      repo.runCli('install --silent --non-interactive');

      expect(repo.fileExists('.husky/post-commit')).toBe(true);
      // The stale pre-commit hook is still there.
      expect(repo.fileExists('.husky/pre-commit')).toBe(true);
      expect(repo.readFile('.husky/pre-commit')).toContain('--pre-commit');
    });
  });

  describe('sequential commits (add-to-patch)', () => {
    test('each commit bumps the patch version by one', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const observed: string[] = [];
      for (let i = 1; i <= 3; i++) {
        repo.writeFile(`file${i}.txt`, `content ${i}\n`);
        repo.runGit('add -A');
        const commit = repo.runGit(`commit -m "commit ${i}"`);
        expect(commit.exitCode).toBe(0);
        observed.push(repo.readPackageJson().version);
      }

      expect(observed).toEqual(['0.1.1', '0.1.2', '0.1.3']);
    });

    test('the bumped version is inside the commit, not left uncommitted', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');

      const committed = repo.runGit('show HEAD:package.json');
      expect(committed.exitCode).toBe(0);
      expect((JSON.parse(committed.stdout) as {version: string}).version).toBe(
        '0.1.1',
      );

      // Working tree must be clean: nothing left over for the user to commit.
      expect(repo.runGit('status --porcelain').stdout.trim()).toBe('');
    });
  });

  describe('sequential commits (append-commits)', () => {
    test('each commit increments the +N suffix', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'append-commits');
      activateHooks(repo);

      const observed: string[] = [];
      for (let i = 1; i <= 3; i++) {
        repo.writeFile(`file${i}.txt`, `content ${i}\n`);
        repo.runGit('add -A');
        repo.runGit(`commit -m "commit ${i}"`);
        observed.push(repo.readPackageJson().version);
      }

      expect(observed).toEqual(['0.1.0+1', '0.1.0+2', '0.1.0+3']);
    });
  });

  describe('self-healing after skipped commits', () => {
    test('--no-verify commits are caught up by the next hooked commit', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "hooked"');
      expect(repo.readPackageJson().version).toBe('0.1.1');

      // Two commits that bypass the hook entirely
      for (const name of ['b', 'c']) {
        repo.writeFile(`${name}.txt`, `${name}\n`);
        repo.runGit('add -A');
        repo.runGit(`commit --no-verify -m "skipped ${name}"`);
      }
      expect(repo.readPackageJson().version).toBe('0.1.1');

      repo.writeFile('d.txt', 'd\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "hooked again"');

      // 0.1.1 was set 2 commits ago, so this commit is +3 => 0.1.4
      expect(repo.readPackageJson().version).toBe('0.1.4');
    });
  });

  describe('git operations that do not behave as the design doc claims', () => {
    test('amend bumps the version a second time', () => {
      // DOCUMENTS A BUG: `git commit --amend` re-runs pre-commit, so amending
      // a commit inflates the version even though no new commit was created.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');
      expect(repo.readPackageJson().version).toBe('0.1.1');

      repo.runGit('commit --amend -m "first (amended)"');
      expect(repo.readPackageJson().version).toBe('0.1.2');

      // One commit exists, but the version claims two.
      const count = repo.runGit('rev-list --count HEAD').stdout.trim();
      expect(count).toBe('3'); // initial + config + first
    });

    test('rebase does not re-run the hook, so the version undercounts history', () => {
      // DOCUMENTS A LIMITATION: pre-commit does not run during rebase, so
      // replayed commits keep whatever version they were authored with even
      // though the branch now contains strictly more commits.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

      repo.runGit('checkout -b feature');
      repo.writeFile('f.txt', 'f\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "feature work"');
      expect(repo.readPackageJson().version).toBe('0.1.1');

      // Advance base WITHOUT bumping, so the rebase replays cleanly.
      repo.runGit(`checkout ${base}`);
      repo.writeFile('m.txt', 'm\n');
      repo.runGit('add -A');
      repo.runGit('commit --no-verify -m "base work"');

      repo.runGit('checkout feature');
      const rebase = repo.runGit(`rebase ${base}`);
      expect(rebase.exitCode).toBe(0);

      // The branch gained a commit, but the version did not move: nothing
      // recomputed it during the replay.
      expect(repo.readPackageJson().version).toBe('0.1.1');
      expect(repo.runGit('rev-list --count HEAD').stdout.trim()).toBe('4');
    });

    test('branches of EQUAL length compute the same version and merge cleanly, colliding', () => {
      // DOCUMENTS A CORRECTNESS HOLE: two diverged branches that each add the
      // same number of commits both compute the SAME next version, so git
      // auto-merges the version field happily. The merged history then
      // contains two distinct commits claiming one version, and the merge
      // result undercounts the work it contains.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

      repo.runGit('checkout -b feature');
      repo.writeFile('f.txt', 'f\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "feature work"');
      const featureVersion = repo.readPackageJson().version;

      repo.runGit(`checkout ${base}`);
      repo.writeFile('m.txt', 'm\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "main work"');
      const baseVersion = repo.readPackageJson().version;

      // Both sides independently produced the same version.
      expect(featureVersion).toBe('0.1.1');
      expect(baseVersion).toBe('0.1.1');

      const merge = repo.runGit('merge --no-ff feature -m "merge feature"');
      expect(merge.exitCode).toBe(0);

      // Two commits of work merged, but the version only ever reached 0.1.1.
      expect(repo.readPackageJson().version).toBe('0.1.1');
    });

    test('branches of UNEQUAL length conflict on package.json', () => {
      // DOCUMENTS THE CENTRAL TRADE-OFF: as soon as the two sides compute
      // different versions, every merge stops on a package.json conflict.
      // This is what blocks GitHub's merge button on a real PR.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

      repo.runGit('checkout -b feature');
      for (const name of ['f1', 'f2']) {
        repo.writeFile(`${name}.txt`, `${name}\n`);
        repo.runGit('add -A');
        repo.runGit(`commit -m "feature ${name}"`);
      }
      expect(repo.readPackageJson().version).toBe('0.1.2');

      const checkout = repo.runGit(`checkout ${base}`);
      expect(checkout.exitCode).toBe(0);
      expect(repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim()).toBe(
        base,
      );

      repo.writeFile('m.txt', 'm\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "main work"');
      expect(repo.readPackageJson().version).toBe('0.1.1');

      const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

      expect(merge.exitCode).not.toBe(0);
      expect(merge.stdout + merge.stderr).toContain('package.json');
    });

    test('an auto-merge does not run pre-commit, so the merge commit keeps a stale version', () => {
      // DOCUMENTS A DOC ERROR: the design doc claims "on the merge commit the
      // pre-commit hook recalculates the correct version". git merge fires
      // pre-merge-commit, not pre-commit, so nothing recalculates.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

      // Branch whose commits bypass the hook, so package.json never diverges
      // and the merge can auto-resolve.
      repo.runGit('checkout -b feature');
      repo.writeFile('f.txt', 'f\n');
      repo.runGit('add -A');
      repo.runGit('commit --no-verify -m "feature work"');

      repo.runGit(`checkout ${base}`);
      repo.writeFile('m.txt', 'm\n');
      repo.runGit('add -A');
      repo.runGit('commit --no-verify -m "main work"');

      const versionBefore = repo.readPackageJson().version;
      const merge = repo.runGit('merge --no-ff feature -m "merge feature"');
      expect(merge.exitCode).toBe(0);

      // Unchanged: no hook ran for the merge commit.
      expect(repo.readPackageJson().version).toBe(versionBefore);
    });
  });

  describe('working tree handling', () => {
    test('unstaged package.json edits are swept into the commit', () => {
      // DOCUMENTS A DATA-INTEGRITY BUG: the hook reads and rewrites the
      // WORKING TREE package.json and then `git add`s the whole file, so an
      // unrelated half-finished edit is committed without the user asking.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      // Stage an unrelated file only.
      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');

      // Leave an UNSTAGED edit in package.json.
      const pkg = repo.readPackageJson();
      pkg.description = 'half-finished edit that should NOT be committed';
      repo.writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n');

      repo.runGit('commit -m "commit only a.txt"');

      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {description?: string};

      expect(committed.description).toBe(
        'half-finished edit that should NOT be committed',
      );
    });
  });

  describe('package manager side effects', () => {
    test('a failing package manager is swallowed and the commit still succeeds', () => {
      // DOCUMENTS A "failure is not empty" VIOLATION: updateLockfile() catches
      // every error from `npm install` / `bun install` and only console.warn()s.
      // A package manager that is broken, offline, or mid-conflict produces a
      // commit that looks completely successful.
      //
      // The failure is induced rather than assumed: a stub `npm` that exits 1
      // is placed first on PATH. The hook itself runs under `bun`, which is
      // resolved by absolute path, so only the package manager is broken.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      // Force the npm code path by giving the repo a package-lock.json.
      repo.writeFile(
        'package-lock.json',
        JSON.stringify(
          {lockfileVersion: 3, name: 'test-package', version: '0.1.0'},
          null,
          2,
        ) + '\n',
      );
      activateHooks(repo);

      const stubDir = path.join(repo.getPath(), 'stub-bin');
      fs.mkdirSync(stubDir, {recursive: true});
      const stubNpm = path.join(stubDir, 'npm');
      const marker = path.join(repo.getPath(), 'stub-npm-was-called');
      fs.writeFileSync(
        stubNpm,
        `#!/bin/sh\ntouch "${marker}"\necho "stub npm: deliberate failure" >&2\nexit 1\n`,
      );
      fs.chmodSync(stubNpm, 0o755);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');
      const commit = repo.runGit('commit -m "first"', {
        PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      });

      // Guard against the test passing for the wrong reason: the hook really
      // did shell out to the (failing) package manager.
      expect(fs.existsSync(marker)).toBe(true);

      // npm failed, yet nothing surfaces it: the commit succeeds and the
      // version is still bumped and staged.
      expect(commit.exitCode).toBe(0);
      expect(repo.readPackageJson().version).toBe('0.1.1');

      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {version: string};
      expect(committed.version).toBe('0.1.1');
    });
  });

  describe("Justin's question: is dynamic-version.local.json still produced?", () => {
    test('the pre-commit hook still writes dynamic-version.local.json', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');

      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);
    });

    test('package.json alone is enough to read the version (no generated file needed)', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');

      // This is the whole point of the mode: a fresh consumer clone with no
      // .git and no generated file still sees the right version.
      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {version: string};
      expect(committed.version).toBe('0.1.1');
    });
  });
});
