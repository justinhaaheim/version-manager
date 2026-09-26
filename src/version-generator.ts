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
import {prettifyError} from 'zod';

import {
  applyBranchSuffix,
  type BranchCommitCounts,
  type BranchSuffixDecision,
  decideBranchSuffix,
  isSuffixExemptBranch,
  stripPrerelease,
} from './branch-suffix';
import {
  countCommitEventsOnBranch,
  type DerivedVersion,
  deriveVersion,
  describeSkippedLines,
  parseEventLog,
  readEventLogText,
  VERSION_LOG_FILENAME,
} from './event-log';
import {appendBaseEvent} from './event-log-mode';
import {
  countCommitsBetween,
  countCommitsOnHead,
  countCommitsSinceRef,
  findLastCommitWhereFieldChanged,
  getGitDescribe,
  isGitRepository,
  readFieldFromCommit,
  type RefCommitCountFailure,
  requireCurrentBranch,
} from './git-utils';
import {getPackageVersion, readPreCommitBaseVersion} from './script-manager';
import {
  DEFAULT_VERSION_CALCULATION_MODE,
  LegacyVersionManagerConfigSchema,
  VersionManagerConfigSchema,
} from './types';
import {calculateCodeVersion} from './version-math';

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
    mergeDriver: {enabled: false},
    versionCalculationMode: legacyConfig.versionCalculationMode,
    versionMode: 'dynamic-file',
    versions,
  };
}

/** The one wording for a config that ends a command (70i.18 F7). */
function invalidConfigMessage(reason: string): string {
  return `${reason}\nFix version-manager.json and run the command again. A broken config is never replaced by the defaults.`;
}

/** An unknown thrown value, as readable text. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What reading version-manager.json found (version-manager-70i.18.2, S4;
 * 70i.18 F7).
 *
 * THREE DIFFERENT FACTS, three members. "absent" is a documented, legal state
 * and is the only one that gets the defaults. "invalid" — the file is there
 * but cannot be read, is not JSON, or fails the schema — used to be reported
 * with a console.warn and then ALSO read as "no config", so a typo'd knob ran
 * the command on the defaults: in package-json mode a typo silently switched
 * the project back to dynamic-file mode.
 */
export type VersionManagerConfigRead =
  | {outcome: 'absent'}
  | {config: VersionManagerConfig; migrated: boolean; outcome: 'ok'}
  | {
      outcome: 'invalid';
      /** Names the file and what the parser or the schema said, readably. */
      reason: string;
    };

/**
 * Parse version-manager.json TEXT exactly as readVersionManagerConfig() does,
 * without reading a file. `install --mode` (version-manager-70i.7, M2) checks
 * the text it is about to write through this, so the text is judged by the
 * same parser, schemas and migration every command uses.
 *
 * @param content - The file's text
 * @param configPath - The path to name in a reason
 * @returns ok (with whether the legacy shape was migrated) or invalid
 */
export function parseVersionManagerConfigText(
  content: string,
  configPath: string,
): Exclude<VersionManagerConfigRead, {outcome: 'absent'}> {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `${configPath} is not valid JSON: ${errorMessage(error)}`,
    };
  }

  // Try parsing with new schema first
  const newResult = VersionManagerConfigSchema.safeParse(json);
  if (newResult.success) {
    return {config: newResult.data, migrated: false, outcome: 'ok'};
  }

  // Try parsing with legacy schema. The migration is unchanged by 70i.18.2.
  const legacyResult = LegacyVersionManagerConfigSchema.safeParse(json);
  if (legacyResult.success) {
    return {
      config: migrateLegacyConfig(legacyResult.data),
      migrated: true,
      outcome: 'ok',
    };
  }

  // Neither schema accepted it. The CURRENT schema's complaint is the one to
  // show: the legacy shape is only a migration path.
  return {
    outcome: 'invalid',
    reason: `${configPath} is not a valid version-manager config:\n${prettifyError(newResult.error)}`,
  };
}

/**
 * Read version-manager.json configuration with Zod validation and migration.
 *
 * Never throws and never warns: it reports. Commands go through
 * loadVersionManagerConfig(), which turns "invalid" into a thrown error.
 *
 * @param configPath - Path to version-manager.json
 * @returns absent, ok (with whether the legacy shape was migrated), or invalid
 *   with a reason naming the file
 */
