#!/usr/bin/env bun

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as semver from 'semver';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {z} from 'zod';

// Custom Zod refinement for semver validation
const semverString = z.string().refine((val) => semver.valid(val) !== null, {
  message: 'Must be a valid semantic version',
});

// Zod schema for version history entry
const versionHistoryEntrySchema = z.object({
  branch: z.string().optional(),
  channel: z.string().optional(),
  commit: z.string().optional(),
  message: z.string().optional(),
  profile: z.string().optional(),
  timestamp: z.string(),
  type: z.enum(['build', 'update']),
});

// Zod schema for runtime version entry
const runtimeVersionEntrySchema = z.object({
  createdAt: z.string(),
  fingerprints: z.array(z.string()),
  message: z.string().optional(),
});

// Zod schema for ProjectVersions
const projectVersionsSchema = z.object({
  buildNumber: z
    .string()
    .regex(/^\d+$/, 'Build number must be a numeric string'),
  codeVersion: semverString,
  codeVersionHistory: z.record(z.string(), versionHistoryEntrySchema),
  releaseVersion: semverString,
  runtimeVersion: semverString,
  runtimeVersions: z.record(z.string(), runtimeVersionEntrySchema),
});

export type ProjectVersions = z.infer<typeof projectVersionsSchema>;

const VERSIONS_FILE_PATH = path.join(process.cwd(), 'projectVersions.json');

function readVersions(): ProjectVersions {
  const content = fs.readFileSync(VERSIONS_FILE_PATH, 'utf-8');
  const parsed = JSON.parse(content) as unknown;

  const result = projectVersionsSchema.safeParse(parsed);
  if (!result.success) {
    console.error('❌ Invalid projectVersions.json schema:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Schema validation failed');
  }

  return result.data;
}

function writeVersions(versions: ProjectVersions): void {
  // Validate before writing
  const result = projectVersionsSchema.safeParse(versions);
  if (!result.success) {
    console.error('❌ Cannot write invalid schema:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Schema validation failed before write');
  }

  fs.writeFileSync(
    VERSIONS_FILE_PATH,
    JSON.stringify(versions, null, 2) + '\n',
  );
}

