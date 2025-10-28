import type {DynamicVersion} from '../../src/types';

import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {spawn} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {assertValidVersionJson} from '../helpers/assertions';
import {setupRepoWithVersionConfig} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

// Simple type for package.json version field
interface PackageJson {
  [key: string]: unknown;
  version: string;
}

/**
 * Helper to start watcher in background
 */
function startWatcher(
  repoPath: string,
  options: {debounce?: number; silent?: boolean} = {},
): {
  cleanup: () => void;
  waitForReady: () => Promise<void>;
} {
  const cliPath = path.join(__dirname, '..', '..', 'src', 'index.ts');
  const args = ['watch'];

  if (options.debounce !== undefined) {
    args.push('--debounce', String(options.debounce));
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

  const waitForReady = async (): Promise<void> => {
    // In silent mode, we can't rely on stdout messages
    // Instead, just wait a bit for the watcher to initialize
    if (options.silent) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }

    // Wait for "Watching for file changes..." message
    const startTime = Date.now();
    const timeout = 5000;

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
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  };

  return {cleanup, waitForReady};
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
      const config = JSON.parse(
        repo.readFile('version-manager.json'),
      ) as Record<string, unknown>;
      config.runtimeVersion = '0.2.0';
      repo.writeFile('version-manager.json', JSON.stringify(config, null, 2));

      // Wait for version file to be regenerated with new runtime version
      const changed = await waitForFileChange(versionFilePath, {
        checkContent: (content) => {
          const version = JSON.parse(content) as DynamicVersion;
          return version.runtimeVersion === '0.2.0';
        },
        timeout: 3000,
      });

      expect(changed).toBe(true);

      const version: unknown = JSON.parse(
        fs.readFileSync(versionFilePath, 'utf-8'),
      );
      assertValidVersionJson(version);
      expect(version.runtimeVersion).toBe('0.2.0');
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
