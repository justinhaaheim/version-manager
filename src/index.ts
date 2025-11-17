#!/usr/bin/env node

import {confirm} from '@inquirer/prompts';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs/yargs';

import packageJson from '../package.json';
import {installGitHooks} from './git-hooks-manager';
import {
  addScriptsToPackageJson,
  getConflictingScripts,
  hasExistingDynamicVersionScripts,
  listDefaultScripts,
  readPackageJson,
} from './script-manager';
import {
  type BumpType,
  bumpVersion,
  generateFileBasedVersion,
  generateTypeDefinitions,
} from './version-generator';
import {startWatcher} from './watcher';

// Shared options for all commands
const globalOptions = {
  fail: {
    default: true,
    describe:
      'Exit with error code on failures (use --no-fail to always exit 0)',
    type: 'boolean' as const,
  },
  'git-hook': {
    default: false,
    describe: 'Triggered by git hook (internal use)',
    hidden: true,
    type: 'boolean' as const,
  },
  'non-interactive': {
    alias: 'n',
    default: false,
    describe:
      'Run in non-interactive mode (assumes default responses for all prompts)',
    type: 'boolean' as const,
  },
  output: {
    alias: 'o',
    default: './dynamic-version.local.json',
    describe: 'Output file path',
    type: 'string' as const,
  },
  silent: {
    alias: 's',
    default: false,
    describe: 'Suppress console output (informational messages only)',
    type: 'boolean' as const,
  },
  types: {
    alias: 't',
    default: true,
    describe:
      'Generate TypeScript definition file with explicit version types (use --no-types to disable)',
    type: 'boolean' as const,
  },
};

// Generate version file command
async function generateVersionFile(
  outputPath: string,
  silent: boolean,
  nonInteractive: boolean,
  generateTypes: boolean,
  gitHook = false,
): Promise<void> {
  // Check if dynamic-version.local.json and *.local.d.ts are in .gitignore
  const gitignorePath = join(process.cwd(), '.gitignore');
  const gitignoreContent = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8')
    : '';
  const gitignoreLines = gitignoreContent
    .split('\n')
    .map((line) => line.trim());
  const hasJsonEntry = gitignoreLines.includes('dynamic-version.local.json');
  const hasDtsEntry = gitignoreLines.includes('*.local.d.ts');

  // Determine what needs to be added
  const entriesToAdd: string[] = [];
  if (!hasJsonEntry) {
    entriesToAdd.push('dynamic-version.local.json');
  }
  if (!hasDtsEntry && generateTypes) {
    entriesToAdd.push('*.local.d.ts');
  }

  if (entriesToAdd.length > 0) {
    // In non-interactive mode OR default mode: add it automatically
    if (nonInteractive || gitHook) {
      // Add silently in non-interactive mode
      const newContent =
        gitignoreContent +
        (gitignoreContent.endsWith('\n') || gitignoreContent === ''
          ? ''
          : '\n') +
        entriesToAdd.join('\n') +
        '\n';
      writeFileSync(gitignorePath, newContent);
      if (!silent) {
        console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
      }
    } else if (!silent) {
      // Interactive mode: prompt with default=yes
      const shouldAdd = await confirm({
        default: true,
        message: `Add ${entriesToAdd.join(', ')} to .gitignore?`,
      });

      if (shouldAdd) {
        const newContent =
          gitignoreContent +
          (gitignoreContent.endsWith('\n') || gitignoreContent === ''
            ? ''
            : '\n') +
          entriesToAdd.join('\n') +
          '\n';
        writeFileSync(gitignorePath, newContent);
        console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
      } else {
        console.log(
          `⚠️  Continuing without gitignore update. Be careful not to commit ${entriesToAdd.join(', ')}!`,
        );
      }
    }
  }

  // Check that package.json exists (required)
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(
      '❌ No package.json found. This tool requires a package.json with a "version" field.',
    );
    process.exit(1);
  }

  // Note: version-manager.json is optional
  // If missing, generateFileBasedVersion() will use default values:
  // - versionCalculationMode: "append-commits"
  // - versions: {}
  // No prompt needed - just use defaults

  // Generate version info using file-based approach
  const versionInfo = await generateFileBasedVersion(
    gitHook ? 'git-hook' : 'cli',
  );

  // Write to dynamic-version.local.json
  const finalOutputPath =
    outputPath ?? join(process.cwd(), 'dynamic-version.local.json');
  writeFileSync(finalOutputPath, JSON.stringify(versionInfo, null, 2) + '\n');

  // Generate TypeScript definition file if requested
  if (generateTypes) {
    const versionKeys = Object.keys(versionInfo.versions);
    generateTypeDefinitions(finalOutputPath, versionKeys);
  }

  if (!silent) {
    console.log(`✅ Version generated:`);
    console.log(`   Base version: ${versionInfo.baseVersion}`);
    console.log(`   Dynamic version: ${versionInfo.dynamicVersion}`);
    if (Object.keys(versionInfo.versions).length > 0) {
      console.log(
        `   Custom versions: ${JSON.stringify(versionInfo.versions, null, 2).replace(/\n/g, '\n   ')}`,
      );
    }
    if (versionInfo.buildNumber) {
      console.log(`   Build number: ${versionInfo.buildNumber}`);
    }
    console.log(`📝 Written to: ${finalOutputPath}`);
    if (generateTypes) {
      const dtsPath = finalOutputPath.replace(/\.json$/, '.d.ts');
      console.log(`📘 TypeScript definitions: ${dtsPath}`);
    }
  }
}

