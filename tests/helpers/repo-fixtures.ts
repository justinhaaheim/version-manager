import type {TestRepo} from './test-repo';

import * as fs from 'fs';
import * as path from 'path';

/**
 * Helper functions to set up common test repository scenarios
 */

/**
 * The branchSuffix block to write into a fixture's version-manager.json.
 *
 * `mainBranches` is deliberately optional so tests can write a PARTIAL object
 * and prove that the schema still supplies the default list.
 */
export interface BranchSuffixFixtureConfig {
  enabled: boolean;
  mainBranches?: string[];
}

/**
 * Set up a repo in the default `versionMode: 'dynamic-file'`, with package.json
 * and version-manager.json committed and no git hooks installed. The CLI is
 * invoked explicitly by the test, which is how dynamic-file mode is exercised
 * without the hook machinery.
 */
export function setupDynamicFileModeRepo(
  repo: TestRepo,
  packageVersion = '0.1.0',
  versionCalculationMode: 'add-to-patch' | 'append-commits' = 'add-to-patch',
  branchSuffix?: BranchSuffixFixtureConfig,
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  repo.writeFile(
    'package.json',
    JSON.stringify({name: 'test-package', version: packageVersion}, null, 2) +
      '\n',
  );

  repo.writeFile(
    'version-manager.json',
    JSON.stringify(
      {
        ...(branchSuffix === undefined ? {} : {branchSuffix}),
        versionCalculationMode,
        versionMode: 'dynamic-file',
        versions: {},
      },
      null,
      2,
    ) + '\n',
  );
  repo.writeFile('.gitignore', '*.local.json\n*.local.d.ts\n');
  repo.makeCommit('Add version config files');
}

/**
 * Set up a fresh repo with no version-manager.json
 */
export function setupBasicRepo(repo: TestRepo): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');
}

/**
 * Set up a repo with package.json and version-manager.json committed
 */
export function setupRepoWithVersionConfig(
  repo: TestRepo,
  packageVersion = '0.1.0',
  runtimeVersion = '0.1.0',
  versionCalculationMode: 'add-to-patch' | 'append-commits' = 'add-to-patch',
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  // Commit package.json with version
  repo.writeFile(
    'package.json',
    JSON.stringify(
      {
        name: 'test-package',
        version: packageVersion,
      },
      null,
      2,
    ) + '\n',
  );

  // Commit version-manager.json
  repo.writeFile(
    'version-manager.json',
    JSON.stringify(
      {
        versionCalculationMode,
        versions: {
          runtime: runtimeVersion,
        },
      },
      null,
      2,
    ) + '\n',
  );
  repo.makeCommit('Add version config files');
}

/**
 * Set up a repo with package.json and N commits after it
 * This simulates the real workflow: commit config, then make changes
 */
export function setupRepoWithCommitsAfterConfig(
  repo: TestRepo,
  commitCount: number,
  packageVersion = '0.1.0',
  runtimeVersion = '0.1.0',
  versionCalculationMode: 'add-to-patch' | 'append-commits' = 'add-to-patch',
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  // Commit package.json with version (this is what the tool tracks from)
  repo.writeFile(
    'package.json',
    JSON.stringify(
      {
        name: 'test-package',
        version: packageVersion,
      },
      null,
      2,
    ) + '\n',
  );

  // Commit version-manager.json
  repo.writeFile(
    'version-manager.json',
    JSON.stringify(
      {
        versionCalculationMode,
        versions: {
          runtime: runtimeVersion,
        },
      },
      null,
      2,
    ) + '\n',
  );
  repo.makeCommit('Add version config files');

  // Add N commits AFTER package.json version was committed
  for (let i = 1; i <= commitCount; i++) {
    repo.writeFile(`file${i}.txt`, `Content ${i}\n`);
    repo.makeCommit(`Add file ${i}`);
  }
}

/**
 * Set up a repo configured for `versionMode: 'package-json'`, with working
 * git hooks wired to the local source tree.
 *
 * Two accommodations are made so the test never touches the network:
 *
 * 1. `husky` is declared in devDependencies and `.husky/` is pre-created, so
 *    `ensureHuskyInstalled()` short-circuits instead of shelling out to
 *    `npm install --save-dev husky`.
 * 2. `core.hooksPath` is pointed at `.husky/` directly rather than at husky's
 *    `_` shim directory, and a shebang is prepended to each generated hook.
 *    This runs the generated hook *command* under real git, which is what we
 *    are testing; husky's own dispatch shim is out of scope.
 *
 * The generated hooks invoke `npx @justinhaaheim/version-manager`, which will
 * not resolve inside a temp fixture, so that prefix is rewritten to run this
 * repo's `src/index.ts` under bun.
 */
