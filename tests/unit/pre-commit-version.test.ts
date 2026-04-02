import {describe, expect, test} from 'bun:test';

import {
  calculatePreCommitVersion,
  parseVersionMetadata,
} from '../../src/version-generator';

describe('parseVersionMetadata', () => {
  test('parses version without metadata', () => {
    expect(parseVersionMetadata('1.2.3')).toEqual({
      base: '1.2.3',
      metadata: null,
    });
  });

  test('parses version with +N metadata', () => {
    expect(parseVersionMetadata('1.2.3+5')).toEqual({
      base: '1.2.3',
      metadata: 5,
    });
  });

  test('parses version with +0 metadata', () => {
    expect(parseVersionMetadata('1.2.3+0')).toEqual({
      base: '1.2.3',
      metadata: 0,
    });
  });

  test('handles invalid metadata after +', () => {
    expect(parseVersionMetadata('1.2.3+abc')).toEqual({
      base: '1.2.3',
      metadata: null,
    });
  });

  test('handles large metadata numbers', () => {
    expect(parseVersionMetadata('0.1.0+42')).toEqual({
      base: '0.1.0',
      metadata: 42,
    });
  });
});

describe('calculatePreCommitVersion', () => {
  describe('add-to-patch mode', () => {
    test('increments patch by 1 when version changed in the last commit (i=0)', () => {
      // Most common case: version changed in the previous commit (by the hook)
      expect(calculatePreCommitVersion('0.1.3', 0, 'add-to-patch')).toBe(
        '0.1.4',
      );
    });

    test('increments patch by i+1 when commits were skipped', () => {
      // Version was set 2 commits ago (1 commit skipped with --no-verify)
      expect(calculatePreCommitVersion('0.1.3', 2, 'add-to-patch')).toBe(
        '0.1.6',
      );
    });

    test('increments from 0.1.0 after a bump', () => {
      // Right after a bump to 0.1.0, first commit
      expect(calculatePreCommitVersion('0.1.0', 0, 'add-to-patch')).toBe(
        '0.1.1',
      );
    });

    test('handles version with no prior commits (commitsSince=0)', () => {
      expect(calculatePreCommitVersion('2.0.0', 0, 'add-to-patch')).toBe(
        '2.0.1',
      );
    });

    test('returns original for invalid semver', () => {
      expect(calculatePreCommitVersion('not-semver', 0, 'add-to-patch')).toBe(
        'not-semver',
      );
    });

    test('returns original for two-part version', () => {
      expect(calculatePreCommitVersion('1.2', 0, 'add-to-patch')).toBe('1.2');
    });

    test('self-heals after multiple skipped commits', () => {
      // 0.1.5 was set, 3 commits skipped, this is the 4th
      expect(calculatePreCommitVersion('0.1.5', 3, 'add-to-patch')).toBe(
        '0.1.9',
      );
    });
  });

  describe('append-commits mode', () => {
    test('adds +1 to version without metadata (first commit after bump)', () => {
      expect(calculatePreCommitVersion('0.1.0', 0, 'append-commits')).toBe(
        '0.1.0+1',
      );
    });

    test('increments existing +N by 1 when version changed in last commit', () => {
      // Previous commit set 0.1.0+3, this commit should be 0.1.0+4
      expect(calculatePreCommitVersion('0.1.0+3', 0, 'append-commits')).toBe(
        '0.1.0+4',
      );
    });

    test('increments +N by i+1 when commits were skipped', () => {
      // 0.1.0+3 was set 2 commits ago, so new version is 0.1.0+(3+2+1) = 0.1.0+6
      expect(calculatePreCommitVersion('0.1.0+3', 2, 'append-commits')).toBe(
        '0.1.0+6',
      );
    });

    test('adds +(i+1) to clean version when commits were skipped', () => {
      // 0.1.0 (no metadata) was set 2 commits ago
      expect(calculatePreCommitVersion('0.1.0', 2, 'append-commits')).toBe(
        '0.1.0+3',
      );
    });

    test('handles +0 metadata', () => {
      expect(calculatePreCommitVersion('1.0.0+0', 0, 'append-commits')).toBe(
        '1.0.0+1',
      );
    });

    test('sequential commits produce incrementing versions', () => {
      // Simulate: bump to 0.1.0, then 5 sequential commits
      let version = '0.1.0';
      const versions: string[] = [];

      for (let i = 0; i < 5; i++) {
        // Each commit: last version changed 0 commits ago (previous commit set it)
        version = calculatePreCommitVersion(version, 0, 'append-commits');
        versions.push(version);
      }

      expect(versions).toEqual([
        '0.1.0+1',
        '0.1.0+2',
        '0.1.0+3',
        '0.1.0+4',
        '0.1.0+5',
      ]);
    });

    test('self-heals after skipped commits', () => {
      // Start: 0.1.0+3 (set 3 commits after bump)
      // Skip 2 commits (--no-verify)
      // Next commit: version was set 2 commits ago
      const result = calculatePreCommitVersion('0.1.0+3', 2, 'append-commits');
      expect(result).toBe('0.1.0+6');
    });
  });

  describe('add-to-patch sequential simulation', () => {
    test('sequential commits produce incrementing patch versions', () => {
      // Simulate: bump to 0.1.0, then 5 sequential commits
      let version = '0.1.0';
      const versions: string[] = [];

      for (let i = 0; i < 5; i++) {
        version = calculatePreCommitVersion(version, 0, 'add-to-patch');
        versions.push(version);
      }

      expect(versions).toEqual(['0.1.1', '0.1.2', '0.1.3', '0.1.4', '0.1.5']);
    });
  });
});
