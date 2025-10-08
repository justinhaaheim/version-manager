"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGitignore = checkGitignore;
exports.installGitHooks = installGitHooks;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const HOOK_NAMES = [
    'post-checkout',
    'post-commit',
    'post-merge',
    'post-rewrite',
];
function checkGitignore() {
    const gitignorePath = (0, path_1.join)(process.cwd(), '.gitignore');
    if (!(0, fs_1.existsSync)(gitignorePath)) {
        return false;
    }
    const content = (0, fs_1.readFileSync)(gitignorePath, 'utf-8');
    return content.includes('*.local.json') || content.includes('.local.json');
}
function getGitHooksPath() {
    // Check if a custom hooks path is configured
    try {
        const customPath = (0, child_process_1.execSync)('git config core.hooksPath', {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (customPath) {
            // If it's a relative path, resolve it relative to the git root
            if (!customPath.startsWith('/')) {
                return (0, path_1.join)(process.cwd(), customPath);
            }
            return customPath;
        }
    }
    catch {
        // No custom hooks path configured, use default
    }
    // Default to .git/hooks
    return (0, path_1.join)(process.cwd(), '.git', 'hooks');
}
function installGitHooks(incrementPatch = false, silent = false, noFail = false) {
    const gitHooksDir = getGitHooksPath();
    if (!(0, fs_1.existsSync)(gitHooksDir)) {
        throw new Error(`Git hooks directory not found: ${gitHooksDir}`);
    }
    console.log(`📦 Installing git hooks to: ${gitHooksDir}`);
    // Detect if we're running from the version-manager development directory itself
    const currentPackageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    let runCommand = 'npx @justinhaaheim/version-manager';
    if ((0, fs_1.existsSync)(currentPackageJsonPath)) {
        try {
            const packageJson = JSON.parse((0, fs_1.readFileSync)(currentPackageJsonPath, 'utf-8'));
            if (packageJson.name === '@justinhaaheim/version-manager') {
                // We're in the development directory, use local script
                runCommand = 'bun run test:local';
                console.log('   ℹ️  Detected local development environment, using: bun run test:local');
            }
        }
        catch {
            // If we can't read package.json, default to npx
        }
    }
    const incrementFlag = incrementPatch ? ' --increment-patch' : '';
    const silentFlag = silent ? ' --silent' : '';
    const noFailFlag = noFail ? ' --no-fail' : '';
    const finalCommand = `${runCommand}${incrementFlag}${silentFlag}${noFailFlag}`;
    // Check if we're using Husky
    const isHusky = gitHooksDir.includes('.husky');
    for (const hookName of HOOK_NAMES) {
        const hookPath = (0, path_1.join)(gitHooksDir, hookName);
        let hookContent;
        if (isHusky) {
            // For Husky, we need to check if it's the special _ directory
            if (gitHooksDir.endsWith('/_')) {
                // Skip the Husky internal directory - we should install in parent
                console.log(`   ⚠️  Detected Husky internal directory, installing to parent directory`);
                const parentDir = (0, path_1.join)(gitHooksDir, '..');
                const parentHookPath = (0, path_1.join)(parentDir, hookName);
                if ((0, fs_1.existsSync)(parentHookPath)) {
                    const existingContent = (0, fs_1.readFileSync)(parentHookPath, 'utf-8');
                    const lines = existingContent.split('\n');
                    // Find lines containing our command patterns
                    const matchingLineIndices = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('bun run test:local') ||
                            lines[i].includes('npx @justinhaaheim/version-manager')) {
                            matchingLineIndices.push(i);
                        }
                    }
                    if (matchingLineIndices.length === 0) {
                        // No matches - append to end
                        const updatedContent = existingContent.trim() +
                            '\n\n# Dynamic version generator\n' +
                            `${finalCommand}\n`;
                        (0, fs_1.writeFileSync)(parentHookPath, updatedContent);
                        (0, fs_1.chmodSync)(parentHookPath, '755');
                        console.log(`   ✓ Appended to existing ${hookName} hook`);
                    }
                    else if (matchingLineIndices.length === 1) {
                        // Exactly one match - replace that line
                        lines[matchingLineIndices[0]] = finalCommand;
                        (0, fs_1.writeFileSync)(parentHookPath, lines.join('\n'));
                        (0, fs_1.chmodSync)(parentHookPath, '755');
                        console.log(`   ✓ Updated ${hookName} hook`);
                    }
                    else {
                        // Multiple matches - warn user
                        console.log(`   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${parentHookPath}`);
                    }
                }
                else {
                    // New hook - create it
                    hookContent = `# Dynamic version generator
${finalCommand}
`;
                    (0, fs_1.writeFileSync)(parentHookPath, hookContent);
                    (0, fs_1.chmodSync)(parentHookPath, '755');
                    console.log(`   ✓ Created ${hookName} hook in Husky directory`);
                }
            }
            else {
                // Regular Husky directory
                if ((0, fs_1.existsSync)(hookPath)) {
                    const existingContent = (0, fs_1.readFileSync)(hookPath, 'utf-8');
                    const lines = existingContent.split('\n');
                    // Find lines containing our command patterns
                    const matchingLineIndices = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('bun run test:local') ||
                            lines[i].includes('npx @justinhaaheim/version-manager')) {
                            matchingLineIndices.push(i);
                        }
                    }
                    if (matchingLineIndices.length === 0) {
                        // No matches - append to end
                        const updatedContent = existingContent.trim() +
                            '\n\n# Dynamic version generator\n' +
                            `${finalCommand}\n`;
                        (0, fs_1.writeFileSync)(hookPath, updatedContent);
                        (0, fs_1.chmodSync)(hookPath, '755');
                        console.log(`   ✓ Appended to existing ${hookName} hook`);
                    }
                    else if (matchingLineIndices.length === 1) {
                        // Exactly one match - replace that line
                        lines[matchingLineIndices[0]] = finalCommand;
                        (0, fs_1.writeFileSync)(hookPath, lines.join('\n'));
                        (0, fs_1.chmodSync)(hookPath, '755');
                        console.log(`   ✓ Updated ${hookName} hook`);
                    }
                    else {
                        // Multiple matches - warn user
                        console.log(`   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`);
                    }
                }
                else {
                    // New hook - create it
                    hookContent = `# Dynamic version generator
${finalCommand}
`;
                    (0, fs_1.writeFileSync)(hookPath, hookContent);
                    (0, fs_1.chmodSync)(hookPath, '755');
                    console.log(`   ✓ Created ${hookName} hook`);
                }
            }
        }
        else {
            // Regular git hooks
            if ((0, fs_1.existsSync)(hookPath)) {
                const existingContent = (0, fs_1.readFileSync)(hookPath, 'utf-8');
                const lines = existingContent.split('\n');
                // Find lines containing our command patterns
                const matchingLineIndices = [];
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('bun run test:local') ||
                        lines[i].includes('npx @justinhaaheim/version-manager')) {
                        matchingLineIndices.push(i);
                    }
                }
                if (matchingLineIndices.length === 0) {
                    // No matches - append to end
                    const updatedContent = existingContent +
                        '\n' +
                        `# Dynamic version generator\n` +
                        `${finalCommand}\n`;
                    (0, fs_1.writeFileSync)(hookPath, updatedContent);
                    (0, fs_1.chmodSync)(hookPath, '755');
                    console.log(`   ✓ Appended to existing ${hookName} hook`);
                }
                else if (matchingLineIndices.length === 1) {
                    // Exactly one match - replace that line
                    lines[matchingLineIndices[0]] = finalCommand;
                    (0, fs_1.writeFileSync)(hookPath, lines.join('\n'));
                    (0, fs_1.chmodSync)(hookPath, '755');
                    console.log(`   ✓ Updated ${hookName} hook`);
                }
                else {
                    // Multiple matches - warn user
                    console.log(`   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`);
                }
            }
            else {
                // New hook - create it
                hookContent = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

${finalCommand}
`;
                (0, fs_1.writeFileSync)(hookPath, hookContent);
                (0, fs_1.chmodSync)(hookPath, '755');
                console.log(`   ✓ Created ${hookName} hook`);
            }
        }
    }
}
//# sourceMappingURL=git-hooks-manager.js.map