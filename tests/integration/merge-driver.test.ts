import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {
  activateHooks,
  setupPackageJsonModeRepo,
  setupRepoForInstall,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for the package.json merge driver (70i.8, D11).
 *
 * Every test drives REAL git merges in a real fixture repository with the
 * real pre-commit hook installed, because the thing under test is how git
 * behaves, not how our functions behave.
 *
 * WHAT THE DRIVER IS FOR. In package-json mode the version is rewritten on
 * every commit, so two branches that both commit always disagree about that
 * one line. D11: the merge takes OURS — the branch being merged INTO.
 */

/** Real git merges plus a CLI subprocess per hooked commit; not fast. */
const TEST_TIMEOUT_MS = 60000;

/**
 * Build a repo that has the driver: package-json mode, the knob ON, hooks
 * installed and rewritten to run this source tree.
 *
 * The knob is explicit here because it is off by default
 * (version-manager-70i.24) — without it install registers nothing and every
 * test below would measure git's built-in merge instead of the driver.
 */
function setupRepoWithDriver(repo: TestRepo): void {
  setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch', undefined, {
    enabled: true,
  });
  activateHooks(repo);
}

/** The version recorded in a given ref's package.json. */
function versionAt(repo: TestRepo, ref: string): string {
  return (
    JSON.parse(repo.runGit(`show ${ref}:package.json`).stdout) as {
      version: string;
    }
  ).version;
}

/** The version in the package.json staged in the index. */
function indexVersion(repo: TestRepo): string {
  return (
    JSON.parse(repo.runGit('show :package.json').stdout) as {version: string}
  ).version;
}

/** Paths git reports as unmerged, i.e. actually conflicted. */
function unmergedPaths(repo: TestRepo): string[] {
  return repo
    .runGit('diff --name-only --diff-filter=U')
    .stdout.split('\n')
    .filter((line) => line !== '');
}

/**
 * A package.json with room in it: a scripts block near the top and a
 * dependencies block at the bottom, several lines apart.
 *
 * AC4 needs two edits that git's LINE-based merge can genuinely combine.
 * Appending two new top-level keys instead (which is what a JSON round-trip
 * does) puts both on the same line of the same hunk, and git conflicts —
 * correctly, and with nothing to do with this driver.
 */
const SPACIOUS_PACKAGE_JSON = [
  '{',
  '  "name": "test-package",',
  '  "version": "0.1.0",',
  '  "description": "a fixture",',
  '  "scripts": {',
  '    "build": "tsc"',
  '  },',
  '  "keywords": [],',
  '  "author": "test",',
  '  "license": "MIT",',
  '  "devDependencies": {',
  '    "husky": "^9.1.7"',
  '  },',
  '  "dependencies": {',
  '    "left-pad": "1.0.0"',
  '  }',
  '}',
  '',
].join('\n');

/** Replace one line of the fixture's package.json text and commit it. */
function commitPackageJsonLineChange(
  repo: TestRepo,
  message: string,
  find: string,
  replaceWith: string,
): void {
  const text = repo.readFile('package.json');
  expect(text).toContain(find);
  repo.writeFile('package.json', text.split(find).join(replaceWith));
  repo.makeCommit(message);
}

/** Rewrite one top-level field of the fixture's package.json and commit it. */
function commitPackageJsonChange(
  repo: TestRepo,
  message: string,
  change: (packageJson: Record<string, unknown>) => void,
): void {
  const packageJson = JSON.parse(repo.readFile('package.json')) as Record<
    string,
    unknown
  >;
  change(packageJson);
  repo.writeFile('package.json', JSON.stringify(packageJson, null, 2) + '\n');
  repo.makeCommit(message);
}

/**
 * Build the shape every merge test needs: a `feature` branch three hooked
 * commits ahead, and `main` one hooked commit ahead, so the two sides carry
 * DIFFERENT versions and the winner is unambiguous.
 *
 * @returns The two versions, measured rather than assumed
 */
