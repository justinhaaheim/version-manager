#!/usr/bin/env node

import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';
import * as readline from 'readline';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs/yargs';

import {checkGitignore, installGitHooks} from './git-hooks-manager';
import {
  addScriptsToPackageJson,
  getConflictingScripts,
  hasExistingDynamicVersionScripts,
  listDefaultScripts,
  readPackageJson,
} from './script-manager';
import {
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
        '\n   💡 Tip: Commit version-manager.json to track your base versions.',
      );
    } else {
      console.log(
        '   ℹ️  Continuing without version-manager.json. Using default version 0.1.0.',
      );
    }
  }

  // Generate version info using file-based approach
  const versionInfo = await generateFileBasedVersion();

  // Write to dynamic-version.local.json
  const finalOutputPath =
    outputPath ?? join(process.cwd(), 'dynamic-version.local.json');
  writeFileSync(finalOutputPath, JSON.stringify(versionInfo, null, 2) + '\n');

  if (!silent) {
    console.log(`✅ Version generated:`);
    console.log(`   Code version: ${versionInfo.codeVersion}`);
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
): Promise<void> {
  // First, generate the version file
  await generateVersionFile(outputPath, silent);

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
    const packageJson = readPackageJson();
    if (packageJson) {
      const hasExisting = hasExistingDynamicVersionScripts(packageJson);
      if (hasExisting) {
        console.log(
          '   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.',
        );
      } else {
        const result = addScriptsToPackageJson(false);
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
  const packageJson = readPackageJson();
  if (!packageJson) {
    console.error('❌ No package.json found in current directory');
    process.exit(1);
  }

  const hasExisting = hasExistingDynamicVersionScripts(packageJson);
  const conflicts = getConflictingScripts(packageJson);

  if (hasExisting) {
    console.log('⚠️  Existing dynamic-version scripts detected:');
    if (conflicts.length > 0) {
      console.log('\nThe following scripts would be overwritten:');
      for (const conflict of conflicts) {
        console.log(
          `  - ${conflict.name}: ${packageJson.scripts?.[conflict.name]}`,
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
          await generateVersionFile(args.output, args.silent);
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
      .help()
      .alias('help', 'h')
      .version()
      .alias('version', 'v')
      .example('$0', 'Generate version file only')
      .example('$0 install', 'Install git hooks and scripts')
      .example('$0 install --increment-patch', 'Install with patch increment')
      .example('$0 install --silent --no-fail', 'Install with quiet hooks')
      .example('$0 install-scripts', 'Add/update scripts only')
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
