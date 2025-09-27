#!/usr/bin/env node

import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';
import * as readline from 'readline';

import {checkGitignore, installGitHooks} from './git-hooks-manager';
import {generateVersion} from './version-generator';

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

function printHelp() {
  console.log(`
@justinhaaheim/version-manager - Git hooks-based dynamic version generator

Usage:
  npx @justinhaaheim/version-manager [options]

Options:
  --install           Install git hooks for automatic version updates
  --increment-patch   Increment patch version with each commit
  -o, --output <path> Output file path (default: ./dynamic-version.local.json)
  -s, --silent        Suppress console output
  -h, --help          Show help

Examples:
  npx @justinhaaheim/version-manager
  npx @justinhaaheim/version-manager --install
  npx @justinhaaheim/version-manager --install --increment-patch
  npx @justinhaaheim/version-manager --output ./src/version.json
`);
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let shouldInstall = false;
    let incrementPatch = false;
    let outputPath: string | undefined;
    let silent = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--install') {
        shouldInstall = true;
      } else if (args[i] === '--increment-patch') {
        incrementPatch = true;
      } else if (args[i] === '--output' || args[i] === '-o') {
        outputPath = args[++i];
      } else if (args[i] === '--silent' || args[i] === '-s') {
        silent = true;
      } else if (args[i] === '--help' || args[i] === '-h') {
        printHelp();
        process.exit(0);
      }
    }

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

    // Generate version info
    const versionInfo = await generateVersion({incrementPatch});

    // Write to dynamic-version.local.json
    const finalOutputPath =
      outputPath ?? join(process.cwd(), 'dynamic-version.local.json');
    writeFileSync(finalOutputPath, JSON.stringify(versionInfo, null, 2));

    if (!silent) {
      console.log(`✅ Version info generated: ${versionInfo.humanReadable}`);
      console.log(`📝 Written to: ${finalOutputPath}`);

      if (versionInfo.dirty) {
        console.log('⚠️  Warning: Uncommitted changes detected');
      }
    }

    // Install git hooks if requested
    if (shouldInstall) {
      if (!silent) {
        console.log('\n📦 Installing git hooks...');
      }
      installGitHooks(incrementPatch);
      if (!silent) {
        console.log('✅ Git hooks installed successfully');
        console.log('   Hooks will auto-update dynamic-version.local.json on:');
        console.log('   - Commits (post-commit)');
        console.log('   - Checkouts (post-checkout)');
        console.log('   - Merges (post-merge)');
        console.log('   - Rebases (post-rewrite)');
      }
    }

    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Failed to generate version info:', error.message);
    } else {
      console.error('❌ Failed to generate version info:', error);
    }
    process.exit(1);
  }
}

// Run immediately if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
