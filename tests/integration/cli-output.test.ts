import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {
  setupRepoWithCommitsAfterConfig,
  setupRepoWithVersionConfig,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for CLI output formatting
 */
describe('CLI Output Format', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('Compact output (default)', () => {
    test('shows append-commits format without derivation', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        2,
        '0.4.6',
        '0.4.6',
        'append-commits',
      );

      const result = repo.runCli('');
      expect(result.exitCode).toBe(0);

      // Should show: 📦 0.4.6+2 🌿main 💾✓
      expect(result.stdout).toContain('📦 0.4.6+2');
      expect(result.stdout).toContain('🌿');
      expect(result.stdout).toContain('💾✓');
      // Should NOT show derivation in parens for append-commits
      expect(result.stdout).not.toContain('(0.4.6+2)');
    });

    test('shows add-to-patch format with derivation', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        2,
        '0.4.6',
        '0.4.6',
        'add-to-patch',
      );

      const result = repo.runCli('');
      expect(result.exitCode).toBe(0);

      // Should show: 📦 0.4.8 (0.4.6+2) 🌿main 💾✓
      expect(result.stdout).toContain('📦 0.4.8');
      expect(result.stdout).toContain('(0.4.6+2)');
      expect(result.stdout).toContain('💾✓');
    });

    test('shows dirty indicator when uncommitted changes exist', () => {
      setupRepoWithVersionConfig(repo, '0.4.6', '0.4.6', 'append-commits');

      // Modify an existing tracked file (untracked files don't count as "dirty")
      repo.writeFile('README.md', 'modified content');

      const result = repo.runCli('');
      expect(result.exitCode).toBe(0);

      // Should show dirty indicator (asterisk)
      expect(result.stdout).toContain('*');
    });

    test('no derivation shown when version equals base (0 commits)', () => {
      setupRepoWithVersionConfig(repo, '0.4.6', '0.4.6', 'add-to-patch');

      const result = repo.runCli('');
      expect(result.exitCode).toBe(0);

      // Should just show: 📦 0.4.6 🌿main 💾✓
      expect(result.stdout).toContain('📦 0.4.6');
      // Should NOT show derivation in parens when no commits
      expect(result.stdout).not.toContain('(');
    });
  });

  describe('Verbose output', () => {
    test('shows full dashboard with --verbose', () => {
      setupRepoWithCommitsAfterConfig(
        repo,
        2,
        '0.4.6',
        '0.4.6',
        'append-commits',
      );

      const result = repo.runCli('--verbose');
      expect(result.exitCode).toBe(0);

      expect(result.stdout).toContain('📦 version-manager');
      expect(result.stdout).toContain('🔢 0.4.6+2');
      expect(result.stdout).toContain('📌 base');
      expect(result.stdout).toContain('🔄 commits');
      expect(result.stdout).toContain('🌿 branch');
      expect(result.stdout).toContain('🔨 build');
      expect(result.stdout).toContain('💾 →');
    });
  });

  describe('Silent output', () => {
    test('produces no output with --silent', () => {
      setupRepoWithVersionConfig(repo);

      const result = repo.runCli('--silent');
      expect(result.exitCode).toBe(0);

      // Should be empty or whitespace only
      expect(result.stdout.trim()).toBe('');
    });
  });

  describe('Help output', () => {
    test('shows output verbosity section in help', () => {
      setupRepoWithVersionConfig(repo);

      const result = repo.runCli('--help');
      expect(result.exitCode).toBe(0);

      expect(result.stdout).toContain('Output verbosity');
      expect(result.stdout).toContain('--verbose');
      expect(result.stdout).toContain('--silent');
    });
  });
});
