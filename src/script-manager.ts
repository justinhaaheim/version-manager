import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

interface PackageJson {
  [key: string]: unknown;
  scripts?: Record<string, string>;
  version?: string;
}

interface ScriptEntry {
  command: string;
  description: string;
  name: string;
}

const DEFAULT_SCRIPTS: ScriptEntry[] = [
  {
    command: 'npx @justinhaaheim/version-manager',
    description: 'Generate an up-to-date version file',
    name: 'dynamic-version',
  },
  {
    command: 'npx @justinhaaheim/version-manager install',
    description: 'Install git hooks and generate version file',
    name: 'dynamic-version:install',
  },
  {
    command: 'npx @justinhaaheim/version-manager install-scripts',
    description: 'Add/update dynamic-version scripts in package.json',
    name: 'dynamic-version:install-scripts',
  },
  {
    command: 'npx @justinhaaheim/version-manager',
    description: 'Generate an up-to-date version file',
    name: 'dynamic-version:generate',
  },
];

// Lifecycle scripts that regenerate version before dev/build/start
const LIFECYCLE_SCRIPTS: ScriptEntry[] = [
  {
    command: 'npx @justinhaaheim/version-manager --no-fail',
    description: 'Generate version file after npm install (for CI)',
    name: 'prepare',
  },
  {
    // command: 'npx @justinhaaheim/version-manager --silent --no-fail',
    command: 'npx @justinhaaheim/version-manager',
    description: 'Regenerate version before build',
    name: 'prebuild',
  },
  {
    // command: 'npx @justinhaaheim/version-manager --silent --no-fail',
    command: 'npx @justinhaaheim/version-manager',
    description: 'Regenerate version before dev server',
    name: 'predev',
  },
  {
    // command: 'npx @justinhaaheim/version-manager --silent --no-fail',
    command: 'npx @justinhaaheim/version-manager',
    description: 'Regenerate version before start',
    name: 'prestart',
  },
];

export function hasExistingDynamicVersionScripts(
  packageJson: PackageJson,
): boolean {
  if (!packageJson.scripts) {
    return false;
  }

  // Check if any script key or value contains 'dynamic-version'
  return Object.entries(packageJson.scripts).some(
    ([key, value]) =>
      key.includes('dynamic-version') || value.includes('dynamic-version'),
  );
}

export function getConflictingScripts(packageJson: PackageJson): ScriptEntry[] {
  if (!packageJson.scripts) {
    return [];
  }

  return DEFAULT_SCRIPTS.filter((script) =>
    Object.prototype.hasOwnProperty.call(packageJson.scripts, script.name),
  );
}

export function readPackageJson(): PackageJson | null {
  const packageJsonPath = join(process.cwd(), 'package.json');

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    console.error('Failed to parse package.json:', error);
    return null;
  }
}

export function writePackageJson(packageJson: PackageJson): boolean {
  const packageJsonPath = join(process.cwd(), 'package.json');

  try {
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to write package.json:', error);
    return false;
  }
}

export function addScriptsToPackageJson(
  force = false,
  includeLifecycleScripts = true,
): {
  conflictsOverwritten: string[];
  message: string;
  success: boolean;
} {
  const packageJson = readPackageJson();

  if (!packageJson) {
    return {
      conflictsOverwritten: [],
      message: 'No package.json found in current directory',
      success: false,
    };
  }

  // Initialize scripts object if it doesn't exist
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  const existingScripts = hasExistingDynamicVersionScripts(packageJson);

  // If not forcing and there are existing dynamic-version scripts, don't modify
  if (!force && existingScripts) {
    return {
      conflictsOverwritten: [],
      message:
        'Existing dynamic-version scripts detected. Skipping script installation to preserve customizations.',
      success: false,
    };
  }

  const conflictsOverwritten: string[] = [];

  // Combine default scripts with lifecycle scripts if requested
  const scriptsToAdd = includeLifecycleScripts
    ? [...DEFAULT_SCRIPTS, ...LIFECYCLE_SCRIPTS]
    : DEFAULT_SCRIPTS;

  // Add or update scripts
  for (const script of scriptsToAdd) {
    const existingScript = packageJson.scripts[script.name];

    // Special handling for 'prepare' script - append instead of replace
    if (script.name === 'prepare' && existingScript) {
      // Check if our command is already in the existing prepare script
      if (!existingScript.includes('@justinhaaheim/version-manager')) {
        // Append our command to the existing prepare script
        packageJson.scripts[script.name] =
          `${existingScript} && ${script.command}`;
      }
      // If it already includes our command, skip to avoid duplicates
    } else {
      // Normal handling for other scripts - replace
      if (existingScript && existingScript !== script.command) {
        conflictsOverwritten.push(script.name);
      }
      packageJson.scripts[script.name] = script.command;
    }
  }

  // Write back to package.json
  const writeSuccess = writePackageJson(packageJson);

  if (!writeSuccess) {
    return {
      conflictsOverwritten: [],
      message: 'Failed to write package.json',
      success: false,
    };
  }

  return {
    conflictsOverwritten,
    message: force
      ? 'Scripts added/updated in package.json'
      : 'Scripts added to package.json',
    success: true,
  };
}

export function listDefaultScripts(includeLifecycleScripts = true): void {
  console.log('\nDefault dynamic-version scripts:');
  for (const script of DEFAULT_SCRIPTS) {
    console.log(`  ${script.name}: ${script.command}`);
    console.log(`    # ${script.description}`);
  }

  if (includeLifecycleScripts) {
    console.log('\nLifecycle scripts (auto-regenerate version):');
    for (const script of LIFECYCLE_SCRIPTS) {
      console.log(`  ${script.name}: ${script.command}`);
      console.log(`    # ${script.description}`);
    }
  }
}

/**
 * Get the version from package.json
 * @returns The version string or null if not found
 */
export function getPackageVersion(): string | null {
  const packageJson = readPackageJson();

  if (!packageJson?.version) {
    return null;
  }

  return packageJson.version;
}

/**
 * Update the version in package.json
 * @param newVersion - The new version string
 * @returns True if successful, false otherwise
 */
export function updatePackageVersion(newVersion: string): boolean {
  const packageJson = readPackageJson();

  if (!packageJson) {
    return false;
  }

  packageJson.version = newVersion;
  return writePackageJson(packageJson);
}
