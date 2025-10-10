import {execSync} from 'child_process';
import {chmodSync, existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

const HOOK_NAMES = [
  'post-checkout',
  'post-commit',
  'post-merge',
  'post-rewrite',
];

export function checkGitignore(): boolean {
  const gitignorePath = join(process.cwd(), '.gitignore');

  if (!existsSync(gitignorePath)) {
    return false;
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  return content.includes('*.local.json') || content.includes('.local.json');
}

/**
 * Check if Husky is installed in the project
 */
function isHuskyInstalled(): boolean {
  const packageJsonPath = join(process.cwd(), 'package.json');

  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Check if husky is in dependencies or devDependencies
    return !!(
      packageJson.devDependencies?.husky ?? packageJson.dependencies?.husky
    );
  } catch {
    return false;
  }
}

/**
 * Install Husky and initialize it in the project
 */
function ensureHuskyInstalled(silent = false): void {
  if (isHuskyInstalled()) {
    if (!silent) {
      console.log('   ℹ️  Husky already installed');
    }
    return;
  }

  if (!silent) {
    console.log('   📦 Installing Husky...');
  }

  try {
    // Install husky as dev dependency
    execSync('npm install --save-dev husky', {
      cwd: process.cwd(),
      stdio: silent ? 'pipe' : 'inherit',
    });

    if (!silent) {
      console.log('   ✅ Husky installed');
      console.log('   🔧 Initializing Husky...');
    }

    // Run husky init to set up .husky directory and prepare script
    execSync('npx husky init', {
      cwd: process.cwd(),
      stdio: silent ? 'pipe' : 'inherit',
    });

    if (!silent) {
      console.log('   ✅ Husky initialized');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to install Husky: ${errorMessage}`);
  }
}

/**
 * Get the path to the Husky hooks directory
 * Always returns .husky/ - we no longer support .git/hooks
 */
function getHuskyHooksPath(): string {
  return join(process.cwd(), '.husky');
}

/**
 * Update an existing Husky hook file
 */
function updateExistingHook(
  hookPath: string,
  command: string,
  hookName: string,
  silent: boolean,
): void {
  const existingContent = readFileSync(hookPath, 'utf-8');
  const lines = existingContent.split('\n');

  // Find lines containing our command patterns
  const matchingLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes('bun run test:local') ||
      lines[i].includes('npx @justinhaaheim/version-manager')
    ) {
      matchingLineIndices.push(i);
    }
  }

  if (matchingLineIndices.length === 0) {
    // No matches - append to end
    const updatedContent =
      existingContent.trim() +
      '\n\n# Dynamic version generator\n' +
      `${command}\n`;
    writeFileSync(hookPath, updatedContent);
    chmodSync(hookPath, '755');
    if (!silent) {
      console.log(`   ✓ Appended to existing ${hookName} hook`);
    }
  } else if (matchingLineIndices.length === 1) {
    // Exactly one match - replace that line
    lines[matchingLineIndices[0]] = command;
    writeFileSync(hookPath, lines.join('\n'));
    chmodSync(hookPath, '755');
    if (!silent) {
      console.log(`   ✓ Updated ${hookName} hook`);
    }
  } else {
    // Multiple matches - warn user
    if (!silent) {
      console.log(
        `   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`,
      );
    }
  }
}

/**
 * Create a new Husky hook file
 */
function createNewHook(
  hookPath: string,
  command: string,
  hookName: string,
  silent: boolean,
): void {
  // Husky hook template
  const hookContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Dynamic version generator
${command}
`;

  writeFileSync(hookPath, hookContent);
  chmodSync(hookPath, '755');

  if (!silent) {
    console.log(`   ✓ Created ${hookName} hook`);
  }
}

/**
 * Install git hooks using Husky
 */
export function installGitHooks(
  incrementPatch = false,
  silent = false,
  noFail = false,
): void {
  // Ensure Husky is installed
  ensureHuskyInstalled(silent);

  const huskyDir = getHuskyHooksPath();

  if (!existsSync(huskyDir)) {
    throw new Error(
      `Husky directory not found: ${huskyDir}. This should have been created by husky init.`,
    );
  }

  if (!silent) {
    console.log(`📦 Installing git hooks to: ${huskyDir}`);
  }

  // Detect if we're running from the version-manager development directory itself
  const currentPackageJsonPath = join(process.cwd(), 'package.json');
  let runCommand = 'npx @justinhaaheim/version-manager';

  if (existsSync(currentPackageJsonPath)) {
    try {
      const packageJson = JSON.parse(
        readFileSync(currentPackageJsonPath, 'utf-8'),
      ) as {name?: string};
      if (packageJson.name === '@justinhaaheim/version-manager') {
        // We're in the development directory, use local script
        runCommand = 'bun run test:local';
        if (!silent) {
          console.log(
            '   ℹ️  Detected local development environment, using: bun run test:local',
          );
        }
      }
    } catch {
      // If we can't read package.json, default to npx
    }
  }

  const incrementFlag = incrementPatch ? ' --increment-patch' : '';
  const silentFlag = silent ? ' --silent' : '';
  const noFailFlag = noFail ? ' --no-fail' : '';
  const finalCommand = `${runCommand}${incrementFlag}${silentFlag}${noFailFlag}`;

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(huskyDir, hookName);

    if (existsSync(hookPath)) {
      // Hook exists - update it
      updateExistingHook(hookPath, finalCommand, hookName, silent);
    } else {
      // Create new hook
      createNewHook(hookPath, finalCommand, hookName, silent);
    }
  }
}
