import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {assertValidVersionJson} from '../helpers/assertions';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for migrating legacy runtimeVersion to new versions format
 */
describe('Config Migration', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('Legacy runtimeVersion migration', () => {
    test('migrates runtimeVersion to versions.runtime', () => {
      repo.initGit();
      repo.writeFile('README.md', '# Test Repo\n');
      repo.makeCommit('Initial commit');

      // Create package.json
      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            name: 'test-package',
            version: '1.0.0',
          },
          null,
          2,
        ) + '\n',
      );

      // Create OLD FORMAT version-manager.json with runtimeVersion
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '0.5.0',
            versionCalculationMode: 'add-to-patch',
          },
          null,
          2,
        ) + '\n',
      );
      repo.makeCommit('Add version config files');

      // Run CLI - should trigger migration
      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Check that version file was generated correctly
      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.versions.runtime).toBe('0.5.0');

      // Check that config file was migrated
      const config = JSON.parse(repo.readFile('version-manager.json'));
      expect(config.runtimeVersion).toBeUndefined();
      expect(config.versions).toBeDefined();
      expect(config.versions.runtime).toBe('0.5.0');
      expect(config.versionCalculationMode).toBe('add-to-patch');
    });

    test('does not modify config already in new format', () => {
      repo.initGit();
      repo.writeFile('README.md', '# Test Repo\n');
      repo.makeCommit('Initial commit');

      // Create package.json
      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            name: 'test-package',
            version: '1.0.0',
          },
          null,
          2,
        ) + '\n',
      );

      // Create NEW FORMAT version-manager.json
      const newFormatConfig = {
        versionCalculationMode: 'append-commits',
        versions: {
          runtime: '1.0.0',
        },
      };
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(newFormatConfig, null, 2) + '\n',
      );
      repo.makeCommit('Add version config files');

      // Get original file content
      const originalConfig = repo.readFile('version-manager.json');

      // Run CLI
      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Check that config file was NOT modified
      const newConfig = repo.readFile('version-manager.json');
      expect(newConfig).toBe(originalConfig);

      // Verify it still works correctly
      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.versions.runtime).toBe('1.0.0');
    });

    test('migrates config with no versions object', () => {
      repo.initGit();
      repo.writeFile('README.md', '# Test Repo\n');
      repo.makeCommit('Initial commit');

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-package', version: '2.0.0'}, null, 2) +
          '\n',
      );

      // Old format with runtimeVersion
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '1.5.0',
            versionCalculationMode: 'append-commits',
          },
          null,
          2,
        ) + '\n',
      );
      repo.makeCommit('Add config');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Verify migration
      const config = JSON.parse(repo.readFile('version-manager.json'));
      expect(config.versions).toBeDefined();
      expect(config.versions.runtime).toBe('1.5.0');
      expect(config.runtimeVersion).toBeUndefined();
    });

    test('migrates config with empty versions object', () => {
      repo.initGit();
      repo.writeFile('README.md', '# Test Repo\n');
      repo.makeCommit('Initial commit');

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-package', version: '2.0.0'}, null, 2) +
          '\n',
      );

      // Old format with runtimeVersion AND empty versions object
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '1.5.0',
            versionCalculationMode: 'append-commits',
            versions: {},
          },
          null,
          2,
        ) + '\n',
      );
      repo.makeCommit('Add config');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Verify migration
      const config = JSON.parse(repo.readFile('version-manager.json'));
      expect(config.versions).toBeDefined();
      expect(config.versions.runtime).toBe('1.5.0');
      expect(config.runtimeVersion).toBeUndefined();
    });

    test('preserves other custom versions during migration', () => {
      repo.initGit();
      repo.writeFile('README.md', '# Test Repo\n');
      repo.makeCommit('Initial commit');

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-package', version: '3.0.0'}, null, 2) +
          '\n',
      );

      // Old format with runtimeVersion but also has custom versions
      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '2.0.0',
            versionCalculationMode: 'add-to-patch',
            versions: {
              api: '1.0.0',
              schema: '0.5.0',
            },
          },
          null,
          2,
        ) + '\n',
      );
      repo.makeCommit('Add config');

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Verify migration preserved custom versions
      const config = JSON.parse(repo.readFile('version-manager.json'));
      expect(config.versions.runtime).toBe('2.0.0');
      expect(config.versions.api).toBe('1.0.0');
      expect(config.versions.schema).toBe('0.5.0');
      expect(config.runtimeVersion).toBeUndefined();
    });
  });
});
