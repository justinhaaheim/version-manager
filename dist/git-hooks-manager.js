"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGitignore = checkGitignore;
exports.installGitHooks = installGitHooks;
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
function installGitHooks(incrementPatch = false) {
    const gitHooksDir = (0, path_1.join)(process.cwd(), '.git', 'hooks');
    if (!(0, fs_1.existsSync)(gitHooksDir)) {
        throw new Error('Not a git repository (no .git/hooks directory found)');
    }
    const packageName = '@justinhaaheim/version-manager';
    const incrementFlag = incrementPatch ? ' --increment-patch' : '';
    const hookScript = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

# Run the version generator using npx
npx ${packageName}${incrementFlag} 2>/dev/null || true

# Exit successfully regardless of version generator result
exit 0
`;
    for (const hookName of HOOK_NAMES) {
        const hookPath = (0, path_1.join)(gitHooksDir, hookName);
        if ((0, fs_1.existsSync)(hookPath)) {
            const existingContent = (0, fs_1.readFileSync)(hookPath, 'utf-8');
            if (existingContent.includes('version-manager')) {
                (0, fs_1.writeFileSync)(hookPath, hookScript);
                (0, fs_1.chmodSync)(hookPath, '755');
                console.log(`   ✓ Updated ${hookName} hook`);
            }
            else {
                const updatedContent = existingContent +
                    '\n' +
                    `# Dynamic version generator\n` +
                    `npx ${packageName}${incrementFlag} 2>/dev/null || true\n`;
                (0, fs_1.writeFileSync)(hookPath, updatedContent);
                (0, fs_1.chmodSync)(hookPath, '755');
                console.log(`   ✓ Appended to existing ${hookName} hook`);
            }
        }
        else {
            (0, fs_1.writeFileSync)(hookPath, hookScript);
            (0, fs_1.chmodSync)(hookPath, '755');
            console.log(`   ✓ Created ${hookName} hook`);
        }
    }
}
//# sourceMappingURL=git-hooks-manager.js.map