export function readVersionManagerConfig(
  configPath: string,
): VersionManagerConfigRead {
  if (!existsSync(configPath)) {
    return {outcome: 'absent'};
  }

  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (error) {
    return {
      outcome: 'invalid',
      reason: `${configPath} could not be read: ${errorMessage(error)}`,
    };
  }

  return parseVersionManagerConfigText(content, configPath);
}

/**
 * Re-exported from src/version-math.ts, where it now lives (see that file for
 * why it moved). Every existing importer of
 * `calculateCodeVersion` from this module keeps working.
 */
export {calculateCodeVersion};

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
    mergeDriver: {enabled: false},
    versionCalculationMode: DEFAULT_VERSION_CALCULATION_MODE,
    versionMode: 'dynamic-file',
    versions: {},
  };
}

/**
 * Load the config a command runs with (70i.18 F7).
 *
 * @returns The parsed config, or the defaults when the file is ABSENT
 * @throws When the file is present but invalid. A broken config is never
 *   replaced by the defaults: that is how a typo used to change the mode.
 */
function loadVersionManagerConfig(configPath: string): {
  config: VersionManagerConfig;
  migrated: boolean;
} {
  const read = readVersionManagerConfig(configPath);

  switch (read.outcome) {
    case 'absent':
      return {config: getDefaultVersionManagerConfig(), migrated: false};
    case 'ok':
      return {config: read.config, migrated: read.migrated};
    case 'invalid':
      throw new Error(invalidConfigMessage(read.reason));
  }
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
  const mergeBaseFailures: RefCommitCountFailure[] = [];

  for (const ref of mainBranches) {
    const result = await countCommitsSinceRef(ref);

    if (result.outcome === 'counted') {
      mergeBase = {count: result.count, ref: result.ref};
      break;
    }

    // Keep WHY each ref was unusable, so the warning can name the cause
    // instead of blaming resolution for all three of them (F1).
    mergeBaseFailures.push(result);
  }

  return {mergeBase, mergeBaseFailures, total: await countCommitsOnHead()};
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
 * Find the commit where package.json's version last changed and count the
 * commits since, ENDING THE COMMAND when either measurement fails
 * (version-manager-70i.18.1, S1 S2; 70i.18 F1).
 *
 * Before 70i.18.1 a failed lookup read as "never changed" and a failed count
 * read as 0, so a broken git computed the base version (plus one in the
 * pre-commit path) with nothing red anywhere.
 *
 * @returns lastCommit null ONLY when the branch has no commits yet or
 *   package.json has never been committed — states where 0 commits since is
 *   the true answer (F3)
 * @throws If git fails, or package.json at HEAD is not a JSON object
 */
async function measureCommitsSinceVersionChange(): Promise<{
  commitsSince: number;
  lastCommit: string | null;
}> {
  const lookup = await findLastCommitWhereFieldChanged(
    'package.json',
    'version',
  );

  if (lookup.outcome === 'never-committed') {
    return {commitsSince: 0, lastCommit: null};
  }

  if (lookup.outcome !== 'found') {
    throw new Error(
      `Could not find the commit where package.json's version last changed: ${lookup.detail}`,
    );
  }

  const counted = await countCommitsBetween(lookup.commit, 'HEAD');

  if (counted.outcome === 'git-failed') {
    throw new Error(
      `Could not count the commits since package.json's version last changed (at ${lookup.commit}): ${counted.detail}`,
    );
  }

  return {commitsSince: counted.count, lastCommit: lookup.commit};
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
  /**
   * Set when the pre-commit base version had to come from the working tree
   * because package.json is absent from the git index (version-manager-70i.3,
   * D9). null means the index was the source — or, on the paths that never
   * read the index at all, that the question does not arise.
   */
  preCommitBaseWarning: string | null;
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

  // Get git branch and dirty status. A failed branch read ends the command
  // (70i.18 F2): it is never reported as a detached "HEAD".
  const branch = await requireCurrentBranch();
  const gitDescribe = await getGitDescribe();
  const dirty = gitDescribe.includes('-dirty');

  // Read base version from package.json
  const rawBaseVersion = getPackageVersion();
  if (!rawBaseVersion) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  // Read config from version-manager.json. An ABSENT file gets the defaults
  // (versions: {}, versionCalculationMode: "append-commits"); a present but
  // invalid one ends the command (70i.18.2, S4).
  const {config, migrated} = loadVersionManagerConfig(configPath);

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

  // Find last commit where package.json version changed, and count the
  // commits since. Either failing ends the command (70i.18.1, S1 S2).
  const measured = await measureCommitsSinceVersionChange();
  const {lastCommit} = measured;
  let {commitsSince} = measured;

  // Check if version has changed in working tree (uncommitted)
  // If current version differs from last committed version, treat as 0 commits
  if (lastCommit !== null) {
    const committed = await readFieldFromCommit(
      lastCommit,
      'package.json',
      'version',
    );

    // S6: a failed read used to arrive as null, which silently skipped this
    // check. It ends the command instead.
    if (committed.outcome === 'git-failed') {
      throw new Error(
        `Could not read the version package.json had at ${lastCommit}: ${committed.detail}`,
      );
    }

    const rawCommittedVersion = committed.value;
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
    // This path reads package.json from the working tree by design; it is not
    // making a commit, so the index is not the question being asked.
    preCommitBaseWarning: null,
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

  // Get git branch and dirty status. A failed branch read ends the command
  // (70i.18 F2): it is never reported as a detached "HEAD".
  const branch = await requireCurrentBranch();
  const gitDescribe = await getGitDescribe();
  const dirty = gitDescribe.includes('-dirty');

  // Read the current version from the git INDEX — what the commit is actually
  // made from (version-manager-70i.3, D9). Unstaged edits in the working-tree
  // package.json therefore do not steer the calculation.
  const baseVersionRead = readPreCommitBaseVersion();
  if (baseVersionRead === null) {
    throw new Error(
      'No version found in package.json. Please add a "version" field to your package.json.',
    );
  }

  const rawCurrentVersion = baseVersionRead.version;

  // D9's documented fallback is never silent: the index was not the source.
  const preCommitBaseWarning =
    baseVersionRead.source === 'working-tree'
      ? '⚠️  package.json is not in the git index, so the version was read from the working tree. Run `git add package.json` to track it.'
      : null;

  // Read config. An invalid one aborts the commit (70i.18.2, S4) rather than
  // running the hook on the defaults, i.e. in dynamic-file mode.
  const {config, migrated} = loadVersionManagerConfig(configPath);

  if (config.versions) {
    validateVersionNames(config.versions);
  }

  if (migrated && existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('✅ Migrated version-manager.json to new format');
    console.log('   Moved runtimeVersion to versions.runtime');
  }

  // Find last commit where package.json version changed, and count the
  // commits since. Either failing ends the command and aborts the commit
  // (70i.18.1, S1 S2): a failure used to compute base+1 here.
  const {commitsSince: commitsSinceLastChange} =
    await measureCommitsSinceVersionChange();

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
    preCommitBaseWarning,
    versionData,
  };
}

/**
 * EVENT-LOG MODE's version data (version-manager-cza, E3).
 *
 * The version is DERIVED from version.jsonl here and stored nowhere. Git is
 * consulted only for the two facts the log does not carry — which branch this
 * is and whether the tree is dirty — and never for the count, which is why
 * this mode has no merge policy to get wrong.
 *
 * Deliberately NOT part of generateFileBasedVersion(): that function counts
 * commits since package.json's version last changed, which is a completely
 * different measurement. Sharing one function would mean a mode flag threaded
 * through every step of it.
 */
export interface EventLogVersionResult {
  /** Output format from config (if set) */
  configuredFormat: 'silent' | 'compact' | 'normal' | 'verbose' | undefined;
  /** What the log says, before the branch suffix is applied. */
  derived: DerivedVersion;
  /** The generated version data, for display and for an explicit --output. */
  versionData: DynamicVersion;
  /**
   * Everything the user must be told: unreadable log lines, a fallen-back
   * branch-suffix measurement. EMPTY MEANS "checked, nothing to report" —
   * never "not checked" (critical rule 6).
   */
  warnings: string[];
}

/**
 * Derive the version from version.jsonl.
 *
 * @param generationTrigger - What triggered the generation
 * @param extraCommitsOnBranch - Commit events the log does not have yet. Zero
 *   everywhere except... nowhere, currently: the pre-commit path appends its
 *   event BEFORE calling this, so the log is already complete. Kept explicit
 *   so that the +1 fudge package-json mode needs cannot creep back in
 *   unnoticed.
 * @returns The version data and everything that must be said about it
 * @throws If this is not a git repository, or if there is nothing to derive a
 *   version from at all
 */
export async function generateEventLogVersionData(
  generationTrigger: GenerationTrigger = 'cli',
  extraCommitsOnBranch = 0,
): Promise<EventLogVersionResult> {
  const configPath = join(process.cwd(), 'version-manager.json');

  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  // A failed branch read ends the command (70i.18 F2).
  const branch = await requireCurrentBranch();
  const gitDescribe = await getGitDescribe();
  const dirty = gitDescribe.includes('-dirty');

  // An invalid config ends the command (70i.18.2, S4).
  const {config} = loadVersionManagerConfig(configPath);

  if (config.versions) {
    validateVersionNames(config.versions);
  }

  const logText = readEventLogText(process.cwd());
  const {events, skippedLines} = parseEventLog(logText ?? '');

  const derived = deriveVersion({
    calculationMode: config.versionCalculationMode,
    events,
    // E11: package.json's version stays an ordinary human-bumped semver and
    // this mode never writes it. It is only the base when the log has no base
    // event of its own.
    packageVersion: getPackageVersion(),
  });

  const warnings: string[] = [];
  const skippedWarning = describeSkippedLines(skippedLines);
  if (skippedWarning !== null) {
    warnings.push(skippedWarning);
  }

  // E12: the same branch-suffix module, but `n` is measured from the log
  // rather than from git. Each commit event records the branch it happened
  // on, so this is a real per-branch count and needs no merge-base.
  const branchCommits =
    countCommitEventsOnBranch(derived.countedCommits, branch) +
    extraCommitsOnBranch;

  const suffixDecision = decideBranchSuffix({
    branch,
    counts: {
      mergeBase: {count: branchCommits, ref: 'version.jsonl'},
      mergeBaseFailures: [],
      total: branchCommits,
    },
    enabled: config.branchSuffix.enabled,
    extraCommits: 0,
    mainBranches: config.branchSuffix.mainBranches,
  });

  if (suffixDecision.warning !== null) {
    warnings.push(suffixDecision.warning);
  }

  const dynamicVersion = decorateVersion(derived.version, suffixDecision);
  const timestamps = generateTimestamps();

  const versionData: DynamicVersion = {
    _generated:
      'This file is auto-generated by @justinhaaheim/version-manager. Do not edit.',
    baseVersion: derived.base,
    branch,
    buildNumber: generateBuildNumber(),
    commitsSince: derived.commitCount,
    dirty,
    dynamicVersion,
    generationTrigger,
    timestamp: timestamps.timestamp,
    timestampUnix: timestamps.timestampUnix,
    versions: config.versions ?? {},
  };

  return {
    configuredFormat: config.outputFormat,
    derived,
    versionData,
    warnings,
  };
}

/**
 * A version computed by whichever derivation its mode uses, plus everything
 * that must be said about it.
 */
export interface ModeVersionResult {
  /** Output format from config (if set) */
  configuredFormat: 'silent' | 'compact' | 'normal' | 'verbose' | undefined;
  /** The generated version data */
  versionData: DynamicVersion;
  /**
   * Everything the user must be told about how the number was reached. EMPTY
   * MEANS "checked, nothing to report" — never "not checked" (critical rule 6).
   */
  warnings: string[];
}

/**
 * Compute the version with THE DERIVATION THIS MODE USES (version-manager-70i.11,
 * W1).
 *
 * event-log mode derives from version.jsonl; the other two modes count commits
 * since package.json's version last changed. That is the choice the CLI's
 * default command makes in src/index.ts. It lives here, in one function, so the
 * watcher and the metro plugin cannot drift from it: before 70i.11 both called
 * generateFileBasedVersion() in every mode, which in event-log mode wrote a
 * number measured from package.json's history, not from the log.
 *
 * The pre-commit derivations are deliberately not reachable from here. They
 * compute the version the about-to-happen commit will carry, which is a
 * question only a pre-commit hook asks.
 *
 * @param versionMode - The mode to derive for. The caller reads it, so the
 *   write decision and the derivation use the same reading.
 * @param generationTrigger - What triggered the generation
 */
export async function generateVersionDataForMode(
  versionMode: VersionMode,
  generationTrigger: GenerationTrigger = 'cli',
): Promise<ModeVersionResult> {
  switch (versionMode) {
    case 'event-log': {
      const {configuredFormat, versionData, warnings} =
        await generateEventLogVersionData(generationTrigger);
      return {configuredFormat, versionData, warnings};
    }
    case 'dynamic-file':
    case 'package-json': {
      const {branchSuffixWarning, configuredFormat, versionData} =
        await generateFileBasedVersion(generationTrigger);
      return {
        configuredFormat,
        versionData,
        warnings: branchSuffixWarning === null ? [] : [branchSuffixWarning],
      };
    }
  }
}

/**
 * Read the versionMode from version-manager.json config.
 *
 * @returns 'dynamic-file' when the file is ABSENT or does not set versionMode
 * @throws When the file is present but invalid (70i.18.2, S4). It used to
 *   return 'dynamic-file' then too, so a typo in a package-json or event-log
 *   project silently ran every command in dynamic-file mode.
 */
export function getVersionMode(): VersionMode {
  const configPath = join(process.cwd(), 'version-manager.json');
  return loadVersionManagerConfig(configPath).config.versionMode;
}

/**
 * Read the merge-driver knob from version-manager.json (70i.24).
 *
 * OFF unless the config says otherwise, including when there is no config at
 * all. A config that is present but cannot be parsed THROWS (70i.18.2, S4):
 * it used to read as off, which hid the typo. Neither answer registers a
 * driver, so the 70i.22 hazard stays opt-in.
 *
 * @throws When version-manager.json is present but invalid
 */
export function isMergeDriverEnabled(): boolean {
  const configPath = join(process.cwd(), 'version-manager.json');
  return loadVersionManagerConfig(configPath).config.mergeDriver.enabled;
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
 * Bump the base version in EVENT-LOG MODE by appending a base event (E2).
 *
 * package.json is NOT touched (E11), and no computed version is stored: the
 * new base is one more line of evidence, and it merges by exactly the same
 * union rule as everything else in the log.
 *
 * @param bumpType - major, minor or patch
 * @param silent - Suppress console output
 * @returns The old and new base versions
 * @throws If the derived version is not a plain semver to increment
 */
export async function bumpEventLogVersion(
  bumpType: BumpType,
  silent = false,
): Promise<BumpVersionResult> {
  const {derived} = await generateEventLogVersionData('cli');

  // Increment the DERIVED version, undecorated: a branch suffix is display
  // only, and `0.1.0-feat-x.3` has no third dot-separated number to bump.
  const oldVersion = derived.version;
  const newVersion = incrementVersion(oldVersion, bumpType);

  if (!newVersion) {
    throw new Error(
      `Invalid version format: ${oldVersion}. Expected semver format (e.g., 1.2.3)`,
    );
  }

  appendBaseEvent(newVersion, new Date());

  if (!silent) {
    console.log('📈 Bumping version...');
    console.log(`   Current: ${oldVersion}`);
    console.log(`   New: ${newVersion}`);
    console.log(`   Appended a base event to ${VERSION_LOG_FILENAME}`);
    console.log('   package.json was not modified (event-log mode)');
  }

  return {newVersion, oldVersion, updatedVersions: []};
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

  // Read config. Absent and invalid are different failures with different
  // fixes, so they get different messages (70i.18.2, S4): an invalid file
  // used to be reported as "No version-manager.json found".
  const read = readVersionManagerConfig(configPath);
  if (read.outcome === 'absent') {
    throw new Error(
      'No version-manager.json found. Please run install command first.',
    );
  }
  if (read.outcome === 'invalid') {
    throw new Error(invalidConfigMessage(read.reason));
  }
  const {config, migrated} = read;

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