function repairSchema(): void {
  console.log('\n🔧 Attempting to repair projectVersions.json...');

  try {
    const content = fs.readFileSync(VERSIONS_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Try to salvage valid parts
    const repaired: ProjectVersions = {
      buildNumber:
        typeof parsed.buildNumber === 'string' ? parsed.buildNumber : '1',
      codeVersion:
        typeof parsed.codeVersion === 'string' &&
        semver.valid(parsed.codeVersion)
          ? parsed.codeVersion
          : '0.1.0',
      codeVersionHistory: {},
      releaseVersion:
        typeof parsed.releaseVersion === 'string' &&
        semver.valid(parsed.releaseVersion)
          ? parsed.releaseVersion
          : '0.1.0',
      runtimeVersion:
        typeof parsed.runtimeVersion === 'string' &&
        semver.valid(parsed.runtimeVersion)
          ? parsed.runtimeVersion
          : '0.1.0',
      runtimeVersions: {},
    };

    // Salvage valid history entries
    if (
      parsed.codeVersionHistory &&
      typeof parsed.codeVersionHistory === 'object'
    ) {
      const historyObj = parsed.codeVersionHistory as Record<string, unknown>;
      for (const [version, entry] of Object.entries(historyObj)) {
        if (typeof entry === 'object' && entry !== null) {
          const historyEntry = entry as Record<string, unknown>;
          const repairedEntry: z.infer<typeof versionHistoryEntrySchema> = {
            timestamp:
              typeof historyEntry.timestamp === 'string'
                ? historyEntry.timestamp
                : new Date().toISOString(),
            type:
              historyEntry.type === 'build' || historyEntry.type === 'update'
                ? historyEntry.type
                : 'update',
          };

          if (historyEntry.branch != null) {
            repairedEntry.branch =
              typeof historyEntry.branch === 'string'
                ? historyEntry.branch
                : JSON.stringify(historyEntry.branch);
          }
          if (historyEntry.channel != null) {
            repairedEntry.channel =
              typeof historyEntry.channel === 'string'
                ? historyEntry.channel
                : JSON.stringify(historyEntry.channel);
          }
          if (historyEntry.commit != null) {
            repairedEntry.commit =
              typeof historyEntry.commit === 'string'
                ? historyEntry.commit
                : JSON.stringify(historyEntry.commit);
          }
          if (historyEntry.message != null) {
            repairedEntry.message =
              typeof historyEntry.message === 'string'
                ? historyEntry.message
                : JSON.stringify(historyEntry.message);
          }
          if (historyEntry.profile != null) {
            repairedEntry.profile =
              typeof historyEntry.profile === 'string'
                ? historyEntry.profile
                : JSON.stringify(historyEntry.profile);
          }

          repaired.codeVersionHistory[version] = repairedEntry;
        }
      }
    }

    // Salvage runtime versions
    if (parsed.runtimeVersions && typeof parsed.runtimeVersions === 'object') {
      const runtimeObj = parsed.runtimeVersions as Record<string, unknown>;
      for (const [version, entry] of Object.entries(runtimeObj)) {
        if (typeof entry === 'object' && entry !== null) {
          const runtimeEntry = entry as Record<string, unknown>;
          const repairedRuntimeEntry: z.infer<
            typeof runtimeVersionEntrySchema
          > = {
            createdAt:
              typeof runtimeEntry.createdAt === 'string'
                ? runtimeEntry.createdAt
                : new Date().toISOString(),
            fingerprints: Array.isArray(runtimeEntry.fingerprints)
              ? (runtimeEntry.fingerprints as string[])
              : [],
          };

          // Handle both old 'description' and new 'message' field
          if (runtimeEntry.message != null) {
            repairedRuntimeEntry.message =
              typeof runtimeEntry.message === 'string'
                ? runtimeEntry.message
                : JSON.stringify(runtimeEntry.message);
          } else if (runtimeEntry.description != null) {
            repairedRuntimeEntry.message =
              typeof runtimeEntry.description === 'string'
                ? runtimeEntry.description
                : JSON.stringify(runtimeEntry.description);
          }

          repaired.runtimeVersions[version] = repairedRuntimeEntry;
        }
      }
    }

    writeVersions(repaired);
    console.log('✅ Schema repaired successfully');
  } catch (error) {
    console.error('❌ Failed to repair schema:', error);
    throw error;
  }
}

function getGitInfo(): {branch?: string; commit?: string} {
  try {
    const commit = execSync('git rev-parse HEAD', {encoding: 'utf-8'}).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
    }).trim();
    return {branch, commit};
  } catch {
    return {};
  }
}

function checkGitStatus(): void {
  try {
    const status = execSync('git status --porcelain', {encoding: 'utf-8'});
    if (status && !status.includes('projectVersions.json')) {
      console.warn(
        '⚠️  Warning: Working directory has uncommitted changes (excluding projectVersions.json)',
      );
    }
  } catch {
    console.warn('⚠️  Warning: Not in a git repository');
  }
}

function checkForStagedChanges(): boolean {
  try {
    const staged = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
    });
    return staged.trim().length > 0;
  } catch {
    return false;
  }
}

