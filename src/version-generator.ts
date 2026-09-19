import type {
  DynamicVersion,
  GenerationTrigger,
  LegacyVersionManagerConfig,
  VersionCalculationMode,
  VersionManagerConfig,
  VersionMode,
} from './types';

import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {
  applyBranchSuffix,
  type BranchCommitCounts,
  type BranchSuffixDecision,
  decideBranchSuffix,
  isSuffixExemptBranch,
  stripPrerelease,
} from './branch-suffix';
import {
  countCommitsBetween,
  countCommitsOnHead,
  countCommitsSinceRef,
  findLastCommitWhereFieldChanged,
  getCurrentBranch,
  getGitDescribe,
  isGitRepository,
  readFieldFromCommit,
} from './git-utils';
import {getPackageVersion, readPreCommitBaseVersion} from './script-manager';
import {
  LegacyVersionManagerConfigSchema,
  VersionManagerConfigSchema,
} from './types';

/**
 * Migrate legacy config format to new format
 * @param legacyConfig - Legacy config with runtimeVersion field
 * @returns Migrated config with versions object
 */
function migrateLegacyConfig(
  legacyConfig: LegacyVersionManagerConfig,
): VersionManagerConfig {
  const versions = {...(legacyConfig.versions ?? {})};

  // Move runtimeVersion to versions.runtime
  versions.runtime = legacyConfig.runtimeVersion;

  return {
    branchSuffix: {enabled: false, mainBranches: ['main', 'master']},
    versionCalculationMode: legacyConfig.versionCalculationMode,
    versionMode: 'dynamic-file',
    versions,
  };
}

/**
 * Read version-manager.json configuration with Zod validation and migration
 * @param configPath - Path to version-manager.json
 * @returns Object with config (or null if not found), and whether migration occurred
 */
function readVersionManagerConfig(configPath: string): {
  config: VersionManagerConfig | null;
  migrated: boolean;
} {
  try {
    if (!existsSync(configPath)) {
      return {config: null, migrated: false};
    }

    const content = readFileSync(configPath, 'utf-8');
    const json: unknown = JSON.parse(content);

    // Try parsing with new schema first
    const newResult = VersionManagerConfigSchema.safeParse(json);
    if (newResult.success) {
      return {config: newResult.data, migrated: false};
    }

    // Try parsing with legacy schema
    const legacyResult = LegacyVersionManagerConfigSchema.safeParse(json);
    if (legacyResult.success) {
      // Migrate legacy config to new format
      const migratedConfig = migrateLegacyConfig(legacyResult.data);
      return {config: migratedConfig, migrated: true};
    }

    // Neither schema worked - invalid config
    console.warn(
      `⚠️  Invalid version-manager.json format:`,
      newResult.error.format(),
    );
    return {config: null, migrated: false};
  } catch (error) {
    console.warn(`⚠️  Failed to read version-manager.json:`, error);
    return {config: null, migrated: false};
  }
}

/**
 * Calculate code version based on calculation mode
 * @param baseVersion - Base version from config
 * @param commitsSince - Number of commits since last base version change
 * @param mode - Calculation mode
 * @returns Calculated code version
 */
export function calculateCodeVersion(
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
const RESERVED_VERSION_NAMES = ['base', 'dynamic', 'build', 'main'];

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
    branchSuffix: {enabled: false, mainBranches: ['main', 'master']},
    versionCalculationMode: 'append-commits',
    versionMode: 'dynamic-file',
    versions: {},
  };
}

/**
 * Take the two commit measurements the branch suffix needs (D5).
 *
 * Both are taken up front rather than lazily so that a null can only ever
 * mean "this measurement failed", never "we did not look" (critical rule 6).
 *
 * @param mainBranches - Configured main branches, tried in order
 * @returns Grouped counts; each field is null only when its git command failed
 */
async function measureBranchCommitCounts(
  mainBranches: string[],
): Promise<BranchCommitCounts> {
  let mergeBase: {count: number; ref: string} | null = null;

  for (const ref of mainBranches) {
    const count = await countCommitsSinceRef(ref);
    if (count !== null) {
      mergeBase = {count, ref};
      break;
    }
  }

  return {mergeBase, total: await countCommitsOnHead()};
}

