import type {DynamicVersion} from '../../src/types';

import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {spawn} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {generateFileBasedVersion} from '../../src/version-generator';
import {readVersion} from '../../src/version-reader';
import {assertValidVersionJson} from '../helpers/assertions';
import {inDirectory} from '../helpers/in-directory';
import {
  activateHooks,
  setupEventLogModeRepo,
  setupPackageJsonModeRepo,
  setupRepoWithVersionConfig,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

// Simple type for package.json version field
interface PackageJson {
  [key: string]: unknown;
  version: string;
}

/**
 * How the watcher process ended, or null if it was still running when the
 * wait gave up. A null here is "did not exit", never "exited 0".
 */
interface WatcherExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * Helper to start watcher in background
 */
function startWatcher(
  repoPath: string,
  options: {debounce?: number; output?: string; silent?: boolean} = {},
): {
  cleanup: () => void;
  getStderr: () => string;
  getStdout: () => string;
  waitForExit: (timeoutMs: number) => Promise<WatcherExit | null>;
  waitForReady: (timeoutMs?: number) => Promise<void>;
} {
  const cliPath = path.join(__dirname, '..', '..', 'src', 'index.ts');
  const args = ['watch'];

  if (options.debounce !== undefined) {
    args.push('--debounce', String(options.debounce));
  }

  if (options.output !== undefined) {
    args.push('--output', options.output);
  }

  if (options.silent) {
    args.push('--silent');
  }

  const proc = spawn('bun', [cliPath, ...args], {
    cwd: repoPath,
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_AUTHOR_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  proc.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  proc.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  let exit: WatcherExit | null = null;
  const exited = new Promise<WatcherExit>((resolve) => {
    proc.on('exit', (code, signal) => {
      exit = {code, signal};
      resolve(exit);
    });
  });

  const waitForExit = async (
    timeoutMs: number,
  ): Promise<WatcherExit | null> => {
    const timedOut = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    return await Promise.race([exited, timedOut]);
  };

  const waitForReady = async (timeout = 5000): Promise<void> => {
    // In silent mode, we can't rely on stdout messages
    // Instead, just wait a bit for the watcher to initialize
    if (options.silent) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }

    // Wait for "Watching for file changes..." message
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (stdout.includes('Watching for file changes')) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(
      `Watcher did not start within ${timeout}ms. stdout: ${stdout}, stderr: ${stderr}`,
    );
  };

  const cleanup = (): void => {
    if (!proc.killed && exit === null) {
      proc.kill('SIGTERM');
    }
  };

  return {
    cleanup,
    getStderr: () => stderr,
    getStdout: () => stdout,
    waitForExit,
    waitForReady,
  };
}

/**
 * Helper to wait for file to exist or change
 */
async function waitForFileChange(
  filePath: string,
  options: {
    checkContent?: (content: string) => boolean;
    timeout?: number;
  } = {},
): Promise<boolean> {
  const {timeout = 5000, checkContent} = options;
  const startTime = Date.now();
  let lastContent = '';

  if (fs.existsSync(filePath)) {
    lastContent = fs.readFileSync(filePath, 'utf-8');
  }

  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) {
      const currentContent = fs.readFileSync(filePath, 'utf-8');

      if (checkContent) {
        if (checkContent(currentContent)) {
          return true;
        }
      } else if (currentContent !== lastContent) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Integration tests for watch command
 */
describe('Watch Command', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test('starts watcher and watches for file changes', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file (watcher doesn't generate on startup)
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    // Start watcher
    const watcher = startWatcher(repo.getPath(), {debounce: 500, silent: true});

    try {
      await watcher.waitForReady();

      // Modify package.json to trigger regeneration
      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      packageJson.version = '0.2.0';
      repo.writeFile('package.json', JSON.stringify(packageJson, null, 2));

      // Wait for version file to be regenerated
      const changed = await waitForFileChange(versionFilePath, {
        checkContent: (content) => {
          const version = JSON.parse(content) as DynamicVersion;
          return version.baseVersion === '0.2.0';
        },
        timeout: 5000,
      });

      expect(changed).toBe(true);

      const newVersion: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(newVersion);
      expect(newVersion.baseVersion).toBe('0.2.0');
      expect(newVersion.dynamicVersion).toBe('0.2.0');
    } finally {
      watcher.cleanup();
    }
  }, 15000); // Increased timeout for watcher tests

  test('debounces rapid file changes', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    // Start watcher with short debounce
    const watcher = startWatcher(repo.getPath(), {
      debounce: 1000,
      silent: true,
    });

    try {
      await watcher.waitForReady();

      const initialModTime = fs.statSync(versionFilePath).mtime;

      // Make multiple rapid changes
      for (let i = 0; i < 5; i++) {
        repo.writeFile(`test-file-${i}.txt`, `content ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Wait for debounce period + some buffer
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Version file should have been regenerated only once
      const finalModTime = fs.statSync(versionFilePath).mtime;
      expect(finalModTime.getTime()).toBeGreaterThan(initialModTime.getTime());

      // Verify version file is still valid
      const version: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(version);
    } finally {
      watcher.cleanup();
    }
  }, 15000);

  test('respects .gitignore patterns', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

    // Add .gitignore
    repo.writeFile('.gitignore', '*.log\nnode_modules/\nbuild/\n');
    repo.makeCommit('Add gitignore');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    const watcher = startWatcher(repo.getPath(), {debounce: 500, silent: true});

    try {
      await watcher.waitForReady();

      const initialModTime = fs.statSync(versionFilePath).mtime;

      // Create ignored file
      repo.writeFile('test.log', 'should be ignored');

      // Wait to ensure watcher would have triggered if it was going to
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Version file should NOT have been regenerated
      const finalModTime = fs.statSync(versionFilePath).mtime;
      expect(finalModTime.getTime()).toBe(initialModTime.getTime());

      // Now create a non-ignored file
      repo.writeFile('test.txt', 'not ignored');

      // Wait for version file to be regenerated
      const changed = await waitForFileChange(versionFilePath, {
        timeout: 3000,
      });

      expect(changed).toBe(true);
    } finally {
      watcher.cleanup();
    }
  }, 15000);

  test('watches git state changes (commits)', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'append-commits');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    const watcher = startWatcher(repo.getPath(), {debounce: 500, silent: true});

    try {
      await watcher.waitForReady();

      // Make a commit
      repo.writeFile('new-file.txt', 'test content');
      repo.makeCommit('Add new file');

      // Wait for version file to be regenerated with new commit count
      const changed = await waitForFileChange(versionFilePath, {
        checkContent: (content) => {
          const version = JSON.parse(content) as DynamicVersion;
          // Should be 0.1.0+1 (one commit after config)
          return version.dynamicVersion === '0.1.0+1';
        },
        timeout: 3000,
      });

      expect(changed).toBe(true);

      const version: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(version);
      expect(version.dynamicVersion).toBe('0.1.0+1');
    } finally {
      watcher.cleanup();
    }
  }, 15000);

  test('watches version-manager.json changes', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    const watcher = startWatcher(repo.getPath(), {debounce: 500, silent: true});

    try {
      await watcher.waitForReady();

      // Update runtime version in config
      const config = JSON.parse(repo.readFile('version-manager.json')) as {
        versions: Record<string, string>;
      };
      config.versions.runtime = '0.2.0';
      repo.writeFile('version-manager.json', JSON.stringify(config, null, 2));

      // Wait for version file to be regenerated with new runtime version
      const changed = await waitForFileChange(versionFilePath, {
        checkContent: (content) => {
          const version = JSON.parse(content) as DynamicVersion;
          return version.versions.runtime === '0.2.0';
        },
        timeout: 3000,
      });

      expect(changed).toBe(true);

      const version: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(version);
      expect(version.versions.runtime).toBe('0.2.0');
    } finally {
      watcher.cleanup();
    }
  }, 15000);

  test('does not regenerate when content is unchanged', async () => {
    setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

    const versionFilePath = path.join(
      repo.getPath(),
      'dynamic-version.local.json',
    );

    // Generate initial version file
    repo.runCli('--silent');
    expect(fs.existsSync(versionFilePath)).toBe(true);

    const watcher = startWatcher(repo.getPath(), {debounce: 500, silent: true});

    try {
      await watcher.waitForReady();

      const initialContent = fs.readFileSync(versionFilePath, 'utf-8');
      const _initialModTime = fs.statSync(versionFilePath).mtime;

      // Make a change that doesn't affect version
      repo.writeFile('random-file.txt', 'random content');

      // Wait for debounce period
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Version file content should be the same (or not changed if truly identical)
      const finalContent = fs.readFileSync(versionFilePath, 'utf-8');
      const _finalModTime = fs.statSync(versionFilePath).mtime;

      // Content should be identical (same version)
      const initialVersion = JSON.parse(initialContent) as DynamicVersion;
      const finalVersion = JSON.parse(finalContent) as DynamicVersion;
      expect(finalVersion.dynamicVersion).toBe(initialVersion.dynamicVersion);
      expect(finalVersion.baseVersion).toBe(initialVersion.baseVersion);
    } finally {
      watcher.cleanup();
    }
  }, 15000);
});

/** Per-test timeout for the tests below: real git, and a watcher subprocess. */
const MODE_TEST_TIMEOUT_MS = 30000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until `predicate()` holds.
 *
 * @returns true once it held, false if `timeoutMs` passed first
 */
async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await sleep(100);
  }

  return predicate();
}

/**
 * The watcher in the modes that have no generated file
 * (version-manager-70i.11). Before that bead it wrote dynamic-version.local.json
 * in every mode, and in event-log mode it wrote a number measured from
 * package.json's history rather than from version.jsonl.
 */
describe('Watch Command in modes with no generated file (version-manager-70i.11)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  /**
   * AC1: no --output, so the watcher must say where the version lives, write
   * nothing, and exit 0 without watching.
   */
  async function expectWatcherToDecline(
    versionMode: 'event-log' | 'package-json',
    whereTheVersionLives: string,
  ): Promise<void> {
    const watcher = startWatcher(repo.getPath(), {debounce: 200});

    try {
      const exit = await watcher.waitForExit(10000);

      // Give a watcher that DID start something to regenerate for, and the
      // time to do it. Without this, "no file" would hold for any watcher,
      // running or not, because chokidar ignores its initial scan.
      repo.writeFile('poke.txt', 'poke\n');
      await sleep(1500);

      // The harm first: no generated file in a mode that has none.
      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);

      // Then: it exited by itself, with 0, rather than waiting forever.
      expect(exit).toEqual({code: 0, signal: null});

      // Then: ONE message, naming the mode, where the version lives, and how
      // to force a file.
      const stdout = watcher.getStdout();
      expect(stdout).toContain(
        `Not watching: versionMode is "${versionMode}", which writes no dynamic-version.local.json.`,
      );
      expect(stdout).toContain(whereTheVersionLives);
      expect(stdout).toContain('Pass --output <path>');
      expect(stdout).not.toContain('Starting file watcher');
      expect(stdout).not.toContain('Watching for file changes');
    } finally {
      watcher.cleanup();
    }
  }

  test(
    'package-json mode, no --output: writes nothing, says where the version lives, exits 0',
    async () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      await expectWatcherToDecline(
        'package-json',
        'The version lives in the committed "version" field of package.json.',
      );
    },
    MODE_TEST_TIMEOUT_MS,
  );

  test(
    'event-log mode, no --output: writes nothing, says where the version lives, exits 0',
    async () => {
      setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');

      await expectWatcherToDecline(
        'event-log',
        'The version is derived from version.jsonl: read it with readVersion() from @justinhaaheim/version-manager/version-reader.',
      );
    },
    MODE_TEST_TIMEOUT_MS,
  );

  test(
    '--silent suppresses that message, and the watcher still exits 0',
    async () => {
      setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');

      const watcher = startWatcher(repo.getPath(), {silent: true});

      try {
        const exit = await watcher.waitForExit(10000);

        expect(exit).toEqual({code: 0, signal: null});
        expect(watcher.getStdout()).toBe('');
        expect(watcher.getStderr()).not.toContain('Not watching');
      } finally {
        watcher.cleanup();
      }
    },
    MODE_TEST_TIMEOUT_MS,
  );

  test(
    'event-log mode WITH --output: writes the version readVersion() derives, not the package.json-history count',
    async () => {
      setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      // Two hooked commits: two commit events in version.jsonl.
      for (const index of [1, 2]) {
        repo.writeFile(`file-${index}.txt`, `${index}\n`);
        repo.makeCommit(`commit ${index}`);
      }

      // One commit the hook never saw. git counts it and the log does not,
      // which is what makes the two derivations disagree here.
      repo.writeFile('unhooked.txt', 'unhooked\n');
      repo.runGit('add -A');
      expect(repo.runGit('commit --no-verify -m "unhooked"').exitCode).toBe(0);

      // Guard against a vacuous pass: if the fixture ever stops separating
      // the two numbers, this test could not tell them apart.
      const fromPackageJsonHistory = await inDirectory(repo.getPath(), () =>
        generateFileBasedVersion('cli'),
      );
      expect(fromPackageJsonHistory.versionData.dynamicVersion).toBe('0.1.3');
      expect(readVersion(repo.getPath()).version).toBe('0.1.2');

      const outputPath = path.join(repo.getPath(), 'watched.local.json');
      const watcher = startWatcher(repo.getPath(), {
        debounce: 300,
        output: 'watched.local.json',
      });

      try {
        await watcher.waitForReady(15000);

        // chokidar ignores its initial scan, so nothing is written until
        // something changes.
        repo.writeFile('poke.txt', 'poke\n');

        const written = await waitUntil(() => fs.existsSync(outputPath), 10000);
        expect(written).toBe(true);

        const version: unknown = JSON.parse(
          fs.readFileSync(outputPath, 'utf-8'),
        );
        assertValidVersionJson(version);

        // AC2, measured in the same repo after the write. branchSuffix is
        // off (the default), so the two are directly comparable.
        expect(version.dynamicVersion).toBe(
          readVersion(repo.getPath()).version,
        );
        expect(version.dynamicVersion).toBe('0.1.2');

        // The explicit path is the only file written.
        expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
      } finally {
        watcher.cleanup();
      }
    },
    MODE_TEST_TIMEOUT_MS,
  );

  test(
    'the mode is re-read on every regeneration: switching to event-log mid-watch writes nothing and says so',
    async () => {
      setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

      const versionFilePath = path.join(
        repo.getPath(),
        'dynamic-version.local.json',
      );

      // dynamic-file mode (the default): the file exists before the watch.
      repo.runCli('--silent');
      const before = fs.readFileSync(versionFilePath, 'utf-8');

      const watcher = startWatcher(repo.getPath(), {debounce: 300});

      try {
        await watcher.waitForReady(15000);

        // version-manager.json is itself watched, so this edit is both the
        // mode change and the trigger.
        const config = JSON.parse(repo.readFile('version-manager.json')) as {
          versionMode?: string;
        };
        config.versionMode = 'event-log';
        repo.writeFile('version-manager.json', JSON.stringify(config, null, 2));

        const said = await waitUntil(
          () => watcher.getStdout().includes('Nothing written'),
          8000,
        );

        // Every dynamic-file write carries a fresh timestamp, so any write at
        // all would change these bytes.
        expect(fs.readFileSync(versionFilePath, 'utf-8')).toBe(before);
        expect(said).toBe(true);
        expect(watcher.getStdout()).toContain(
          'versionMode is "event-log", which writes no dynamic-version.local.json.',
        );
      } finally {
        watcher.cleanup();
      }
    },
    MODE_TEST_TIMEOUT_MS,
  );
});
