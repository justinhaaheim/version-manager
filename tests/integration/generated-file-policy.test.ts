import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {
  activateHooks,
  setupPackageJsonModeRepo,
  setupRepoForInstall,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for version-manager-70i.2 / D12: in package-json mode the
 * tool produces NO dynamic-version.local.json.
 *
 * That file is the reason the mode exists. It is gitignored, so CI has to
 * regenerate it (which needs .git) and Expo EAS builds — which historically
 * packed the repo without .git — cannot produce it at all. package.json is
 * the whole deliverable in this mode.
 *
 * Every test here has a dynamic-file twin in the second describe block: the
 * change must be invisible outside package-json mode.
 */

const GENERATED_FILE_PATTERN = /dynamic-version\.local\.(json|d\.ts)$/;

/**
 * Every generated version file anywhere in the repo, as paths relative to it.
 *
 * .git and node_modules are skipped: neither is somewhere this tool writes,
 * and node_modules really does get materialised in these fixtures because the
 * pre-commit hook shells out to a package manager.
 */
function findGeneratedFiles(repo: TestRepo): string[] {
  const root = repo.getPath();
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (GENERATED_FILE_PATTERN.test(entry.name)) {
        found.push(path.relative(root, full));
      }
    }
  };

  walk(root);
  return found;
}

/** Husky hook files that invoke version-manager, by hook name. */
function hooksInvokingVersionManager(repo: TestRepo): string[] {
  const huskyDir = repo.getHuskyHooksDir();

  return fs
    .readdirSync(huskyDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name !== '.keep')
    .filter((entry) =>
      repo
        .readFile(path.join('.husky', entry.name))
        .includes('@justinhaaheim/version-manager'),
    )
    .map((entry) => entry.name)
    .sort();
}

