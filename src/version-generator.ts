import type {
  DynamicVersion,
  GenerationTrigger,
  VersionCalculationMode,
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
  readFieldFromCommit,
} from './git-utils';
import {getPackageVersion} from './script-manager';
import {VersionManagerConfigSchema} from './types';

/**
 * Migrate legacy config format to new format
 * @param config - Config that may have legacy runtimeVersion field
 * @returns Migrated config with versions object
 */
function migrateConfigIfNeeded(config: VersionManagerConfig): {
  config: VersionManagerConfig;
  migrated: boolean;
} {
  // If already using new format, no migration needed
  if (config.versions && Object.keys(config.versions).length > 0) {
    return {config, migrated: false};
  }

  // If has legacy runtimeVersion, migrate it
  if (config.runtimeVersion) {
    const migratedConfig: VersionManagerConfig = {
      versionCalculationMode: config.versionCalculationMode,
      versions: {
        runtime: config.runtimeVersion,
      },
    };

    return {config: migratedConfig, migrated: true};
  }

  // No migration needed
  return {config, migrated: false};
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
 * Reserved version names that cannot be used
 */
const RESERVED_VERSION_NAMES = ['base', 'dynamic', 'build'];

/**
 * Validate version names in config
 * @param versions - Versions object from config
 * @throws Error if any version name is reserved
 */
function validateVersionNames(versions: Record<string, unknown>): void {
  for (const name of Object.keys(versions)) {
    if (RESERVED_VERSION_NAMES.includes(name.toLowerCase())) {
      throw new Error(
        `Version name "${name}" is reserved and cannot be used. Reserved names: ${RESERVED_VERSION_NAMES.join(', ')}`,
      );
    }
  }
}

/**
 * Get default version-manager.json configuration
 * @returns Default VersionManagerConfig object
 */
function getDefaultVersionManagerConfig(): VersionManagerConfig {
  return {
    versionCalculationMode: 'append-commits',
    versions: {},
  };
}

/**
 * Write version-manager.json with $schema property for IDE support
 * @param configPath - Path to version-manager.json
 * @param config - Configuration object to write
 */
function writeVersionManagerConfig(
  configPath: string,
  config: VersionManagerConfig,
): void {
  const configWithSchema = {
    $schema:
      './node_modules/@justinhaaheim/version-manager/schemas/version-manager.schema.json',
    ...config,
  };

  writeFileSync(configPath, JSON.stringify(configWithSchema, null, 2) + '\n');
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
  const defaultConfig = getDefaultVersionManagerConfig();

  writeVersionManagerConfig(configPath, defaultConfig);

  if (!silent) {
    console.log('✅ Created version-manager.json with default values:');
    console.log(
      `   versionCalculationMode: ${defaultConfig.versionCalculationMode}`,
    );
    console.log(`   versions: {}`);
  }
}

/**
 * Generate a build number in iOS-compatible format
 * Format: YYYYMMDD.HHmmss.SS (18 characters max)
 * Example: 20251020.143245.67
 * @returns Build number string
 */
function generateBuildNumber(): string {
  const now = new Date();

  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const hundredths = Math.floor(now.getMilliseconds() / 10)
    .toString()
    .padStart(2, '0');

  return `${year}${month}${day}.${hours}${minutes}${seconds}.${hundredths}`;
}

/**
 * Generate timestamps for version tracking
 * @returns Object containing human-readable timestamp and Unix timestamp in milliseconds
 */
function generateTimestamps(): {timestamp: string; timestampUnix: number} {
  return {
    timestamp: new Date().toString(),
    timestampUnix: Date.now(),
  };
}

/**
 * Generate dynamic version using file-based approach
 * @param generationTrigger - What triggered the version generation
 * @returns DynamicVersion object
 */
export async function generateFileBasedVersion(
  generationTrigger: GenerationTrigger = 'cli',
): Promise<DynamicVersion> {
  const configPath = join(process.cwd(), 'version-manager.json');

  // Check if in git repository
  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  // Get git branch and dirty status
  const branch = await getCurrentBranch();
  const gitDescribe = await getGitDescribe();
  const dirty = gitDescribe.includes('-dirty');

  // Read base version from package.json
  const baseVersion = getPackageVersion();
  if (!baseVersion) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  // Read config from version-manager.json, or use defaults if not found
  // When config file doesn't exist, falls back to default values:
  // - versions: {} (no custom versions)
  // - versionCalculationMode: "append-commits" (explicit, non-magic behavior)
  let config =
    readVersionManagerConfig(configPath) ?? getDefaultVersionManagerConfig();

  // Migrate legacy format if needed
  const {config: migratedConfig, migrated} = migrateConfigIfNeeded(config);
  config = migratedConfig;

  // Validate version names
  if (config.versions) {
    validateVersionNames(config.versions);
  }

  // Write migrated config back to disk if migration occurred
  if (migrated && existsSync(configPath)) {
    writeVersionManagerConfig(configPath, config);
    console.log('✅ Migrated version-manager.json to new format');
    console.log('   Moved runtimeVersion to versions.runtime');
  }

  // Find last commit where package.json version changed
  const lastCommit = await findLastCommitWhereFieldChanged(
    'package.json',
    'version',
  );

  // Count commits since last change
  let commitsSince = lastCommit
    ? await countCommitsBetween(lastCommit, 'HEAD')
    : 0;

  // Check if version has changed in working tree (uncommitted)
  // If current version differs from last committed version, treat as 0 commits
  if (lastCommit) {
    const committedVersion = await readFieldFromCommit(
      lastCommit,
      'package.json',
      'version',
    );

    if (committedVersion && committedVersion !== baseVersion) {
      // Version changed in working tree (uncommitted bump)
      // Treat this as the new base with 0 commits on top
      commitsSince = 0;
    }
  }

  // Calculate dynamic version
  const dynamicVersion = calculateCodeVersion(
    baseVersion,
    commitsSince,
    config.versionCalculationMode,
  );

  // Generate timestamps
  const timestamps = generateTimestamps();

  // Build result
  const result: DynamicVersion = {
    baseVersion,
    branch,
    buildNumber: generateBuildNumber(),
    dirty,
    dynamicVersion,
    generationTrigger,
    timestamp: timestamps.timestamp,
    timestampUnix: timestamps.timestampUnix,
    versions: config.versions ?? {},
  };

  return result;
}

/**
 * Bump version type
 */
export type BumpType = 'major' | 'minor' | 'patch';

/**
 * Result of bumping version
 */
export interface BumpVersionResult {
  newVersion: string;
  oldVersion: string;
  updatedVersions: string[]; // Names of custom versions that were updated
}

/**
 * Parse a semver version string into components
 * @param version - Semver version string (e.g., "1.2.3" or "1.2.3+5")
 * @returns [major, minor, patch] or null if invalid
 */
function parseSemver(version: string): [number, number, number] | null {
  // Strip any metadata (e.g., "+5" from "1.2.3+5")
  const cleanVersion = version.split('+')[0];
  const parts = cleanVersion.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [major, minor, patch] = parts.map(Number);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return null;
  }

  return [major, minor, patch];
}

