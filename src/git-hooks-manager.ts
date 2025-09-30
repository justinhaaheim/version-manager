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

export function installGitHooks(incrementPatch = false): void {
  const gitHooksDir = join(process.cwd(), '.git', 'hooks');

  if (!existsSync(gitHooksDir)) {
    throw new Error('Not a git repository (no .git/hooks directory found)');
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
        console.log(
          '   ℹ️  Detected local development environment, using: bun run test:local',
        );
      }
    } catch {
      // If we can't read package.json, default to npx
    }
  }

  const incrementFlag = incrementPatch ? ' --increment-patch' : '';
  const finalCommand = runCommand + incrementFlag;

  const hookScript = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

# Run the version generator silently
${finalCommand} >/dev/null 2>&1 || true

# Exit successfully regardless of version generator result
exit 0
`;

  for (const hookName of HOOK_NAMES) {
    const hookPath = join(gitHooksDir, hookName);

    if (existsSync(hookPath)) {
      const existingContent = readFileSync(hookPath, 'utf-8');

      if (existingContent.includes('version-manager')) {
        writeFileSync(hookPath, hookScript);
        chmodSync(hookPath, '755');
        console.log(`   ✓ Updated ${hookName} hook`);
      } else {
        const updatedContent =
          existingContent +
          '\n' +
          `# Dynamic version generator\n` +
          `${finalCommand} >/dev/null 2>&1 || true\n`;

        writeFileSync(hookPath, updatedContent);
        chmodSync(hookPath, '755');
        console.log(`   ✓ Appended to existing ${hookName} hook`);
      }
    } else {
      writeFileSync(hookPath, hookScript);
      chmodSync(hookPath, '755');
      console.log(`   ✓ Created ${hookName} hook`);
    }
  }
}