/**
 * Work out whether this version should carry a branch suffix, performing the
 * git measurements only when the knob is on and the branch is eligible.
 *
 * @param config - Parsed version-manager.json
 * @param branch - Current branch name ("HEAD" when detached)
 * @param extraCommits - 1 in the pre-commit path (the about-to-happen commit), else 0
 */
async function planBranchSuffix(
  config: VersionManagerConfig,
  branch: string,
  extraCommits: number,
): Promise<BranchSuffixDecision> {
  const {enabled, mainBranches} = config.branchSuffix;

  if (!enabled || isSuffixExemptBranch(branch, mainBranches)) {
    return {decoration: null, warning: null};
  }

  return decideBranchSuffix({
    branch,
    counts: await measureBranchCommitCounts(mainBranches),
    enabled,
    extraCommits,
    mainBranches,
  });
}

/**
 * Apply a suffix decision to a computed version.
 *
 * @param version - The version as computed by the normal calculation
 * @param decision - The outcome of planBranchSuffix()
 * @returns The decorated version, or the input unchanged when no suffix applies
 */
function decorateVersion(
  version: string,
  decision: BranchSuffixDecision,
): string {
  if (decision.decoration === null) {
    return version;
  }

  return applyBranchSuffix(
    version,
    decision.decoration.sanitisedBranch,
    decision.decoration.n,
  );
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

  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');

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
 * Result from generateFileBasedVersion including config settings
 */
export interface GenerateVersionResult {
  /**
   * Set when the branch-suffix commit count fell back to a different
   * measurement, or could not be taken at all. null means either that the
   * knob is off or that the measurement was clean — never that it was skipped
   * silently.
   */
  branchSuffixWarning: string | null;
  /** Output format from config (if set) */
  configuredFormat: 'silent' | 'compact' | 'normal' | 'verbose' | undefined;
  /** The generated version data */
  versionData: DynamicVersion;
}

/**
 * Generate dynamic version using file-based approach
 * @param generationTrigger - What triggered the version generation
 * @returns GenerateVersionResult with version data and config settings
 */
export async function generateFileBasedVersion(
  generationTrigger: GenerationTrigger = 'cli',
): Promise<GenerateVersionResult> {
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
  const rawBaseVersion = getPackageVersion();
  if (!rawBaseVersion) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  // Read config from version-manager.json, or use defaults if not found
  // When config file doesn't exist, falls back to default values:
  // - versions: {} (no custom versions)
  // - versionCalculationMode: "append-commits" (explicit, non-magic behavior)
  const {config: rawConfig, migrated} = readVersionManagerConfig(configPath);
  const config = rawConfig ?? getDefaultVersionManagerConfig();

  // Validate version names
  if (config.versions) {
    validateVersionNames(config.versions);
  }

  // Write migrated config back to disk if migration occurred
  if (migrated && existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('✅ Migrated version-manager.json to new format');
    console.log('   Moved runtimeVersion to versions.runtime');
  }

  // D3: while the knob is on, version-manager owns the prerelease segment.
  // Strip it before anything calculates with the version — calculateCodeVersion()
  // returns its input unchanged on a 4-part split, so an un-stripped decorated
  // version would freeze silently rather than fail.
  const ownsPrerelease = config.branchSuffix.enabled;
  const baseVersion = ownsPrerelease
    ? stripPrerelease(rawBaseVersion)
    : rawBaseVersion;

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
    const rawCommittedVersion = await readFieldFromCommit(
      lastCommit,
      'package.json',
      'version',
    );
    const committedVersion =
      rawCommittedVersion !== null && ownsPrerelease
        ? stripPrerelease(rawCommittedVersion)
        : rawCommittedVersion;

    if (committedVersion && committedVersion !== baseVersion) {
      // Version changed in working tree (uncommitted bump)
      // Treat this as the new base with 0 commits on top
      commitsSince = 0;
    }
  }

  // Calculate dynamic version
  const calculatedVersion = calculateCodeVersion(
    baseVersion,
    commitsSince,
    config.versionCalculationMode,
  );

  // D8: the branch suffix applies in both version modes, through this one path.
  const suffixDecision = await planBranchSuffix(config, branch, 0);
  const dynamicVersion = decorateVersion(calculatedVersion, suffixDecision);

  // Generate timestamps
  const timestamps = generateTimestamps();

  // Build result
  const versionData: DynamicVersion = {
    _generated:
      'This file is auto-generated by @justinhaaheim/version-manager. Do not edit.',
    baseVersion,
    branch,
    buildNumber: generateBuildNumber(),
    commitsSince,
    dirty,
    dynamicVersion,
    generationTrigger,
    timestamp: timestamps.timestamp,
    timestampUnix: timestamps.timestampUnix,
    versions: config.versions ?? {},
  };

  return {
    branchSuffixWarning: suffixDecision.warning,
    configuredFormat: config.outputFormat,
    versionData,
  };
}

