import {afterEach, beforeEach, describe, expect, test} from 'bun:test';

import {
  setupRepoWithCommitsAfterConfig,
  setupRepoWithVersionConfig,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests spawn a real CLI subprocess; under full-suite load that
 * routinely exceeds bun's default per-test timeout (see the 70i epic notes).
 */
const TEST_TIMEOUT_MS = 30000;

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

      // Should show: Dynamic version: 0.4.6+2 🌿main 💾✓
      expect(result.stdout).toContain('Dynamic version:');
      expect(result.stdout).toContain('0.4.6+2');
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

      // Should show: Dynamic version: 0.4.8 (0.4.6+2) 🌿main 💾✓
      expect(result.stdout).toContain('Dynamic version:');
      expect(result.stdout).toContain('0.4.8');
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

      // Should show: Dynamic version: 0.4.6 🌿main 💾✓
      expect(result.stdout).toContain('Dynamic version:');
      expect(result.stdout).toContain('0.4.6');
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

  describe('Usage errors (finding F9)', () => {
    test(
      'an unknown flag exits non-zero even with --no-fail',
      () => {
        setupRepoWithVersionConfig(repo);

        const result = repo.runCli('--no-fail --bogus-flag');

        // --no-fail means "a version-generation hiccup must not break the
        // caller". It does NOT mean "report a mistyped invocation as
        // success": a typo inside an installed hook would then fail silently
        // forever.
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Unknown argument');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'an unknown flag exits non-zero without --no-fail',
      () => {
        setupRepoWithVersionConfig(repo);

        const result = repo.runCli('--bogus-flag');

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Unknown argument');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a valid invocation with --no-fail still succeeds',
      () => {
        setupRepoWithVersionConfig(repo);

        // The control: the F9 fix must not turn --no-fail into a no-op.
        const result = repo.runCli('--no-fail --silent');

        expect(result.exitCode).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );
  });
});
