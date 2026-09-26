import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {parseEventLog, VERSION_LOG_FILENAME} from '../../src/event-log';
import {UNION_MERGE_ATTRIBUTE} from '../../src/event-log-mode';
import {VersionManagerConfigSchema} from '../../src/types';
import {
  activateHooks,
  setupRepoForInstall,
  setupRepoForModeInstall,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * `install --mode <m>` (version-manager-70i.7): record the mode in
 * version-manager.json, then install for it (M2), and warn about what the
 * previous mode left behind (M3). Every test drives the real CLI in a real
 * fixture repository.
 */

/** A CLI subprocess or two per test, plus real git; not fast. */
const TEST_TIMEOUT_MS = 60000;

const CONFIG = 'version-manager.json';

/** The hook files in .husky/, sorted, without the fixture's .keep. */
function huskyHooks(repo: TestRepo): string[] {
  return fs
    .readdirSync(repo.getHuskyHooksDir())
    .filter((name) => name !== '.keep')
    .sort();
}

/** Parse the config file as raw JSON, with no defaults filled in. */
function rawConfig(repo: TestRepo): Record<string, unknown> {
  return JSON.parse(repo.readFile(CONFIG)) as Record<string, unknown>;
}

describe('install --mode (version-manager-70i.7)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('a fresh repository with no version-manager.json', () => {
    test(
      'AC1: --mode event-log writes only versionMode, sets up the log, installs pre-commit only, and the next commit appends one event',
      () => {
        setupRepoForModeInstall(repo);

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        // Exactly this text: the mode and nothing else (M2, epic P4).
        expect(repo.readFile(CONFIG)).toBe(
          '{\n  "versionMode": "event-log"\n}\n',
        );

        expect(repo.readFile(VERSION_LOG_FILENAME)).toBe('');
        expect(repo.readFile('.gitattributes')).toContain(
          UNION_MERGE_ATTRIBUTE,
        );
        expect(huskyHooks(repo)).toEqual(['pre-commit']);
        expect(repo.readHuskyHook('pre-commit')).toContain('--pre-commit');

        // A plain install afterwards (inside activateHooks) reads the recorded
        // mode back, and the hook it leaves appends one event per commit.
        activateHooks(repo);
        repo.writeFile('a.txt', 'a\n');
        repo.runGit('add -A');
        expect(repo.runGit('commit -m "first"').exitCode).toBe(0);

        const {events, skippedLines} = parseEventLog(
          repo.readFile(VERSION_LOG_FILENAME),
        );
        expect(skippedLines).toEqual([]);
        expect(events.filter((event) => event.e === 'commit')).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC2: --mode package-json writes only versionMode, installs pre-commit only, and writes no generated file',
      () => {
        setupRepoForModeInstall(repo);

        const result = repo.runCli(
          'install --mode package-json --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        expect(repo.readFile(CONFIG)).toBe(
          '{\n  "versionMode": "package-json"\n}\n',
        );
        expect(huskyHooks(repo)).toEqual(['pre-commit']);
        expect(repo.readHuskyHook('pre-commit')).toContain('--pre-commit');
        expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
        expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC6: --mode bogus is a usage error that writes nothing',
      () => {
        setupRepoForModeInstall(repo);

        const result = repo.runCli('install --mode bogus --non-interactive');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Invalid values');
        expect(result.stderr).toContain('bogus');
        expect(repo.fileExists(CONFIG)).toBe(false);
        expect(huskyHooks(repo)).toEqual([]);
        expect(repo.fileExists(VERSION_LOG_FILENAME)).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('an existing version-manager.json', () => {
    test(
      'AC3: a hand-formatted file without versionMode gains it at the end; formatting, values and order survive; no default is added',
      () => {
        const original =
          '{\n' +
          '    "versionCalculationMode": "add-to-patch",\n' +
          '    "versions": {\n' +
          '        "runtime": "1.0.0"\n' +
          '    }\n' +
          '}\n';
        setupRepoForModeInstall(repo, original);

        const result = repo.runCli(
          'install --mode dynamic-file --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        expect(repo.readFile(CONFIG)).toBe(
          '{\n' +
            '    "versionCalculationMode": "add-to-patch",\n' +
            '    "versions": {\n' +
            '        "runtime": "1.0.0"\n' +
            '    },\n' +
            '    "versionMode": "dynamic-file"\n' +
            '}\n',
        );
        // Spelled out so a failure names what went wrong.
        expect(Object.keys(rawConfig(repo))).toEqual([
          'versionCalculationMode',
          'versions',
          'versionMode',
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC3: with versionMode present and different, only that value changes',
      () => {
        const original =
          '{\n' +
          '\t"versionMode" :  "package-json",\n' +
          '\t"versionCalculationMode": "append-commits",\n' +
          '\t"versions": {"runtime": "2.0.0"}\n' +
          '}';
        setupRepoForModeInstall(repo, original);

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        expect(repo.readFile(CONFIG)).toBe(
          original.replace('"package-json"', '"event-log"'),
        );
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC4: an unparseable file fails naming it, stays byte-identical, and nothing is installed',
      () => {
        const broken = '{\n  "versionMode": "package-json",\n';
        setupRepoForModeInstall(repo, broken);

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain(CONFIG);
        expect(result.stderr).toContain('not valid JSON');
        expect(repo.readFile(CONFIG)).toBe(broken);
        expect(huskyHooks(repo)).toEqual([]);
        expect(repo.fileExists(VERSION_LOG_FILENAME)).toBe(false);
        expect(repo.fileExists('.gitattributes')).toBe(false);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC5: a legacy file becomes a current-schema file with the mode and versions.runtime preserved',
      () => {
        setupRepoForModeInstall(
          repo,
          JSON.stringify(
            {runtimeVersion: '3.1.4', versionCalculationMode: 'add-to-patch'},
            null,
            2,
          ) + '\n',
        );

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        const raw = rawConfig(repo);
        const parsed = VersionManagerConfigSchema.safeParse(raw);

        expect(parsed.success).toBe(true);
        expect(parsed.data?.versionMode).toBe('event-log');
        expect(parsed.data?.versions).toEqual({runtime: '3.1.4'});
        expect(parsed.data?.versionCalculationMode).toBe('add-to-patch');
        // The migration's fields and the mode; no defaults written (P4).
        expect(raw).toEqual({
          versionCalculationMode: 'add-to-patch',
          versionMode: 'event-log',
          versions: {runtime: '3.1.4'},
        });
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'AC8: the same mode says so and does not touch the file',
      () => {
        const original =
          '{"versionMode":"event-log","versionCalculationMode":"add-to-patch"}\n';
        setupRepoForModeInstall(repo, original);

        const configPath = path.join(repo.getPath(), CONFIG);
        const past = new Date('2020-01-01T00:00:00Z');
        fs.utimesSync(configPath, past, past);

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        expect(result.stdout).toContain(
          'already sets versionMode to "event-log"',
        );
        expect(repo.readFile(CONFIG)).toBe(original);
        // Not written at all, not merely rewritten with the same bytes.
        expect(fs.statSync(configPath).mtimeMs).toBe(past.getTime());
        expect(result.stderr).not.toContain('versionMode changed');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('AC8: switching modes warns about what the old mode left behind (M3)', () => {
    for (const from of ['package-json', 'event-log'] as const) {
      test(
        `${from} -> dynamic-file warns about the pre-commit hook`,
        () => {
          setupRepoForInstall(repo, from);
          expect(repo.runCli('install --non-interactive').exitCode).toBe(0);
          expect(huskyHooks(repo)).toEqual(['pre-commit']);

          const result = repo.runCli(
            'install --mode dynamic-file --non-interactive',
          );
          expect(result.exitCode).toBe(0);

          expect(result.stderr).toContain(
            `versionMode changed from "${from}" to "dynamic-file"`,
          );
          expect(result.stderr).toContain(
            '.husky/pre-commit still runs version-manager --pre-commit',
          );
          expect(result.stderr).toContain(
            'rewrites the version in package.json on every commit',
          );
          // Said, not done: the hook is still there (70i.6 is the clean-up).
          expect(repo.readHuskyHook('pre-commit')).toContain('--pre-commit');
        },
        TEST_TIMEOUT_MS,
      );
    }

    test(
      'dynamic-file -> event-log warns about the post-* hooks, the lifecycle scripts and the generated file',
      () => {
        setupRepoForInstall(repo, 'dynamic-file');
        expect(repo.runCli('install --non-interactive').exitCode).toBe(0);
        expect(repo.fileExists('dynamic-version.local.json')).toBe(true);

        const result = repo.runCli(
          'install --mode event-log --non-interactive',
        );
        expect(result.exitCode).toBe(0);

        const {stderr} = result;
        expect(stderr).toContain(
          'versionMode changed from "dynamic-file" to "event-log"',
        );
        expect(stderr).toContain(
          'The post-checkout, post-commit, post-merge and post-rewrite hooks in .husky/ still run version-manager',
        );
        expect(stderr).toContain(
          'The prepare, prebuild, predev and prestart scripts in package.json still run version-manager',
        );
        expect(stderr).toContain(
          'dynamic-version.local.json and dynamic-version.local.d.ts are still on disk and will never be updated again',
        );
        // Nothing about a pre-commit hook: that is the other direction.
        expect(stderr).not.toContain('--pre-commit');
      },
      TEST_TIMEOUT_MS,
    );

    for (const [from, to] of [
      ['package-json', 'event-log'],
      ['event-log', 'package-json'],
    ] as const) {
      test(
        `${from} -> ${to} says nothing about hooks`,
        () => {
          setupRepoForInstall(repo, from);
          expect(repo.runCli('install --non-interactive').exitCode).toBe(0);

          const result = repo.runCli(`install --mode ${to} --non-interactive`);
          expect(result.exitCode).toBe(0);

          expect(result.stdout).toContain(
            `Set versionMode to "${to}" in version-manager.json (it was "${from}" before)`,
          );
          expect(result.stderr).not.toContain('versionMode changed');
          expect(result.stderr).not.toContain('hook');
        },
        TEST_TIMEOUT_MS,
      );
    }
  });
});