function divergeBranches(repo: TestRepo): {feature: string; main: string} {
  const mainBranch = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

  repo.runGit('checkout -b feature');
  for (const index of [1, 2, 3]) {
    repo.writeFile(`feature-${index}.txt`, `${index}\n`);
    repo.makeCommit(`feature ${index}`);
  }
  const feature = versionAt(repo, 'HEAD');

  repo.runGit(`checkout ${mainBranch}`);
  repo.writeFile('main-1.txt', '1\n');
  repo.makeCommit('main 1');
  const main = versionAt(repo, 'HEAD');

  expect(main).not.toBe(feature);
  return {feature, main};
}

/**
 * Take the merge driver back out of git config, keeping .gitattributes.
 *
 * This is not a contrived state: .gitattributes is committed and travels,
 * while `merge.<name>.driver` lives in .git/config and by design does not.
 * Every fresh clone, every collaborator who has not run install, and every
 * CI checkout is in exactly this state.
 */
function unregisterMergeDriver(repo: TestRepo): void {
  repo.runGit('config --remove-section merge.version-manager');
}

describe('package.json merge driver (70i.8)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('merging with the driver registered', () => {
    test(
      'AC1: a true merge of a diverged branch does not conflict, and keeps OUR version',
      () => {
        setupRepoWithDriver(repo);
        const {feature, main} = divergeBranches(repo);

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        expect(merge.exitCode).toBe(0);
        expect(unmergedPaths(repo)).toEqual([]);
        expect(repo.readFile('package.json')).not.toContain('<<<<<<<');

        // D11: ours, the branch being merged into. The merge commit itself
        // does not re-run the pre-commit hook (git fires pre-merge-commit for
        // an automatic merge), so the version stays exactly main's.
        expect(versionAt(repo, 'HEAD')).toBe(main);
        expect(versionAt(repo, 'HEAD')).not.toBe(feature);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC2: a squash merge does not conflict, and follows the same ours policy',
      () => {
        setupRepoWithDriver(repo);
        const {feature, main} = divergeBranches(repo);

        const merge = repo.runGit('merge --squash feature');

        expect(merge.exitCode).toBe(0);
        expect(unmergedPaths(repo)).toEqual([]);

        // A squash leaves the merged content staged and the commit to the
        // author, so the index carries ours...
        expect(indexVersion(repo)).toBe(main);
        expect(indexVersion(repo)).not.toBe(feature);

        // ...and that commit runs the pre-commit hook, which adds its usual
        // one on top. A squash of any branch therefore lands at main + 1.
        repo.makeCommit('squash feature', false);
        expect(versionAt(repo, 'HEAD')).toBe('0.1.2');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC3: a genuine conflict elsewhere in package.json STILL conflicts',
      () => {
        setupRepoWithDriver(repo);

        const mainBranch = repo
          .runGit('rev-parse --abbrev-ref HEAD')
          .stdout.trim();

        repo.runGit('checkout -b feature');
        // Two hooked commits against main's one, so the two sides really do
        // carry different versions. Equal-length branches compute the SAME
        // version and would never exercise the driver at all.
        repo.writeFile('feature-1.txt', '1\n');
        repo.makeCommit('feature 1');
        commitPackageJsonChange(repo, 'feature dependency', (packageJson) => {
          packageJson.dependencies = {'left-pad': '9.9.9'};
        });
        const feature = versionAt(repo, 'HEAD');

        repo.runGit(`checkout ${mainBranch}`);
        commitPackageJsonChange(repo, 'main dependency', (packageJson) => {
          packageJson.dependencies = {'left-pad': '3.3.3'};
        });
        const main = versionAt(repo, 'HEAD');
        expect(main).not.toBe(feature);

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        // THE CONTROL THAT MATTERS: the driver neutralises the version line
        // and NOTHING else. A real disagreement must still reach the author.
        expect(merge.exitCode).not.toBe(0);
        expect(unmergedPaths(repo)).toEqual(['package.json']);

        const merged = repo.readFile('package.json');
        expect(merged).toContain('<<<<<<<');
        expect(merged).toContain('9.9.9');
        expect(merged).toContain('3.3.3');

        // And the conflict is about the dependency ONLY: the version was
        // settled by policy, so their version appears nowhere in the file
        // and ours sits outside the markers. Without the driver this is the
        // assertion that fails — their version would be in the conflict.
        expect(merged).not.toContain(feature);
        const beforeMarkers = merged.slice(0, merged.indexOf('<<<<<<<'));
        expect(beforeMarkers).toContain(`"version": "${main}"`);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC4: non-conflicting changes on both sides both survive',
      () => {
        setupRepoWithDriver(repo);

        const mainBranch = repo
          .runGit('rev-parse --abbrev-ref HEAD')
          .stdout.trim();

        repo.writeFile('package.json', SPACIOUS_PACKAGE_JSON);
        repo.makeCommit('room to merge in');

        repo.runGit('checkout -b feature');
        // An extra hooked commit, so feature's version really does diverge
        // from main's. Equal-length branches compute the same version and
        // would merge cleanly with or without the driver.
        repo.writeFile('feature-1.txt', '1\n');
        repo.makeCommit('feature 1');
        // Theirs: a new dependency, at the bottom of the file.
        commitPackageJsonLineChange(
          repo,
          'feature dependency',
          '    "left-pad": "1.0.0"',
          '    "left-pad": "1.0.0",\n    "right-pad": "2.0.0"',
        );

        repo.runGit(`checkout ${mainBranch}`);
        // Ours: a new script, near the top of the file.
        commitPackageJsonLineChange(
          repo,
          'main script',
          '    "build": "tsc"',
          '    "build": "tsc",\n    "test": "bun test"',
        );
        const main = versionAt(repo, 'HEAD');

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        expect(merge.exitCode).toBe(0);
        expect(repo.readFile('package.json')).not.toContain('<<<<<<<');

        const merged = JSON.parse(repo.readFile('package.json')) as {
          dependencies?: Record<string, string>;
          scripts?: Record<string, string>;
          version: string;
        };

        // Both sides' work survives; only the version was decided by policy.
        expect(merged.dependencies).toEqual({
          'left-pad': '1.0.0',
          'right-pad': '2.0.0',
        });
        expect(merged.scripts).toEqual({build: 'tsc', test: 'bun test'});
        expect(merged.version).toBe(main);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('AC6: the control — without the driver, nothing changes', () => {
    test(
      'the same merge conflicts on package.json when the driver is not registered',
      () => {
        setupRepoWithDriver(repo);
        unregisterMergeDriver(repo);
        const {feature, main} = divergeBranches(repo);

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        // Exactly the behaviour measured before the driver existed: exit 1
        // (a conflict, NOT a fatal error), package.json unmerged, both
        // versions in the file for the author to choose between. The
        // committed .gitattributes naming an unconfigured driver changes
        // nothing — git falls back to its built-in merge.
        expect(merge.exitCode).toBe(1);
        expect(unmergedPaths(repo)).toEqual(['package.json']);

        const merged = repo.readFile('package.json');
        expect(merged).toContain('<<<<<<<');
        expect(merged).toContain(main);
        expect(merged).toContain(feature);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a squash merge also conflicts again once the driver is gone',
      () => {
        setupRepoWithDriver(repo);
        unregisterMergeDriver(repo);
        divergeBranches(repo);

        const merge = repo.runGit('merge --squash feature');

        expect(merge.exitCode).toBe(1);
        expect(unmergedPaths(repo)).toEqual(['package.json']);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a driver command that cannot RUN leaves a conflict with no markers (known trap)',
      () => {
        setupRepoWithDriver(repo);

        // `false` stands in for the real way this happens: the registered
        // command is `npx @justinhaaheim/version-manager ...`, and a fresh
        // worktree (which SHARES .git/config, so the driver is registered)
        // with no node_modules cannot resolve it.
        repo.runGit('config merge.version-manager.driver false');

        const mainBranch = repo
          .runGit('rev-parse --abbrev-ref HEAD')
          .stdout.trim();

        repo.runGit('checkout -b feature');
        commitPackageJsonChange(repo, 'their dependency', (packageJson) => {
          packageJson.dependencies = {'theirs-only': '1.0.0'};
        });

        repo.runGit(`checkout ${mainBranch}`);
        repo.writeFile('m.txt', 'm\n');
        repo.makeCommit('main work');

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        // git reports a conflict, as it should — but because the driver
        // never wrote anything, the file left behind is OURS verbatim with
        // NO conflict markers in it. An author who sees "conflict", opens
        // the file, finds nothing to resolve and runs `git add package.json`
        // silently drops their side. Documented in the README; hardening the
        // registered command is version-manager-70i.22.
        expect(merge.exitCode).toBe(1);
        expect(unmergedPaths(repo)).toEqual(['package.json']);

        const left = repo.readFile('package.json');
        expect(left).not.toContain('<<<<<<<');
        expect(left).not.toContain('theirs-only');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a HALF-registered driver aborts the merge — which is why install writes the driver first',
      () => {
        setupRepoWithDriver(repo);

        // git's own behaviour, measured 2026-09-19: a named driver with no
        // command line is fatal (exit 128) and the merge never starts, where
        // NO configuration at all merely falls back to the built-in merge.
        // registerMergeDriver() therefore writes .driver before .name, so an
        // interrupted install can never leave a repository in this state.
        // This test pins the hazard so a future reordering is caught here
        // rather than by someone whose merge suddenly stops working.
        repo.runGit('config --unset merge.version-manager.driver');
        divergeBranches(repo);

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        expect(merge.exitCode).toBe(128);
        expect(merge.stderr).toContain('lacks command line');
        // Nothing was merged at all: no conflict to resolve, no result.
        expect(unmergedPaths(repo)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('AC5: install registers the driver idempotently', () => {
    test(
      'two installs leave one .gitattributes entry and one git config entry',
      () => {
        setupRepoForInstall(repo, 'package-json', '0.1.0', {enabled: true});
        // An unrelated line that must survive untouched.
        repo.writeFile('.gitattributes', '*.png binary\n');

        expect(repo.runCli('install --silent --non-interactive').exitCode).toBe(
          0,
        );
        expect(repo.runCli('install --silent --non-interactive').exitCode).toBe(
          0,
        );

        const attributes = repo.readFile('.gitattributes').split('\n');

        expect(attributes).toContain('*.png binary');
        expect(
          attributes.filter(
            (line) => line.trim() === 'package.json merge=version-manager',
          ),
        ).toHaveLength(1);

        const configured = repo
          .runGit('config --get-all merge.version-manager.driver')
          .stdout.split('\n')
          .filter((line) => line !== '');

        expect(configured).toHaveLength(1);
        expect(configured[0]).toContain('merge-driver %O %A %B');

        expect(
          repo.runGit('config --get merge.version-manager.name').stdout.trim(),
        ).not.toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'install creates .gitattributes when the repo has none',
      () => {
        setupRepoForInstall(repo, 'package-json', '0.1.0', {enabled: true});

        expect(repo.fileExists('.gitattributes')).toBe(false);
        expect(repo.runCli('install --silent --non-interactive').exitCode).toBe(
          0,
        );

        expect(repo.readFile('.gitattributes')).toContain(
          'package.json merge=version-manager',
        );
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a package.json line claimed by ANOTHER merge driver is left alone',
      () => {
        setupRepoForInstall(repo, 'package-json', '0.1.0', {enabled: true});
        repo.writeFile('.gitattributes', 'package.json merge=someone-else\n');

        const result = repo.runCli('install --silent --non-interactive');

        expect(result.exitCode).toBe(0);
        // Their policy stays theirs, and we say so rather than quietly
        // appending a line that would win by being last.
        expect(repo.readFile('.gitattributes')).toBe(
          'package.json merge=someone-else\n',
        );
        expect(result.stderr).toContain('different merge driver');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'dynamic-file mode does NOT register the driver',
      () => {
        setupRepoForInstall(repo, 'dynamic-file', '0.1.0');

        expect(repo.runCli('install --silent --non-interactive').exitCode).toBe(
          0,
        );

        // That mode changes package.json's version only when someone bumps it
        // deliberately; picking a side of a deliberate bump is not ours to
        // install on anyone's behalf.
        expect(repo.fileExists('.gitattributes')).toBe(false);
        expect(
          repo
            .runGit('config --get merge.version-manager.driver')
            .stdout.trim(),
        ).toBe('');
      },
      TEST_TIMEOUT_MS,
    );
  });

  /**
   * The knob itself (version-manager-70i.24).
   *
   * Registration needs package-json mode AND mergeDriver.enabled, because
   * registering the driver is what exposes a repo to the 70i.22 trap: a
   * driver command that cannot run leaves a conflict with no markers in it.
   * The code is merged; the feature is opted into.
   *
   * The four tests above under AC5, and every merge test in this file, are
   * the knob-ON half of this contract — they all now write
   * `mergeDriver: {enabled: true}` into the fixture's version-manager.json,
   * and assert that both halves get registered.
   */
  describe('the mergeDriver knob (70i.24)', () => {
    /** Everything install could possibly say about the merge driver. */
    function mentionsMergeDriver(text: string): boolean {
      return (
        /merge[ -]?driver/i.test(text) ||
        text.includes('merge=version-manager') ||
        text.includes('.gitattributes')
      );
    }

    test(
      'DEFAULT OFF: package-json mode with no mergeDriver field registers nothing and says nothing',
      () => {
        // No fourth argument: version-manager.json carries no mergeDriver key
        // at all, which is what every existing project's config looks like.
        setupRepoForInstall(repo, 'package-json', '0.1.0');

        // NOT --silent: the point is that a user watching the install scroll
        // by is never told about a feature they did not ask for.
        const result = repo.runCli('install --non-interactive');

        expect(result.exitCode).toBe(0);
        expect(repo.fileExists('.gitattributes')).toBe(false);
        expect(
          repo
            .runGit('config --get merge.version-manager.driver')
            .stdout.trim(),
        ).toBe('');
        expect(
          repo.runGit('config --get merge.version-manager.name').stdout.trim(),
        ).toBe('');
        expect(mentionsMergeDriver(result.stdout)).toBe(false);
        expect(mentionsMergeDriver(result.stderr)).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'KNOB ON: package-json mode with mergeDriver.enabled registers both halves',
      () => {
        setupRepoForInstall(repo, 'package-json', '0.1.0', {enabled: true});

        const result = repo.runCli('install --non-interactive');

        expect(result.exitCode).toBe(0);
        expect(repo.readFile('.gitattributes')).toContain(
          'package.json merge=version-manager',
        );
        expect(
          repo
            .runGit('config --get merge.version-manager.driver')
            .stdout.trim(),
        ).toContain('merge-driver %O %A %B');
        expect(
          repo.runGit('config --get merge.version-manager.name').stdout.trim(),
        ).not.toBe('');
        // And it is the knob being on that makes install talk about it.
        expect(mentionsMergeDriver(result.stdout)).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'BOTH CONDITIONS: the knob on in dynamic-file mode still registers nothing',
      () => {
        setupRepoForInstall(repo, 'dynamic-file', '0.1.0', {enabled: true});

        const result = repo.runCli('install --non-interactive');

        expect(result.exitCode).toBe(0);
        // The mode veto is independent of the knob: dynamic-file changes
        // package.json's version only on a deliberate bump, and no knob asks
        // us to pick a side of one of those.
        expect(repo.fileExists('.gitattributes')).toBe(false);
        expect(
          repo
            .runGit('config --get merge.version-manager.driver')
            .stdout.trim(),
        ).toBe('');
        expect(mentionsMergeDriver(result.stdout)).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
