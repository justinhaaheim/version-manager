import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import semver from 'semver';

import {assertValidVersionJson} from '../helpers/assertions';
import {
  activateHooks,
  setupDynamicFileModeRepo,
  setupPackageJsonModeRepo,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for the branchSuffix knob (version-manager-70i.10).
 *
 * With the knob on, a build made on a branch that is not one of the
 * configured main branches carries a semver prerelease naming the branch and
 * counting its own commits: 0.32.1 -> 0.32.1-my-branch.3.
 *
 * Every test here sets an explicit timeout: these spawn real git and a real
 * CLI, and under full-suite load they exceed bun's 5s default and report as
 * failures that are really timeouts.
 */

const TEST_TIMEOUT_MS = 30000;

/** Read the generated file and return its computed version. */
function readDynamicVersion(repo: TestRepo): string {
  const json: unknown = JSON.parse(repo.readFile('dynamic-version.local.json'));
  assertValidVersionJson(json);
  return json.dynamicVersion;
}

/** Fail loudly if the fixture is not on the branch these tests assume. */
function assertOnBranch(repo: TestRepo, expected: string): void {
  expect(repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim()).toBe(
    expected,
  );
}

describe('branchSuffix knob', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('off by default (AC 1)', () => {
    test(
      'dynamic-file mode: a config with no branchSuffix field produces the undecorated version',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch');

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'dynamic-file mode: no version-manager.json at all produces the undecorated version',
      () => {
        repo.initGit();
        repo.writeFile('README.md', '# Test Repo\n');
        repo.makeCommit('Initial commit');
        repo.writeFile(
          'package.json',
          JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2) +
            '\n',
        );
        repo.writeFile('.gitignore', '*.local.json\n');
        repo.makeCommit('Add package.json');

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }

        expect(repo.runCli('--silent').exitCode).toBe(0);
        // Default calculation mode is append-commits, and no suffix.
        expect(readDynamicVersion(repo)).toBe('0.1.0+2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'package-json mode: a config with no branchSuffix field commits the undecorated version',
      () => {
        setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.runGit('add -A');
        expect(repo.runGit('commit -m "work"').exitCode).toBe(0);

        expect(repo.readPackageJson().version).toBe('0.1.1');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('main branches are untouched with the knob ON (AC 4)', () => {
    // These are built so that the D7 "n === 0" rule cannot make them pass for
    // the wrong reason: in each case the branch under test is genuinely AHEAD
    // of the first main branch that resolves, so a broken exemption would
    // produce a suffix.
    test(
      'on master, ahead of main, with the default main branch list',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          // Partial object: mainBranches must come from the schema default.
          enabled: true,
        });
        assertOnBranch(repo, 'main');

        repo.runGit('checkout -b master');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }
        // master really is ahead of main, so n would be 2 if not exempt.
        expect(repo.runGit('rev-list --count main..HEAD').stdout.trim()).toBe(
          '2',
        );

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'on main, ahead of master, with an explicit main branch list',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
          // master is tried FIRST, so it resolves and yields a non-zero count.
          mainBranches: ['master', 'main'],
        });
        assertOnBranch(repo, 'main');

        repo.runGit('branch master');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }
        expect(repo.runGit('rev-list --count master..HEAD').stdout.trim()).toBe(
          '2',
        );

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'detached HEAD gets no suffix even when it is ahead of main',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }
        expect(repo.runGit('checkout --detach').exitCode).toBe(0);
        expect(repo.runGit('rev-list --count main..HEAD').stdout.trim()).toBe(
          '2',
        );

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a non-main branch in the same repo IS decorated, proving the knob is live',
      () => {
        // The control for the three tests above: same config, same repo shape,
        // only the branch name differs.
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.2-feat-x.2');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('n === 0 means no suffix (AC 5, D7)', () => {
    test(
      'a branch with no commits of its own is undecorated, and decorated after one commit',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.0');

        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');
        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.1-feat-x.1');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('dynamic-file mode writes the decorated version (AC 8)', () => {
    test(
      'add-to-patch: the generated file carries the suffix',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b', 'c']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.3-feat-x.3');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'append-commits: the prerelease sits before the +N metadata (D2)',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'append-commits', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        for (const name of ['a', 'b']) {
          repo.writeFile(`${name}.txt`, `${name}\n`);
          repo.makeCommit(`add ${name}`);
        }

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('0.1.0-feat-x.2+2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'the base version in the generated file stays undecorated',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        const json: unknown = JSON.parse(
          repo.readFile('dynamic-version.local.json'),
        );
        assertValidVersionJson(json);
        expect(json.baseVersion).toBe('0.1.0');
        expect(json.dynamicVersion).toBe('0.1.1-feat-x.1');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('sanitisation end to end (AC 2)', () => {
    test(
      'a real branch name with a slash produces a valid semver',
      () => {
        setupDynamicFileModeRepo(repo, '0.32.1', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b claude/add-alternate-version-mode-Hnq9X');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        const version = readDynamicVersion(repo);

        expect(version).toBe(
          '0.32.2-claude-add-alternate-version-mode-Hnq9X.1',
        );
        expect(semver.valid(version)).toBe(version);
        expect(semver.lt(version, '0.32.2')).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a branch name full of dots and separators produces a valid semver',
      () => {
        setupDynamicFileModeRepo(repo, '0.32.1', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b "release/1.2.x--wip"');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        const version = readDynamicVersion(repo);

        expect(version).toBe('0.32.2-release-1-2-x-wip.1');
        expect(semver.valid(version)).toBe(version);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('sanitisation edge cases end to end (AC 3)', () => {
    test(
      'an all-digits branch name is prefixed with b, keeping the semver legal',
      () => {
        // A numeric prerelease identifier may not have a leading zero, so
        // "007" would produce an INVALID semver without the prefix.
        // The all-punctuation case is unit-tested only: git will not create a
        // branch whose name sanitises to nothing.
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
        });

        expect(repo.runGit('checkout -b 007').exitCode).toBe(0);
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        const version = readDynamicVersion(repo);

        expect(version).toBe('0.1.1-b007.1');
        expect(semver.valid(version)).toBe(version);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('failure is not empty (AC 9)', () => {
    test(
      'unresolvable main branches fall back to the total commit count, loudly',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
          mainBranches: ['does-not-exist'],
        });

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        // initial + config + a = 3 commits on HEAD
        expect(repo.runGit('rev-list --count HEAD').stdout.trim()).toBe('3');

        const result = repo.runCli('');
        expect(result.exitCode).toBe(0);
        // The fallback notice is a warning, so it goes to stderr.
        expect(result.stderr).toContain('none of the configured main branches');

        // The version is still produced, from the fallback count.
        expect(readDynamicVersion(repo)).toBe('0.1.1-feat-x.3');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'the fallback notice is suppressed by --silent but the version is not',
      () => {
        setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch', {
          enabled: true,
          mainBranches: ['does-not-exist'],
        });

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        const result = repo.runCli('--silent');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain('branchSuffix');
        expect(result.stderr).not.toContain('branchSuffix');
        expect(readDynamicVersion(repo)).toBe('0.1.1-feat-x.3');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('a hand-authored prerelease is discarded while the knob is on (D3)', () => {
    test(
      'dynamic-file mode replaces 1.0.0-beta.1 rather than freezing on it',
      () => {
        // ACCEPTED LIMITATION, documented in the README: with the knob ON,
        // version-manager owns the prerelease segment. Without this the
        // version would freeze forever, because calculateCodeVersion()
        // returns its input unchanged on a 4-part split.
        setupDynamicFileModeRepo(repo, '1.0.0-beta.1', 'add-to-patch', {
          enabled: true,
        });

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        expect(readDynamicVersion(repo)).toBe('1.0.1-feat-x.1');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'with the knob OFF a hand-authored prerelease is left alone',
      () => {
        setupDynamicFileModeRepo(repo, '1.0.0-beta.1', 'add-to-patch');

        repo.runGit('checkout -b feat-x');
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('add a');

        expect(repo.runCli('--silent').exitCode).toBe(0);
        // Pre-existing behaviour: a 4-part split is returned unchanged.
        expect(readDynamicVersion(repo)).toBe('1.0.0-beta.1');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
