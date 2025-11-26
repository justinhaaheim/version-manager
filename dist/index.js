#!/usr/bin/env node
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prompts_1 = require("@inquirer/prompts");
const fs_1 = require("fs");
const path_1 = require("path");
const helpers_1 = require("yargs/helpers");
const yargs_1 = __importDefault(require("yargs/yargs"));
const package_json_1 = __importDefault(require("../package.json"));
const git_hooks_manager_1 = require("./git-hooks-manager");
const output_formatter_1 = require("./output-formatter");
const script_manager_1 = require("./script-manager");
const version_generator_1 = require("./version-generator");
const watcher_1 = require("./watcher");
// Shared options for all commands
const globalOptions = {
    compact: {
        default: false,
        describe: 'Ultra-compact single-line output',
        type: 'boolean',
    },
    fail: {
        default: true,
        describe: 'Exit with error code on failures (use --no-fail to always exit 0)',
        type: 'boolean',
    },
    'git-hook': {
        default: false,
        describe: 'Triggered by git hook (internal use)',
        hidden: true,
        type: 'boolean',
    },
    'non-interactive': {
        alias: 'n',
        default: false,
        describe: 'Run in non-interactive mode (assumes default responses for all prompts)',
        type: 'boolean',
    },
    output: {
        alias: 'o',
        default: './dynamic-version.local.json',
        describe: 'Output file path',
        type: 'string',
    },
    silent: {
        alias: 's',
        default: false,
        describe: 'Suppress console output (informational messages only)',
        type: 'boolean',
    },
    types: {
        alias: 't',
        default: true,
        describe: 'Generate TypeScript definition file with explicit version types (use --no-types to disable)',
        type: 'boolean',
    },
    verbose: {
        default: false,
        describe: 'Verbose output with full status dashboard',
        type: 'boolean',
    },
};
/**
 * Determine output format from CLI flags
 * Returns null if no format flag was specified (allows config to be used as fallback)
 */