// Install command handler
async function installCommand(
  incrementPatch: boolean,
  outputPath: string,
  silent: boolean,
  nonInteractive: boolean,
  noFail: boolean,
  force: boolean,
  generateTypes: boolean,
  gitHook = false,
): Promise<void> {
  // First, generate the version file
  await generateVersionFile(
    outputPath,
    silent,
    nonInteractive,
    generateTypes,
    gitHook,
  );

  if (!silent) {
    console.log('\n📦 Installing git hooks...');
  }

  installGitHooks(incrementPatch, silent, noFail);

  if (!silent) {
    console.log('✅ Git hooks installed successfully');
    console.log('   Hooks will auto-update dynamic-version.local.json on:');
    console.log('   - Commits (post-commit)');
    console.log('   - Checkouts (post-checkout)');
    console.log('   - Merges (post-merge)');
    console.log('   - Rebases (post-rewrite)');

    // Add scripts to package.json during install
    console.log('\n📝 Checking package.json scripts...');
    const projectPackageJson = readPackageJson();
    if (projectPackageJson) {
      const hasExisting = hasExistingDynamicVersionScripts(projectPackageJson);
      if (hasExisting && !force) {
        console.log(
          '   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.',
        );
        console.log(
          '   💡 Use --force to overwrite existing scripts with defaults',
        );
      } else {
        const result = addScriptsToPackageJson(force, true);
        if (result.success) {
          console.log(`   ✅ ${result.message}`);
          if (result.conflictsOverwritten.length > 0) {
            console.log(
              `   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`,
            );
          }
          console.log('\n   Added scripts:');
          console.log(
            '   - npm run dynamic-version           # Reinstall/update',
          );
          console.log(
            '   - npm run dynamic-version:generate   # Generate version file',
          );
          console.log(
            '   - npm run dynamic-version:install-scripts  # Update scripts',
          );
          console.log(
            '\n   Added lifecycle scripts (auto-regenerate version):',
          );
          console.log('   - prebuild   # Runs before npm run build');
          console.log('   - predev     # Runs before npm run dev');
          console.log('   - prestart   # Runs before npm run start');
        } else {
          console.log(`   ⚠️  ${result.message}`);
        }
      }
    } else {
      console.log('   ⚠️  No package.json found. Scripts not installed.');
    }
  }
}

