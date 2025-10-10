import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {
  assertAddToPatchFormat,
  assertAppendCommitsFormat,
  assertSemver,
  assertValidVersionJson,
} from '../helpers/assertions';
import {
  setupBasicRepo,
  setupRepoWithCommitsAfterConfig,
  setupRepoWithVersionConfig,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for version generation functionality
 *
 * Key concept: The tool tracks commits since codeVersionBase was last
 * changed in the COMMITTED version-manager.json file (not git tags).
 */
describe('Version Generation', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('Without config file', () => {
    test('generates default version for repo without version-manager.json', () => {
      setupBasicRepo(repo);

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.codeVersion).toBe('0.1.0');
      expect(version.runtimeVersion).toBe('0.1.0');
    });
  });

  describe('With config file (add-to-patch mode)', () => {
    test('returns base version when config just committed (0 commits since)', () => {
      setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.codeVersion).toBe('0.1.0');
      expect(version.runtimeVersion).toBe('0.1.0');
    });

    test('adds commits to patch version (5 commits after config)', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '0.1.0',
        '0.1.0',
        'add-to-patch',
      );

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // With add-to-patch mode, 5 commits after base 0.1.0 → 0.1.5
      assertAddToPatchFormat(version.codeVersion, '0.1.0', 5);
      expect(version.runtimeVersion).toBe('0.1.0');
    });

    test('works with custom base version', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '1.2.3',
        '1.0.0',
        'add-to-patch',
      );

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // 5 commits after 1.2.3 → 1.2.8
      assertAddToPatchFormat(version.codeVersion, '1.2.3', 5);
      expect(version.runtimeVersion).toBe('1.0.0');
    });
  });

  describe('With config file (append-commits mode)', () => {
    test('appends commit count to base version', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '0.1.0',
        '0.1.0',
        'append-commits',
      );

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // With append-commits mode, 5 commits after 0.1.0 → 0.1.0+5
      assertAppendCommitsFormat(version.codeVersion, '0.1.0', 5);
      expect(version.runtimeVersion).toBe('0.1.0');
    });

    test('returns base version when no commits after config', () => {
      setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'append-commits');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      assertAppendCommitsFormat(version.codeVersion, '0.1.0', 0);
      expect(version.runtimeVersion).toBe('0.1.0');
    });
  });

  describe('Build number from environment', () => {
    test('includes BUILD_NUMBER from env variable', () => {
      setupRepoWithVersionConfig(repo);

      // Set environment variable before running CLI
      const originalEnv = process.env.BUILD_NUMBER;
      process.env.BUILD_NUMBER = '42';

      try {
        const result = repo.runCli('--silent');
        expect(result.exitCode).toBe(0);

        const version: unknown = JSON.parse(
          repo.readFile('dynamic-version.local.json'),
        );
        assertValidVersionJson(version);
        expect(version.buildNumber).toBe('42');
      } finally {
        // Restore original env
        if (originalEnv !== undefined) {
          process.env.BUILD_NUMBER = originalEnv;
        } else {
          delete process.env.BUILD_NUMBER;
        }
      }
    });

    test('omits buildNumber when env variable not set', () => {
      setupRepoWithVersionConfig(repo);

      // Ensure BUILD_NUMBER is not set
      delete process.env.BUILD_NUMBER;

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.buildNumber).toBeUndefined();
    });
  });

  describe('Output file options', () => {
    test('respects --output flag for custom file path', () => {
      setupRepoWithVersionConfig(repo);

      const result = repo.runCli('--output custom.json --silent');
      expect(result.exitCode).toBe(0);

      expect(repo.fileExists('custom.json')).toBe(true);
      expect(repo.fileExists('dynamic-version.local.json')).toBe(false);

      const version: unknown = JSON.parse(repo.readFile('custom.json'));
      assertValidVersionJson(version);
    });
  });

  describe('Runtime version handling', () => {
    test('runtime version always matches config (does not increment)', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '0.1.0',
        '0.1.0',
        'add-to-patch',
      );

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // Code version changes with commits, but runtime stays at config value
      expect(version.codeVersion).toBe('0.1.5');
      expect(version.runtimeVersion).toBe('0.1.0');
    });
  });

  describe('Semantic versioning format', () => {
    test('generated versions are valid semver', () => {
      setupRepoWithVersionConfig(repo);

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // Should be valid semver format
      assertSemver(version.codeVersion);
      assertSemver(version.runtimeVersion);
    });
  });
});
