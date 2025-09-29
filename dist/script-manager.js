"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasExistingDynamicVersionScripts = hasExistingDynamicVersionScripts;
exports.getConflictingScripts = getConflictingScripts;
exports.readPackageJson = readPackageJson;
exports.writePackageJson = writePackageJson;
exports.addScriptsToPackageJson = addScriptsToPackageJson;
exports.listDefaultScripts = listDefaultScripts;
const fs_1 = require("fs");
const path_1 = require("path");
const DEFAULT_SCRIPTS = [
    {
        command: 'npx @justinhaaheim/version-manager --install',
        description: 'Install git hooks and generate version file',
        name: 'dynamic-version',
    },
    {
        command: 'npx @justinhaaheim/version-manager --install',
        description: 'Install git hooks and generate version file',
        name: 'dynamic-version:install',
    },
    {
        command: 'npx @justinhaaheim/version-manager --install-scripts',
        description: 'Add/update dynamic-version scripts in package.json',
        name: 'dynamic-version:install-scripts',
    },
    {
        command: 'npx @justinhaaheim/version-manager',
        description: 'Generate an up-to-date version file',
        name: 'dynamic-version:generate',
    },
];
function hasExistingDynamicVersionScripts(packageJson) {
    if (!packageJson.scripts) {
        return false;
    }
    // Check if any script key or value contains 'dynamic-version'
    return Object.entries(packageJson.scripts).some(([key, value]) => key.includes('dynamic-version') || value.includes('dynamic-version'));
}
function getConflictingScripts(packageJson) {
    if (!packageJson.scripts) {
        return [];
    }
    return DEFAULT_SCRIPTS.filter((script) => Object.prototype.hasOwnProperty.call(packageJson.scripts, script.name));
}
function readPackageJson() {
    const packageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath)) {
        return null;
    }
    try {
        const content = (0, fs_1.readFileSync)(packageJsonPath, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        console.error('Failed to parse package.json:', error);
        return null;
    }
}
function writePackageJson(packageJson) {
    const packageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    try {
        (0, fs_1.writeFileSync)(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        return true;
    }
    catch (error) {
        console.error('Failed to write package.json:', error);
        return false;
    }
}
function addScriptsToPackageJson(force = false) {
    const packageJson = readPackageJson();
    if (!packageJson) {
        return {
            conflictsOverwritten: [],
            message: 'No package.json found in current directory',
            success: false,
        };
    }
    // Initialize scripts object if it doesn't exist
    if (!packageJson.scripts) {
        packageJson.scripts = {};
    }
    const existingScripts = hasExistingDynamicVersionScripts(packageJson);
    // If not forcing and there are existing dynamic-version scripts, don't modify
    if (!force && existingScripts) {
        return {
            conflictsOverwritten: [],
            message: 'Existing dynamic-version scripts detected. Skipping script installation to preserve customizations.',
            success: false,
        };
    }
    const conflictsOverwritten = [];
    // Add or update scripts
    for (const script of DEFAULT_SCRIPTS) {
        if (packageJson.scripts[script.name] &&
            packageJson.scripts[script.name] !== script.command) {
            conflictsOverwritten.push(script.name);
        }
        packageJson.scripts[script.name] = script.command;
    }
    // Write back to package.json
    const writeSuccess = writePackageJson(packageJson);
    if (!writeSuccess) {
        return {
            conflictsOverwritten: [],
            message: 'Failed to write package.json',
            success: false,
        };
    }
    return {
        conflictsOverwritten,
        message: force
            ? 'Scripts added/updated in package.json'
            : 'Scripts added to package.json',
        success: true,
    };
}
function listDefaultScripts() {
    console.log('\nDefault dynamic-version scripts:');
    for (const script of DEFAULT_SCRIPTS) {
        console.log(`  ${script.name}: ${script.command}`);
        console.log(`    # ${script.description}`);
    }
}
//# sourceMappingURL=script-manager.js.map