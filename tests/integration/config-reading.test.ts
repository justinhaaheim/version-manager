import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {readVersion} from '../../src/version-reader';
import {
  activateHooks,
  setupBasicRepo,
  setupDynamicFileModeRepo,
  setupEventLogModeRepo,
  setupPackageJsonModeRepo,
  setupRepoForInstall,
} from '../helpers/repo-fixtures';
import {type CliResult, TestRepo} from '../helpers/test-repo';

/**
 * Three ways a version-manager.json can be broken (70i.18.2 AC2), each with a
 * fragment its message must carry so a reader can find the problem.
 */
const BROKEN_CONFIGS = [
  {
    content: '{"versionMode": "package-json",\n',
    fragment: 'is not valid JSON',
    name: 'invalid JSON',
  },
  {
    content: '{"versionMode": "package-json", "brnachSuffix": {}}\n',
    fragment: 'brnachSuffix',
    name: 'an unknown field (the schema is .strict())',
  },
  {
    content: '{"versionMode": "package-jsn"}\n',
    fragment: 'versionMode',
    name: 'a versionMode that does not exist',
  },
] as const;

/** The command failed, named the config and what is wrong with it. */
function expectConfigFailure(result: CliResult, fragment: string): void {
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('version-manager.json');
  expect(result.stderr).toContain(fragment);
}

describe('a broken version-manager.json ends every command (70i.18.2, S4)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  for (const broken of BROKEN_CONFIGS) {
    test(`${broken.name}: generate, install and bump fail and write nothing`, () => {
      // An untracked .gitignore and a pre-created .husky/: a working install
      // would edit the first and write hooks into the second, so both are
      // observable. package.json is committed at 0.1.0.
      setupRepoForInstall(repo, 'dynamic-file');
      repo.writeFile('version-manager.json', broken.content);

      const packageJsonBefore = repo.readFile('package.json');
      const gitignoreBefore = repo.readFile('.gitignore');

      for (const command of ['', 'install --non-interactive', 'bump']) {
        expectConfigFailure(repo.runCli(command), broken.fragment);

        expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
        expect(repo.readFile('package.json')).toBe(packageJsonBefore);
        expect(repo.readFile('.gitignore')).toBe(gitignoreBefore);
        expect(repo.fileExists('.husky/pre-commit')).toBe(false);
        expect(repo.fileExists('.husky/post-commit')).toBe(false);
      }

      // Not the old wrong message for bump, either.
      expect(repo.runCli('bump').stderr).not.toContain(
        'No version-manager.json found',
      );
    }, 60000);
  }

  test('THE S4 SCENARIO, package-json mode: a typo aborts the next commit instead of switching to dynamic-file', () => {
    setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
    activateHooks(repo);
    const headBefore = repo.runGit('rev-parse HEAD').stdout.trim();

    repo.writeFile(
      'version-manager.json',
      JSON.stringify(
        {
          brnachSuffix: {enabled: true},
          versionCalculationMode: 'add-to-patch',
          versionMode: 'package-json',
          versions: {},
        },
        null,
        2,
      ) + '\n',
    );
    repo.runGit('add version-manager.json');
    const commit = repo.runGit('commit -m "typo"');

    expect(commit.exitCode).not.toBe(0);
    expect(commit.stderr).toContain('version-manager.json');
    expect(commit.stderr).toContain('brnachSuffix');
    expect(repo.runGit('rev-parse HEAD').stdout.trim()).toBe(headBefore);

    // Not dynamic-file mode: no generated file, and no version written.
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
    expect(repo.readPackageJson().version).toBe('0.1.0');
  }, 30000);

  test('THE S4 SCENARIO, event-log mode: a typo aborts the next commit and appends no event', () => {
    setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
    activateHooks(repo);
    const headBefore = repo.runGit('rev-parse HEAD').stdout.trim();
    const logBefore = repo.readFile('version.jsonl');
    const packageJsonBefore = repo.readFile('package.json');

    repo.writeFile(
      'version-manager.json',
      JSON.stringify(
        {
          versionCalculationMode: 'add-to-patch',
          versionMode: 'event-log',
          versons: {},
        },
        null,
        2,
      ) + '\n',
    );
    repo.runGit('add version-manager.json');
    const commit = repo.runGit('commit -m "typo"');

    expect(commit.exitCode).not.toBe(0);
    expect(commit.stderr).toContain('version-manager.json');
    expect(commit.stderr).toContain('versons');
    expect(repo.runGit('rev-parse HEAD').stdout.trim()).toBe(headBefore);

    // Not the package-json path either, which is where the old default sent
    // an event-log project's pre-commit hook.
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
    expect(repo.readFile('version.jsonl')).toBe(logBefore);
    expect(repo.readFile('package.json')).toBe(packageJsonBefore);
  }, 30000);

  test('an ABSENT version-manager.json still means the defaults', () => {
    // append-commits in dynamic-file mode: a generated file, and +N.
    repo.initGit();
    repo.writeFile('README.md', '# Test Repo\n');
    repo.makeCommit('Initial commit');
    repo.writeFile(
      'package.json',
      JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2) + '\n',
    );
    repo.makeCommit('Add package.json');
    repo.writeFile('one.txt', '1\n');
    repo.makeCommit('one');

    const result = repo.runCli('');

    expect(result.exitCode).toBe(0);
    const generated = JSON.parse(
      repo.readFile('dynamic-version.local.json'),
    ) as {dynamicVersion: string};
    expect(generated.dynamicVersion).toBe('0.1.0+1');
  }, 30000);
});

