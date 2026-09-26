import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';

import {
  setupDynamicFileModeRepo,
  setupRepoForInstall,
} from '../helpers/repo-fixtures';
import {
  type FailingGitStub,
  type GitStubMatch,
  stubFailingGit,
} from '../helpers/stub-git';
import {type CliResult, TestRepo} from '../helpers/test-repo';

/**
 * version-manager-70i.18.1: a failed git measurement ends the command with an
 * error naming the git command and git's stderr (70i.18 F1). It is never
 * turned into 0 commits, "never changed", a detached "HEAD", or "untracked".
 *
 * Every failure here is INDUCED FOR REAL with a stub git first on PATH that
 * fails only the matching invocation (tests/helpers/stub-git.ts), and every
 * test asserts the stub's marker file, so none can pass for another reason.
 * The CLI runs outside any hook, so PATH delivery is enough.
 *
 * The fixture has two commits after the one that set package.json's version,
 * so the honest answer is 0.1.2: a failure silently read as "0 commits" or as
 * "never changed" would print 0.1.0, and the positive control pins 0.1.2.
 */
describe('git measurement failures end the command (70i.18.1)', () => {
  let repo: TestRepo;
  /** The commit that added package.json: the one S2 and S6 read. */
  let versionCommit: string;

  beforeEach(() => {
    repo = new TestRepo();
    setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch');
    versionCommit = repo
      .runGit('log -1 --format=%H -- package.json')
      .stdout.trim();
    repo.writeFile('one.txt', '1\n');
    repo.makeCommit('one');
    repo.writeFile('two.txt', '2\n');
    repo.makeCommit('two');
  });

  afterEach(() => {
    repo.cleanup();
  });

  function stub(
    label: string,
    match: GitStubMatch,
    failFromCall = 1,
  ): FailingGitStub {
    return stubFailingGit(repo.getPath(), {
      delivery: 'path',
      failFromCall,
      label,
      match,
    });
  }

  /** The command failed, named what failed, and wrote no version. */
  function expectFailedGenerate(
    result: CliResult,
    failing: FailingGitStub,
    label: string,
    gitCommand: string,
    context: string,
  ): void {
    // Guard against passing for the wrong reason: the induction happened.
    expect(fs.existsSync(failing.marker)).toBe(true);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(context);
    expect(result.stderr).toContain(gitCommand);
    expect(result.stderr).toContain(`deliberate ${label} failure`);

    // No fabricated version anywhere.
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
    expect(result.stdout).not.toContain('0.1.');
  }

  test('positive control: without a stub the fixture generates 0.1.2', () => {
    const result = repo.runCli('');

    expect(result.exitCode).toBe(0);
    const generated = JSON.parse(
      repo.readFile('dynamic-version.local.json'),
    ) as {dynamicVersion: string};
    expect(generated.dynamicVersion).toBe('0.1.2');
  }, 30000);

  test('S1: a failed commit count ends the command, never 0 commits', () => {
    const failing = stub('rev-list', {prefix: 'rev-list'});

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'rev-list',
      'git rev-list --count',
      'Could not count the commits since',
    );
  }, 30000);

  test('S2 (a): a failed git log ends the command, never "never changed"', () => {
    const failing = stub('log', {prefix: 'log'});

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'log',
      'git log --format=%H -- package.json',
      "Could not find the commit where package.json's version last changed",
    );
  }, 30000);

  test('S2 (b): a failed read of HEAD ends the command, never the newest commit', () => {
    const failing = stub('head-read', {contains: 'HEAD:package.json'});

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'head-read',
      'git rev-parse --verify --quiet HEAD:package.json',
      "Could not find the commit where package.json's version last changed",
    );
  }, 30000);

  test('S2 (c): a failed read of a historical commit ends the command, never a skip', () => {
    const failing = stub('history-read', {
      contains: `${versionCommit}:package.json`,
    });

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'history-read',
      `git rev-parse --verify --quiet ${versionCommit}:package.json`,
      "Could not find the commit where package.json's version last changed",
    );
  }, 30000);

  test('S2 (b) decision: package.json at HEAD that is not JSON ends the command', () => {
    // Not a git failure: the content itself. With no current value there is
    // nothing to compare history against, so no commit can honestly be named
    // (F5 b). The working-tree package.json is valid, so only HEAD's copy is
    // at fault, and the message says so.
    repo.writeFile('package.json', '{"name": "test-package", "version": \n');
    repo.makeCommit('break package.json');
    repo.writeFile(
      'package.json',
      JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2) + '\n',
    );

    const result = repo.runCli('');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'package.json as committed at HEAD is not a JSON object',
    );
    expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
  }, 30000);

  test('S6: a failed read of the committed version ends the command, never skips the check', () => {
    // The walk in S2 reads this commit's package.json first (call 1, passed
    // through); the uncommitted-bump check reads it again (call 2, failed).
    const failing = stub(
      'field-read',
      {contains: `${versionCommit}:package.json`},
      2,
    );

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'field-read',
      `git rev-parse --verify --quiet ${versionCommit}:package.json`,
      `Could not read the version package.json had at ${versionCommit}`,
    );
  }, 30000);

  test('S3: a failed branch read ends the command, never a detached "HEAD"', () => {
    const failing = stub('symbolic-ref', {prefix: 'symbolic-ref'});

    const result = repo.runCli('', failing.envOverrides);

    expectFailedGenerate(
      result,
      failing,
      'symbolic-ref',
      'git symbolic-ref --quiet --short HEAD',
      'Could not read the current branch',
    );
  }, 30000);
});

describe('the .gitignore guard fails closed (70i.18.1, S7)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('install leaves .gitignore alone when tracking cannot be measured, and says so', () => {
    // The fixture's .gitignore is UNTRACKED, so a measured answer would let
    // install add the generated-file entries (the positive case is covered in
    // generated-file-policy.test.ts). A failed measurement must not.
    setupRepoForInstall(repo, 'dynamic-file');
    const before = repo.readFile('.gitignore');
    const failing = stubFailingGit(repo.getPath(), {
      delivery: 'path',
      label: 'ls-files',
      match: {prefix: 'ls-files'},
    });

    const result = repo.runCli(
      'install --non-interactive',
      failing.envOverrides,
    );

    expect(fs.existsSync(failing.marker)).toBe(true);
    expect(repo.readFile('.gitignore')).toBe(before);
    expect(result.stderr).toContain('Skipping .gitignore update');
    expect(result.stderr).toContain('git ls-files');
    expect(result.stderr).toContain('deliberate ls-files failure');

    // Fail CLOSED, not fail the install: the rest of it still ran.
    expect(result.exitCode).toBe(0);
  }, 30000);
});
