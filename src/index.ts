#!/usr/bin/env node

import type {GenerateVersionOptions} from './types';

import {writeFileSync} from 'fs';
import {join} from 'path';

import {generateVersion} from './version-generator';

function printHelp() {
  console.log(`
@justinhaaheim/version-manager - Generate unique version identifiers for each commit

Usage:
  npx @justinhaaheim/version-manager [options]

Options:
  -o, --output <path>  Output file path (default: ./package-versions.json)
  -s, --silent         Suppress console output
  -h, --help           Show help

Examples:
  npx @justinhaaheim/version-manager
  npx @justinhaaheim/version-manager --output ./src/version.json
  npx @justinhaaheim/version-manager --silent
`);
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const options: GenerateVersionOptions = {};

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--output' || args[i] === '-o') {
        options.outputPath = args[++i];
      } else if (args[i] === '--silent' || args[i] === '-s') {
        options.silent = true;
      } else if (args[i] === '--help' || args[i] === '-h') {
        printHelp();
        process.exit(0);
      }
    }

    const versionInfo = await generateVersion();

    const outputPath =
      options.outputPath ?? join(process.cwd(), 'package-versions.json');
    writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2));

    if (!options.silent) {
      console.log(`✅ Version info generated: ${versionInfo.humanReadable}`);
      console.log(`📝 Written to: ${outputPath}`);

      if (versionInfo.dirty) {
        console.log('⚠️  Warning: Uncommitted changes detected');
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

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
