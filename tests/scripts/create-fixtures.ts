#!/usr/bin/env bun

/**
 * Script to generate test fixture git repositories.
 * Run this once to create the fixture repos used in tests.
 *
 * Usage: bun tests/scripts/create-fixtures.ts
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface FixtureConfig {
  description: string;
  name: string;
  setup: (repoPath: string) => void;
}

/**
 * Execute a git command in a specific directory
 */
function git(command: string, cwd: string): void {
  execSync(`git ${command}`, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_AUTHOR_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
    },
    stdio: 'ignore',
  });
}

/**
 * Create a file in a repo
 */
function writeFile(repoPath: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(repoPath, filename), content);
}

/**
 * Make a commit
 */
function commit(repoPath: string, message: string): void {
  git('add .', repoPath);
  git(`commit -m "${message}"`, repoPath);
}

/**
 * Create a tag
 */
function tag(repoPath: string, tagName: string): void {
  git(`tag ${tagName}`, repoPath);
}

/**
 * Fixture configurations
 */
const fixtures: FixtureConfig[] = [
  {
    description: 'Fresh repo with no tags, just initial commit',
    name: 'repo-no-tags',
    setup: (repoPath: string) => {
      git('init', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
    },
  },

  {
    description: 'Repo with v0.1.0 tag at HEAD',
    name: 'repo-with-v0.1.0-tag',
    setup: (repoPath: string) => {
      git('init', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
      tag(repoPath, 'v0.1.0');
    },
  },

  {
    description: 'Repo with v0.1.0 tag and 5 commits after it',
    name: 'repo-5-commits-after-tag',
    setup: (repoPath: string) => {
      git('init', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
      tag(repoPath, 'v0.1.0');

      // Add 5 commits after the tag
      for (let i = 1; i <= 5; i++) {
        writeFile(repoPath, `file${i}.txt`, `Content ${i}\n`);
        commit(repoPath, `Add file ${i}`);
      }
    },
  },

  {
    description: 'Repo with tag and uncommitted changes (dirty state)',
    name: 'repo-dirty-state',
    setup: (repoPath: string) => {
      git('init', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
      tag(repoPath, 'v0.1.0');

      // Create an uncommitted change
      writeFile(repoPath, 'uncommitted.txt', 'This file is not committed\n');
    },
  },

  {
    description: 'Repo with feature branch (not on main)',
    name: 'repo-feature-branch',
    setup: (repoPath: string) => {
      git('init', repoPath);
      git('checkout -b main', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
      tag(repoPath, 'v0.1.0');

      // Create and checkout feature branch
      git('checkout -b feature/test-branch', repoPath);
      writeFile(repoPath, 'feature.txt', 'Feature work\n');
      commit(repoPath, 'Add feature');
    },
  },

  {
    description: 'Repo with multiple tags (v0.1.0 and v0.2.0)',
    name: 'repo-multiple-tags',
    setup: (repoPath: string) => {
      git('init', repoPath);
      writeFile(repoPath, 'README.md', '# Test Repo\n');
      commit(repoPath, 'Initial commit');
      tag(repoPath, 'v0.1.0');

      writeFile(repoPath, 'feature.txt', 'New feature\n');
      commit(repoPath, 'Add feature');

      writeFile(repoPath, 'another.txt', 'Another feature\n');
      commit(repoPath, 'Add another feature');
      tag(repoPath, 'v0.2.0');

      // Add one more commit after v0.2.0
      writeFile(repoPath, 'latest.txt', 'Latest work\n');
      commit(repoPath, 'Latest changes');
    },
  },
];

/**
 * Main execution
 */
function main() {
  console.log('🔧 Creating test fixture repositories...\n');

  // Ensure fixtures directory exists
  const fixturesDir = path.join(__dirname, '..', 'fixtures', 'git-repos');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, {recursive: true});
    console.log(`✅ Created fixtures directory: ${fixturesDir}\n`);
  }

  // Create each fixture
  for (const fixture of fixtures) {
    console.log(`📦 Creating: ${fixture.name}`);
    console.log(`   ${fixture.description}`);

    // Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-'));

    try {
      // Set up the repo
      fixture.setup(tempDir);

      // Create tarball
      const tarPath = path.join(fixturesDir, `${fixture.name}.tar.gz`);

      // Create tarball from the temp directory contents
      execSync(`tar -czf "${tarPath}" -C "${tempDir}" .`, {stdio: 'ignore'});

      console.log(`   ✅ Created: ${tarPath}\n`);
    } catch (error) {
      console.error(`   ❌ Failed to create ${fixture.name}:`, error);
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, {force: true, recursive: true});
    }
  }

  console.log('✨ All fixtures created successfully!');
  console.log('\nYou can now run tests with: bun test');
}

// Run the script
try {
  main();
} catch (error: unknown) {
  console.error('Failed to create fixtures:', error);
  process.exit(1);
}
