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
 * Key concept: The tool tracks commits since the package.json version was last
 * changed (not git tags). The package.json is the source of truth for the base version.
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

      // Add package.json (now required)
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-package', version: '0.1.0'}, null, 2),
      );
      repo.makeCommit('Add package.json');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.baseVersion).toBe('0.1.0');
      expect(version.dynamicVersion).toBe('0.1.0');
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
      expect(version.dynamicVersion).toBe('0.1.0');
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
      assertAddToPatchFormat(version.dynamicVersion, '0.1.0', 5);
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
      assertAddToPatchFormat(version.dynamicVersion, '1.2.3', 5);
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
      assertAppendCommitsFormat(version.dynamicVersion, '0.1.0', 5);
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
      assertAppendCommitsFormat(version.dynamicVersion, '0.1.0', 0);
      expect(version.runtimeVersion).toBe('0.1.0');
    });
  });

  describe('Build number generation', () => {
    test('always generates a build number in iOS-compatible format', () => {
      setupRepoWithVersionConfig(repo);

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // Build number should always be present
      expect(version.buildNumber).toBeDefined();
      expect(typeof version.buildNumber).toBe('string');

      // Should match iOS-compatible format: YYYYMMDD.HHmmss.SS
      expect(version.buildNumber).toMatch(/^\d{8}\.\d{6}\.\d{2}$/);
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
      expect(version.dynamicVersion).toBe('0.1.5');
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
      assertSemver(version.dynamicVersion);
      assertSemver(version.runtimeVersion);
    });
  });

  describe('Uncommitted version changes', () => {
    test('treats uncommitted version bump as 0 commits (add-to-patch mode)', () => {
      // Set up repo with 5 commits after initial version
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '0.1.0',
        '0.1.0',
        'add-to-patch',
      );

      // Now modify package.json version in working tree (uncommitted)
      const packageJson = JSON.parse(repo.readFile('package.json'));
      packageJson.version = '0.2.0';
      repo.writeFile('package.json', JSON.stringify(packageJson, null, 2));

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // Should use the new version with 0 commits (not 0.2.5 from 5 commits)
      expect(version.baseVersion).toBe('0.2.0');
      expect(version.dynamicVersion).toBe('0.2.0');
      expect(version.dirty).toBe(true);
    });

    test('treats uncommitted version bump as 0 commits (append-commits mode)', () => {
      // Set up repo with 5 commits after initial version
      setupRepoWithCommitsAfterConfig(
        repo,
        5,
        '0.1.0',
        '0.1.0',
        'append-commits',
      );

      // Now modify package.json version in working tree (uncommitted)
      const packageJson = JSON.parse(repo.readFile('package.json'));
      packageJson.version = '0.2.0';
      repo.writeFile('package.json', JSON.stringify(packageJson, null, 2));

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);

      // Should use the new version with 0 commits (not 0.2.0+5)
      expect(version.baseVersion).toBe('0.2.0');
      expect(version.dynamicVersion).toBe('0.2.0');
      expect(version.dirty).toBe(true);
    });
  });
});
