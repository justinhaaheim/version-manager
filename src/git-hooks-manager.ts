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

function getGitHooksPath(): string {
  // Check if a custom hooks path is configured
  try {
    const customPath = execSync('git config core.hooksPath', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (customPath) {
      // If it's a relative path, resolve it relative to the git root
      if (!customPath.startsWith('/')) {
        return join(process.cwd(), customPath);
      }
      return customPath;
    }
  } catch {
    // No custom hooks path configured, use default
  }

  // Default to .git/hooks
  return join(process.cwd(), '.git', 'hooks');
}

export function installGitHooks(
  incrementPatch = false,
  silent = false,
  noFail = false,
): void {
  const gitHooksDir = getGitHooksPath();

  if (!existsSync(gitHooksDir)) {
    throw new Error(`Git hooks directory not found: ${gitHooksDir}`);
  }

  console.log(`📦 Installing git hooks to: ${gitHooksDir}`);

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
        console.log(
          '   ℹ️  Detected local development environment, using: bun run test:local',
        );
      }
    } catch {
      // If we can't read package.json, default to npx
    }
  }

  const incrementFlag = incrementPatch ? ' --increment-patch' : '';
  const silentFlag = silent ? ' --silent' : '';
  const noFailFlag = noFail ? ' --no-fail' : '';
  const finalCommand = `${runCommand}${incrementFlag}${silentFlag}${noFailFlag}`;

  // Check if we're using Husky
  const isHusky = gitHooksDir.includes('.husky');

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(gitHooksDir, hookName);
    let hookContent: string;

    if (isHusky) {
      // For Husky, we need to check if it's the special _ directory
      if (gitHooksDir.endsWith('/_')) {
        // Skip the Husky internal directory - we should install in parent
        console.log(
          `   ⚠️  Detected Husky internal directory, installing to parent directory`,
        );
        const parentDir = join(gitHooksDir, '..');
        const parentHookPath = join(parentDir, hookName);

        if (existsSync(parentHookPath)) {
          const existingContent = readFileSync(parentHookPath, 'utf-8');
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
              `${finalCommand}\n`;
            writeFileSync(parentHookPath, updatedContent);
            chmodSync(parentHookPath, '755');
            console.log(`   ✓ Appended to existing ${hookName} hook`);
          } else if (matchingLineIndices.length === 1) {
            // Exactly one match - replace that line
            lines[matchingLineIndices[0]] = finalCommand;
            writeFileSync(parentHookPath, lines.join('\n'));
            chmodSync(parentHookPath, '755');
            console.log(`   ✓ Updated ${hookName} hook`);
          } else {
            // Multiple matches - warn user
            console.log(
              `   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${parentHookPath}`,
            );
          }
        } else {
          // New hook - create it
          hookContent = `# Dynamic version generator
${finalCommand}
`;
          writeFileSync(parentHookPath, hookContent);
          chmodSync(parentHookPath, '755');
          console.log(`   ✓ Created ${hookName} hook in Husky directory`);
        }
      } else {
        // Regular Husky directory
        if (existsSync(hookPath)) {
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
              `${finalCommand}\n`;
            writeFileSync(hookPath, updatedContent);
            chmodSync(hookPath, '755');
            console.log(`   ✓ Appended to existing ${hookName} hook`);
          } else if (matchingLineIndices.length === 1) {
            // Exactly one match - replace that line
            lines[matchingLineIndices[0]] = finalCommand;
            writeFileSync(hookPath, lines.join('\n'));
            chmodSync(hookPath, '755');
            console.log(`   ✓ Updated ${hookName} hook`);
          } else {
            // Multiple matches - warn user
            console.log(
              `   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`,
            );
          }
        } else {
          // New hook - create it
          hookContent = `# Dynamic version generator
${finalCommand}
`;
          writeFileSync(hookPath, hookContent);
          chmodSync(hookPath, '755');
          console.log(`   ✓ Created ${hookName} hook`);
        }
      }
    } else {
      // Regular git hooks
      if (existsSync(hookPath)) {
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
            existingContent +
            '\n' +
            `# Dynamic version generator\n` +
            `${finalCommand}\n`;
          writeFileSync(hookPath, updatedContent);
          chmodSync(hookPath, '755');
          console.log(`   ✓ Appended to existing ${hookName} hook`);
        } else if (matchingLineIndices.length === 1) {
          // Exactly one match - replace that line
          lines[matchingLineIndices[0]] = finalCommand;
          writeFileSync(hookPath, lines.join('\n'));
          chmodSync(hookPath, '755');
          console.log(`   ✓ Updated ${hookName} hook`);
        } else {
          // Multiple matches - warn user
          console.log(
            `   ⚠️  ${hookName}: Found ${matchingLineIndices.length} version-manager commands. Please manually edit ${hookPath}`,
          );
        }
      } else {
        // New hook - create it
        hookContent = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

${finalCommand}
`;
        writeFileSync(hookPath, hookContent);
        chmodSync(hookPath, '755');
        console.log(`   ✓ Created ${hookName} hook`);
      }
    }
  }
}