/**
 * Parse a version string into its base semver and optional +N metadata.
 * Examples:
 *   "1.2.3"   → { base: "1.2.3", metadata: null }
 *   "1.2.3+5" → { base: "1.2.3", metadata: 5 }
 */
export function parseVersionMetadata(version: string): {
  base: string;
  metadata: number | null;
} {
  const plusIndex = version.indexOf('+');
  if (plusIndex === -1) {
    return {base: version, metadata: null};
  }

  const base = version.slice(0, plusIndex);
  const metadataStr = version.slice(plusIndex + 1);
  const metadata = parseInt(metadataStr, 10);

  return {base, metadata: isNaN(metadata) ? null : metadata};
}

/**
 * Calculate the pre-commit version for package-json mode.
 *
 * In package-json mode, the version in package.json is updated on every commit
 * via a pre-commit hook. The algorithm:
 *
 * 1. Read current version from package.json
 * 2. Find last commit where package.json version changed → i commits ago
 * 3. Add 1 for the current (about-to-happen) commit → i + 1
 * 4. Calculate new version:
 *    - add-to-patch: X.Y.Z changed i commits ago → X.Y.(Z + i + 1)
 *    - append-commits: X.Y.Z+N changed i commits ago → X.Y.Z+(N + i + 1)
 *                      X.Y.Z (no +N) changed i commits ago → X.Y.Z+(i + 1)
 *
 * @param currentVersion - Current version string from package.json
 * @param commitsSinceLastChange - Number of commits since the version was last changed (0 if changed in the most recent commit)
 * @param mode - Calculation mode
 * @returns New version string
 */
export function calculatePreCommitVersion(
  currentVersion: string,
  commitsSinceLastChange: number,
  mode: VersionCalculationMode,
): string {
  const increment = commitsSinceLastChange + 1;

  if (mode === 'add-to-patch') {
    const parts = currentVersion.split('.');
    if (parts.length !== 3) {
      return currentVersion;
    }
    const [major, minor, patch] = parts.map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return currentVersion;
    }
    return `${major}.${minor}.${patch + increment}`;
  } else if (mode === 'append-commits') {
    const {base, metadata} = parseVersionMetadata(currentVersion);
    const currentCount = metadata ?? 0;
    return `${base}+${currentCount + increment}`;
  }

  // Fallback: treat as add-to-patch
  const parts = currentVersion.split('.');
  if (parts.length !== 3) {
    return currentVersion;
  }
  const [major, minor, patch] = parts.map(Number);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return currentVersion;
  }
  return `${major}.${minor}.${patch + increment}`;
}

/**
 * Generate version data for pre-commit hook in package-json mode.
 * Calculates the version that will be written to package.json before the commit.
 *
 * @param generationTrigger - What triggered the version generation
 * @returns GenerateVersionResult with pre-commit adjusted version data
 */