describe('generated file policy (70i.2)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('package-json mode', () => {
    test('AC1: a hooked commit leaves no generated file anywhere, and package.json carries the bump', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');
      activateHooks(repo);

      repo.writeFile('a.txt', 'a\n');
      repo.runGit('add -A');
      expect(repo.runGit('commit -m "first"').exitCode).toBe(0);

      // The point of the mode: the version travels in package.json...
      expect(repo.readPackageJson().version).toBe('0.1.1');
      const committed = JSON.parse(
        repo.runGit('show HEAD:package.json').stdout,
      ) as {version: string};
      expect(committed.version).toBe('0.1.1');

      // ...and nothing else was produced, .d.ts included.
      expect(findGeneratedFiles(repo)).toEqual([]);
    }, 30000);

    test('AC2: the generate command writes no file and still prints the computed version', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      const result = repo.runCli('');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dynamic version: 0.1.0');
      // The 💾 marker claims a file was saved; nothing was.
      expect(result.stdout).not.toContain('💾');
      expect(findGeneratedFiles(repo)).toEqual([]);
    }, 30000);

    test('AC3: an explicit --output still writes that file', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      const result = repo.runCli('--output ./custom-version.json');

      expect(result.exitCode).toBe(0);
      expect(repo.fileExists('custom-version.json')).toBe(true);
      expect(repo.fileExists('custom-version.d.ts')).toBe(true);

      const written = JSON.parse(repo.readFile('custom-version.json')) as {
        dynamicVersion: string;
      };
      expect(written.dynamicVersion).toBe('0.1.0');

      // Only what was asked for: still no default generated file.
      expect(findGeneratedFiles(repo)).toEqual([]);
    }, 30000);

    test('AC3: the -o alias counts as explicit too', () => {
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      const result = repo.runCli('-o ./alias-version.json');

      expect(result.exitCode).toBe(0);
      expect(repo.fileExists('alias-version.json')).toBe(true);
    }, 30000);

    test('AC4: install writes a pre-commit hook and no post-* version-manager hooks', () => {
      setupRepoForInstall(repo, 'package-json');

      const result = repo.runCli('install --non-interactive');
      expect(result.exitCode).toBe(0);

      expect(repo.fileExists('.husky/pre-commit')).toBe(true);
      expect(repo.readFile('.husky/pre-commit')).toContain('--pre-commit');

      // Named individually so a failure says which hook came back...
      expect(repo.fileExists('.husky/post-commit')).toBe(false);
      expect(repo.fileExists('.husky/post-checkout')).toBe(false);
      expect(repo.fileExists('.husky/post-merge')).toBe(false);
      expect(repo.fileExists('.husky/post-rewrite')).toBe(false);

      // ...and swept as a whole, so a version-manager line appearing in some
      // other hook file cannot slip past the four names above.
      expect(hooksInvokingVersionManager(repo)).toEqual(['pre-commit']);
    }, 30000);

    test('AC5: install adds no generated-file lifecycle scripts and leaves .gitignore alone', () => {
      setupRepoForInstall(repo, 'package-json');

      const result = repo.runCli('install --non-interactive');
      expect(result.exitCode).toBe(0);

      const scripts = (
        repo.readPackageJson() as {scripts?: Record<string, string>}
      ).scripts;

      // The CLI entry points stay: they still do useful work in this mode.
      expect(scripts?.['dynamic-version:install']).toBeDefined();

      // The lifecycle scripts exist only to regenerate the file.
      expect(scripts?.prepare).toBeUndefined();
      expect(scripts?.prebuild).toBeUndefined();
      expect(scripts?.predev).toBeUndefined();
      expect(scripts?.prestart).toBeUndefined();

      // Nothing to ignore, so .gitignore is untouched and unmentioned.
      expect(repo.readFile('.gitignore')).toBe('node_modules/\n');
      expect(result.stdout).not.toContain('.gitignore');
    }, 30000);

    test('F4: bump does not announce a generated file this mode never writes', () => {
      // version-manager-70i.13 F4: bump printed '📝 Regenerating
      // dynamic-version.local.json...' unconditionally, then called a function
      // that writes nothing in this mode. The tool named a file it does not
      // produce.
      setupPackageJsonModeRepo(repo, '0.1.0', 'add-to-patch');

      const result = repo.runCli('bump --patch --non-interactive');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('Regenerating');
      expect(result.stdout).toContain('this mode writes no version file');
      expect(findGeneratedFiles(repo)).toEqual([]);
    }, 30000);
  });

  describe('dynamic-file mode (regression control)', () => {
    test('the generate command still writes the file and its .d.ts', () => {
      setupRepoForInstall(repo, 'dynamic-file');

      const result = repo.runCli('');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('💾');
      expect(findGeneratedFiles(repo).sort()).toEqual([
        'dynamic-version.local.d.ts',
        'dynamic-version.local.json',
      ]);
    }, 30000);

    test('install still writes all four post-* hooks and no pre-commit hook', () => {
      setupRepoForInstall(repo, 'dynamic-file');

      const result = repo.runCli('install --non-interactive');
      expect(result.exitCode).toBe(0);

      expect(hooksInvokingVersionManager(repo)).toEqual([
        'post-checkout',
        'post-commit',
        'post-merge',
        'post-rewrite',
      ]);
      expect(repo.fileExists('.husky/pre-commit')).toBe(false);
    }, 30000);

    test('install still adds the lifecycle scripts and the gitignore entries', () => {
      setupRepoForInstall(repo, 'dynamic-file');

      const result = repo.runCli('install --non-interactive');
      expect(result.exitCode).toBe(0);

      const scripts = (
        repo.readPackageJson() as {scripts?: Record<string, string>}
      ).scripts;

      expect(scripts?.prepare).toBeDefined();
      expect(scripts?.prebuild).toBeDefined();
      expect(scripts?.predev).toBeDefined();
      expect(scripts?.prestart).toBeDefined();

      const gitignore = repo.readFile('.gitignore');
      expect(gitignore).toContain('dynamic-version.local.json');
      expect(gitignore).toContain('dynamic-version.local.d.ts');
    }, 30000);

    test('F4 control: bump still announces the file this mode does write', () => {
      // The other half of the F4 fix: the wording dynamic-file mode prints is
      // deliberately unchanged, byte for byte.
      setupRepoForInstall(repo, 'dynamic-file');

      const result = repo.runCli('bump --patch --non-interactive');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        '📝 Regenerating dynamic-version.local.json...',
      );
    }, 30000);
  });
});
