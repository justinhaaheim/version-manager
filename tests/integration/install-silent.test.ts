import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {setupRepoForInstall} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * `install --silent` (version-manager-70i.14): --silent hides what install
 * SAYS, not what it DOES. installCommand() used to put the whole
 * script-installation block inside `if (!silent)`, so a silent install
 * installed the hooks and quietly added no package.json scripts at all.
 *
 * Each test runs a non-silent install and a silent one in two identical
 * fixtures and compares what each left in package.json. The non-silent result
 * is also pinned to an explicit list, so "the same" can never pass because
 * both installs added nothing.
 */

/** Two CLI subprocesses and real git per test; not fast. */
const TEST_TIMEOUT_MS = 60000;

type VersionMode = 'dynamic-file' | 'event-log' | 'package-json';

/** The four entry points every mode gets. */
const ENTRY_POINT_SCRIPTS: Record<string, string> = {
  'dynamic-version': 'npx @justinhaaheim/version-manager',
  'dynamic-version:generate': 'npx @justinhaaheim/version-manager',
  'dynamic-version:install': 'npx @justinhaaheim/version-manager install',
  'dynamic-version:install-scripts':
    'npx @justinhaaheim/version-manager install-scripts',
};

/** The lifecycle scripts only dynamic-file mode gets (70i.2, D12). */
const LIFECYCLE_SCRIPTS: Record<string, string> = {
  prebuild: 'npx @justinhaaheim/version-manager',
  predev: 'npx @justinhaaheim/version-manager',
  prepare: 'npx @justinhaaheim/version-manager --no-fail',
  prestart: 'npx @justinhaaheim/version-manager',
};

const EXPECTED_SCRIPTS: Record<VersionMode, Record<string, string>> = {
  'dynamic-file': {...ENTRY_POINT_SCRIPTS, ...LIFECYCLE_SCRIPTS},
  'event-log': ENTRY_POINT_SCRIPTS,
  'package-json': ENTRY_POINT_SCRIPTS,
};

/** package.json's scripts block, or null when it has none. */
function scriptsOf(repo: TestRepo): Record<string, string> | null {
  const scripts = (repo.readPackageJson() as {scripts?: Record<string, string>})
    .scripts;
  return scripts ?? null;
}

describe('install --silent (version-manager-70i.14)', () => {
  let loud: TestRepo;
  let quiet: TestRepo;

  beforeEach(() => {
    loud = new TestRepo();
    quiet = new TestRepo();
  });

  afterEach(() => {
    loud.cleanup();
    quiet.cleanup();
  });

  for (const mode of [
    'dynamic-file',
    'package-json',
    'event-log',
  ] as VersionMode[]) {
    test(
      `${mode}: a silent install adds the scripts a non-silent install adds, and prints nothing on stdout`,
      () => {
        setupRepoForInstall(loud, mode);
        setupRepoForInstall(quiet, mode);

        const loudResult = loud.runCli('install --non-interactive');
        const quietResult = quiet.runCli('install --silent --non-interactive');

        expect(loudResult.exitCode).toBe(0);
        expect(quietResult.exitCode).toBe(0);

        // Non-silent behaviour, pinned: the scripts it adds, and that it
        // still talks about them.
        expect(scriptsOf(loud)).toEqual(EXPECTED_SCRIPTS[mode]);
        expect(loudResult.stdout).toContain('Checking package.json scripts');

        // The bug: a silent install added no scripts at all.
        expect(scriptsOf(quiet)).toEqual(EXPECTED_SCRIPTS[mode]);

        // ...and silent still means silent.
        expect(quietResult.stdout).toBe('');
      },
      TEST_TIMEOUT_MS,
    );
  }

  test(
    'a silent install still preserves customised dynamic-version scripts without --force',
    () => {
      // Now that a silent install writes package.json, it must honour the
      // same "Preserving customizations" rule a non-silent install does.
      setupRepoForInstall(quiet, 'dynamic-file');
      const packageJson = quiet.readPackageJson();
      const customised = {'dynamic-version': 'echo my own generate step'};
      quiet.writeFile(
        'package.json',
        JSON.stringify({...packageJson, scripts: customised}, null, 2) + '\n',
      );

      const result = quiet.runCli('install --silent --non-interactive');

      expect(result.exitCode).toBe(0);
      expect(scriptsOf(quiet)).toEqual(customised);
      expect(result.stdout).toBe('');
    },
    TEST_TIMEOUT_MS,
  );

  test(
    'a silent install with --force replaces customised scripts, as a non-silent one does',
    () => {
      setupRepoForInstall(quiet, 'package-json');
      const packageJson = quiet.readPackageJson();
      quiet.writeFile(
        'package.json',
        JSON.stringify(
          {
            ...packageJson,
            scripts: {'dynamic-version': 'echo my own generate step'},
          },
          null,
          2,
        ) + '\n',
      );

      const result = quiet.runCli('install --silent --non-interactive --force');

      expect(result.exitCode).toBe(0);
      expect(scriptsOf(quiet)).toEqual(EXPECTED_SCRIPTS['package-json']);
      expect(result.stdout).toBe('');
    },
    TEST_TIMEOUT_MS,
  );
});