function _hasUncommittedVersionsFile(): boolean {
  try {
    const status = execSync('git status --porcelain projectVersions.json', {
      encoding: 'utf-8',
    });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

function incrementCodeVersion(
  currentVersion: string,
  type: 'major' | 'minor' | 'patch' = 'patch',
): string {
  const newVersion = semver.inc(currentVersion, type);
  if (!newVersion) {
    throw new Error(`Failed to increment version: ${currentVersion}`);
  }
  return newVersion;
}

function incrementBuildNumber(currentBuildNumber: string): string {
  const num = parseInt(currentBuildNumber, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid build number: ${currentBuildNumber}`);
  }
  return String(num + 1);
}

function recordVersionHistory(
  versions: ProjectVersions,
  type: 'build' | 'update',
  options?: {
    channel?: string;
    message?: string;
    profile?: string;
  },
): void {
  const gitInfo = getGitInfo();
  const historyEntry = {
    ...gitInfo,
    timestamp: new Date().toISOString(),
    type,
    ...(options?.channel && {channel: options.channel}),
    ...(options?.profile && {profile: options.profile}),
    ...(options?.message && {message: options.message}),
  };

  versions.codeVersionHistory[versions.codeVersion] = historyEntry;

  // Keep only the last 50 entries to prevent file bloat
  const entries = Object.entries(versions.codeVersionHistory);
  if (entries.length > 50) {
    const sorted = entries.sort(
      (a, b) =>
        new Date(b[1].timestamp).getTime() - new Date(a[1].timestamp).getTime(),
    );
    versions.codeVersionHistory = Object.fromEntries(sorted.slice(0, 50));
  }
}

async function promptForAction(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return await new Promise((resolve) => {
    console.log('\n📦 Version Manager - Select an action:');
    console.log('1. Bump code version only (--bump)');
    console.log('2. Bump for build (code + build number) (--bump-for-build)');
    console.log('3. Increment build number only (--build-only)');
    console.log('4. Increment major version');
    console.log('5. Increment minor version');
    console.log('6. Update runtime version (manual)');
    console.log('7. Show version history');
    console.log('8. Exit');

    rl.question('\nSelect option (1-8): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptForInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return await new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function showVersionHistory(versions: ProjectVersions): void {
  console.log('\n📜 Recent Version History:');
  const entries = Object.entries(versions.codeVersionHistory)
    .sort(
      (a, b) =>
        new Date(b[1].timestamp).getTime() - new Date(a[1].timestamp).getTime(),
    )
    .slice(0, 10);

  if (entries.length === 0) {
    console.log('No version history recorded yet.');
    return;
  }

  entries.forEach(([version, info]) => {
    const date = new Date(info.timestamp).toLocaleString();
    const branch = info.branch ?? 'unknown';
    const type = info.type === 'build' ? '🔨 Build' : '📤 Update';
    const channel = info.channel ? ` (${info.channel})` : '';
    const message = info.message ? ` - ${info.message}` : '';
    console.log(
      `  ${type} v${version} - ${date} - ${branch}${channel}${message}`,
    );
  });
}

function handleBump(options?: {
  channel?: string;
  message?: string;
  updateRuntime?: boolean;
  versionType?: 'major' | 'minor' | 'patch';
}): {
  newRuntimeVersion?: string;
  newVersion: string;
  oldRuntimeVersion?: string;
  oldVersion: string;
} {
  checkGitStatus();
  const versions = readVersions();

  const versionType = options?.versionType ?? 'patch';
  console.log(`\n📤 Bumping code version (${versionType})...`);
  console.log(`Current code version: ${versions.codeVersion}`);
  if (options?.updateRuntime) {
    console.log(`Current runtime version: ${versions.runtimeVersion}`);
  }

  const oldVersion = versions.codeVersion;
  const oldRuntimeVersion = versions.runtimeVersion;

  versions.codeVersion = incrementCodeVersion(
    versions.codeVersion,
    versionType,
  );

  const result: {
    newRuntimeVersion?: string;
    newVersion: string;
    oldRuntimeVersion?: string;
    oldVersion: string;
  } = {newVersion: versions.codeVersion, oldVersion};

  if (options?.updateRuntime) {
    versions.runtimeVersion = versions.codeVersion;
    result.oldRuntimeVersion = oldRuntimeVersion;
    result.newRuntimeVersion = versions.codeVersion;

    // Record runtime version change
    versions.runtimeVersions[versions.codeVersion] = {
      createdAt: new Date().toISOString(),
      fingerprints: [],
      message:
        options?.message ??
        `Updated runtime to match code version ${versions.codeVersion}`,
    };
  }

  recordVersionHistory(versions, 'update', options);
  writeVersions(versions);

  console.log(`✅ Updated code version to: ${versions.codeVersion}`);
  if (options?.updateRuntime) {
    console.log(`✅ Updated runtime version to: ${versions.runtimeVersion}`);
  }
  if (options?.channel) {
    console.log(`📡 Update channel: ${options.channel}`);
  }

  return result;
}

function handleBumpForBuild(options?: {
  message?: string;
  profile?: string;
  updateRuntime?: boolean;
  versionType?: 'major' | 'minor' | 'patch';
}): {
  newBuildNumber: string;
  newCodeVersion: string;
  newRuntimeVersion?: string;
  oldBuildNumber: string;
  oldCodeVersion: string;
  oldRuntimeVersion?: string;
} {
  checkGitStatus();
  const versions = readVersions();

  const versionType = options?.versionType ?? 'patch';
  console.log(`\n🔨 Bumping versions for new build (${versionType})...`);
  console.log(`Current code version: ${versions.codeVersion}`);
  console.log(`Current build number: ${versions.buildNumber}`);
  if (options?.updateRuntime) {
    console.log(`Current runtime version: ${versions.runtimeVersion}`);
  }

  const oldCodeVersion = versions.codeVersion;
  const oldBuildNumber = versions.buildNumber;
  const oldRuntimeVersion = versions.runtimeVersion;

  versions.codeVersion = incrementCodeVersion(
    versions.codeVersion,
    versionType,
  );
  versions.buildNumber = incrementBuildNumber(versions.buildNumber);

  const result: {
    newBuildNumber: string;
    newCodeVersion: string;
    newRuntimeVersion?: string;
    oldBuildNumber: string;
    oldCodeVersion: string;
    oldRuntimeVersion?: string;
  } = {
    newBuildNumber: versions.buildNumber,
    newCodeVersion: versions.codeVersion,
    oldBuildNumber,
    oldCodeVersion,
  };

  if (options?.updateRuntime) {
    versions.runtimeVersion = versions.codeVersion;
    result.oldRuntimeVersion = oldRuntimeVersion;
    result.newRuntimeVersion = versions.codeVersion;

    // Record runtime version change
    versions.runtimeVersions[versions.codeVersion] = {
      createdAt: new Date().toISOString(),
      fingerprints: [],
      message:
        options?.message ??
        `Updated runtime to match code version ${versions.codeVersion} (build)`,
    };
  }

  recordVersionHistory(versions, 'build', options);
  writeVersions(versions);

  console.log(`✅ Updated code version to: ${versions.codeVersion}`);
  console.log(`✅ Updated build number to: ${versions.buildNumber}`);
  if (options?.updateRuntime) {
    console.log(`✅ Updated runtime version to: ${versions.runtimeVersion}`);
  }

  return result;
}

function handleBuildOnly(): {newBuildNumber: string; oldBuildNumber: string} {
  checkGitStatus();
  const versions = readVersions();

  console.log('\n🔢 Incrementing build number only...');
  console.log(`Current build number: ${versions.buildNumber}`);

  const oldBuildNumber = versions.buildNumber;
  versions.buildNumber = incrementBuildNumber(versions.buildNumber);

  writeVersions(versions);

  console.log(`✅ Updated build number to: ${versions.buildNumber}`);

  return {
    newBuildNumber: versions.buildNumber,
    oldBuildNumber,
  };
}

function handleMajorMinorIncrement(type: 'major' | 'minor'): {
  newVersion: string;
  oldVersion: string;
} {
  checkGitStatus();
  const versions = readVersions();

  console.log(`\n🚀 Incrementing ${type} version...`);
  console.log(`Current code version: ${versions.codeVersion}`);

  const oldVersion = versions.codeVersion;
  versions.codeVersion = incrementCodeVersion(versions.codeVersion, type);

  recordVersionHistory(versions, 'update');
  writeVersions(versions);

  console.log(`✅ Updated code version to: ${versions.codeVersion}`);

  return {newVersion: versions.codeVersion, oldVersion};
}

async function handleRuntimeVersionUpdate(): Promise<void> {
  const versions = readVersions();

  console.log('\n⚙️  Update Runtime Version');
  console.log(`Current runtime version: ${versions.runtimeVersion}`);
  console.log(
    '\n⚠️  Warning: Changing runtime version will prevent OTA updates to existing builds!',
  );

  const newVersion = await promptForInput(
    'Enter new runtime version (or press Enter to cancel): ',
  );

  if (!newVersion) {
    console.log('Cancelled.');
    return;
  }

  if (!semver.valid(newVersion)) {
    console.error('❌ Invalid semantic version format');
    return;
  }

  const message = await promptForInput(
    'Enter message for this runtime version change (optional): ',
  );

  versions.runtimeVersion = newVersion;
  versions.runtimeVersions[newVersion] = {
    createdAt: new Date().toISOString(),
    fingerprints: [],
    ...(message && {message}),
  };

  writeVersions(versions);
  console.log(`✅ Updated runtime version to: ${newVersion}`);
}

function commitVersionChanges(changes: {
  details: Record<string, string>;
  type: string;
}): void {
  // Note: We don't check for uncommitted projectVersions.json here because
  // we just wrote the changes ourselves. We only check for other staged changes.

  if (checkForStagedChanges()) {
    console.error('❌ Cannot commit: There are already staged changes');
    console.error('   Please commit or unstage these changes first');
    return;
  }

  // Generate commit message based on change type
  let commitMessage = '';
  const {type, details} = changes;

  switch (type) {
    case 'bump':
      commitMessage = `Bump version to ${details.newVersion}`;
      break;
    case 'bump-for-build':
      commitMessage = `Bump version to ${details.newCodeVersion} (build ${details.newBuildNumber})`;
      break;
    case 'build-only':
      commitMessage = `Increment build number to ${details.newBuildNumber}`;
      break;
    case 'major':
    case 'minor':
      commitMessage = `Bump ${type} version to ${details.newVersion}`;
      break;
    default:
      console.error('❌ Unknown change type for commit');
      return;
  }

  try {
    // Stage the file
    execSync('git add projectVersions.json', {encoding: 'utf-8'});

    // Commit with the generated message
    execSync(`git commit -m '${commitMessage}'`, {encoding: 'utf-8'});

    console.log(`\n✅ Committed: ${commitMessage}`);
  } catch (error) {
    console.error('❌ Failed to commit changes:', error);
  }
}

async function interactiveMode(): Promise<void> {
  const versions = readVersions();

  console.log('\n🎯 Health Logger Version Manager');
  console.log('================================');
  console.log(`Code Version:    ${versions.codeVersion}`);
  console.log(`Build Number:    ${versions.buildNumber}`);
  console.log(`Runtime Version: ${versions.runtimeVersion}`);
  console.log(`Release Version: ${versions.releaseVersion}`);

  const action = await promptForAction();

  switch (action) {
    case '1': {
      const channel = await promptForInput(
        'Enter update channel (development/preview/production) [optional]: ',
      );
      const message = await promptForInput('Enter message [optional]: ');
      handleBump({
        ...(channel && {channel}),
        ...(message && {message}),
      });
      break;
    }
    case '2': {
      const profile = await promptForInput(
        'Enter build profile (development/preview/production) [optional]: ',
      );
      const message = await promptForInput('Enter message [optional]: ');
      handleBumpForBuild({
        ...(profile && {profile}),
        ...(message && {message}),
      });
      break;
    }
    case '3':
      handleBuildOnly();
      break;
    case '4':
      handleMajorMinorIncrement('major');
      break;
    case '5':
      handleMajorMinorIncrement('minor');
      break;
    case '6':
      await handleRuntimeVersionUpdate();
      break;
    case '7':
      showVersionHistory(versions);
      break;
    case '8':
      console.log('Goodbye! 👋');
      process.exit(0);
    // eslint-disable-next-line no-fallthrough
    default:
      console.error('❌ Invalid option');
      process.exit(1);
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('bump', {
      alias: 'b',
      description: 'Increment code version only (for OTA updates)',
      type: 'boolean',
    })
    .option('bump-for-build', {
      alias: 'B',
      description: 'Increment both code version and build number',
      type: 'boolean',
    })
    .option('build-only', {
      description: 'Increment build number only',
      type: 'boolean',
    })
    .option('major', {
      description: 'Bump major version (1.0.0 -> 2.0.0)',
      type: 'boolean',
    })
    .option('minor', {
      description: 'Bump minor version (0.1.0 -> 0.2.0)',
      type: 'boolean',
    })
    .option('update-runtime', {
      description: 'Update runtime version to match new code version',
      type: 'boolean',
    })
    .option('channel', {
      description: 'Update channel (development/preview/production)',
      type: 'string',
    })
    .option('profile', {
      description: 'Build profile (development/preview/production)',
      type: 'string',
    })
    .option('message', {
      alias: 'm',
      description: 'Message to record with version change',
      type: 'string',
    })
    .option('commit', {
      alias: 'c',
      description: 'Automatically commit the version changes',
      type: 'boolean',
    })
    .option('show', {
      description: 'Show current versions',
      type: 'boolean',
    })
    .option('history', {
      description: 'Show version history',
      type: 'boolean',
    })
    .option('repair', {
      description: 'Attempt to repair invalid schema',
      type: 'boolean',
    })
    .conflicts('bump', ['bump-for-build', 'build-only'])
    .conflicts('bump-for-build', ['build-only'])
    .help().argv;

  try {
    // Check for schema repair mode
    if (argv.repair) {
      repairSchema();
      return;
    }

    // Validate argument combinations
    const actionCount = [
      argv.bump,
      argv['bump-for-build'],
      argv['build-only'],
    ].filter(Boolean).length;

    if (actionCount > 1) {
      console.error('❌ Error: Cannot use multiple action flags together');
      console.error(
        '   Choose one of: --bump, --bump-for-build, or --build-only',
      );
      process.exit(1);
    }

    // Validate version type flags
    const versionTypeCount = [argv.major, argv.minor].filter(Boolean).length;
    if (versionTypeCount > 1) {
      console.error('❌ Error: Cannot use both --major and --minor together');
      process.exit(1);
    }

    // Determine version type
    const versionType: 'major' | 'minor' | 'patch' = argv.major
      ? 'major'
      : argv.minor
        ? 'minor'
        : 'patch';

    // Warn about redundant options
    if (argv.channel && !argv.bump) {
      console.warn('⚠️  Warning: --channel is only used with --bump');
    }
    if (argv.profile && !argv['bump-for-build']) {
      console.warn('⚠️  Warning: --profile is only used with --bump-for-build');
    }
    if (argv['update-runtime'] && !argv.bump && !argv['bump-for-build']) {
      console.warn(
        '⚠️  Warning: --update-runtime is only used with --bump or --bump-for-build',
      );
    }

    let changeDetails: {details: Record<string, string>; type: string} | null =
      null;

    if (argv.bump) {
      const result = handleBump({
        channel: argv.channel,
        message: argv.message,
        updateRuntime: argv['update-runtime'],
        versionType,
      });
      changeDetails = {details: result as Record<string, string>, type: 'bump'};
    } else if (argv['bump-for-build']) {
      const result = handleBumpForBuild({
        message: argv.message,
        profile: argv.profile,
        updateRuntime: argv['update-runtime'],
        versionType,
      });
      changeDetails = {
        details: result as Record<string, string>,
        type: 'bump-for-build',
      };
    } else if (argv['build-only']) {
      const result = handleBuildOnly();
      changeDetails = {details: result, type: 'build-only'};
    } else if (argv.show) {
      const versions = readVersions();
      console.log('\n📊 Current Versions:');
      console.log(`Code Version:    ${versions.codeVersion}`);
      console.log(`Build Number:    ${versions.buildNumber}`);
      console.log(`Runtime Version: ${versions.runtimeVersion}`);
      console.log(`Release Version: ${versions.releaseVersion}`);
    } else if (argv.history) {
      const versions = readVersions();
      showVersionHistory(versions);
    } else {
      await interactiveMode();
    }

    // Handle auto-commit if requested and we made changes
    if (argv.commit && changeDetails) {
      commitVersionChanges(changeDetails);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Schema validation failed')
    ) {
      console.log('\n💡 Tip: Try running with --repair flag to fix the schema');
    }
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
