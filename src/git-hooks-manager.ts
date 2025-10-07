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

        hookContent = `# Dynamic version generator
${finalCommand}
`;

        writeFileSync(parentHookPath, hookContent);
        chmodSync(parentHookPath, '755');
        console.log(`   ✓ Created ${hookName} hook in Husky directory`);
      } else {
        // Regular Husky directory
        hookContent = `# Dynamic version generator
${finalCommand}
`;

        if (existsSync(hookPath)) {
          const existingContent = readFileSync(hookPath, 'utf-8');

          if (existingContent.includes('version-manager')) {
            writeFileSync(hookPath, hookContent);
            chmodSync(hookPath, '755');
            console.log(`   ✓ Updated ${hookName} hook`);
          } else {
            // Append to existing Husky hook
            const updatedContent =
              existingContent.trim() +
              '\n\n# Dynamic version generator\n' +
              `${finalCommand}\n`;
            writeFileSync(hookPath, updatedContent);
            chmodSync(hookPath, '755');
            console.log(`   ✓ Appended to existing ${hookName} hook`);
          }
        } else {
          writeFileSync(hookPath, hookContent);
          chmodSync(hookPath, '755');
          console.log(`   ✓ Created ${hookName} hook`);
        }
      }
    } else {
      // Regular git hooks
      hookContent = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

${finalCommand}
`;

      if (existsSync(hookPath)) {
        const existingContent = readFileSync(hookPath, 'utf-8');

        if (existingContent.includes('version-manager')) {
          writeFileSync(hookPath, hookContent);
          chmodSync(hookPath, '755');
          console.log(`   ✓ Updated ${hookName} hook`);
        } else {
          const updatedContent =
            existingContent +
            '\n' +
            `# Dynamic version generator\n` +
            `${finalCommand}\n`;

          writeFileSync(hookPath, updatedContent);
          chmodSync(hookPath, '755');
          console.log(`   ✓ Appended to existing ${hookName} hook`);
        }
      } else {
        writeFileSync(hookPath, hookContent);
        chmodSync(hookPath, '755');
        console.log(`   ✓ Created ${hookName} hook`);
      }
    }
  }
}
