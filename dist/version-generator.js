"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultVersionManagerConfig = createDefaultVersionManagerConfig;
exports.generateFileBasedVersion = generateFileBasedVersion;
exports.generateTypeDefinitions = generateTypeDefinitions;
exports.bumpVersion = bumpVersion;
const fs_1 = require("fs");
const path_1 = require("path");
const git_utils_1 = require("./git-utils");
const script_manager_1 = require("./script-manager");
const types_1 = require("./types");
/**
 * Migrate legacy config format to new format
 * @param legacyConfig - Legacy config with runtimeVersion field
 * @returns Migrated config with versions object
 */
function migrateLegacyConfig(legacyConfig) {
    const versions = { ...(legacyConfig.versions ?? {}) };
    // Move runtimeVersion to versions.runtime
    versions.runtime = legacyConfig.runtimeVersion;
    return {
        versionCalculationMode: legacyConfig.versionCalculationMode,
        versions,
    };
}
/**
 * Read version-manager.json configuration with Zod validation and migration
 * @param configPath - Path to version-manager.json
 * @returns Object with config (or null if not found), and whether migration occurred
 */
function readVersionManagerConfig(configPath) {
    try {
        if (!(0, fs_1.existsSync)(configPath)) {
            return { config: null, migrated: false };
        }
        const content = (0, fs_1.readFileSync)(configPath, 'utf-8');
        const json = JSON.parse(content);
        // Try parsing with new schema first
        const newResult = types_1.VersionManagerConfigSchema.safeParse(json);
        if (newResult.success) {
            return { config: newResult.data, migrated: false };
        }
        // Try parsing with legacy schema
        const legacyResult = types_1.LegacyVersionManagerConfigSchema.safeParse(json);
        if (legacyResult.success) {
            // Migrate legacy config to new format
            const migratedConfig = migrateLegacyConfig(legacyResult.data);
            return { config: migratedConfig, migrated: true };
        }
        // Neither schema worked - invalid config
        console.warn(`⚠️  Invalid version-manager.json format:`, newResult.error.format());
        return { config: null, migrated: false };
    }
    catch (error) {
        console.warn(`⚠️  Failed to read version-manager.json:`, error);
        return { config: null, migrated: false };
    }
}
/**
 * Calculate code version based on calculation mode
 * @param baseVersion - Base version from config
 * @param commitsSince - Number of commits since last base version change
 * @param mode - Calculation mode
 * @returns Calculated code version
 */
function calculateCodeVersion(baseVersion, commitsSince, mode) {
    if (commitsSince === 0) {
        return baseVersion;
    }
    if (mode === 'add-to-patch') {
        // Mode A: Add commits to patch version
        const parts = baseVersion.split('.');
        if (parts.length !== 3) {
            return baseVersion; // Invalid semver format
        }
        const [major, minor, patch] = parts.map(Number);
        if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
            return baseVersion; // Invalid semver format
        }
        return `${major}.${minor}.${patch + commitsSince}`;
    }
    else if (mode === 'append-commits') {
        // Mode B: Append commit count
        return `${baseVersion}+${commitsSince}`;
    }
    // Fallback to mode A if unrecognized mode
    const parts = baseVersion.split('.');
    if (parts.length !== 3) {
        return baseVersion;
    }
    const [major, minor, patch] = parts.map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
        return baseVersion;
    }
    return `${major}.${minor}.${patch + commitsSince}`;
}
/**
 * Reserved version names that cannot be used
 */
const RESERVED_VERSION_NAMES = ['base', 'dynamic', 'build'];
/**
 * Validate version names in config
 * @param versions - Versions object from config
 * @throws Error if any version name is reserved
 */
function validateVersionNames(versions) {
    for (const name of Object.keys(versions)) {
        if (RESERVED_VERSION_NAMES.includes(name.toLowerCase())) {
            throw new Error(`Version name "${name}" is reserved and cannot be used. Reserved names: ${RESERVED_VERSION_NAMES.join(', ')}`);
        }
    }
}
/**
 * Get default version-manager.json configuration
 * @returns Default VersionManagerConfig object
 */
function getDefaultVersionManagerConfig() {
    return {
        versionCalculationMode: 'append-commits',
        versions: {},
    };
}
/**
 * Create default version-manager.json configuration
 * @param configPath - Path to version-manager.json
 * @param silent - Suppress console output
 */
function createDefaultVersionManagerConfig(configPath, silent = false) {
    const defaultConfig = getDefaultVersionManagerConfig();
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
    if (!silent) {
        console.log('✅ Created version-manager.json with default values:');
        console.log(`   versionCalculationMode: ${defaultConfig.versionCalculationMode}`);
        console.log(`   versions: {}`);
    }
}
/**
 * Generate a build number in iOS-compatible format
 * Format: YYYYMMDD.HHmmss.SS (18 characters max)
 * Example: 20251020.143245.67
 * @returns Build number string
 */
