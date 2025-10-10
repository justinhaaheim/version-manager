import type {
  DynamicVersion,
  VersionCalculationMode,
  VersionComponents,
  VersionInfo,
  VersionManagerConfig,
} from './types';

import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {
  countCommitsBetween,
  findLastCommitWhereFieldChanged,
  getCurrentBranch,
  getGitDescribe,
  isGitRepository,
} from './git-utils';
import {VersionManagerConfigSchema} from './types';

function parseGitDescribe(describe: string): VersionComponents | null {
  const cleanDescribe = describe.replace('-dirty', '');
  const match = /^v?(\d+\.\d+\.\d+)-(\d+)-g([a-f0-9]+)$/.exec(cleanDescribe);

  if (match) {
    const [, baseVersion, commitsSince, shortHash] = match;
    return {
      baseVersion,
      commitsSince: parseInt(commitsSince, 10),
      shortHash,
    };
  }

  const tagMatch = /^v?(\d+\.\d+\.\d+)$/.exec(cleanDescribe);
  if (tagMatch) {
    const [, version] = tagMatch;
    return {
      baseVersion: version,
      commitsSince: 0,
      shortHash: '',
    };
  }

  const hashMatch = /^([a-f0-9]+)$/.exec(cleanDescribe);
  if (hashMatch) {
    return null;
  }

  return null;
}

function formatHumanReadable(
  components: VersionComponents | null,
  branch: string,
  dirty: boolean,
): string {
  let result = '';

  if (components) {
    if (components.commitsSince === 0 && !components.shortHash) {
      result = components.baseVersion;
    } else {
      result = `${components.baseVersion}+${components.commitsSince}`;
    }
  } else {
    result = 'untagged';
  }

  if (branch !== 'main' && branch !== 'master') {
    result += ` (${branch})`;
  }

  if (dirty) {
    result += ' *';
  }

  return result;
}

export async function generateVersion(
  options: {incrementPatch?: boolean} = {},
): Promise<VersionInfo> {
  const {incrementPatch = false} = options;

  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  const describe = await getGitDescribe();
  const branch = await getCurrentBranch();
  const dirty = describe.includes('-dirty');

  const components = parseGitDescribe(describe);

  let version: string;
  let humanReadable: string;

  if (incrementPatch && components) {
    const [major, minor, patch] = components.baseVersion.split('.').map(Number);
    const newPatch = patch + components.commitsSince;
    version = `${major}.${minor}.${newPatch}`;

    if (branch !== 'main' && branch !== 'master') {
      const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
      version += `-${safeBranch}`;
    }

    if (dirty) {
      version += '+dirty';
    }

    humanReadable = version;
  } else {
    humanReadable = formatHumanReadable(components, branch, dirty);
    version = components ? components.baseVersion : 'unknown';
  }

  return {
    branch: branch,
    components,
    describe: describe,
    dirty,
    humanReadable,
    timestamp: new Date().toISOString(),
    version,
  };
}

/**
 * Read version-manager.json configuration with Zod validation
 * @param configPath - Path to version-manager.json
 * @returns Configuration object or null if not found/invalid
 */
function readVersionManagerConfig(
  configPath: string,
): VersionManagerConfig | null {
  try {
    if (!existsSync(configPath)) {
      return null;
    }

    const content = readFileSync(configPath, 'utf-8');
    const json: unknown = JSON.parse(content);

    // Use Zod to validate the config
    const result = VersionManagerConfigSchema.safeParse(json);

    if (!result.success) {
      console.warn(
        `⚠️  Invalid version-manager.json format:`,
        result.error.format(),
      );
      return null;
    }

    return result.data;
  } catch (error) {
    console.warn(`⚠️  Failed to read version-manager.json:`, error);
    return null;
  }
}

/**
 * Calculate code version based on calculation mode
 * @param baseVersion - Base version from config
 * @param commitsSince - Number of commits since last base version change
 * @param mode - Calculation mode
 * @returns Calculated code version
 */
function calculateCodeVersion(
  baseVersion: string,
  commitsSince: number,
  mode: VersionCalculationMode,
): string {
  if (commitsSince === 0) {
    return baseVersion;
  }

  if (mode === 'add-to-patch') {
    // Mode A: Add commits to patch version
    const parts = baseVersion.split('.');
    if (parts.length !== 3) {
      return baseVersion; // Invalid semver format
    }

    const [major, minor, patch] = parts.map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return baseVersion; // Invalid semver format
    }

    return `${major}.${minor}.${patch + commitsSince}`;
  } else if (mode === 'append-commits') {
    // Mode B: Append commit count
    return `${baseVersion}+${commitsSince}`;
  }

  // Fallback to mode A if unrecognized mode
  const parts = baseVersion.split('.');
  if (parts.length !== 3) {
    return baseVersion;
  }

  const [major, minor, patch] = parts.map(Number);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return baseVersion;
  }

  return `${major}.${minor}.${patch + commitsSince}`;
}

/**
 * Create default version-manager.json configuration
 * @param configPath - Path to version-manager.json
 * @param silent - Suppress console output
 */
export function createDefaultVersionManagerConfig(
  configPath: string,
  silent = false,
): void {
  const defaultConfig: VersionManagerConfig = {
    codeVersionBase: '0.1.0',
    runtimeVersion: '0.1.0',
    versionCalculationMode: 'add-to-patch',
  };

  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');

  if (!silent) {
    console.log('✅ Created version-manager.json with default values:');
    console.log(`   codeVersionBase: ${defaultConfig.codeVersionBase}`);
    console.log(`   runtimeVersion: ${defaultConfig.runtimeVersion}`);
    console.log(
      `   versionCalculationMode: ${defaultConfig.versionCalculationMode}`,
    );
  }
}

/**
 * Generate dynamic version using file-based approach
 * @returns DynamicVersion object
 */
export async function generateFileBasedVersion(): Promise<DynamicVersion> {
  const configPath = join(process.cwd(), 'version-manager.json');

  // Check if in git repository
  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  // Read config (will be null if doesn't exist)
  const config = readVersionManagerConfig(configPath);

  if (!config) {
    // Return default version if config doesn't exist
    return {
      codeVersion: '0.1.0',
      runtimeVersion: '0.1.0',
    };
  }

  // Find last commit where codeVersionBase changed
  const lastCommit = await findLastCommitWhereFieldChanged(
    'version-manager.json',
    'codeVersionBase',
  );

  // Count commits since last change
  const commitsSince = lastCommit
    ? await countCommitsBetween(lastCommit, 'HEAD')
    : 0;

  // Calculate code version
  const codeVersion = calculateCodeVersion(
    config.codeVersionBase,
    commitsSince,
    config.versionCalculationMode,
  );

  // Build result
  const result: DynamicVersion = {
    codeVersion,
    runtimeVersion: config.runtimeVersion,
  };

  // Add BUILD_NUMBER from environment if present
  if (process.env.BUILD_NUMBER) {
    result.buildNumber = process.env.BUILD_NUMBER;
  }

  return result;
}
