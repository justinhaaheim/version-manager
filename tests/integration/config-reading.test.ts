import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {readVersion} from '../../src/version-reader';
import {TestRepo} from '../helpers/test-repo';

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