/**
 * Increment a semver version based on bump type
 * @param version - Current version string
 * @param bumpType - Type of bump (major, minor, patch)
 * @returns New version string or null if invalid
 */
function incrementVersion(version: string, bumpType: BumpType): string | null {
  const parts = parseSemver(version);
  if (!parts) {
    return null;
  }

  let [major, minor, patch] = parts;

  switch (bumpType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Bump the version in package.json and optionally sync custom versions
 * @param bumpType - Type of bump (major, minor, patch)
 * @param customVersionsToUpdate - Names of custom versions to sync to new version
 * @param silent - Suppress console output
 * @returns Result with old/new versions
 */
export async function bumpVersion(
  bumpType: BumpType,
  customVersionsToUpdate: string[] = [],
  silent = false,
): Promise<BumpVersionResult> {
  const configPath = join(process.cwd(), 'version-manager.json');

  // Check if in git repository
  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  // Check that package.json exists
  const currentPackageVersion = getPackageVersion();
  if (!currentPackageVersion) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  // Read config
  let config = readVersionManagerConfig(configPath);
  if (!config) {
    throw new Error(
      'No version-manager.json found. Please run install command first.',
    );
  }

  // Migrate if needed
  const {config: migratedConfig, migrated} = migrateConfigIfNeeded(config);
  config = migratedConfig;

  // Validate custom version names exist in config
  for (const versionName of customVersionsToUpdate) {
    if (!config.versions?.[versionName]) {
      throw new Error(
        `Version "${versionName}" not found in version-manager.json. Available versions: ${Object.keys(config.versions ?? {}).join(', ') || 'none'}`,
      );
    }
  }

  // Generate current computed version to show user what it was
  const currentDynamic = await generateFileBasedVersion();
  const oldVersion = currentDynamic.dynamicVersion;

  // Increment from the current computed version (not the base)
  const newVersion = incrementVersion(oldVersion, bumpType);
  if (!newVersion) {
    throw new Error(
      `Invalid version format: ${oldVersion}. Expected semver format (e.g., 1.2.3)`,
    );
  }

  // Update package.json version
  const {updatePackageVersion} = await import('./script-manager');
  const packageUpdateSuccess = updatePackageVersion(newVersion);
  if (!packageUpdateSuccess) {
    throw new Error('Failed to update package.json');
  }

  // Update custom versions in config if requested
  const updatedVersions: string[] = [];
  if (customVersionsToUpdate.length > 0 && config.versions) {
    for (const versionName of customVersionsToUpdate) {
      config.versions[versionName] = newVersion;
      updatedVersions.push(versionName);
    }

    // Write updated config (including migration if it occurred)
    writeVersionManagerConfig(configPath, config);
  } else if (migrated) {
    // Write migrated config even if no custom versions to update
    writeVersionManagerConfig(configPath, config);
  }

  if (!silent) {
    console.log('📈 Bumping version...');
    console.log(`   Current: ${oldVersion}`);
    console.log(`   New: ${newVersion}`);
    console.log('✅ Updated package.json');
    if (updatedVersions.length > 0) {
      console.log(`   Updated versions: ${updatedVersions.join(', ')}`);
      console.log('✅ Updated version-manager.json');
    }
    if (migrated) {
      console.log('✅ Migrated version-manager.json to new format');
    }
  }

  return {
    newVersion,
    oldVersion,
    updatedVersions,
  };
}
