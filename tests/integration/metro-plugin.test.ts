import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {spawnSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {generateFileBasedVersion} from '../../src/version-generator';
import {assertValidVersionJson} from '../helpers/assertions';
import {inDirectory} from '../helpers/in-directory';
import {
  setupDynamicFileModeRepo,
  setupEventLogModeRepo,
  setupPackageJsonModeRepo,
} from '../helpers/repo-fixtures';
import {STUB_BUNDLE} from '../helpers/run-metro-plugin';
import {TestRepo} from '../helpers/test-repo';

/**
 * The metro plugin in each version mode (version-manager-70i.11, W5 and W6).
 *
 * Before that bead the plugin wrote dynamic-version.local.json in every mode,
 * and in event-log mode the number in it was measured from package.json's
 * history rather than from version.jsonl. Now it writes only in dynamic-file
 * mode, and in the other two it warns once per process and writes nothing.
 *
 * Each run is a separate `bun` process (tests/helpers/run-metro-plugin.ts):
 * the plugin reads process.cwd(), and "once per process" can only be tested
 * with a fresh process.
 */

/** Real git and a subprocess per test; not fast. */
const TEST_TIMEOUT_MS = 30000;

/** The start of the plugin's one warning, whatever the mode. */
const WARNING_PREFIX = '[version-manager] withVersionManager() writes nothing:';

interface MetroPluginRun {
  /** What each serializer call returned, in order. */
  bundles: string[];
  exitCode: number;
  stderr: string;
}

/**
 * Invoke the plugin's serializer `calls` times in one fresh process.
 *
 * DEBUG is set so the plugin's catch-all prints what it swallows. Without it, a
 * plugin that crashed before writing would look exactly like a plugin that
 * decided not to write.
 *
 * @throws If the process could not be spawned or died on a signal: neither is
 *   an exit code, and reporting one as a result would be a failed measurement
 *   dressed up as a finding (critical rule 6).
 */
function runMetroPlugin(repo: TestRepo, calls: number): MetroPluginRun {
  const driverPath = path.join(
    __dirname,
    '..',
    'helpers',
    'run-metro-plugin.ts',
  );

  const result = spawnSync('bun', [driverPath, String(calls)], {
    cwd: repo.getPath(),
    encoding: 'utf-8',
    env: {
      ...process.env,
      DEBUG: '1',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_AUTHOR_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
    },
  });

  if (result.error != null) {
    throw new Error(
      `Failed to spawn the metro driver: ${result.error.message}`,
    );
  }

  if (result.status === null) {
    throw new Error(
      `The metro driver died on signal ${result.signal ?? 'unknown'} without an exit code`,
    );
  }

  const bundles = result.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => (JSON.parse(line) as {bundle: string}).bundle);

  return {bundles, exitCode: result.status, stderr: result.stderr};
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('metro plugin (version-manager-70i.11)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test(
    'package-json mode: writes no file, warns exactly once across two bundles, still serializes',
    () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      const run = runMetroPlugin(repo, 2);

      expect(run.exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
      expect(countOccurrences(run.stderr, WARNING_PREFIX)).toBe(1);
      expect(run.stderr).toContain(
        'versionMode is "package-json", which writes no dynamic-version.local.json. The version lives in the committed "version" field of package.json.',
      );
      // The plugin's catch-all printed nothing: the absent file is a decision,
      // not a crash.
      expect(run.stderr).not.toContain('Failed to generate version');
      // Declining to write never costs the bundle.
      expect(run.bundles).toEqual([STUB_BUNDLE, STUB_BUNDLE]);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'event-log mode: writes no file, warns exactly once across two bundles, still serializes',
    () => {
      setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');

      const run = runMetroPlugin(repo, 2);

      expect(run.exitCode).toBe(0);
      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
      expect(countOccurrences(run.stderr, WARNING_PREFIX)).toBe(1);
      expect(run.stderr).toContain(
        'versionMode is "event-log", which writes no dynamic-version.local.json. The version is derived from version.jsonl',
      );
      expect(run.stderr).not.toContain('Failed to generate version');
      expect(run.bundles).toEqual([STUB_BUNDLE, STUB_BUNDLE]);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'dynamic-file mode: writes the version generateFileBasedVersion() computes, and warns nothing',
    async () => {
      setupDynamicFileModeRepo(repo, '0.1.0', 'add-to-patch');

      // Three commits after the version was set, so the count is not zero and
      // a derivation that ignored package.json's history would disagree.
      for (const index of [1, 2, 3]) {
        repo.writeFile(`file-${index}.txt`, `${index}\n`);
        repo.makeCommit(`commit ${index}`);
      }

      const run = runMetroPlugin(repo, 1);

      expect(run.exitCode).toBe(0);
      expect(run.stderr).not.toContain('[version-manager]');
      expect(run.bundles).toEqual([STUB_BUNDLE]);

      const versionFilePath = path.join(
        repo.getPath(),
        'dynamic-version.local.json',
      );
      expect(fs.existsSync(versionFilePath)).toBe(true);

      const written: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(written);

      const expected = await inDirectory(repo.getPath(), () =>
        generateFileBasedVersion('cli'),
      );

      expect(written.dynamicVersion).toBe(expected.versionData.dynamicVersion);
      expect(written.baseVersion).toBe(expected.versionData.baseVersion);
      expect(written.commitsSince).toBe(expected.versionData.commitsSince);
      expect(written.dynamicVersion).toBe('0.1.3');
    },
    TEST_TIMEOUT_MS,
  );
});
