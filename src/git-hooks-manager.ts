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

  const packageName = '@justinhaaheim/version-manager';
  const incrementFlag = incrementPatch ? ' --increment-patch' : '';

  const hookScript = `#!/bin/sh
# Auto-generated hook by @justinhaaheim/version-manager
# This hook updates the dynamic-version.local.json file

# Run the version generator using npx
npx ${packageName}${incrementFlag} 2>/dev/null || true

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
          `npx ${packageName}${incrementFlag} 2>/dev/null || true\n`;

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