// Install scripts command handler
async function installScriptsCommand(force: boolean): Promise<void> {
  const projectPackageJson = readPackageJson();
  if (!projectPackageJson) {
    console.error('❌ No package.json found in current directory');
    process.exit(1);
  }

  const hasExisting = hasExistingDynamicVersionScripts(projectPackageJson);
  const conflicts = getConflictingScripts(projectPackageJson);

  if (hasExisting) {
    console.log('⚠️  Existing dynamic-version scripts detected:');
    if (conflicts.length > 0) {
      console.log('\nThe following scripts would be overwritten:');
      for (const conflict of conflicts) {
        console.log(
          `  - ${conflict.name}: ${projectPackageJson.scripts?.[conflict.name]}`,
        );
      }
    }

    let shouldForce = force;
    if (!force) {
      shouldForce = await confirm({
        default: false,
        message: 'Do you want to add/update the scripts anyway?',
      });
    }

    if (!shouldForce) {
      console.log('Script installation cancelled.');
      process.exit(0);
    }

    const result = addScriptsToPackageJson(true);
    if (result.success) {
      console.log('✅', result.message);
      if (result.conflictsOverwritten.length > 0) {
        console.log(
          `   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`,
        );
      }
      listDefaultScripts();
    } else {
      console.error('❌', result.message);
      process.exit(1);
    }
  } else {
    const result = addScriptsToPackageJson(false);
    if (result.success) {
      console.log('✅', result.message);
      listDefaultScripts();
    } else {
      console.error('❌', result.message);
    }
  }
}