/** Five commit events: a count git's own history cannot produce here. */
function fiveCommitEvents(branch: string): string {
  return Array.from(
    {length: 5},
    (_, i) =>
      `${JSON.stringify({b: branch, e: 'commit', t: `2026-09-26T10:0${i}:00.000Z`})}\n`,
  ).join('');
}

describe('a config holding only versionMode (70i.28)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('runs in the mode it names, and the CLI and readVersion() agree on the calculation mode', () => {
    // Before 70i.28 this config failed the schema (versionCalculationMode was
    // required), the CLI warned and ran as dynamic-file, and counted commits
    // since package.json's version changed: 0, so 0.1.0. The log says five
    // commits, so event-log mode with the default append-commits is 0.1.0+5.
    repo.initGit();
    repo.writeFile('README.md', '# Test Repo\n');
    repo.makeCommit('Initial commit');
    const branch = repo.runGit('symbolic-ref --short HEAD').stdout.trim();

    repo.writeFile(
      'package.json',
      JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2) + '\n',
    );
    repo.writeFile(
      'version-manager.json',
      JSON.stringify({versionMode: 'event-log'}, null, 2) + '\n',
    );
    repo.writeFile('version.jsonl', fiveCommitEvents(branch));
    repo.makeCommit('Add a minimal config and a log');

    const result = repo.runCli('--output out.json --silent');

    expect(result.exitCode).toBe(0);

    const cli = JSON.parse(repo.readFile('out.json')) as {
      commitsSince: number;
      dynamicVersion: string;
    };
    const reader = readVersion(repo.getPath());

    expect(reader.calculationMode).toBe('append-commits');
    expect(reader.version).toBe('0.1.0+5');
    expect(cli.commitsSince).toBe(5);
    expect(cli.dynamicVersion).toBe(reader.version);

    // Nothing to say about the config: it is valid.
    expect(result.stderr).not.toContain('version-manager.json');
  }, 30000);
});

/** A package.json cut off mid-edit: present, and not JSON. */
const CORRUPT_PACKAGE_JSON = '{"name": "test-package", "version": "0.1.0",\n';

describe('a corrupt package.json is an error, not a missing one (70i.18.2, S5)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  /** Failed, said the file is not JSON, and did not say "add a version". */
  function expectCorruptPackageJson(result: CliResult): void {
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('package.json is not valid JSON');
    expect(result.stderr).not.toContain('No version found in package.json');
    expect(result.stderr).not.toContain('No package.json found');
  }

  test('generate says package.json is not valid JSON, not "no version found"', () => {
    setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch');
    repo.writeFile('package.json', CORRUPT_PACKAGE_JSON);

    expectCorruptPackageJson(repo.runCli(''));
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
  }, 30000);

  test('the pre-commit working-tree fallback says so too (package.json not in the index)', () => {
    // readPreCommitBaseVersion() falls back to the working tree only when
    // package.json has never been staged (D9). That fallback is where S5 was
    // found: a corrupt file read as "No version found".
    setupBasicRepo(repo);
    repo.writeFile('package.json', CORRUPT_PACKAGE_JSON);
    repo.writeFile(
      'version-manager.json',
      JSON.stringify({versionMode: 'package-json'}, null, 2) + '\n',
    );

    expectCorruptPackageJson(repo.runCli('--pre-commit'));
    expect(repo.readFile('package.json')).toBe(CORRUPT_PACKAGE_JSON);
  }, 30000);

  test('install-scripts fails naming the file, and leaves it alone', () => {
    setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch');
    repo.writeFile('package.json', CORRUPT_PACKAGE_JSON);

    expectCorruptPackageJson(repo.runCli('install-scripts --force'));
    expect(repo.readFile('package.json')).toBe(CORRUPT_PACKAGE_JSON);
  }, 30000);

  test('an ABSENT package.json is reported exactly as before', () => {
    setupBasicRepo(repo);

    const result = repo.runCli('');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'No package.json found. This tool requires a package.json with a "version" field.',
    );
  }, 30000);
});