function generateBuildNumber() {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const hundredths = Math.floor(now.getMilliseconds() / 10)
        .toString()
        .padStart(2, '0');
    return `${year}${month}${day}.${hours}${minutes}${seconds}.${hundredths}`;
}
/**
 * Generate timestamps for version tracking
 * @returns Object containing human-readable timestamp and Unix timestamp in milliseconds
 */
function generateTimestamps() {
    return {
        timestamp: new Date().toString(),
        timestampUnix: Date.now(),
    };
}
/**
 * Generate dynamic version using file-based approach
 * @param generationTrigger - What triggered the version generation
 * @returns GenerateVersionResult with version data and config settings
 */
async function generateFileBasedVersion(generationTrigger = 'cli') {
    const configPath = (0, path_1.join)(process.cwd(), 'version-manager.json');
    // Check if in git repository
    const isRepo = await (0, git_utils_1.isGitRepository)();
    if (!isRepo) {
        throw new Error('Not a git repository. Please run this command in a git project.');
    }
    // Get git branch and dirty status
    const branch = await (0, git_utils_1.getCurrentBranch)();
    const gitDescribe = await (0, git_utils_1.getGitDescribe)();
    const dirty = gitDescribe.includes('-dirty');
    // Read base version from package.json
    const baseVersion = (0, script_manager_1.getPackageVersion)();
    if (!baseVersion) {
        throw new Error('No version found in package.json. Please add a "version" field to your package.json.');
    }
    // Read config from version-manager.json, or use defaults if not found
    // When config file doesn't exist, falls back to default values:
    // - versions: {} (no custom versions)
    // - versionCalculationMode: "append-commits" (explicit, non-magic behavior)
    const { config: rawConfig, migrated } = readVersionManagerConfig(configPath);
    const config = rawConfig ?? getDefaultVersionManagerConfig();
    // Validate version names
    if (config.versions) {
        validateVersionNames(config.versions);
    }
    // Write migrated config back to disk if migration occurred
    if (migrated && (0, fs_1.existsSync)(configPath)) {
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2) + '\n');
        console.log('✅ Migrated version-manager.json to new format');
        console.log('   Moved runtimeVersion to versions.runtime');
    }
    // Find last commit where package.json version changed
    const lastCommit = await (0, git_utils_1.findLastCommitWhereFieldChanged)('package.json', 'version');
    // Count commits since last change
    let commitsSince = lastCommit
        ? await (0, git_utils_1.countCommitsBetween)(lastCommit, 'HEAD')
        : 0;
    // Check if version has changed in working tree (uncommitted)
    // If current version differs from last committed version, treat as 0 commits
    if (lastCommit) {
        const committedVersion = await (0, git_utils_1.readFieldFromCommit)(lastCommit, 'package.json', 'version');
        if (committedVersion && committedVersion !== baseVersion) {
            // Version changed in working tree (uncommitted bump)
            // Treat this as the new base with 0 commits on top
            commitsSince = 0;
        }
    }
    // Calculate dynamic version
    const dynamicVersion = calculateCodeVersion(baseVersion, commitsSince, config.versionCalculationMode);
    // Generate timestamps
    const timestamps = generateTimestamps();
    // Build result
    const versionData = {
        _generated: 'This file is auto-generated by @justinhaaheim/version-manager. Do not edit.',
        baseVersion,
        branch,
        buildNumber: generateBuildNumber(),
        commitsSince,
        dirty,
        dynamicVersion,
        generationTrigger,
        timestamp: timestamps.timestamp,
        timestampUnix: timestamps.timestampUnix,
        versions: config.versions ?? {},
    };
    return {
        configuredFormat: config.outputFormat,
        versionData,
    };
}
/**
 * Parse a semver version string into components
 * @param version - Semver version string (e.g., "1.2.3" or "1.2.3+5")
 * @returns [major, minor, patch] or null if invalid
 */
function parseSemver(version) {
    // Strip any metadata (e.g., "+5" from "1.2.3+5")
    const cleanVersion = version.split('+')[0];
    const parts = cleanVersion.split('.');
    if (parts.length !== 3) {
        return null;
    }
    const [major, minor, patch] = parts.map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
        return null;
    }
    return [major, minor, patch];
}
/**
 * Increment a semver version based on bump type
 * @param version - Current version string
 * @param bumpType - Type of bump (major, minor, patch)
 * @returns New version string or null if invalid
 */
