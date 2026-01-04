import {describe, expect, test} from 'bun:test';

import {
  formatVersionOutput,
  type VersionOutputData,
} from '../../src/output-formatter';

/**
 * Unit tests for output formatting
 */
describe('Output Formatter', () => {
  const baseData: VersionOutputData = {
    baseVersion: '0.4.6',
    branch: 'main',
    buildNumber: '20260104.120000.00',
    commitsSince: 2,
    dirty: false,
    dynamicVersion: '0.4.6+2',
    outputPath: './dynamic-version.local.json',
    versions: {},
  };

  describe('compact format', () => {
    test('shows append-commits format correctly', () => {
      const data: VersionOutputData = {
        ...baseData,
        dynamicVersion: '0.4.6+2',
      };

      const output = formatVersionOutput(data, 'compact');

      expect(output).toBe('📦 0.4.6+2 🌿main 💾✓');
    });

    test('shows add-to-patch format with derivation', () => {
      const data: VersionOutputData = {
        ...baseData,
        dynamicVersion: '0.4.8', // 0.4.6 + 2 commits = 0.4.8
      };

      const output = formatVersionOutput(data, 'compact');

      expect(output).toBe('📦 0.4.8 (0.4.6+2) 🌿main 💾✓');
    });

    test('shows dirty indicator for append-commits', () => {
      const data: VersionOutputData = {
        ...baseData,
        dirty: true,
        dynamicVersion: '0.4.6+2',
      };

      const output = formatVersionOutput(data, 'compact');

      expect(output).toBe('📦 0.4.6+2* 🌿main 💾✓');
    });

    test('shows dirty indicator for add-to-patch', () => {
      const data: VersionOutputData = {
        ...baseData,
        dirty: true,
        dynamicVersion: '0.4.8',
      };

      const output = formatVersionOutput(data, 'compact');

      expect(output).toBe('📦 0.4.8* (0.4.6+2) 🌿main 💾✓');
    });

    test('no derivation shown when version equals base (0 commits)', () => {
      const data: VersionOutputData = {
        ...baseData,
        commitsSince: 0,
        dynamicVersion: '0.4.6',
      };

      const output = formatVersionOutput(data, 'compact');

      // Should not show derivation when there are no commits
      expect(output).toBe('📦 0.4.6 🌿main 💾✓');
    });
  });

  describe('normal format', () => {
    test('shows version tree correctly', () => {
      const output = formatVersionOutput(baseData, 'normal');

      expect(output).toContain('📦 0.4.6+2 (🌿 main)');
      expect(output).toContain('└─ 📌 0.4.6 + 🔄 2 commits');
      expect(output).toContain('💾 → ./dynamic-version.local.json');
    });

    test('shows custom versions', () => {
      const data: VersionOutputData = {
        ...baseData,
        versions: {
          runtime: '0.3.1',
        },
      };

      const output = formatVersionOutput(data, 'normal');

      expect(output).toContain('🏷️  runtime 0.3.1');
    });

    test('shows dts path when present', () => {
      const data: VersionOutputData = {
        ...baseData,
        dtsPath: './dynamic-version.local.d.ts',
      };

      const output = formatVersionOutput(data, 'normal');

      expect(output).toContain('📘 → ./dynamic-version.local.d.ts');
    });
  });

  describe('verbose format', () => {
    test('shows full dashboard', () => {
      const output = formatVersionOutput(baseData, 'verbose');

      expect(output).toContain('📦 version-manager');
      expect(output).toContain('🔢 0.4.6+2');
      expect(output).toContain('📌 base      0.4.6');
      expect(output).toContain('🔄 commits   +2');
      expect(output).toContain('🌿 branch    main');
      expect(output).toContain('💾 → ./dynamic-version.local.json');
    });

    test('shows dirty indicator', () => {
      const data: VersionOutputData = {
        ...baseData,
        dirty: true,
      };

      const output = formatVersionOutput(data, 'verbose');

      expect(output).toContain('🔢 0.4.6+2 *');
    });
  });

  describe('silent format', () => {
    test('returns empty string', () => {
      const output = formatVersionOutput(baseData, 'silent');

      expect(output).toBe('');
    });
  });
});