export function setupPackageJsonModeRepo(
  repo: TestRepo,
  packageVersion = '0.1.0',
  versionCalculationMode: 'add-to-patch' | 'append-commits' = 'add-to-patch',
  branchSuffix?: BranchSuffixFixtureConfig,
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  repo.writeFile(
    'package.json',
    JSON.stringify(
      {
        devDependencies: {husky: '^9.1.7'},
        name: 'test-package',
        version: packageVersion,
      },
      null,
      2,
    ) + '\n',
  );

  repo.writeFile(
    'version-manager.json',
    JSON.stringify(
      {
        ...(branchSuffix === undefined ? {} : {branchSuffix}),
        versionCalculationMode,
        versionMode: 'package-json',
        versions: {},
      },
      null,
      2,
    ) + '\n',
  );
  // node_modules/ is ignored as insurance. The pre-commit hook no longer
  // shells out to `npm install` / `bun install` (70i.5 deleted that), so
  // nothing here should materialise it any more — but a fixture that commits
  // `git add -A` has no defence if something ever does, and the resulting
  // failures are baffling. The package-manager test in
  // tests/integration/package-json-mode.test.ts asserts the directory's
  // absence, so this entry hides nothing that test is watching for.
  repo.writeFile('.gitignore', '*.local.json\n*.local.d.ts\nnode_modules/\n');
  repo.makeCommit('Add version config files');
}

/**
 * Set up a repo in either versionMode that is ready for a real `install` run
 * with no network access and nothing suppressed.
 *
 * Differences from the two fixtures above, both of which matter to what
 * `install` does (version-manager-70i.2):
 *
 * 1. `.gitignore` is left UNTRACKED and carries only `node_modules/`, because
 *    ensureGitignoreEntries() refuses to touch a tracked .gitignore. A
 *    committed .gitignore would make install's gitignore behaviour
 *    unobservable — it would be skipped in both modes for the wrong reason.
 * 2. `.husky/` is pre-created and husky is declared in devDependencies, so
 *    installGitHooks() neither installs husky nor shells out to `husky init`.
 *
 * The hooks are NOT rewritten to run the local source tree here: these
 * fixtures exist to inspect what install WRITES, not to execute it. Use
 * setupPackageJsonModeRepo() + activateHooks() to run hooks for real.
 */
export function setupRepoForInstall(
  repo: TestRepo,
  versionMode: 'dynamic-file' | 'package-json',
  packageVersion = '0.1.0',
): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  repo.writeFile(
    'package.json',
    JSON.stringify(
      {
        devDependencies: {husky: '^9.1.7'},
        name: 'test-package',
        version: packageVersion,
      },
      null,
      2,
    ) + '\n',
  );

  repo.writeFile(
    'version-manager.json',
    JSON.stringify(
      {versionCalculationMode: 'add-to-patch', versionMode, versions: {}},
      null,
      2,
    ) + '\n',
  );

  repo.runGit('add package.json version-manager.json');
  repo.makeCommit('Add version config files', false);

  // Written after the commit, and never staged, so it stays untracked.
  repo.writeFile('.gitignore', 'node_modules/\n');
  repo.writeFile('.husky/.keep', '');
}

/**
 * Install git hooks into a fixture repo and make them executable by real git.
 * See setupPackageJsonModeRepo() for why the rewriting is necessary.
 */
export function activateHooks(repo: TestRepo): void {
  repo.writeFile('.husky/.keep', '');

  const result = repo.runCli('install --silent --non-interactive');
  if (result.exitCode !== 0) {
    throw new Error(
      `Hook install failed (exit ${result.exitCode}): ${result.stderr}`,
    );
  }

  repo.runGit('config core.hooksPath .husky');

  const cliPath = path.join(__dirname, '..', '..', 'src', 'index.ts');
  for (const hookName of [
    'pre-commit',
    'post-commit',
    'post-checkout',
    'post-merge',
    'post-rewrite',
  ]) {
    if (!repo.fileExists(`.husky/${hookName}`)) {
      continue;
    }
    const body = repo
      .readFile(`.husky/${hookName}`)
      .split('npx @justinhaaheim/version-manager')
      .join(`bun ${cliPath}`);
    repo.writeFile(`.husky/${hookName}`, `#!/bin/sh\n${body}`);
    fs.chmodSync(path.join(repo.getPath(), '.husky', hookName), 0o755);
  }

  // Commit the hooks so they survive branch switches, exactly as a real repo
  // does. Amending the existing config commit (rather than adding a new one)
  // keeps the commit count clean, so tests can count bumps from a known base.
  // --no-verify stops this setup step from bumping the version itself.
  repo.runGit('add -A');
  repo.runGit('commit --amend --no-verify --no-edit');
}

/**
 * Set up a repo with uncommitted changes (dirty state)
 */
export function setupRepoDirtyState(repo: TestRepo): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  // Create uncommitted change
  repo.writeFile('uncommitted.txt', 'This file is not committed\n');
}