function incrementVersion(version, bumpType) {
    const parts = parseSemver(version);
    if (!parts) {
        return null;
    }
    let [major, minor, patch] = parts;
    switch (bumpType) {
        case 'major':
            major += 1;
            minor = 0;
            patch = 0;
            break;
        case 'minor':
            minor += 1;
            patch = 0;
            break;
        case 'patch':
            patch += 1;
            break;
    }
    return `${major}.${minor}.${patch}`;
}
/**
 * Generate TypeScript definition file for dynamic version with explicit version types
 * @param outputPath - Path to the JSON file (will generate .d.ts alongside)
 * @param versionKeys - Keys from version-manager.json versions object
 */
function generateTypeDefinitions(outputPath, versionKeys) {
    // Replace .json extension with .d.ts
    const dtsPath = outputPath.replace(/\.json$/, '.d.ts');
    // Generate versions interface shape
    // Use Record<string, never> for empty versions to avoid eslint empty-object-type error
    const versionsShape = versionKeys.length > 0
        ? versionKeys.map((key) => `    ${key}: string;`).join('\n')
        : '    [key: string]: never; // No custom versions defined';
    const content = `/**
 * @generated
 * This file is auto-generated by @justinhaaheim/version-manager.
 * Do not edit manually - changes will be overwritten.
 */
/* eslint-disable */

import type {DynamicVersion} from '@justinhaaheim/version-manager';

export interface DynamicVersionLocal extends Omit<DynamicVersion, 'versions'> {
  versions: {
${versionsShape}
  };
}

declare const version: DynamicVersionLocal;
export default version;
`;
    (0, fs_1.writeFileSync)(dtsPath, content);
}
/**
 * Bump the version in package.json and optionally sync custom versions
 * @param bumpType - Type of bump (major, minor, patch)
 * @param customVersionsToUpdate - Names of custom versions to sync to new version
 * @param silent - Suppress console output
 * @returns Result with old/new versions
 */
async function bumpVersion(bumpType, customVersionsToUpdate = [], silent = false) {
    const configPath = (0, path_1.join)(process.cwd(), 'version-manager.json');
    // Check if in git repository
    const isRepo = await (0, git_utils_1.isGitRepository)();
    if (!isRepo) {
        throw new Error('Not a git repository. Please run this command in a git project.');
    }
    // Check that package.json exists
    const currentPackageVersion = (0, script_manager_1.getPackageVersion)();
    if (!currentPackageVersion) {
        throw new Error('No version found in package.json. Please add a "version" field to your package.json.');
    }
    // Read config
    const { config: rawConfig, migrated } = readVersionManagerConfig(configPath);
    if (!rawConfig) {
        throw new Error('No version-manager.json found. Please run install command first.');
    }
    const config = rawConfig;
    // Validate custom version names exist in config
    for (const versionName of customVersionsToUpdate) {
        if (!config.versions?.[versionName]) {
            throw new Error(`Version "${versionName}" not found in version-manager.json. Available versions: ${Object.keys(config.versions ?? {}).join(', ') || 'none'}`);
        }
    }
    // Generate current computed version to show user what it was
    const { versionData: currentDynamic } = await generateFileBasedVersion();
    const oldVersion = currentDynamic.dynamicVersion;
    // Increment from the current computed version (not the base)
    const newVersion = incrementVersion(oldVersion, bumpType);
    if (!newVersion) {
        throw new Error(`Invalid version format: ${oldVersion}. Expected semver format (e.g., 1.2.3)`);
    }
    // Update package.json version
    const { updatePackageVersion } = await Promise.resolve().then(() => __importStar(require('./script-manager')));
    const packageUpdateSuccess = updatePackageVersion(newVersion);
    if (!packageUpdateSuccess) {
        throw new Error('Failed to update package.json');
    }
    // Update custom versions in config if requested
    const updatedVersions = [];
    if (customVersionsToUpdate.length > 0 && config.versions) {
        for (const versionName of customVersionsToUpdate) {
            config.versions[versionName] = newVersion;
            updatedVersions.push(versionName);
        }
        // Write updated config (including migration if it occurred)
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2) + '\n');
    }
    else if (migrated) {
        // Write migrated config even if no custom versions to update
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2) + '\n');
    }
    if (!silent) {
        console.log('📈 Bumping version...');
        console.log(`   Current: ${oldVersion}`);
        console.log(`   New: ${newVersion}`);
        console.log('✅ Updated package.json');
        if (updatedVersions.length > 0) {
            console.log(`   Updated versions: ${updatedVersions.join(', ')}`);
            console.log('✅ Updated version-manager.json');
        }
        if (migrated) {
            console.log('✅ Migrated version-manager.json to new format');
        }
    }
    return {
        newVersion,
        oldVersion,
        updatedVersions,
    };
}
//# sourceMappingURL=version-generator.js.map