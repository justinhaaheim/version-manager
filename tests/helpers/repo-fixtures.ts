import type {TestRepo} from './test-repo';

/**
 * Helper functions to set up common test repository scenarios
 */

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
        runtimeVersion,
        versionCalculationMode,
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
        runtimeVersion,
        versionCalculationMode,
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
 * Set up a repo with uncommitted changes (dirty state)
 */
export function setupRepoDirtyState(repo: TestRepo): void {
  repo.initGit();
  repo.writeFile('README.md', '# Test Repo\n');
  repo.makeCommit('Initial commit');

  // Create uncommitted change
  repo.writeFile('uncommitted.txt', 'This file is not committed\n');
}
