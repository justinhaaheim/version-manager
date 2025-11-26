"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWatcher = startWatcher;
const chokidar_1 = __importDefault(require("chokidar"));
const fs_1 = require("fs");
const path_1 = require("path");
const version_generator_1 = require("./version-generator");
/**
 * Start watching files and auto-regenerate version on changes
 * @param options - Watcher configuration options
 * @returns Promise that resolves when watcher is initialized
 */
async function startWatcher(options) {
    const { outputPath, debounce, silent, failOnError, generateTypes } = options;
    // Track debounce timer
    let debounceTimer = null;
    let changesPending = false;
    let lastChangedFile = null;
    /**
     * Regenerate version file (debounced)
     */
    const regenerateVersion = async (reason) => {
        try {
            const { versionData } = await (0, version_generator_1.generateFileBasedVersion)('cli');
            const content = JSON.stringify(versionData, null, 2) + '\n';
            // Read existing file to check if content changed
            const existingContent = (0, fs_1.existsSync)(outputPath)
                ? (0, fs_1.readFileSync)(outputPath, 'utf8')
                : null;
            // Only write if content changed
            if (existingContent !== content) {
                (0, fs_1.writeFileSync)(outputPath, content);
                // Generate TypeScript definitions if requested
                if (generateTypes) {
                    const versionKeys = Object.keys(versionData.versions);
                    (0, version_generator_1.generateTypeDefinitions)(outputPath, versionKeys);
                }
                if (!silent) {
                    console.log(`✅ Version regenerated (${reason}): ${versionData.dynamicVersion}`);
                }
            }
            else if (!silent) {
                console.log(`ℹ️  No version change detected (${reason})`);
            }
        }
        catch (error) {
            if (!silent) {
                console.error('❌ Failed to regenerate version:', error);
            }
            if (failOnError) {
                throw error;
            }
        }
    };
    /**
     * Handle file change with debouncing
     */
    const handleChange = (path) => {
        lastChangedFile = path;
        changesPending = true;
        // Clear existing timer
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        // Set new timer
        debounceTimer = setTimeout(() => {
            if (changesPending) {
                const reason = lastChangedFile
                    ? `changed: ${lastChangedFile}`
                    : 'files changed';
                void regenerateVersion(reason);
                changesPending = false;
                lastChangedFile = null;
            }
        }, debounce);
    };
    // Read .gitignore if it exists
    const gitignorePath = (0, path_1.join)(process.cwd(), '.gitignore');
    const gitignorePatterns = [];
    if ((0, fs_1.existsSync)(gitignorePath)) {
        const gitignoreContent = (0, fs_1.readFileSync)(gitignorePath, 'utf8');
        const patterns = gitignoreContent
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
        gitignorePatterns.push(...patterns);
    }
    // Always ignore node_modules, .git folder itself, and the output file
    const ignorePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '!**/.git/HEAD', // But DO watch .git/HEAD
        '!**/.git/refs/**', // And .git/refs
        outputPath, // Don't watch the output file itself
        ...gitignorePatterns,
    ];
    // Set up watcher
    const watcher = chokidar_1.default.watch([
        '.git/HEAD', // Current branch/commit
        '.git/refs/**', // Branch references
        'package.json', // Base version
        'version-manager.json', // Config
        '**/*', // All project files
    ], {
        awaitWriteFinish: {
            pollInterval: 50,
            stabilityThreshold: 100,
        },
        cwd: process.cwd(),
        ignoreInitial: true,
        ignored: ignorePatterns,
        // Don't trigger on initial scan
        persistent: true,
    });
    // Set up event handlers
    watcher
        .on('add', (path) => handleChange(path))
        .on('change', (path) => handleChange(path))
        .on('unlink', (path) => handleChange(path));
    // Wait for initial scan to complete
    await new Promise((resolve) => {
        watcher.on('ready', () => {
            if (!silent) {
                console.log('👀 Watching for file changes...');
                console.log(`   Debounce: ${debounce}ms`);
                console.log(`   Output: ${outputPath}`);
                console.log('   Press Ctrl+C to stop\n');
            }
            resolve();
        });
    });
    // Handle graceful shutdown
    const cleanup = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        void watcher.close();
        if (!silent) {
            console.log('\n👋 Watcher stopped');
        }
    };
    // Return cleanup function
    return cleanup;
}
//# sourceMappingURL=watcher.js.map