function getFormat(silent, compact, verbose) {
    if (silent)
        return 'silent';
    if (compact)
        return 'compact';
    if (verbose)
        return 'verbose';
    return null; // No CLI flag specified, use config value
}
// Generate version file command
async function generateVersionFile(outputPath, format, nonInteractive, generateTypes, gitHook = false) {
    // Note: format can be null if no CLI flag specified; config value will be used as fallback
    const silent = format === 'silent';
    // Determine the actual output paths based on the outputPath parameter
    const finalOutputPath = outputPath ?? (0, path_1.join)(process.cwd(), 'dynamic-version.local.json');
    const dtsFilename = finalOutputPath.replace(/\.json$/, '.d.ts');
    // Check if our specific generated files are in .gitignore
    const gitignorePath = (0, path_1.join)(process.cwd(), '.gitignore');
    const gitignoreContent = (0, fs_1.existsSync)(gitignorePath)
        ? (0, fs_1.readFileSync)(gitignorePath, 'utf-8')
        : '';
    const gitignoreLines = gitignoreContent
        .split('\n')
        .map((line) => line.trim());
    // Extract just the filename from the full path for gitignore check
    const jsonFilename = finalOutputPath.split('/').pop() ?? 'dynamic-version.local.json';
    const dtsFilenameOnly = dtsFilename.split('/').pop() ?? 'dynamic-version.local.d.ts';
    const hasJsonEntry = gitignoreLines.includes(jsonFilename);
    const hasDtsEntry = gitignoreLines.includes(dtsFilenameOnly);
    // Determine what needs to be added
    const entriesToAdd = [];
    if (!hasJsonEntry) {
        entriesToAdd.push(jsonFilename);
    }
    if (!hasDtsEntry && generateTypes) {
        entriesToAdd.push(dtsFilenameOnly);
    }
    if (entriesToAdd.length > 0) {
        // In non-interactive mode OR default mode: add it automatically
        if (nonInteractive || gitHook) {
            // Add silently in non-interactive mode
            const newContent = gitignoreContent +
                (gitignoreContent.endsWith('\n') || gitignoreContent === ''
                    ? ''
                    : '\n') +
                entriesToAdd.join('\n') +
                '\n';
            (0, fs_1.writeFileSync)(gitignorePath, newContent);
            if (!silent) {
                console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
            }
        }
        else if (!silent) {
            // Interactive mode: prompt with default=yes
            const shouldAdd = await (0, prompts_1.confirm)({
                default: true,
                message: `Add ${entriesToAdd.join(', ')} to .gitignore?`,
            });
            if (shouldAdd) {
                const newContent = gitignoreContent +
                    (gitignoreContent.endsWith('\n') || gitignoreContent === ''
                        ? ''
                        : '\n') +
                    entriesToAdd.join('\n') +
                    '\n';
                (0, fs_1.writeFileSync)(gitignorePath, newContent);
                console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
            }
            else {
                console.log(`⚠️  Continuing without gitignore update. Be careful not to commit ${entriesToAdd.join(', ')}!`);
            }
        }
    }
    // Check that package.json exists (required)
    const packageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath)) {
        console.error('❌ No package.json found. This tool requires a package.json with a "version" field.');
        process.exit(1);
    }
    // Note: version-manager.json is optional
    // If missing, generateFileBasedVersion() will use default values:
    // - versionCalculationMode: "append-commits"
    // - versions: {}
    // No prompt needed - just use defaults
    // Generate version info using file-based approach
    const { versionData, configuredFormat } = await (0, version_generator_1.generateFileBasedVersion)(gitHook ? 'git-hook' : 'cli');
    // Write to output file (finalOutputPath already calculated above for gitignore check)
    (0, fs_1.writeFileSync)(finalOutputPath, JSON.stringify(versionData, null, 2) + '\n');
    // Generate TypeScript definition file if requested
    if (generateTypes) {
        const versionKeys = Object.keys(versionData.versions);
        (0, version_generator_1.generateTypeDefinitions)(finalOutputPath, versionKeys);
    }
    // Use CLI format if specified, otherwise fall back to config, otherwise 'normal'
    const effectiveFormat = format ?? configuredFormat ?? 'normal';
    // Format and display output based on format
    if (effectiveFormat !== 'silent') {
        const dtsPath = generateTypes
            ? finalOutputPath.replace(/\.json$/, '.d.ts')
            : undefined;
        const outputData = {
            baseVersion: versionData.baseVersion,
            branch: versionData.branch,
            buildNumber: versionData.buildNumber,
            commitsSince: versionData.commitsSince,
            dirty: versionData.dirty,
            dtsPath,
            dynamicVersion: versionData.dynamicVersion,
            outputPath: finalOutputPath,
            versions: versionData.versions,
        };
        const output = (0, output_formatter_1.formatVersionOutput)(outputData, effectiveFormat);
        console.log(output);
    }
}
// Install command handler
async function installCommand(incrementPatch, outputPath, format, nonInteractive, noFail, force, generateTypes, gitHook = false) {
    const silent = format === 'silent';
    // First, generate the version file
    await generateVersionFile(outputPath, format, nonInteractive, generateTypes, gitHook);
    if (!silent) {
        console.log('\n📦 Installing git hooks...');
    }
    (0, git_hooks_manager_1.installGitHooks)(incrementPatch, silent, noFail);
    if (!silent) {
        console.log('✅ Git hooks installed successfully');
        console.log('   Hooks will auto-update dynamic-version.local.json on:');
        console.log('   - Commits (post-commit)');
        console.log('   - Checkouts (post-checkout)');
        console.log('   - Merges (post-merge)');
        console.log('   - Rebases (post-rewrite)');
        // Add scripts to package.json during install
        console.log('\n📝 Checking package.json scripts...');
        const projectPackageJson = (0, script_manager_1.readPackageJson)();
        if (projectPackageJson) {
            const hasExisting = (0, script_manager_1.hasExistingDynamicVersionScripts)(projectPackageJson);
            if (hasExisting && !force) {
                console.log('   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.');
                console.log('   💡 Use --force to overwrite existing scripts with defaults');
            }
            else {
                const result = (0, script_manager_1.addScriptsToPackageJson)(force, true);
                if (result.success) {
                    console.log(`   ✅ ${result.message}`);
                    if (result.conflictsOverwritten.length > 0) {
                        console.log(`   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`);
                    }
                    console.log('\n   Added scripts:');
                    console.log('   - npm run dynamic-version           # Reinstall/update');
                    console.log('   - npm run dynamic-version:generate   # Generate version file');
                    console.log('   - npm run dynamic-version:install-scripts  # Update scripts');
                    console.log('\n   Added lifecycle scripts (auto-regenerate version):');
                    console.log('   - prebuild   # Runs before npm run build');
                    console.log('   - predev     # Runs before npm run dev');
                    console.log('   - prestart   # Runs before npm run start');
                }
                else {
                    console.log(`   ⚠️  ${result.message}`);
                }
            }
        }
        else {
            console.log('   ⚠️  No package.json found. Scripts not installed.');
        }
    }
}
// Install scripts command handler
async function installScriptsCommand(force) {
    const projectPackageJson = (0, script_manager_1.readPackageJson)();
    if (!projectPackageJson) {
        console.error('❌ No package.json found in current directory');
        process.exit(1);
    }
    const hasExisting = (0, script_manager_1.hasExistingDynamicVersionScripts)(projectPackageJson);
    const conflicts = (0, script_manager_1.getConflictingScripts)(projectPackageJson);
    if (hasExisting) {
        console.log('⚠️  Existing dynamic-version scripts detected:');
        if (conflicts.length > 0) {
            console.log('\nThe following scripts would be overwritten:');
            for (const conflict of conflicts) {
                console.log(`  - ${conflict.name}: ${projectPackageJson.scripts?.[conflict.name]}`);
            }
        }
        let shouldForce = force;
        if (!force) {
            shouldForce = await (0, prompts_1.confirm)({
                default: false,
                message: 'Do you want to add/update the scripts anyway?',
            });
        }
        if (!shouldForce) {
            console.log('Script installation cancelled.');
            process.exit(0);
        }
        const result = (0, script_manager_1.addScriptsToPackageJson)(true);
        if (result.success) {
            console.log('✅', result.message);
            if (result.conflictsOverwritten.length > 0) {
                console.log(`   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`);
            }
            (0, script_manager_1.listDefaultScripts)();
        }
        else {
            console.error('❌', result.message);
            process.exit(1);
        }
    }
    else {
        const result = (0, script_manager_1.addScriptsToPackageJson)(false);
        if (result.success) {
            console.log('✅', result.message);
            (0, script_manager_1.listDefaultScripts)();
        }
        else {
            console.error('❌', result.message);
        }
    }
}
// Bump version command handler
async function bumpCommand(bumpType, customVersionsToUpdate, outputPath, format, nonInteractive, generateTypes, commit, tag, push, message, gitHook = false) {
    const silent = format === 'silent';
    // Bump the version
    const result = await (0, version_generator_1.bumpVersion)(bumpType, customVersionsToUpdate, silent);
    // Regenerate dynamic version file
    if (!silent) {
        console.log('📝 Regenerating dynamic-version.local.json...');
    }
    await generateVersionFile(outputPath, format, nonInteractive, generateTypes, gitHook);
    // Optionally commit
    if (commit) {
        if (!silent) {
            console.log('\n📦 Committing changes...');
        }
        const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const commitMessage = message ?? `Bump version to ${result.newVersion}`;
        try {
            // Stage package.json (always) and version-manager.json (if custom versions were updated)
            // TODO: Extract these CLI calls to git-utils so we have a function to call for `gitAddPackageJson`, etc instead of manually writing out the commands here
            execSync('git add package.json', { stdio: 'pipe' });
            if (result.updatedVersions.length > 0) {
                execSync('git add version-manager.json', { stdio: 'pipe' });
            }
            execSync(`git commit -m '${commitMessage.replace(/'/g, "'\\''")}'`, {
                stdio: 'pipe',
            });
            if (!silent) {
                console.log('✅ Changes committed');
            }
            // Optionally create git tag
            if (tag) {
                if (!silent) {
                    console.log(`🏷️  Creating git tag ${result.newVersion}...`);
                }
                const tagMessage = `Version ${result.newVersion}`;
                try {
                    execSync(`git tag -a ${result.newVersion} -m '${tagMessage.replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
                    if (!silent) {
                        console.log(`✅ Tag ${result.newVersion} created`);
                    }
                }
                catch (error) {
                    if (!silent) {
                        console.error('❌ Failed to create tag:', error);
                    }
                    throw error;
                }
            }
            // Optionally push to remote
            if (push) {
                if (!silent) {
                    console.log('🚀 Pushing to remote...');
                }
                try {
                    // Push commits and tags together
                    if (tag) {
                        execSync('git push --follow-tags', { stdio: 'pipe' });
                        if (!silent) {
                            console.log('✅ Pushed commit and tag to remote');
                        }
                    }
                    else {
                        execSync('git push', { stdio: 'pipe' });
                        if (!silent) {
                            console.log('✅ Pushed commit to remote');
                        }
                    }
                }
                catch (error) {
                    if (!silent) {
                        console.error('❌ Failed to push:', error);
                    }
                    throw error;
                }
            }
        }
        catch (error) {
            if (!silent) {
                console.error('❌ Failed to commit:', error);
            }
            throw error;
        }
    }
    else if (!silent) {
        let tip = `\n💡 Tip: Commit this change with: git add version-manager.json && git commit -m "Bump version to ${result.newVersion}"`;
        if (tag && !commit) {
            tip += `\n💡 Note: --tag requires --commit to create a git tag`;
        }
        if (push && !commit) {
            tip += `\n💡 Note: --push requires --commit to push changes`;
        }
        console.log(tip);
    }
}
// Watch command handler
async function watchCommand(outputPath, debounce, silent, failOnError, generateTypes) {
    if (!silent) {
        console.log('🚀 Starting file watcher...\n');
    }
    const cleanup = await (0, watcher_1.startWatcher)({
        debounce,
        failOnError,
        generateTypes,
        outputPath,
        silent,
    });
    // Handle graceful shutdown on Ctrl+C
    const handleShutdown = () => {
        cleanup();
        process.exit(0);
    };
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
    // Keep process alive
    await new Promise(() => {
        // Never resolves - keeps watching until interrupted
    });
}
async function main() {
    try {
        await (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
            .scriptName('npx @justinhaaheim/version-manager')
            .usage('$0 [command]')
            .command('$0', 'Generate version file', (yargsInstance) => yargsInstance.options(globalOptions), async (args) => {
            const format = getFormat(args.silent, args.compact, args.verbose);
            await generateVersionFile(args.output, format, args['non-interactive'], args.types, args['git-hook']);
        })
            .command('install', 'Install git hooks and scripts', (yargsInstance) => yargsInstance.options({
            ...globalOptions,
            force: {
                default: false,
                describe: 'Force script installation even if existing scripts are detected',
                type: 'boolean',
            },
            'increment-patch': {
                default: false,
                describe: 'Increment patch version with each commit',
                type: 'boolean',
            },
        }), async (args) => {
            const format = getFormat(args.silent, args.compact, args.verbose);
            await installCommand(args['increment-patch'], args.output, format, args['non-interactive'], !args.fail, args.force, args.types, args['git-hook']);
        })
            .command('install-scripts', 'Add/update dynamic-version scripts in package.json', (yargsInstance) => yargsInstance.options({
            ...globalOptions,
            force: {
                default: false,
                describe: 'Force script installation without prompting (skip confirmation)',
                type: 'boolean',
            },
        }), async (args) => {
            await installScriptsCommand(args.force);
        })
            .command('bump [versions..]', 'Bump version to next major, minor, or patch', (yargsInstance) => yargsInstance
            .positional('versions', {
            array: true,
            default: [],
            describe: 'Custom version names to sync (e.g., runtime, pancake)',
            type: 'string',
        })
            .options({
            ...globalOptions,
            commit: {
                alias: 'c',
                default: false,
                describe: 'Commit the version change automatically',
                type: 'boolean',
            },
            major: {
                default: false,
                describe: 'Bump major version (e.g., 1.2.3 -> 2.0.0)',
                type: 'boolean',
            },
            message: {
                alias: 'm',
                describe: 'Custom commit message (only with --commit)',
                type: 'string',
            },
            minor: {
                default: false,
                describe: 'Bump minor version (e.g., 1.2.3 -> 1.3.0)',
                type: 'boolean',
            },
            patch: {
                default: false,
                describe: 'Bump patch version (e.g., 1.2.3 -> 1.2.4)',
                type: 'boolean',
            },
            push: {
                alias: 'p',
                default: false,
                describe: 'Push commit and tag to remote (requires --commit)',
                type: 'boolean',
            },
            tag: {
                alias: 't',
                default: false,
                describe: 'Create git tag (requires --commit)',
                type: 'boolean',
            },
        }), async (args) => {
            // Validate that only one bump type is specified
            const bumpTypes = [args.major, args.minor, args.patch].filter(Boolean);
            if (bumpTypes.length > 1) {
                throw new Error('Only one of --major, --minor, or --patch can be specified');
            }
            // Determine bump type - default to patch if none specified
            let bumpType = 'patch';
            if (args.major) {
                bumpType = 'major';
            }
            else if (args.minor) {
                bumpType = 'minor';
            }
            // Get custom versions to update from positional args
            const customVersionsToUpdate = (args.versions ?? []);
            const format = getFormat(args.silent, args.compact, args.verbose);
            await bumpCommand(bumpType, customVersionsToUpdate, args.output, format, args['non-interactive'], args.types, args.commit, args.tag, args.push, args.message, args['git-hook']);
        })
            .command('watch', 'Watch files and auto-regenerate version on changes', (yargsInstance) => yargsInstance.options({
            ...globalOptions,
            debounce: {
                default: 2000,
                describe: 'Debounce delay in milliseconds',
                type: 'number',
            },
        }), async (args) => {
            await watchCommand(args.output, args.debounce, args.silent, args.fail, args.types);
        })
            .help()
            .alias('help', 'h')
            .version(package_json_1.default.version)
            .alias('version', 'v')
            .example('$0', 'Generate version file only')
            .example('$0 install', 'Install git hooks and scripts')
            .example('$0 install --force', 'Install and force-overwrite scripts')
            .example('$0 install --increment-patch', 'Install with patch increment')
            .example('$0 install --silent --no-fail', 'Install with quiet hooks')
            .example('$0 install-scripts', 'Add/update scripts only')
            .example('$0 install-scripts --force', 'Force-overwrite scripts')
            .example('$0 bump', 'Bump patch version (default)')
            .example('$0 bump --minor', 'Bump minor version')
            .example('$0 bump --major', 'Bump major version')
            .example('$0 bump runtime', 'Bump patch and sync runtime version')
            .example('$0 bump runtime --minor', 'Bump minor and sync runtime')
            .example('$0 bump runtime pancake', 'Bump and sync multiple versions')
            .example('$0 bump --commit', 'Bump and commit automatically')
            .example('$0 watch', 'Watch files and auto-regenerate')
            .example('$0 watch --debounce 500', 'Watch with 500ms debounce')
            .example('$0 watch --silent', 'Watch in silent mode')
            .strict()
            .parseAsync();
        process.exit(0);
    }
    catch (error) {
        if (error instanceof Error) {
            console.error('❌ Failed:', error.message);
        }
        else {
            console.error('❌ Failed:', error);
        }
        // Check if noFail flag was set
        const hasNoFail = process.argv.includes('--no-fail');
        process.exit(hasNoFail ? 0 : 1);
    }
}
// Run immediately if executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Unexpected error:', error);
        const hasNoFail = process.argv.includes('--no-fail');
        process.exit(hasNoFail ? 0 : 1);
    });
}
//# sourceMappingURL=index.js.map