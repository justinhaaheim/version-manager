"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVersion = generateVersion;
exports.createDefaultVersionManagerConfig = createDefaultVersionManagerConfig;
exports.generateFileBasedVersion = generateFileBasedVersion;
exports.bumpVersion = bumpVersion;
const fs_1 = require("fs");
const path_1 = require("path");
const git_utils_1 = require("./git-utils");
const types_1 = require("./types");
function parseGitDescribe(describe) {
    const cleanDescribe = describe.replace('-dirty', '');
    const match = /^v?(\d+\.\d+\.\d+)-(\d+)-g([a-f0-9]+)$/.exec(cleanDescribe);
    if (match) {
        const [, baseVersion, commitsSince, shortHash] = match;
        return {
            baseVersion,
            commitsSince: parseInt(commitsSince, 10),
            shortHash,
        };
    }
    const tagMatch = /^v?(\d+\.\d+\.\d+)$/.exec(cleanDescribe);
    if (tagMatch) {
        const [, version] = tagMatch;
        return {
            baseVersion: version,
            commitsSince: 0,
            shortHash: '',
        };
    }
    const hashMatch = /^([a-f0-9]+)$/.exec(cleanDescribe);
    if (hashMatch) {
        return null;
    }
    return null;
}
function formatHumanReadable(components, branch, dirty) {
    let result = '';
    if (components) {
        if (components.commitsSince === 0 && !components.shortHash) {
            result = components.baseVersion;
        }
        else {
            result = `${components.baseVersion}+${components.commitsSince}`;
        }
    }
    else {
        result = 'untagged';
    }
    if (branch !== 'main' && branch !== 'master') {
        result += ` (${branch})`;
    }
    if (dirty) {
        result += ' *';
    }
    return result;
}
async function generateVersion(options = {}) {
    const { incrementPatch = false } = options;
    const isRepo = await (0, git_utils_1.isGitRepository)();
    if (!isRepo) {
        throw new Error('Not a git repository. Please run this command in a git project.');
    }
    const describe = await (0, git_utils_1.getGitDescribe)();
    const branch = await (0, git_utils_1.getCurrentBranch)();
    const dirty = describe.includes('-dirty');
    const components = parseGitDescribe(describe);
    let version;
    let humanReadable;
    if (incrementPatch && components) {
        const [major, minor, patch] = components.baseVersion.split('.').map(Number);
        const newPatch = patch + components.commitsSince;
        version = `${major}.${minor}.${newPatch}`;
        if (branch !== 'main' && branch !== 'master') {
            const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
            version += `-${safeBranch}`;
        }
        if (dirty) {
            version += '+dirty';
        }
        humanReadable = version;
    }
    else {
        humanReadable = formatHumanReadable(components, branch, dirty);
        version = components ? components.baseVersion : 'unknown';
    }
    return {
        branch: branch,
        components,
        describe: describe,
        dirty,
        humanReadable,
        timestamp: new Date().toISOString(),
        version,
    };
}
/**
 * Read version-manager.json configuration with Zod validation
 * @param configPath - Path to version-manager.json
 * @returns Configuration object or null if not found/invalid
 */
function readVersionManagerConfig(configPath) {
    try {
        if (!(0, fs_1.existsSync)(configPath)) {
            return null;
        }
        const content = (0, fs_1.readFileSync)(configPath, 'utf-8');
        const json = JSON.parse(content);
        // Use Zod to validate the config
        const result = types_1.VersionManagerConfigSchema.safeParse(json);
        if (!result.success) {
            console.warn(`⚠️  Invalid version-manager.json format:`, result.error.format());
            return null;
        }
        return result.data;
    }
    catch (error) {
        console.warn(`⚠️  Failed to read version-manager.json:`, error);
        return null;
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
 * Create default version-manager.json configuration
 * @param configPath - Path to version-manager.json
 * @param silent - Suppress console output
 */
function createDefaultVersionManagerConfig(configPath, silent = false) {
    const defaultConfig = {
        codeVersionBase: '0.1.0',
        runtimeVersion: '0.1.0',
        versionCalculationMode: 'add-to-patch',
    };
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
    if (!silent) {
        console.log('✅ Created version-manager.json with default values:');
        console.log(`   codeVersionBase: ${defaultConfig.codeVersionBase}`);
        console.log(`   runtimeVersion: ${defaultConfig.runtimeVersion}`);
        console.log(`   versionCalculationMode: ${defaultConfig.versionCalculationMode}`);
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
 * Generate dynamic version using file-based approach
 * @param generationTrigger - What triggered the version generation
 * @returns DynamicVersion object
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
    // Read config (will be null if doesn't exist)
    const config = readVersionManagerConfig(configPath);
    if (!config) {
        // Return default version if config doesn't exist
        return {
            branch,
            buildNumber: generateBuildNumber(),
            codeVersion: '0.1.0',
            dirty,
            generationTrigger,
            runtimeVersion: '0.1.0',
            timestamp: new Date().toISOString(),
        };
    }
    // Find last commit where codeVersionBase changed
    const lastCommit = await (0, git_utils_1.findLastCommitWhereFieldChanged)('version-manager.json', 'codeVersionBase');
    // Count commits since last change
    const commitsSince = lastCommit
        ? await (0, git_utils_1.countCommitsBetween)(lastCommit, 'HEAD')
        : 0;
    // Calculate code version
    const codeVersion = calculateCodeVersion(config.codeVersionBase, commitsSince, config.versionCalculationMode);
    // Build result
    const result = {
        branch,
        buildNumber: generateBuildNumber(),
        codeVersion,
        dirty,
        generationTrigger,
        runtimeVersion: config.runtimeVersion,
        timestamp: new Date().toISOString(),
    };
    return result;
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
 * Bump the version in version-manager.json
 * @param bumpType - Type of bump (major, minor, patch)
 * @param updateRuntime - Whether to also update runtimeVersion to match
 * @param silent - Suppress console output
 * @returns Result with old/new versions
 */
async function bumpVersion(bumpType, updateRuntime = false, silent = false) {
    const configPath = (0, path_1.join)(process.cwd(), 'version-manager.json');
    // Check if in git repository
    const isRepo = await (0, git_utils_1.isGitRepository)();
    if (!isRepo) {
        throw new Error('Not a git repository. Please run this command in a git project.');
    }
    // Read current config
    const config = readVersionManagerConfig(configPath);
    if (!config) {
        throw new Error('version-manager.json not found. Run the install command first or create the file manually.');
    }
    // Generate current computed version to show user what it was
    const currentDynamic = await generateFileBasedVersion();
    const oldVersion = currentDynamic.codeVersion;
    // Increment from the current computed version (not the base)
    const newVersion = incrementVersion(oldVersion, bumpType);
    if (!newVersion) {
        throw new Error(`Invalid version format: ${oldVersion}. Expected semver format (e.g., 1.2.3)`);
    }
    // Update config
    config.codeVersionBase = newVersion;
    if (updateRuntime) {
        config.runtimeVersion = newVersion;
    }
    // Write updated config
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2) + '\n');
    if (!silent) {
        console.log('📈 Bumping version...');
        console.log(`   Current: ${oldVersion}`);
        console.log(`   New base: ${newVersion}`);
        if (updateRuntime) {
            console.log(`   Runtime version: ${newVersion}`);
        }
        console.log('✅ Updated version-manager.json');
    }
    return {
        newVersion,
        oldVersion,
        updatedRuntimeVersion: updateRuntime,
    };
}
//# sourceMappingURL=version-generator.js.map