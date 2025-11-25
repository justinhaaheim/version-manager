import {describe, expect, test} from 'bun:test';

import {
  formatVersionOutput,
  type OutputFormat,
  type VersionOutputData,
} from './output-formatter';

// Sample test data
const sampleData: VersionOutputData = {
  baseVersion: '1.2.3',
  branch: 'main',
  buildNumber: '20251124.120000.00',
  commitsSince: 5,
  dirty: false,
  dtsPath: './dynamic-version.local.d.ts',
  dynamicVersion: '1.2.3+5',
  outputPath: './dynamic-version.local.json',
  versions: {
    runtime: '1.0.0',
  },
};

const sampleDataDirty: VersionOutputData = {
  ...sampleData,
  dirty: true,
};

const sampleDataNoCustomVersions: VersionOutputData = {
  ...sampleData,
  versions: {},
};

describe('formatVersionOutput', () => {
  test('silent mode returns empty string', () => {
    const output = formatVersionOutput(sampleData, 'silent');
    expect(output).toBe('');
  });

  describe('compact mode', () => {
    test('renders single line with version, branch, and checkmark', () => {
      const output = formatVersionOutput(sampleData, 'compact');
      expect(output).toMatchSnapshot();
    });

    test('shows dirty indicator when dirty', () => {
      const output = formatVersionOutput(sampleDataDirty, 'compact');
      expect(output).toContain('*');
      expect(output).toMatchSnapshot();
    });
  });

  describe('normal mode', () => {
    test('renders tree-style output with emojis', () => {
      const output = formatVersionOutput(sampleData, 'normal');
      expect(output).toMatchSnapshot();
    });

    test('shows dirty indicator when dirty', () => {
      const output = formatVersionOutput(sampleDataDirty, 'normal');
      expect(output).toContain('*');
      expect(output).toMatchSnapshot();
    });

    test('handles no custom versions', () => {
      const output = formatVersionOutput(sampleDataNoCustomVersions, 'normal');
      expect(output).not.toContain('🏷️');
      expect(output).toMatchSnapshot();
    });

    test('handles singular commit count', () => {
      const data: VersionOutputData = {...sampleData, commitsSince: 1};
      const output = formatVersionOutput(data, 'normal');
      expect(output).toContain('1 commit');
      expect(output).not.toContain('1 commits');
    });
  });

  describe('verbose mode', () => {
    test('renders full status dashboard', () => {
      const output = formatVersionOutput(sampleData, 'verbose');
      expect(output).toMatchSnapshot();
    });

    test('shows dirty indicator when dirty', () => {
      const output = formatVersionOutput(sampleDataDirty, 'verbose');
      expect(output).toContain('*');
      expect(output).toMatchSnapshot();
    });

    test('handles no custom versions', () => {
      const output = formatVersionOutput(sampleDataNoCustomVersions, 'verbose');
      expect(output).not.toContain('🏷️');
      expect(output).toMatchSnapshot();
    });

    test('includes all expected fields', () => {
      const output = formatVersionOutput(sampleData, 'verbose');
      expect(output).toContain('📦 version-manager');
      expect(output).toContain('🔢 1.2.3+5');
      expect(output).toContain('📌 base');
      expect(output).toContain('🔄 commits');
      expect(output).toContain('🌿 branch');
      expect(output).toContain('🔨 build');
      expect(output).toContain('💾');
      expect(output).toContain('📘');
    });
  });

  describe('default behavior', () => {
    test('uses normal mode when format is undefined/invalid', () => {
      const output = formatVersionOutput(sampleData, 'invalid' as OutputFormat);
      const normalOutput = formatVersionOutput(sampleData, 'normal');
      expect(output).toBe(normalOutput);
    });
  });
});
