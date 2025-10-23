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
const fs_1 = require("fs");
const path_1 = require("path");
const readline = __importStar(require("readline"));
const helpers_1 = require("yargs/helpers");
const yargs_1 = __importDefault(require("yargs/yargs"));
const git_hooks_manager_1 = require("./git-hooks-manager");
const script_manager_1 = require("./script-manager");
const version_generator_1 = require("./version-generator");
// TODO: Refactor this to use prompts library
async function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return await new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}
// Shared options for all commands
const globalOptions = {
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
    output: {
        alias: 'o',
        default: './dynamic-version.local.json',
        describe: 'Output file path',
        type: 'string',
    },
    silent: {
        alias: 's',
        default: false,
        describe: 'Suppress console output',
        type: 'boolean',
    },
};
// Generate version file command
async function generateVersionFile(outputPath, silent, gitHook = false) {
    // Check if .local.json is in .gitignore
    const gitignoreOk = (0, git_hooks_manager_1.checkGitignore)();
    if (!gitignoreOk && !silent) {
        console.log('⚠️  Pattern "*.local.json" is not in .gitignore');
        const shouldAdd = await promptUser('Would you like to add it? (y/n): ');
        if (shouldAdd) {
            const gitignorePath = (0, path_1.join)(process.cwd(), '.gitignore');
            const content = (0, fs_1.existsSync)(gitignorePath)
                ? (0, fs_1.readFileSync)(gitignorePath, 'utf-8')
                : '';
            (0, fs_1.writeFileSync)(gitignorePath, content + (content.endsWith('\n') ? '' : '\n') + '*.local.json\n');
            console.log('✅ Added *.local.json to .gitignore');
        }
        else {
            console.log('⚠️  Continuing without gitignore update. Be careful not to commit dynamic-version.local.json!');
        }
    }
    // Check that package.json exists (required)
    const packageJsonPath = (0, path_1.join)(process.cwd(), 'package.json');
    if (!(0, fs_1.existsSync)(packageJsonPath)) {
        console.error('❌ No package.json found. This tool requires a package.json with a "version" field.');
        process.exit(1);
    }
    // Check if version-manager.json exists
    const versionManagerPath = (0, path_1.join)(process.cwd(), 'version-manager.json');
    if (!(0, fs_1.existsSync)(versionManagerPath) && !silent) {
        console.log('\n⚠️  version-manager.json not found.');
        const shouldCreate = await promptUser('Would you like to create it with default values? (y/n): ');
        if (shouldCreate) {
            (0, version_generator_1.createDefaultVersionManagerConfig)(versionManagerPath, silent);
            console.log('\n   💡 Tip: The version from package.json will be used as the base version.');
            console.log('        Commit both package.json and version-manager.json to git.');
        }
        else {
            console.log('   ℹ️  Continuing without version-manager.json. Using package.json version with default settings.');
        }
    }
    // Generate version info using file-based approach
    const versionInfo = await (0, version_generator_1.generateFileBasedVersion)(gitHook ? 'git-hook' : 'cli');
    // Write to dynamic-version.local.json
    const finalOutputPath = outputPath ?? (0, path_1.join)(process.cwd(), 'dynamic-version.local.json');
    (0, fs_1.writeFileSync)(finalOutputPath, JSON.stringify(versionInfo, null, 2) + '\n');
    if (!silent) {
        console.log(`✅ Version generated:`);
        console.log(`   Base version: ${versionInfo.baseVersion}`);
        console.log(`   Dynamic version: ${versionInfo.dynamicVersion}`);
        console.log(`   Runtime version: ${versionInfo.runtimeVersion}`);
        if (versionInfo.buildNumber) {
            console.log(`   Build number: ${versionInfo.buildNumber}`);
        }
        console.log(`📝 Written to: ${finalOutputPath}`);
    }
}
// Install command handler
async function installCommand(incrementPatch, outputPath, silent, noFail, gitHook = false) {
    // First, generate the version file
    await generateVersionFile(outputPath, silent, gitHook);
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
        const packageJson = (0, script_manager_1.readPackageJson)();
        if (packageJson) {
            const hasExisting = (0, script_manager_1.hasExistingDynamicVersionScripts)(packageJson);
            if (hasExisting) {
                console.log('   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.');
            }
            else {
                const result = (0, script_manager_1.addScriptsToPackageJson)(false, true);
                if (result.success) {
                    console.log(`   ✅ ${result.message}`);
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
async function installScriptsCommand() {
    const packageJson = (0, script_manager_1.readPackageJson)();
    if (!packageJson) {
        console.error('❌ No package.json found in current directory');
        process.exit(1);
    }
    const hasExisting = (0, script_manager_1.hasExistingDynamicVersionScripts)(packageJson);
    const conflicts = (0, script_manager_1.getConflictingScripts)(packageJson);
    if (hasExisting) {
        console.log('⚠️  Existing dynamic-version scripts detected:');
        if (conflicts.length > 0) {
            console.log('\nThe following scripts would be overwritten:');
            for (const conflict of conflicts) {
                console.log(`  - ${conflict.name}: ${packageJson.scripts?.[conflict.name]}`);
            }
        }
        const shouldForce = await promptUser('\nDo you want to add/update the scripts anyway? (y/N): ');
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
async function bumpCommand(bumpType, updateRuntime, silent, commit, tag, push, message, gitHook = false) {
    // Bump the version
    const result = await (0, version_generator_1.bumpVersion)(bumpType, updateRuntime, silent);
    // Regenerate dynamic version file
    if (!silent) {
        console.log('📝 Regenerating dynamic-version.local.json...');
    }
    await generateVersionFile('./dynamic-version.local.json', silent, gitHook);
    // Optionally commit
    if (commit) {
        if (!silent) {
            console.log('\n📦 Committing changes...');
        }
        const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
        const commitMessage = message ??
            `Bump version to ${result.newVersion}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
        try {
            // Stage package.json (always) and version-manager.json (if runtime was updated)
            execSync('git add package.json', { stdio: 'pipe' });
            if (updateRuntime) {
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
                    console.log(`🏷️  Creating git tag v${result.newVersion}...`);
                }
                const tagMessage = `Version ${result.newVersion}`;
                try {
                    execSync(`git tag -a v${result.newVersion} -m '${tagMessage.replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
                    if (!silent) {
                        console.log(`✅ Tag v${result.newVersion} created`);
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
async function main() {
    try {
        await (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
            .scriptName('npx @justinhaaheim/version-manager')
            .usage('$0 [command]')
            .command('$0', 'Generate version file', (yargsInstance) => yargsInstance.options(globalOptions), async (args) => {
            await generateVersionFile(args.output, args.silent, args['git-hook']);
        })
            .command('install', 'Install git hooks and scripts', (yargsInstance) => yargsInstance.options({
            ...globalOptions,
            'increment-patch': {
                default: false,
                describe: 'Increment patch version with each commit',
                type: 'boolean',
            },
        }), async (args) => {
            await installCommand(args['increment-patch'], args.output, args.silent, !args.fail, args['git-hook']);
        })
            .command('install-scripts', 'Add/update dynamic-version scripts in package.json', (yargsInstance) => yargsInstance.options(globalOptions), async () => {
            await installScriptsCommand();
        })
            .command('bump', 'Bump version to next major, minor, or patch', (yargsInstance) => yargsInstance.options({
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
            runtime: {
                alias: 'r',
                default: false,
                describe: 'Also update runtimeVersion to match',
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
            await bumpCommand(bumpType, args.runtime, args.silent, args.commit, args.tag, args.push, args.message, args['git-hook']);
        })
            .help()
            .alias('help', 'h')
            .version()
            .alias('version', 'v')
            .example('$0', 'Generate version file only')
            .example('$0 install', 'Install git hooks and scripts')
            .example('$0 install --increment-patch', 'Install with patch increment')
            .example('$0 install --silent --no-fail', 'Install with quiet hooks')
            .example('$0 install-scripts', 'Add/update scripts only')
            .example('$0 bump', 'Bump patch version (default)')
            .example('$0 bump --minor', 'Bump minor version')
            .example('$0 bump --major', 'Bump major version')
            .example('$0 bump --commit', 'Bump and commit automatically')
            .example('$0 bump --runtime', 'Bump and update runtime version')
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