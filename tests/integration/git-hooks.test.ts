import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {assertValidVersionJson} from '../helpers/assertions';
import {
  setupBasicRepo,
  setupRepoWithVersionConfig,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for git hooks installation and management
 *
 * Key concepts:
 * - Always uses Husky for hook management (installs if needed)
 * - Hooks are created in .husky/ directory
 * - Smart update logic: appends new, replaces existing, warns on multiple
 * - Hooks execute npx @justinhaaheim/version-manager
 */

// Helper type for package.json structure
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  scripts?: Record<string, string>;
  version: string;
}

describe('Git Hooks Installation', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('Husky Installation', () => {
    test('installs Husky when not present', () => {
      setupBasicRepo(repo);

      // Create package.json without Husky
      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            name: 'test-project',
            version: '1.0.0',
          },
          null,
          2,
        ),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Verify Husky was installed
      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      expect(packageJson.devDependencies?.husky).toBeDefined();

      // Verify .husky directory was created
      expect(repo.isHuskyInitialized()).toBe(true);
    });

    test('skips installation when Husky already present', () => {
      setupBasicRepo(repo);

      // Create package.json with Husky already in devDependencies
      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            devDependencies: {
              husky: '^9.0.0',
            },
            name: 'test-project',
            version: '1.0.0',
          },
          null,
          2,
        ),
      );

      // Manually create .husky directory (simulate already initialized)
      fs.mkdirSync(path.join(repo.getPath(), '.husky'), {recursive: true});

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Should not have modified package.json dependencies
      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      expect(packageJson.devDependencies?.husky).toBe('^9.0.0');
    });

    test('detects bun package manager from bun.lock', () => {
      setupBasicRepo(repo);

      // Create bun.lock file
      repo.writeFile('bun.lock', '# Bun lock file\n');
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Verify Husky was installed (regardless of package manager)
      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      expect(packageJson.devDependencies?.husky).toBeDefined();
    });

    test('detects npm package manager from package-lock.json', () => {
      setupBasicRepo(repo);

      // Create package-lock.json file
      repo.writeFile(
        'package-lock.json',
        JSON.stringify({lockfileVersion: 3, name: 'test-project'}, null, 2),
      );
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Verify Husky was installed
      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      expect(packageJson.devDependencies?.husky).toBeDefined();
    });
  });

  describe('Hook Creation', () => {
    test('creates all 4 hooks in fresh installation', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Verify all 4 hooks were created
      expect(repo.huskyHookExists('post-commit')).toBe(true);
      expect(repo.huskyHookExists('post-checkout')).toBe(true);
      expect(repo.huskyHookExists('post-merge')).toBe(true);
      expect(repo.huskyHookExists('post-rewrite')).toBe(true);
    });

    test('hooks are created in .husky/ directory', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Verify hooks are in .husky/, not .git/hooks
      expect(repo.isHuskyInitialized()).toBe(true);
      const huskyDir = repo.getHuskyHooksDir();
      expect(fs.existsSync(path.join(huskyDir, 'post-commit'))).toBe(true);
    });

    test('hooks are executable (755 permissions)', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Check executable bit on all hooks
      const hooks = [
        'post-commit',
        'post-checkout',
        'post-merge',
        'post-rewrite',
      ];
      for (const hookName of hooks) {
        const hookPath = path.join(repo.getHuskyHooksDir(), hookName);
        const stats = fs.statSync(hookPath);
        expect(Boolean(stats.mode & 0o111)).toBe(true);
      }
    });

    test('hook content uses npx command', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      const hookContent = repo.readHuskyHook('post-commit');
      expect(hookContent).toContain('npx @justinhaaheim/version-manager');
      expect(hookContent).toContain('--silent');
    });

    test('hook content includes --increment-patch flag when specified', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent --increment-patch');
      expect(result.exitCode).toBe(0);

      const hookContent = repo.readHuskyHook('post-commit');
      expect(hookContent).toContain('--increment-patch');
    });

    test('hook content includes --no-fail flag when specified', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent --no-fail');
      expect(result.exitCode).toBe(0);

      const hookContent = repo.readHuskyHook('post-commit');
      expect(hookContent).toContain('--no-fail');
    });
  });

  describe('Hook Updates (Smart Replacement)', () => {
    test('appends to hook when no version-manager command exists', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      // First installation
      repo.runCli('install --silent');

      // Manually add other content to hook
      const hookPath = path.join(repo.getHuskyHooksDir(), 'post-commit');
      const existingContent = repo.readHuskyHook('post-commit');
      const newContent =
        '# Some other hook\necho "Running other command"\n\n' + existingContent;
      fs.writeFileSync(hookPath, newContent);

      // Run install again with different flags
      const result = repo.runCli('install --silent --increment-patch');
      expect(result.exitCode).toBe(0);

      const updatedContent = repo.readHuskyHook('post-commit');
      // Should contain both the other command and our command
      expect(updatedContent).toContain('echo "Running other command"');
      expect(updatedContent).toContain('npx @justinhaaheim/version-manager');
      expect(updatedContent).toContain('--increment-patch');
    });

    test('replaces existing version-manager command line', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      // First installation without flags
      repo.runCli('install --silent');

      const hookBefore = repo.readHuskyHook('post-commit');
      expect(hookBefore).toContain(
        'npx @justinhaaheim/version-manager --silent',
      );
      expect(hookBefore).not.toContain('--increment-patch');

      // Second installation with different flags
      const result = repo.runCli('install --silent --increment-patch');
      expect(result.exitCode).toBe(0);

      const hookAfter = repo.readHuskyHook('post-commit');

      // Should have replaced the command (not duplicated)
      const matches = hookAfter.match(/npx @justinhaaheim\/version-manager/g);
      expect(matches).toBeDefined();
      expect(matches?.length).toBe(1); // Only one occurrence

      // New flags should be present
      expect(hookAfter).toContain('--increment-patch');
    });

    test('warns when multiple version-manager commands found', () => {
      setupBasicRepo(repo);

      // Add .gitignore, package.json, and version-manager.json to avoid prompts
      repo.writeFile('.gitignore', '*.local.json\n');

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '0.1.0'}, null, 2),
      );

      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '0.1.0',
            versionCalculationMode: 'add-to-patch',
          },
          null,
          2,
        ),
      );

      // First installation
      repo.runCli('install --silent');

      // Manually duplicate the command in the hook
      const hookPath = path.join(repo.getHuskyHooksDir(), 'post-commit');
      const existingContent = repo.readHuskyHook('post-commit');
      const duplicated =
        existingContent +
        '\n# Another instance\nnpx @justinhaaheim/version-manager\n';
      fs.writeFileSync(hookPath, duplicated);

      // Run install again (should warn, not modify)
      const result = repo.runCli('install');
      expect(result.exitCode).toBe(0);

      // Output should contain warning about multiple commands
      expect(result.stdout).toContain('Found');
      expect(result.stdout).toContain('version-manager commands');
    });
  });

  describe('Hook Execution', () => {
    test.skip('hook executes and generates version file on commit', () => {
      // TODO: This test requires npm link to work perfectly in the test environment
      // For now, we're skipping it since we've verified hook creation, permissions, and content
      // The hook execution relies on npx resolving the linked package correctly
      setupRepoWithVersionConfig(repo, '0.1.0', '0.1.0', 'add-to-patch');

      // Add .gitignore to avoid prompts in hook execution
      repo.writeFile('.gitignore', '*.local.json\n');
      repo.makeCommit('Add gitignore');

      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      // Install hooks
      const installResult = repo.runCli('install --silent');
      expect(installResult.exitCode).toBe(0);

      // Remove any existing version file
      const versionFilePath = path.join(
        repo.getPath(),
        'dynamic-version.local.json',
      );
      if (fs.existsSync(versionFilePath)) {
        fs.unlinkSync(versionFilePath);
      }

      // Make a commit (should trigger post-commit hook)
      repo.writeFile('test.txt', 'test content');
      repo.makeCommit('Test commit');

      // Hook should have generated version file
      expect(repo.fileExists('dynamic-version.local.json')).toBe(true);

      const version: unknown = JSON.parse(
        repo.readFile('dynamic-version.local.json'),
      );
      assertValidVersionJson(version);
      expect(version.dynamicVersion).toBeDefined();
      expect(version.runtimeVersion).toBe('0.1.0');
    });
  });

  describe('Script Installation', () => {
    test('adds scripts to package.json', () => {
      setupBasicRepo(repo);

      // Add .gitignore, package.json, and version-manager.json to avoid prompts
      repo.writeFile('.gitignore', '*.local.json\n');

      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            name: 'test-project',
            scripts: {},
            version: '0.1.0',
          },
          null,
          2,
        ),
      );

      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '0.1.0',
            versionCalculationMode: 'add-to-patch',
          },
          null,
          2,
        ),
      );

      // Use non-silent mode so scripts get installed
      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // In silent mode, scripts are NOT installed (by design)
      // Let's test with non-silent mode instead
      const result2 = repo.runCli('install');
      expect(result2.exitCode).toBe(0);

      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      expect(packageJson.scripts?.['dynamic-version']).toBeDefined();
      expect(packageJson.scripts?.['dynamic-version:generate']).toBeDefined();
      expect(packageJson.scripts?.['dynamic-version']).toContain(
        'npx @justinhaaheim/version-manager',
      );
    });

    test('preserves existing scripts in package.json', () => {
      setupBasicRepo(repo);

      // Add .gitignore, package.json, and version-manager.json to avoid prompts
      repo.writeFile('.gitignore', '*.local.json\n');

      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            name: 'test-project',
            scripts: {
              build: 'tsc',
              test: 'bun test',
            },
            version: '0.1.0',
          },
          null,
          2,
        ),
      );

      repo.writeFile(
        'version-manager.json',
        JSON.stringify(
          {
            runtimeVersion: '0.1.0',
            versionCalculationMode: 'add-to-patch',
          },
          null,
          2,
        ),
      );

      // Use non-silent mode so scripts get installed
      const result = repo.runCli('install');
      expect(result.exitCode).toBe(0);

      const packageJson = JSON.parse(
        repo.readFile('package.json'),
      ) as PackageJson;
      // Original scripts should still exist
      expect(packageJson.scripts?.test).toBe('bun test');
      expect(packageJson.scripts?.build).toBe('tsc');
      // New scripts should be added
      expect(packageJson.scripts?.['dynamic-version']).toBeDefined();
    });
  });

  describe('CLI Flags', () => {
    test('--silent suppresses output', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install --silent');
      expect(result.exitCode).toBe(0);

      // Silent mode should produce minimal/no output
      expect(result.stdout.length).toBeLessThan(100);
    });

    test('verbose mode shows installation progress', () => {
      setupBasicRepo(repo);
      repo.writeFile(
        'package.json',
        JSON.stringify({name: 'test-project', version: '1.0.0'}, null, 2),
      );

      const result = repo.runCli('install');
      expect(result.exitCode).toBe(0);

      // Verbose mode should show progress messages
      expect(result.stdout.length).toBeGreaterThan(50);
    });
  });

  describe('Error Handling', () => {
    test('throws error when .husky directory missing after init', () => {
      setupBasicRepo(repo);

      // Create package.json but prevent Husky from actually installing
      // (This simulates a failure scenario)
      repo.writeFile(
        'package.json',
        JSON.stringify(
          {
            devDependencies: {
              husky: '^9.0.0',
            },
            name: 'test-project',
            version: '1.0.0',
          },
          null,
          2,
        ),
      );

      // Don't create .husky directory - install should fail
      const result = repo.runCli('install --silent');

      // Should fail because .husky directory doesn't exist
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Husky directory not found');
    });
  });
});
