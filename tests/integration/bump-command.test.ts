import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for what `bump` commits, tags, pushes and tells the
 * author to commit (version-manager-70i.34 and version-manager-70i.35).
 */

const TEST_TIMEOUT_MS = 30000;

/**
 * A dynamic-file repo with package.json at 0.1.0 and, when given, a
 * version-manager.json, both committed in ONE commit. No commit follows, so
 * the computed version is 0.1.0 and a patch bump gives 0.1.1 in either
 * calculation mode.
 *
 * @param config - The version-manager.json to write, or null for no file
 */
function setupBumpRepo(
  repo: TestRepo,
  config: Record<string, unknown> | null,
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  repo.writeFile(
    'package.json',
    JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2) + '\n',
  );
  if (config !== null) {
    repo.writeFile(
      'version-manager.json',
      JSON.stringify(config, null, 2) + '\n',
    );
  }
  repo.writeFile('.gitignore', '*.local.json\n*.local.d.ts\n');
  repo.makeCommit('Add version config files');
}

/** Every tag in a repository, one per line, or '' for none. */
function tags(repo: TestRepo): string {
  const result = repo.runGit('tag -l');
  // A failed listing must not read as "no tags" (critical rule 6).
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
}

describe('bump creates a tag only when asked (version-manager-70i.34)', () => {
  let repo: TestRepo;
  let remote: TestRepo | null = null;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
    remote?.cleanup();
    remote = null;
  });

  /**
   * Give `repo` a local bare repository as `origin`, with the current branch
   * pushed and tracking it, so a plain `git push` has somewhere to go.
   *
   * @returns The remote, and the branch name both sides share
   */
  function addBareRemote(): {branch: string; origin: TestRepo} {
    const origin = new TestRepo();
    remote = origin;
    expect(origin.runGit('init --bare').exitCode).toBe(0);

    expect(repo.runGit(`remote add origin ${origin.getPath()}`).exitCode).toBe(
      0,
    );
    const branch = repo.runGit('symbolic-ref --short HEAD').stdout.trim();
    expect(repo.runGit(`push -u origin ${branch}`).exitCode).toBe(0);

    return {branch, origin};
  }

  test(
    'bump --commit commits and creates NO tag',
    () => {
      setupBumpRepo(repo, null);

      const result = repo.runCli('bump --commit');

      expect(result.exitCode).toBe(0);
      expect(repo.runGit('log -1 --format=%s').stdout.trim()).toBe(
        'Bump version to 0.1.1',
      );
      expect(result.stdout).not.toContain('Creating git tag');
      expect(tags(repo)).toBe('');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'bump --commit --push pushes the commit and NO tag',
    () => {
      // The harm the bug did: `--push` with an unrequested tag ran
      // `git push --follow-tags` and published the tag.
      setupBumpRepo(repo, null);
      const {branch, origin} = addBareRemote();

      const result = repo.runCli('bump --commit --push');

      expect(result.exitCode).toBe(0);
      // The push happened, so an empty tag list below is not a failed push.
      expect(origin.runGit(`rev-parse ${branch}`).stdout.trim()).toBe(
        repo.runGit('rev-parse HEAD').stdout.trim(),
      );
      expect(tags(origin)).toBe('');
      expect(tags(repo)).toBe('');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'bump --commit --tag still creates an annotated tag',
    () => {
      setupBumpRepo(repo, null);

      const result = repo.runCli('bump --commit --tag');

      expect(result.exitCode).toBe(0);
      expect(tags(repo)).toBe('0.1.1');
      expect(repo.runGit('cat-file -t 0.1.1').stdout.trim()).toBe('tag');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'the documented short form `bump -c -t -p` commits, tags, and pushes both',
    () => {
      // README and CLAUDE.md: "Bump, commit, tag, and push". -t is --tag.
      setupBumpRepo(repo, null);
      const {branch, origin} = addBareRemote();

      const result = repo.runCli('bump -c -t -p');

      expect(result.exitCode).toBe(0);
      expect(tags(repo)).toBe('0.1.1');
      expect(tags(origin)).toBe('0.1.1');
      expect(origin.runGit(`rev-parse ${branch}`).stdout.trim()).toBe(
        repo.runGit('rev-parse HEAD').stdout.trim(),
      );
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'bump --help lists -t for --tag and no short flag for --types',
    () => {
      setupBumpRepo(repo, null);

      const help = repo.runCli('bump --help');

      expect(help.exitCode).toBe(0);
      const lines = help.stdout.split('\n');
      const tagLine = lines.find((line) => line.includes('--tag'));
      const typesLine = lines.find((line) => line.includes('--types'));
      expect(tagLine).toContain('-t, --tag');
      expect(typesLine).toBeDefined();
      expect(typesLine).not.toContain('-t,');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    '-t on a command other than bump is an unknown flag, not a silent --types',
    () => {
      // The accepted consequence of the decision in 70i.34's design: -t used
      // to set --types, which already defaulted to true, so it never changed
      // anything. Under .strict() it is now a usage error.
      setupBumpRepo(repo, null);

      const result = repo.runCli('-t');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown argument: t');
      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

describe('--types / --no-types still control the .d.ts (version-manager-70i.34)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
    setupBumpRepo(repo, null);
  });

  afterEach(() => {
    repo.cleanup();
  });

  test(
    'the default command writes the .d.ts, and --no-types stops it',
    () => {
      expect(repo.runCli('--no-types').exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);
      expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(false);

      expect(repo.runCli('').exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'bump writes the .d.ts by default and creates no tag',
    () => {
      expect(repo.runCli('bump --commit').exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(true);
      expect(tags(repo)).toBe('');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'bump --no-types writes no .d.ts, and does not switch off --tag',
    () => {
      // The two options are independent now. While they shared -t, yargs
      // treated them as one option, so these two flags contradicted each other.
      const result = repo.runCli('bump --commit --tag --no-types');

      expect(result.exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);
      expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(false);
      expect(tags(repo)).toBe('0.1.1');
    },
    TEST_TIMEOUT_MS,
  );
});
