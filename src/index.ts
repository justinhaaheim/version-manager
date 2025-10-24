#!/usr/bin/env node

import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';
import * as readline from 'readline';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs/yargs';

import packageJson from '../package.json';
import {checkGitignore, installGitHooks} from './git-hooks-manager';
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
  createDefaultVersionManagerConfig,
  generateFileBasedVersion,
} from './version-generator';

// TODO: Refactor this to use prompts library
async function promptUser(question: string): Promise<boolean> {
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
  output: {
    alias: 'o',
    default: './dynamic-version.local.json',
    describe: 'Output file path',
    type: 'string' as const,
  },
  silent: {
    alias: 's',
    default: false,
    describe: 'Suppress console output',
    type: 'boolean' as const,
  },
};

// Generate version file command
async function generateVersionFile(
  outputPath: string,
  silent: boolean,
  gitHook = false,
): Promise<void> {
  // Check if .local.json is in .gitignore
  const gitignoreOk = checkGitignore();
  if (!gitignoreOk && !silent) {
    console.log('⚠️  Pattern "*.local.json" is not in .gitignore');
    const shouldAdd = await promptUser('Would you like to add it? (y/n): ');

    if (shouldAdd) {
      const gitignorePath = join(process.cwd(), '.gitignore');
      const content = existsSync(gitignorePath)
        ? readFileSync(gitignorePath, 'utf-8')
        : '';

      writeFileSync(
        gitignorePath,
        content + (content.endsWith('\n') ? '' : '\n') + '*.local.json\n',
      );
      console.log('✅ Added *.local.json to .gitignore');
    } else {
      console.log(
        '⚠️  Continuing without gitignore update. Be careful not to commit dynamic-version.local.json!',
      );
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

  // Check if version-manager.json exists
  const versionManagerPath = join(process.cwd(), 'version-manager.json');
  if (!existsSync(versionManagerPath) && !silent) {
    console.log('\n⚠️  version-manager.json not found.');
    const shouldCreate = await promptUser(
      'Would you like to create it with default values? (y/n): ',
    );

    if (shouldCreate) {
      createDefaultVersionManagerConfig(versionManagerPath, silent);
      console.log(
        '\n   💡 Tip: The version from package.json will be used as the base version.',
      );
      console.log(
        '        Commit both package.json and version-manager.json to git.',
      );
    } else {
      console.log(
        '   ℹ️  Continuing without version-manager.json. Using package.json version with default settings.',
      );
    }
  }

  // Generate version info using file-based approach
  const versionInfo = await generateFileBasedVersion(
    gitHook ? 'git-hook' : 'cli',
  );

  // Write to dynamic-version.local.json
  const finalOutputPath =
    outputPath ?? join(process.cwd(), 'dynamic-version.local.json');
  writeFileSync(finalOutputPath, JSON.stringify(versionInfo, null, 2) + '\n');

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
async function installCommand(
  incrementPatch: boolean,
  outputPath: string,
  silent: boolean,
  noFail: boolean,
  gitHook = false,
): Promise<void> {
  // First, generate the version file
  await generateVersionFile(outputPath, silent, gitHook);

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
      if (hasExisting) {
        console.log(
          '   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.',
        );
      } else {
        const result = addScriptsToPackageJson(false, true);
        if (result.success) {
          console.log(`   ✅ ${result.message}`);
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
async function installScriptsCommand(): Promise<void> {
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

    const shouldForce = await promptUser(
      '\nDo you want to add/update the scripts anyway? (y/N): ',
    );

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
  updateRuntime: boolean,
  silent: boolean,
  commit: boolean,
  tag: boolean,
  push: boolean,
  message?: string,
  gitHook = false,
): Promise<void> {
  // Bump the version
  const result = await bumpVersion(bumpType, updateRuntime, silent);

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

    const {execSync} = await import('child_process');
    const commitMessage =
      message ??
      `Bump version to ${result.newVersion}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

    try {
      // Stage package.json (always) and version-manager.json (if runtime was updated)
      execSync('git add package.json', {stdio: 'pipe'});
      if (updateRuntime) {
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
          console.log(`🏷️  Creating git tag v${result.newVersion}...`);
        }

        const tagMessage = `Version ${result.newVersion}`;
        try {
          execSync(
            `git tag -a v${result.newVersion} -m '${tagMessage.replace(/'/g, "'\\''")}'`,
            {stdio: 'pipe'},
          );

          if (!silent) {
            console.log(`✅ Tag v${result.newVersion} created`);
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
          await generateVersionFile(args.output, args.silent, args['git-hook']);
        },
      )
      .command(
        'install',
        'Install git hooks and scripts',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
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
            !args.fail,
            args['git-hook'],
          );
        },
      )
      .command(
        'install-scripts',
        'Add/update dynamic-version scripts in package.json',
        (yargsInstance) => yargsInstance.options(globalOptions),
        async () => {
          await installScriptsCommand();
        },
      )
      .command(
        'bump',
        'Bump version to next major, minor, or patch',
        (yargsInstance) =>
          yargsInstance.options({
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
            runtime: {
              alias: 'r',
              default: false,
              describe: 'Also update runtimeVersion to match',
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

          await bumpCommand(
            bumpType,
            args.runtime,
            args.silent,
            args.commit,
            args.tag,
            args.push,
            args.message,
            args['git-hook'],
          );
        },
      )
      .help()
      .alias('help', 'h')
      .version(packageJson.version)
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
