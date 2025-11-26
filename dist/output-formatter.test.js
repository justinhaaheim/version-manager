"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bun_test_1 = require("bun:test");
const output_formatter_1 = require("./output-formatter");
// Sample test data
const sampleData = {
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
const sampleDataDirty = {
    ...sampleData,
    dirty: true,
};
const sampleDataNoCustomVersions = {
    ...sampleData,
    versions: {},
};
(0, bun_test_1.describe)('formatVersionOutput', () => {
    (0, bun_test_1.test)('silent mode returns empty string', () => {
        const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'silent');
        (0, bun_test_1.expect)(output).toBe('');
    });
    (0, bun_test_1.describe)('compact mode', () => {
        (0, bun_test_1.test)('renders single line with version, branch, and checkmark', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'compact');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('shows dirty indicator when dirty', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleDataDirty, 'compact');
            (0, bun_test_1.expect)(output).toContain('*');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
    });
    (0, bun_test_1.describe)('normal mode', () => {
        (0, bun_test_1.test)('renders tree-style output with emojis', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'normal');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('shows dirty indicator when dirty', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleDataDirty, 'normal');
            (0, bun_test_1.expect)(output).toContain('*');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('handles no custom versions', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleDataNoCustomVersions, 'normal');
            (0, bun_test_1.expect)(output).not.toContain('🏷️');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('handles singular commit count', () => {
            const data = { ...sampleData, commitsSince: 1 };
            const output = (0, output_formatter_1.formatVersionOutput)(data, 'normal');
            (0, bun_test_1.expect)(output).toContain('1 commit');
            (0, bun_test_1.expect)(output).not.toContain('1 commits');
        });
    });
    (0, bun_test_1.describe)('verbose mode', () => {
        (0, bun_test_1.test)('renders full status dashboard', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'verbose');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('shows dirty indicator when dirty', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleDataDirty, 'verbose');
            (0, bun_test_1.expect)(output).toContain('*');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('handles no custom versions', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleDataNoCustomVersions, 'verbose');
            (0, bun_test_1.expect)(output).not.toContain('🏷️');
            (0, bun_test_1.expect)(output).toMatchSnapshot();
        });
        (0, bun_test_1.test)('includes all expected fields', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'verbose');
            (0, bun_test_1.expect)(output).toContain('📦 version-manager');
            (0, bun_test_1.expect)(output).toContain('🔢 1.2.3+5');
            (0, bun_test_1.expect)(output).toContain('📌 base');
            (0, bun_test_1.expect)(output).toContain('🔄 commits');
            (0, bun_test_1.expect)(output).toContain('🌿 branch');
            (0, bun_test_1.expect)(output).toContain('🔨 build');
            (0, bun_test_1.expect)(output).toContain('💾');
            (0, bun_test_1.expect)(output).toContain('📘');
        });
    });
    (0, bun_test_1.describe)('default behavior', () => {
        (0, bun_test_1.test)('uses normal mode when format is undefined/invalid', () => {
            const output = (0, output_formatter_1.formatVersionOutput)(sampleData, 'invalid');
            const normalOutput = (0, output_formatter_1.formatVersionOutput)(sampleData, 'normal');
            (0, bun_test_1.expect)(output).toBe(normalOutput);
        });
    });
});
//# sourceMappingURL=output-formatter.test.js.map