// Bump version command handler
async function bumpCommand(
  bumpType: BumpType,
  customVersionsToUpdate: string[],
  outputPath: string,
  silent: boolean,
  nonInteractive: boolean,
  generateTypes: boolean,
  commit: boolean,
  tag: boolean,
  push: boolean,
  message?: string,
  gitHook = false,
): Promise<void> {
  // Bump the version
  const result = await bumpVersion(bumpType, customVersionsToUpdate, silent);

  // Regenerate dynamic version file
  if (!silent) {
    console.log('📝 Regenerating dynamic-version.local.json...');
  }
  await generateVersionFile(
    outputPath,
    silent,
    nonInteractive,
    generateTypes,
    gitHook,
  );

  // Optionally commit
  if (commit) {
    if (!silent) {
      console.log('\n📦 Committing changes...');
    }

    const {execSync} = await import('child_process');
    const commitMessage = message ?? `Bump version to ${result.newVersion}`;

    try {
      // Stage package.json (always) and version-manager.json (if custom versions were updated)
      // TODO: Extract these CLI calls to git-utils so we have a function to call for `gitAddPackageJson`, etc instead of manually writing out the commands here
      execSync('git add package.json', {stdio: 'pipe'});
      if (result.updatedVersions.length > 0) {
        execSync('git add version-manager.json', {stdio: 'pipe'});
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
          execSync(
            `git tag -a ${result.newVersion} -m '${tagMessage.replace(/'/g, "'\\''")}'`,
            {stdio: 'pipe'},
          );

          if (!silent) {
            console.log(`✅ Tag ${result.newVersion} created`);
          }
        } catch (error) {
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
            execSync('git push --follow-tags', {stdio: 'pipe'});
            if (!silent) {
              console.log('✅ Pushed commit and tag to remote');
            }
          } else {
            execSync('git push', {stdio: 'pipe'});
            if (!silent) {
              console.log('✅ Pushed commit to remote');
            }
          }
        } catch (error) {
          if (!silent) {
            console.error('❌ Failed to push:', error);
          }
          throw error;
        }
      }
    } catch (error) {
      if (!silent) {
        console.error('❌ Failed to commit:', error);
      }
      throw error;
    }
  } else if (!silent) {
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
async function watchCommand(
  outputPath: string,
  debounce: number,
  silent: boolean,
  failOnError: boolean,
  generateTypes: boolean,
): Promise<void> {
  if (!silent) {
    console.log('🚀 Starting file watcher...\n');
  }

  const cleanup = await startWatcher({
    debounce,
    failOnError,
    generateTypes,
    outputPath,
    silent,
  });

  // Handle graceful shutdown on Ctrl+C
  const handleShutdown = (): void => {
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
    await yargs(hideBin(process.argv))
      .scriptName('npx @justinhaaheim/version-manager')
      .usage('$0 [command]')
      .command(
        '$0',
        'Generate version file',
        (yargsInstance) => yargsInstance.options(globalOptions),
        async (args) => {
          await generateVersionFile(
            args.output,
            args.silent,
            args['non-interactive'],
            args.types,
            args['git-hook'],
          );
        },
      )
      .command(
        'install',
        'Install git hooks and scripts',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            force: {
              default: false,
              describe:
                'Force script installation even if existing scripts are detected',
              type: 'boolean' as const,
            },
            'increment-patch': {
              default: false,
              describe: 'Increment patch version with each commit',
              type: 'boolean' as const,
            },
          }),
        async (args) => {
          await installCommand(
            args['increment-patch'],
            args.output,
            args.silent,
            args['non-interactive'],
            !args.fail,
            args.force,
            args.types,
            args['git-hook'],
          );
        },
      )
      .command(
        'install-scripts',
        'Add/update dynamic-version scripts in package.json',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            force: {
              default: false,
              describe:
                'Force script installation without prompting (skip confirmation)',
              type: 'boolean' as const,
            },
          }),
        async (args) => {
          await installScriptsCommand(args.force);
        },
      )
      .command(
        'bump [versions..]',
        'Bump version to next major, minor, or patch',
        (yargsInstance) =>
          yargsInstance
            .positional('versions', {
              array: true,
              default: [],
              describe: 'Custom version names to sync (e.g., runtime, pancake)',
              type: 'string' as const,
            })
            .options({
              ...globalOptions,
              commit: {
                alias: 'c',
                default: false,
                describe: 'Commit the version change automatically',
                type: 'boolean' as const,
              },
              major: {
                default: false,
                describe: 'Bump major version (e.g., 1.2.3 -> 2.0.0)',
                type: 'boolean' as const,
              },
              message: {
                alias: 'm',
                describe: 'Custom commit message (only with --commit)',
                type: 'string' as const,
              },
              minor: {
                default: false,
                describe: 'Bump minor version (e.g., 1.2.3 -> 1.3.0)',
                type: 'boolean' as const,
              },
              patch: {
                default: false,
                describe: 'Bump patch version (e.g., 1.2.3 -> 1.2.4)',
                type: 'boolean' as const,
              },
              push: {
                alias: 'p',
                default: false,
                describe: 'Push commit and tag to remote (requires --commit)',
                type: 'boolean' as const,
              },
              tag: {
                alias: 't',
                default: false,
                describe: 'Create git tag (requires --commit)',
                type: 'boolean' as const,
              },
            }),
        async (args) => {
          // Validate that only one bump type is specified
          const bumpTypes = [args.major, args.minor, args.patch].filter(
            Boolean,
          );
          if (bumpTypes.length > 1) {
            throw new Error(
              'Only one of --major, --minor, or --patch can be specified',
            );
          }

          // Determine bump type - default to patch if none specified
          let bumpType: BumpType = 'patch';
          if (args.major) {
            bumpType = 'major';
          } else if (args.minor) {
            bumpType = 'minor';
          }

          // Get custom versions to update from positional args
          const customVersionsToUpdate = (args.versions ?? []) as string[];

          await bumpCommand(
            bumpType,
            customVersionsToUpdate,
            args.output,
            args.silent,
            args['non-interactive'],
            args.types,
            args.commit,
            args.tag,
            args.push,
            args.message,
            args['git-hook'],
          );
        },
      )
      .command(
        'watch',
        'Watch files and auto-regenerate version on changes',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            debounce: {
              default: 2000,
              describe: 'Debounce delay in milliseconds',
              type: 'number' as const,
            },
          }),
        async (args) => {
          await watchCommand(
            args.output,
            args.debounce,
            args.silent,
            args.fail,
            args.types,
          );
        },
      )
      .help()
      .alias('help', 'h')
      .version(packageJson.version)
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
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Failed:', error.message);
    } else {
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
