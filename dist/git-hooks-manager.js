"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectPackageManager = detectPackageManager;
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
/**
 * Detect which package manager to use based on lock files
 * @returns 'bun' if bun.lock exists, 'npm' if package-lock.json exists,
 *          or 'npm' with warning if neither exists
 */
function detectPackageManager() {
    const hasBunLock = (0, fs_1.existsSync)((0, path_1.join)(process.cwd(), 'bun.lock'));
    const hasNpmLock = (0, fs_1.existsSync)((0, path_1.join)(process.cwd(), 'package-lock.json'));
    if (hasBunLock) {
        return 'bun';
    }
    if (hasNpmLock) {
        return 'npm';
    }
    // Neither lock file exists - warn and default to npm
    console.warn('⚠️  No bun.lock or package-lock.json found. Defaulting to npm.');
    return 'npm';
}
function checkGitignore() {
    const gitignorePath = (0, path_1.join)(process.cwd(), '.gitignore');
    if (!(0, fs_1.existsSync)(gitignorePath)) {
        return false;
    }
    const content = (0, fs_1.readFileSync)(gitignorePath, 'utf-8');
    return content.includes('*.local.json') || content.includes('.local.json');
}
/**
 * Check if Husky is installed in the project
 */
function isHuskyInstalled() {
    const packageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath)) {
        return false;
    }
    try {
        const packageJson = JSON.parse((0, fs_1.readFileSync)(packageJsonPath, 'utf-8'));
        // Check if husky is in dependencies or devDependencies
        return !!(packageJson.devDependencies?.husky ?? packageJson.dependencies?.husky);
    }
    catch {
        return false;
    }
}
/**
 * Install Husky and initialize it in the project
 */
function ensureHuskyInstalled(silent = false) {
    if (isHuskyInstalled()) {
        if (!silent) {
            console.log('   ℹ️  Husky already installed');
        }
        return;
    }
    const packageManager = detectPackageManager();
    if (!silent) {
        console.log(`   📦 Installing Husky using ${packageManager}...`);
    }
    try {
        // Install husky as dev dependency using detected package manager
        const installCmd = packageManager === 'bun'
            ? 'bun add --dev husky'
            : 'npm install --save-dev husky';
        (0, child_process_1.execSync)(installCmd, {
            cwd: process.cwd(),
            stdio: silent ? 'pipe' : 'inherit',
        });
        if (!silent) {
            console.log('   ✅ Husky installed');
            console.log('   🔧 Initializing Husky...');
        }
        // Run husky init to set up .husky directory and prepare script
        // Use npx for both package managers (bunx doesn't support husky init well)
        (0, child_process_1.execSync)('npx husky init', {
            cwd: process.cwd(),
            stdio: silent ? 'pipe' : 'inherit',
        });
        if (!silent) {
            console.log('   ✅ Husky initialized');
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to install Husky: ${errorMessage}`);
    }
}
/**
 * Get the path to the Husky hooks directory
 * Always returns .husky/ - we no longer support .git/hooks
 */
function getHuskyHooksPath() {
    return (0, path_1.join)(process.cwd(), '.husky');
}
/**
 * Update an existing Husky hook file
 */
function updateExistingHook(hookPath, command, hookName, silent) {
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
            `${command}\n`;
        (0, fs_1.writeFileSync)(hookPath, updatedContent);
        (0, fs_1.chmodSync)(hookPath, '755');
        if (!silent) {
            console.log(`   ✓ Appended to existing ${hookName} hook`);
        }
    }
    else if (matchingLineIndices.length === 1) {
        // Exactly one match - replace that line
        lines[matchingLineIndices[0]] = command;
        (0, fs_1.writeFileSync)(hookPath, lines.join('\n'));
        (0, fs_1.chmodSync)(hookPath, '755');
        if (!silent) {
            console.log(`   ✓ Updated ${hookName} hook`);
        }
    }
    else {
        // Multiple matches - warn user
        if (!silent) {
            console.log(`   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`);
        }
    }
}
/**
 * Create a new Husky hook file
 */
function createNewHook(hookPath, command, hookName, silent) {
    // Husky hook template (modern format - no longer needs husky.sh sourcing)
    const hookContent = `# Dynamic version generator
${command}
`;
    (0, fs_1.writeFileSync)(hookPath, hookContent);
    (0, fs_1.chmodSync)(hookPath, '755');
    if (!silent) {
        console.log(`   ✓ Created ${hookName} hook`);
    }
}
/**
 * Install git hooks using Husky
 */
function installGitHooks(incrementPatch = false, silent = false, noFail = false) {
    // Ensure Husky is installed
    ensureHuskyInstalled(silent);
    const huskyDir = getHuskyHooksPath();
    if (!(0, fs_1.existsSync)(huskyDir)) {
        throw new Error(`Husky directory not found: ${huskyDir}. This should have been created by husky init.`);
    }
    if (!silent) {
        console.log(`📦 Installing git hooks to: ${huskyDir}`);
    }
    // Detect if we're running from the version-manager development directory itself
    const currentPackageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    let runCommand = 'npx @justinhaaheim/version-manager';
    if ((0, fs_1.existsSync)(currentPackageJsonPath)) {
        try {
            const packageJson = JSON.parse((0, fs_1.readFileSync)(currentPackageJsonPath, 'utf-8'));
            if (packageJson.name === '@justinhaaheim/version-manager') {
                // We're in the development directory, use local script
                runCommand = 'bun run test:local';
                if (!silent) {
                    console.log('   ℹ️  Detected local development environment, using: bun run test:local');
                }
            }
        }
        catch {
            // If we can't read package.json, default to npx
        }
    }
    const incrementFlag = incrementPatch ? ' --increment-patch' : '';
    const silentFlag = silent ? ' --silent' : '';
    const noFailFlag = noFail ? ' --no-fail' : '';
    const gitHookFlag = ' --git-hook';
    const finalCommand = `${runCommand}${incrementFlag}${silentFlag}${noFailFlag}${gitHookFlag}`;
    for (const hookName of HOOK_NAMES) {
        const hookPath = (0, path_1.join)(huskyDir, hookName);
        if ((0, fs_1.existsSync)(hookPath)) {
            // Hook exists - update it
            updateExistingHook(hookPath, finalCommand, hookName, silent);
        }
        else {
            // Create new hook
            createNewHook(hookPath, finalCommand, hookName, silent);
        }
    }
}
//# sourceMappingURL=git-hooks-manager.js.map