export async function generatePreCommitVersionData(
  generationTrigger: GenerationTrigger = 'git-hook',
): Promise<GenerateVersionResult> {
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

  // Read current version. Isolated behind a named helper so that 70i.3 can
  // switch the source to the git index without touching anything below.
  const rawCurrentVersion = readPreCommitBaseVersion();
  if (!rawCurrentVersion) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  // Read config
  const {config: rawConfig, migrated} = readVersionManagerConfig(configPath);
  const config = rawConfig ?? getDefaultVersionManagerConfig();

  if (config.versions) {
    validateVersionNames(config.versions);
  }

  if (migrated && existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('✅ Migrated version-manager.json to new format');
    console.log('   Moved runtimeVersion to versions.runtime');
  }

  // Find last commit where package.json version changed
  const lastCommit = await findLastCommitWhereFieldChanged(
    'package.json',
    'version',
  );

  // Count commits since last change
  const commitsSinceLastChange = lastCommit
    ? await countCommitsBetween(lastCommit, 'HEAD')
    : 0;

  // D3: while the knob is on, version-manager owns the prerelease segment. In
  // this mode the decorated version is COMMITTED into package.json and read
  // back here as the next computation's input, so stripping it is what stops
  // the suffix compounding (0.1.0-b.1 -> 0.1.0-b.1-b.2) or, worse, freezing
  // the version entirely: calculatePreCommitVersion() returns its input
  // unchanged when the split is not exactly three parts.
  const currentVersion = config.branchSuffix.enabled
    ? stripPrerelease(rawCurrentVersion)
    : rawCurrentVersion;

  // Calculate the pre-commit version (accounts for the about-to-happen commit)
  const calculatedVersion = calculatePreCommitVersion(
    currentVersion,
    commitsSinceLastChange,
    config.versionCalculationMode,
  );

  // D5: +1 for the about-to-happen commit, which is not in any git count yet.
  const suffixDecision = await planBranchSuffix(config, branch, 1);
  const dynamicVersion = decorateVersion(calculatedVersion, suffixDecision);

  // For the base version in the output, strip any +N metadata
  const {base: baseVersion} = parseVersionMetadata(currentVersion);

  const timestamps = generateTimestamps();
  const totalCommitsSince = commitsSinceLastChange + 1;

  const versionData: DynamicVersion = {
    _generated:
      'This file is auto-generated by @justinhaaheim/version-manager. Do not edit.',
    baseVersion,
    branch,
    buildNumber: generateBuildNumber(),
    commitsSince: totalCommitsSince,
    dirty,
    dynamicVersion,
    generationTrigger,
    timestamp: timestamps.timestamp,
    timestampUnix: timestamps.timestampUnix,
    versions: config.versions ?? {},
  };

  return {
    branchSuffixWarning: suffixDecision.warning,
    configuredFormat: config.outputFormat,
    versionData,
  };
}

/**
 * Read the versionMode from version-manager.json config.
 * Returns 'dynamic-file' if config is missing or versionMode is not set.
 */
export function getVersionMode(): VersionMode {
  const configPath = join(process.cwd(), 'version-manager.json');
  const {config} = readVersionManagerConfig(configPath);
  return config?.versionMode ?? 'dynamic-file';
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
 * Generate TypeScript definition file for dynamic version with explicit version types
 * @param outputPath - Path to the JSON file (will generate .d.ts alongside)
 * @param versionKeys - Keys from version-manager.json versions object
 * @returns The path of the .d.ts file that was written, so callers can report
 *   it without re-deriving the name
 */
export function generateTypeDefinitions(
  outputPath: string,
  versionKeys: string[],
): string {
  // Replace .json extension with .d.ts
  const dtsPath = outputPath.replace(/\.json$/, '.d.ts');

  // Generate versions interface shape
  // Use Record<string, never> for empty versions to avoid eslint empty-object-type error
  const versionsShape =
    versionKeys.length > 0
      ? versionKeys.map((key) => `    ${key}: string;`).join('\n')
      : '    [key: string]: never; // No custom versions defined';

  const content = `/**
 * @generated
 * This file is auto-generated by @justinhaaheim/version-manager.
 * Do not edit manually - changes will be overwritten.
 */
import type {DynamicVersion} from '@justinhaaheim/version-manager';

export interface DynamicVersionLocal extends Omit<DynamicVersion, 'versions'> {
  versions: {
${versionsShape}
  };
}

declare const version: DynamicVersionLocal;
export default version;
`;

  writeFileSync(dtsPath, content);

  return dtsPath;
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
  const {config: rawConfig, migrated} = readVersionManagerConfig(configPath);
  if (!rawConfig) {
    throw new Error(
      'No version-manager.json found. Please run install command first.',
    );
  }
  const config = rawConfig;

  // Validate custom version names exist in config
  for (const versionName of customVersionsToUpdate) {
    if (!config.versions?.[versionName]) {
      throw new Error(
        `Version "${versionName}" not found in version-manager.json. Available versions: ${Object.keys(config.versions ?? {}).join(', ') || 'none'}`,
      );
    }
  }

  // Generate current computed version to show user what it was
  const {versionData: currentDynamic} = await generateFileBasedVersion();
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
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  } else if (migrated) {
    // Write migrated config even if no custom versions to update
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
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
