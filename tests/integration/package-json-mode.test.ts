import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {
  activateHooks,
  setupBasicRepo,
  setupPackageJsonModeRepo,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * A package.json nothing in this codebase would ever produce: four-space
 * indent, a blank line inside the object, and `name` last. Used to prove the
 * hook rewrites the version VALUE and nothing else (70i.3 AC3).
 */
const ODD_PACKAGE_JSON = [
  '{',
  '    "version": "0.1.0",',
  '',
  '    "devDependencies": {',
  '        "husky": "^9.1.7"',
  '    },',
  '    "name": "test-package"',
  '}',
  '',
].join('\n');

/**
 * The shape of the fixture package.json these tests read back. Every field
 * but `version` is optional because the tests deliberately add and remove
 * them; TestRepo.readPackageJson() guarantees only `version`.
 */
type FixturePackageJson = {
  description?: string;
  devDependencies?: Record<string, string>;
  name?: string;
  version: string;
} & Record<string, unknown>;

/**
 * The two-character `git status --porcelain` code for one path, e.g. ' M' for
 * "modified, not staged" or '??' for untracked.
 *
 * @returns The code, or null if git does not report that path at all. Null is
 *   "git said nothing about it", which is not the same as any status code.
 */
function statusOf(repo: TestRepo, filePath: string): string | null {
  const line = repo
    .runGit('status --porcelain')
    .stdout.split('\n')
    .find((candidate) => candidate.endsWith(` ${filePath}`));

  return line === undefined ? null : line.slice(0, 2);
}

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
    test('installs a pre-commit hook and no post-* hooks at all', () => {
      // CHANGED BY version-manager-70i.2: post-checkout/merge/rewrite used to
      // be installed here. Their only job was regenerating
      // dynamic-version.local.json, which this mode no longer produces, so
      // they ran the CLI on every checkout to write nothing. post-commit was
      // always absent because pre-commit covers the commit itself.
      setupPackageJsonModeRepo(repo);
      activateHooks(repo);

      expect(repo.fileExists('.husky/pre-commit')).toBe(true);

      expect(repo.fileExists('.husky/post-commit')).toBe(false);
      expect(repo.fileExists('.husky/post-checkout')).toBe(false);
      expect(repo.fileExists('.husky/post-merge')).toBe(false);
      expect(repo.fileExists('.husky/post-rewrite')).toBe(false);
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

    test('with branchSuffix ON, equal-length branches no longer collide (70i.10)', () => {
      // THE KNOB-ON TWIN of the test above, which is kept as the control.
      // The suffix makes the two sides structurally different, so the same
      // scenario becomes a VISIBLE CONFLICT instead of a clean auto-merge
      // that silently undercounts. The suffix does not reduce conflicts —
      // it converts a wrong answer into a stopped merge.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch', {
        enabled: true,
      });
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();
      expect(['main', 'master']).toContain(base);

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

      // The control asserts both sides are '0.1.1'. Here they differ.
      expect(featureVersion).toBe('0.1.1-feature.1');
      expect(baseVersion).toBe('0.1.1');
      expect(featureVersion).not.toBe(baseVersion);

      const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

      expect(merge.exitCode).not.toBe(0);
      expect(merge.stdout + merge.stderr).toContain('package.json');
    }, 30000);

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

  describe('the index is the source of truth in pre-commit (70i.3, D9)', () => {
    test('AC1: an unstaged package.json edit is NOT swept into the commit, but the version bump is', () => {
      // THE HEADLINE. This test asserted the opposite until 70i.3: the hook
      // read and rewrote the WORKING TREE package.json and then `git add`ed
      // the whole file, so an unrelated half-finished edit landed in a commit
      // the author never staged it for. Content reaching history unasked is a
      // data-integrity bug, not a `git add -p` annoyance.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      // Stage an unrelated file only.
      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');

      // Leave an UNSTAGED devDependency edit in package.json — the
      // half-added dependency case, written the way a human would leave it.
      const edited = repo.readPackageJson() as FixturePackageJson;
      edited.devDependencies = {
        ...edited.devDependencies,
        'left-pad': '^1.3.0',
      };
      repo.writeFile('package.json', JSON.stringify(edited, null, 2) + '\n');

      expect(repo.runGit('commit -m "commit only a.txt"').exitCode).toBe(0);

      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {devDependencies?: Record<string, string>; version: string};

      // The version bump DID land in the commit: that is the mode's purpose.
      expect(committed.version).toBe('0.1.1');
      // The unstaged edit did NOT.
      expect(committed.devDependencies?.['left-pad']).toBeUndefined();

      // The working tree still holds both, and package.json is still dirty:
      // the author's half-finished edit is exactly where they left it.
      const workingTree = repo.readPackageJson() as FixturePackageJson;
      expect(workingTree.version).toBe('0.1.1');
      expect(workingTree.devDependencies?.['left-pad']).toBe('^1.3.0');
      expect(statusOf(repo, 'package.json')).toBe(' M');
    }, 30000);

    test('AC2: a STAGED package.json edit is committed, together with the version bump', () => {
      // The other half of AC1: staging is honoured exactly as the author
      // asked. Only what they did NOT stage is left behind.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const edited = repo.readPackageJson() as FixturePackageJson;
      edited.description = 'deliberately staged';
      edited.devDependencies = {
        ...edited.devDependencies,
        'left-pad': '^1.3.0',
      };
      repo.writeFile('package.json', JSON.stringify(edited, null, 2) + '\n');
      repo.runGit('add package.json');

      expect(repo.runGit('commit -m "stage package.json"').exitCode).toBe(0);

      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {
        description?: string;
        devDependencies?: Record<string, string>;
        name?: string;
        version: string;
      };

      expect(committed.version).toBe('0.1.1');
      expect(committed.description).toBe('deliberately staged');
      expect(committed.devDependencies?.['left-pad']).toBe('^1.3.0');
      // Unchanged in every other respect.
      expect(committed.name).toBe('test-package');
      expect(committed.devDependencies?.husky).toBe('^9.1.7');

      // Nothing left over: the staged edit and the bump both went in.
      expect(repo.runGit('status --porcelain').stdout.trim()).toBe('');
    }, 30000);

    test('AC3: formatting and key order survive byte-for-byte apart from the version', () => {
      // The reason the working-tree write is a string-level replacement and
      // not a parse-and-re-stringify: reformatting a file someone is midway
      // through editing destroys the very work AC1 protects.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      // Written AFTER activateHooks on purpose: `install` rewrites
      // package.json through JSON.stringify, which would flatten this back to
      // two-space indent before the test even starts.
      repo.writeFile('package.json', ODD_PACKAGE_JSON);
      repo.runGit('add package.json');
      expect(
        repo.runGit('commit --no-verify -m "hand-formatted package.json"')
          .exitCode,
      ).toBe(0);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');
      expect(repo.runGit('commit -m "hooked"').exitCode).toBe(0);

      // 0.1.0 was last changed 1 commit ago, so this commit is +2.
      const expected = ODD_PACKAGE_JSON.replace('"0.1.0"', '"0.1.2"');

      // Working tree: every byte but the version value is where it was.
      expect(repo.readFile('package.json')).toBe(expected);
      // And so is the copy that went into the commit.
      expect(repo.runGit('show HEAD:package.json').stdout).toBe(expected);
    }, 30000);

    test('AC4: the version written to the index and to the working tree is the same string', () => {
      // Proven with the two files genuinely differing, so "same string" is
      // not true merely because the two copies are identical.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');

      const edited = repo.readPackageJson() as Record<string, unknown>;
      edited.description = 'unstaged, so the two copies differ';
      repo.writeFile('package.json', JSON.stringify(edited, null, 2) + '\n');

      expect(repo.runGit('commit -m "first"').exitCode).toBe(0);

      const committedVersion = (
        JSON.parse(repo.runGit('show HEAD:package.json').stdout) as {
          version: string;
        }
      ).version;

      expect(repo.readPackageJson().version).toBe(committedVersion);
      expect(committedVersion).toBe('0.1.1');
      // The copies really were different, or this test proves nothing.
      expect(
        (repo.readPackageJson() as {description?: string}).description,
      ).toBe('unstaged, so the two copies differ');
    }, 30000);

    test('an unstaged VERSION edit does not steer the calculation', () => {
      // The direct consequence of reading the index: the base version is what
      // the commit is being made FROM, not whatever the author happens to
      // have typed into their working copy and not staged.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      const edited = repo.readPackageJson() as Record<string, unknown>;
      edited.version = '9.9.9';
      repo.writeFile('package.json', JSON.stringify(edited, null, 2) + '\n');

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add a.txt');
      expect(repo.runGit('commit -m "first"').exitCode).toBe(0);

      // Computed from the staged 0.1.0, not from the unstaged 9.9.9.
      expect(repo.readPackageJson().version).toBe('0.1.1');
    }, 30000);

    test('package.json absent from the index falls back to the working tree and says so', () => {
      // D9's documented fallback: a repo where package.json has never been
      // staged. The fallback is reported, never silent — an unmeasured index
      // must not look like a measured one.
      setupBasicRepo(repo);

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'untracked', version: '0.1.0'}, null, 2) + '\n',
      );
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            versionCalculationMode: 'add-to-patch',
            versionMode: 'package-json',
            versions: {},
          },
          null,
          2,
        ) + '\n',
      );

      // 2>&1 because TestRepo.runCli cannot capture stderr on a successful
      // run (version-manager-70i.13 F2).
      const result = repo.runCli('--pre-commit 2>&1');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('not in the git index');
      expect(repo.readPackageJson().version).toBe('0.1.1');
      // Still untracked: the fallback writes the working tree only. Adding a
      // whole unstaged file to the index is the bigger version of the bug
      // this bead fixes.
      expect(statusOf(repo, 'package.json')).toBe('??');
    }, 30000);
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
    test('no: the pre-commit hook writes no dynamic-version.local.json (70i.2)', () => {
      // The answer used to be yes, which is what made the mode only half a
      // solution. tests/integration/generated-file-policy.test.ts sweeps the
      // whole repo; this keeps the answer next to the question.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');

      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
      expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(false);
    }, 30000);

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

  describe('branch suffix in package-json mode (70i.10)', () => {
    test('add-to-patch: successive commits advance both the version and n, with no compounding (AC 7)', () => {
      // THE FEEDBACK LOOP. In this mode the decorated version is committed
      // into package.json and read back as the next computation's input.
      // Without the D3 strip-then-reapply the suffix would either compound
      // (0.1.0-feat-x.1-feat-x.2) or, far worse, freeze the version
      // forever — calculatePreCommitVersion() returns its input UNCHANGED
      // when the split is not exactly three parts, so nothing errors.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch', {
        enabled: true,
      });
      activateHooks(repo);

      repo.runGit('checkout -b feat-x');

      const observed: string[] = [];
      for (let i = 1; i <= 3; i++) {
        repo.writeFile(`file${i}.txt`, `content ${i}\n`);
        repo.runGit('add -A');
        expect(repo.runGit(`commit -m "commit ${i}"`).exitCode).toBe(0);
        observed.push(repo.readPackageJson().version);
      }

      expect(observed).toEqual([
        '0.1.1-feat-x.1',
        '0.1.2-feat-x.2',
        '0.1.3-feat-x.3',
      ]);
    }, 30000);

    test('append-commits: the prerelease sits before the +N metadata and neither compounds (AC 7)', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'append-commits', {
        enabled: true,
      });
      activateHooks(repo);

      repo.runGit('checkout -b feat-x');

      const observed: string[] = [];
      for (let i = 1; i <= 3; i++) {
        repo.writeFile(`file${i}.txt`, `content ${i}\n`);
        repo.runGit('add -A');
        expect(repo.runGit(`commit -m "commit ${i}"`).exitCode).toBe(0);
        observed.push(repo.readPackageJson().version);
      }

      expect(observed).toEqual([
        '0.1.0-feat-x.1+1',
        '0.1.0-feat-x.2+2',
        '0.1.0-feat-x.3+3',
      ]);
    }, 30000);

    test('the decorated version is COMMITTED into package.json, not just written (AC 8)', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch', {
        enabled: true,
      });
      activateHooks(repo);

      repo.runGit('checkout -b feat-x');
      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "first"');

      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {version: string};
      expect(committed.version).toBe('0.1.1-feat-x.1');

      // Working tree still clean: nothing left for the user to commit.
      expect(repo.runGit('status --porcelain').stdout.trim()).toBe('');
    }, 30000);

    test('committing back on a main branch strips the branch suffix (D3, D6)', () => {
      // The merge case: a decorated version that landed on main must not
      // freeze there. version-manager owns the prerelease while the knob is
      // on, so the next main-branch commit strips it and carries on.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch', {
        enabled: true,
      });
      activateHooks(repo);

      const base = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();
      expect(['main', 'master']).toContain(base);

      repo.runGit('checkout -b feat-x');
      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      repo.runGit('commit -m "feature work"');
      expect(repo.readPackageJson().version).toBe('0.1.1-feat-x.1');

      // Land the branch on main with a fast-forward, so main's
      // package.json now carries the decorated version.
      repo.runGit(`checkout ${base}`);
      expect(repo.runGit('merge --ff-only feat-x').exitCode).toBe(0);
      expect(repo.readPackageJson().version).toBe('0.1.1-feat-x.1');

      repo.writeFile('b.txt', 'b\n');
      repo.runGit('add -A');
      expect(repo.runGit('commit -m "main work"').exitCode).toBe(0);

      expect(repo.readPackageJson().version).toBe('0.1.2');
    }, 30000);
  });
});
