#!/usr/bin/env node

import {confirm} from '@inquirer/prompts';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs/yargs';

import packageJson from '../package.json';
import {VERSION_LOG_FILENAME} from './event-log';
import {
  appendCommitEvent,
  ensureUnionMergeAttribute,
  ensureVersionLogExists,
  UNION_MERGE_ATTRIBUTE,
} from './event-log-mode';
import {
  DEFAULT_OUTPUT_PATH,
  type GeneratedFileWriteResult,
  type OutputPathOption,
  resolveOutputPathOption,
  shouldWriteGeneratedFiles,
  writeGeneratedFiles,
} from './generated-file-policy';
import {detectRunCommand, installGitHooks} from './git-hooks-manager';
import {isFileTrackedByGit, requireCurrentBranch} from './git-utils';
import {
  MERGE_DRIVER_ATTRIBUTE,
  registerMergeDriver,
  runMergeDriver,
} from './merge-driver';
import {
  formatVersionOutput,
  type OutputFormat,
  type VersionOutputData,
} from './output-formatter';
import {
  addScriptsToPackageJson,
  getConflictingScripts,
  hasExistingDynamicVersionScripts,
  listDefaultScripts,
  readPackageJson,
  writePreCommitVersion,
} from './script-manager';
import {type DynamicVersion} from './types';
import {
  bumpEventLogVersion,
  type BumpType,
  bumpVersion,
  generateEventLogVersionData,
  generateFileBasedVersion,
  generatePreCommitVersionData,
  getVersionMode,
  isMergeDriverEnabled,
} from './version-generator';
import {startWatcher} from './watcher';

// Shared options for all commands
const globalOptions = {
  compact: {
    default: false,
    describe: 'Ultra-compact single-line output',
    type: 'boolean' as const,
  },
  fail: {
    default: true,
    describe:
      'Exit with error code on failures (use --no-fail to always exit 0)',
    type: 'boolean' as const,
  },
  'git-hook': {
    default: false,
    describe: 'Triggered by git hook (internal use)',
    hidden: true,
    type: 'boolean' as const,
  },
  'non-interactive': {
    alias: 'n',
    default: false,
    describe:
      'Run in non-interactive mode (assumes default responses for all prompts)',
    type: 'boolean' as const,
  },
  output: {
    alias: 'o',
    // Deliberately no yargs `default`: the handlers must be able to tell
    // "the user asked for this path" from "nobody said anything", because in
    // package-json mode an explicit --output is the one thing that still
    // produces a file. resolveOutputPathOption() applies the default instead.
    defaultDescription: DEFAULT_OUTPUT_PATH,
    describe: 'Output file path',
    type: 'string' as const,
  },
  'pre-commit': {
    default: false,
    describe:
      'Pre-commit hook mode: update package.json version and stage files (internal use)',
    hidden: true,
    type: 'boolean' as const,
  },
  silent: {
    alias: 's',
    default: false,
    describe: 'Suppress console output (informational messages only)',
    type: 'boolean' as const,
  },
  types: {
    alias: 't',
    default: true,
    describe:
      'Generate TypeScript definition file with explicit version types (use --no-types to disable)',
    type: 'boolean' as const,
  },
  verbose: {
    default: false,
    describe: 'Verbose output with full status dashboard',
    type: 'boolean' as const,
  },
};

/**
 * Determine output format from CLI flags
 * Returns null if no format flag was specified (allows config to be used as fallback)
 */
function getFormat(
  silent: boolean,
  compact: boolean,
  verbose: boolean,
): OutputFormat | null {
  if (silent) return 'silent';
  if (compact) return 'compact';
  if (verbose) return 'verbose';
  return null; // No CLI flag specified, use config value
}

/**
 * Ensure generated files are listed in .gitignore
 * Only called during install command - never modifies tracked files
 * @param jsonFilename - The JSON output filename (e.g., "dynamic-version.local.json")
 * @param dtsFilename - The TypeScript definition filename (e.g., "dynamic-version.local.d.ts")
 * @param generateTypes - Whether type definitions are being generated
 * @param nonInteractive - Skip prompts and auto-add entries
 * @param silent - Suppress console output
 */
async function ensureGitignoreEntries(
  jsonFilename: string,
  dtsFilename: string,
  generateTypes: boolean,
  nonInteractive: boolean,
  silent: boolean,
): Promise<void> {
  const gitignorePath = join(process.cwd(), '.gitignore');

  // Guard: never modify tracked files
  const tracking = await isFileTrackedByGit('.gitignore');

  // FAIL CLOSED (version-manager-70i.18.1, S7). Before, a failed measurement
  // read as "untracked", which OPENED this guard and edited a .gitignore
  // nobody had proved untracked. Said even under --silent, like install's
  // other warnings: the user has something to do by hand.
  if (tracking.outcome === 'git-failed') {
    console.warn(
      `⚠️  Skipping .gitignore update: could not tell whether it is tracked in git (${tracking.detail}). Please add ${jsonFilename}${generateTypes ? ` and ${dtsFilename}` : ''} manually.`,
    );
    return;
  }

  if (tracking.tracked) {
    if (!silent) {
      console.log(
        `⚠️  Skipping .gitignore update: file is tracked in git. Please add ${jsonFilename}${generateTypes ? ` and ${dtsFilename}` : ''} manually.`,
      );
    }
    return;
  }

  const gitignoreContent = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8')
    : '';
  const gitignoreLines = gitignoreContent
    .split('\n')
    .map((line) => line.trim());

  const hasJsonEntry = gitignoreLines.includes(jsonFilename);
  const hasDtsEntry = gitignoreLines.includes(dtsFilename);

  // Determine what needs to be added
  const entriesToAdd: string[] = [];
  if (!hasJsonEntry) {
    entriesToAdd.push(jsonFilename);
  }
  if (!hasDtsEntry && generateTypes) {
    entriesToAdd.push(dtsFilename);
  }

  if (entriesToAdd.length === 0) {
    return;
  }

  // In non-interactive mode: add automatically
  if (nonInteractive) {
    const newContent =
      gitignoreContent +
      (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
      entriesToAdd.join('\n') +
      '\n';
    writeFileSync(gitignorePath, newContent);
    if (!silent) {
      console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
    }
    return;
  }

  // Interactive mode: prompt with default=yes
  if (!silent) {
    const shouldAdd = await confirm({
      default: true,
      message: `Add ${entriesToAdd.join(', ')} to .gitignore?`,
    });

    if (shouldAdd) {
      const newContent =
        gitignoreContent +
        (gitignoreContent.endsWith('\n') || gitignoreContent === ''
          ? ''
          : '\n') +
        entriesToAdd.join('\n') +
        '\n';
      writeFileSync(gitignorePath, newContent);
      console.log(`✅ Added ${entriesToAdd.join(', ')} to .gitignore`);
    } else {
      console.log(
        `⚠️  Continuing without gitignore update. Be careful not to commit ${entriesToAdd.join(', ')}!`,
      );
    }
  }
}

// Generate version file command
async function generateVersionFile(
  output: OutputPathOption,
  format: OutputFormat | null,
  generateTypes: boolean,
  gitHook = false,
): Promise<void> {
  // Check that package.json exists (required)
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(
      '❌ No package.json found. This tool requires a package.json with a "version" field.',
    );
    process.exit(1);
  }

  // Note: version-manager.json is optional
  // If missing, generateFileBasedVersion() will use default values:
  // - versionCalculationMode: "append-commits"
  // - versions: {}
  // No prompt needed - just use defaults

  // Generate version info using file-based approach
  const {versionData, configuredFormat, branchSuffixWarning} =
    await generateFileBasedVersion(gitHook ? 'git-hook' : 'cli');

  // Whether anything is written is decided in ONE place, shared with the
  // pre-commit path below (version-manager-70i.2, D12).
  const written = writeGeneratedFiles({
    generateTypes,
    output,
    versionData,
    versionMode: getVersionMode(),
  });

  // Use CLI format if specified, otherwise fall back to config, otherwise 'compact'
  const effectiveFormat = format ?? configuredFormat ?? 'compact';

  // A fallen-back or failed branch-suffix measurement must not be silent
  if (branchSuffixWarning !== null && effectiveFormat !== 'silent') {
    console.warn(branchSuffixWarning);
  }

  // Format and display output based on format
  if (effectiveFormat !== 'silent') {
    const outputData: VersionOutputData = {
      baseVersion: versionData.baseVersion,
      branch: versionData.branch,
      buildNumber: versionData.buildNumber,
      commitsSince: versionData.commitsSince,
      dirty: versionData.dirty,
      dtsPath: written.dtsPath,
      dynamicVersion: versionData.dynamicVersion,
      outputPath: written.jsonPath,
      versions: versionData.versions,
    };

    console.log(formatVersionOutput(outputData, effectiveFormat));
  }
}

/**
 * Print a computed version, in whatever format is in force.
 *
 * One place rather than a fourth copy of the same eleven-line object literal.
 * The two older paths still build theirs inline; folding them onto this is a
 * separate change, deliberately not made here, because their output is
 * snapshot-tested and this bead must not touch the other two modes.
 */
function reportVersion(
  versionData: DynamicVersion,
  written: GeneratedFileWriteResult,
  format: OutputFormat,
  warnings: string[],
): void {
  if (format === 'silent') {
    return;
  }

  for (const warning of warnings) {
    console.warn(warning);
  }

  const outputData: VersionOutputData = {
    baseVersion: versionData.baseVersion,
    branch: versionData.branch,
    buildNumber: versionData.buildNumber,
    commitsSince: versionData.commitsSince,
    dirty: versionData.dirty,
    dtsPath: written.dtsPath,
    dynamicVersion: versionData.dynamicVersion,
    outputPath: written.jsonPath,
    versions: versionData.versions,
  };

  console.log(formatVersionOutput(outputData, format));
}

/**
 * EVENT-LOG MODE: report the version derived from version.jsonl.
 *
 * Writes nothing unless --output was given explicitly (the shared decision in
 * generated-file-policy). There is no generated file in this mode: the log is
 * committed and the version comes out of it on demand.
 */
async function generateEventLogVersionFile(
  output: OutputPathOption,
  format: OutputFormat | null,
  generateTypes: boolean,
  trigger: 'cli' | 'git-hook',
): Promise<void> {
  const {versionData, configuredFormat, warnings} =
    await generateEventLogVersionData(trigger);

  const written = writeGeneratedFiles({
    generateTypes,
    output,
    versionData,
    versionMode: 'event-log',
  });

  reportVersion(
    versionData,
    written,
    format ?? configuredFormat ?? 'compact',
    warnings,
  );
}

/**
 * EVENT-LOG MODE's pre-commit hook (version-manager-cza, E9).
 *
 * Appends ONE commit event to version.jsonl, in the working tree and in the
 * git index, and writes nothing else — no package.json version, no generated
 * file. A failure throws and the commit aborts (E10, 70i.4's contract): a
 * commit that silently records no event is a hole in the evidence, and the
 * count is only meaningful because every hooked commit is in the log.
 */
async function preCommitEventLogHandler(
  output: OutputPathOption,
  format: OutputFormat | null,
  generateTypes: boolean,
): Promise<void> {
  // A failed branch read aborts the commit (70i.18 F2) rather than recording
  // a commit event on a "HEAD" branch that was never measured.
  const branch = await requireCurrentBranch();
  const append = appendCommitEvent(branch, new Date());

  // Derived AFTER the append, so the number reported is the number the commit
  // will carry. No +1 fudge: the evidence is already in the log.
  const {versionData, configuredFormat, warnings} =
    await generateEventLogVersionData('git-hook');

  const written = writeGeneratedFiles({
    generateTypes,
    output,
    versionData,
    versionMode: 'event-log',
  });

  if (append.indexOutcome === 'added') {
    warnings.push(
      `ℹ️  ${VERSION_LOG_FILENAME} was not staged, so it was added to this commit.`,
    );
  }

  reportVersion(
    versionData,
    written,
    format ?? configuredFormat ?? 'compact',
    warnings,
  );
}

// Pre-commit handler for package-json mode
async function preCommitHandler(
  output: OutputPathOption,
  format: OutputFormat | null,
  generateTypes: boolean,
): Promise<void> {
  // Generate version data with pre-commit calculation (+1 for the about-to-happen commit)
  const {
    versionData,
    configuredFormat,
    branchSuffixWarning,
    preCommitBaseWarning,
  } = await generatePreCommitVersionData('git-hook');

  // Same single decision as the CLI path above: in package-json mode this
  // writes nothing, which is the whole point of the mode (D12). package.json
  // below is the real output.
  const written = writeGeneratedFiles({
    generateTypes,
    output,
    versionData,
    versionMode: getVersionMode(),
  });

  // Write dynamicVersion into BOTH the git index and the working-tree
  // package.json, surgically (version-manager-70i.3, D9).
  //
  // This THROWS on any failure (version-manager-70i.4, D10) and nothing here
  // catches it: the hook exits non-zero and the commit is aborted, naming the
  // operation that failed. The alternative — carrying on — records a commit
  // whose package.json version is not the one that was computed, and every
  // later computation counts from that wrong anchor with nothing red anywhere.
  writePreCommitVersion(versionData.dynamicVersion);

  // NOTHING IS STAGED HERE, and no package manager runs (70i.5, 70i.3).
  //
  // package.json is already in the index: writePreCommitVersion() put it there
  // by hand, and `git add package.json` would replace that with the whole
  // working-tree file — sweeping any unstaged edit into a commit the author
  // never staged it for.
  //
  // The lockfile used to be refreshed by `npm install` / `bun install` and
  // then staged. Measured (70i.5): bun.lock does not record the root
  // package's version at all and `bun install --frozen-lockfile` exits 0 after
  // a version-only bump; package-lock.json does record it and `npm ci` also
  // exits 0. So the subprocess bought nothing and cost a package-manager run
  // on every commit — and staging a lockfile the author had edited but not
  // staged was the same sweep-it-in bug as above.

  // Display output
  const effectiveFormat = format ?? configuredFormat ?? 'compact';

  // A fallen-back or failed branch-suffix measurement must not be silent
  if (branchSuffixWarning !== null && effectiveFormat !== 'silent') {
    console.warn(branchSuffixWarning);
  }

  // Nor must a base version that did not come from the index (D9)
  if (preCommitBaseWarning !== null && effectiveFormat !== 'silent') {
    console.warn(preCommitBaseWarning);
  }

  if (effectiveFormat !== 'silent') {
    const outputData: VersionOutputData = {
      baseVersion: versionData.baseVersion,
      branch: versionData.branch,
      buildNumber: versionData.buildNumber,
      commitsSince: versionData.commitsSince,
      dirty: versionData.dirty,
      dtsPath: written.dtsPath,
      dynamicVersion: versionData.dynamicVersion,
      outputPath: written.jsonPath,
      versions: versionData.versions,
    };

    console.log(formatVersionOutput(outputData, effectiveFormat));
  }
}

// Install command handler
async function installCommand(
  incrementPatch: boolean,
  output: OutputPathOption,
  format: OutputFormat | null,
  nonInteractive: boolean,
  noFail: boolean,
  force: boolean,
  generateTypes: boolean,
  gitHook = false,
): Promise<void> {
  const silent = format === 'silent';

  // Read once, up front: the mode decides which of the generated-file
  // machinery below is installed at all (version-manager-70i.2, D12).
  const versionMode = getVersionMode();

  // Two related but different questions:
  //  - will THIS run write a generated file? (mode + an explicit --output)
  //  - is the generated file part of this project at all? (mode alone)
  // The gitignore entries follow the first; the hooks and lifecycle scripts,
  // which never pass --output, follow the second.
  const writesGeneratedFiles = shouldWriteGeneratedFiles(versionMode, output);
  // Only dynamic-file mode produces dynamic-version.local.json. package-json
  // mode writes package.json; event-log mode writes version.jsonl; neither
  // wants the lifecycle scripts that exist only to regenerate that file.
  const usesGeneratedFile = versionMode === 'dynamic-file';

  if (writesGeneratedFiles) {
    // Determine filenames for gitignore check
    const jsonFilename =
      output.path.split('/').pop() ?? 'dynamic-version.local.json';
    const dtsFilename =
      output.path
        .replace(/\.json$/, '.d.ts')
        .split('/')
        .pop() ?? 'dynamic-version.local.d.ts';

    // Ensure generated files are in .gitignore (only during install)
    await ensureGitignoreEntries(
      jsonFilename,
      dtsFilename,
      generateTypes,
      nonInteractive || gitHook,
      silent,
    );
  }

  // EVENT-LOG MODE's whole setup (version-manager-cza, E4 and E6): the log
  // itself, and the one .gitattributes line that makes every merge of it a
  // union instead of a conflict. Both are idempotent, and both happen BEFORE
  // the version is reported so that the first install has something to read.
  //
  // Nothing here is caught: an install that says it succeeded while the union
  // attribute is missing would leave the user to discover it at their first
  // merge conflict, looking at git rather than at us.
  if (versionMode === 'event-log') {
    const log = ensureVersionLogExists();
    const attribute = ensureUnionMergeAttribute();

    if (attribute === 'claimed-by-another') {
      console.warn(
        `⚠️  .gitattributes already points ${VERSION_LOG_FILENAME} at a different merge driver, so it was left alone. Add \`${UNION_MERGE_ATTRIBUTE}\` yourself, or merges of the version log will conflict.`,
      );
    }

    if (!silent) {
      console.log(`\n📓 Setting up the event log...`);
      console.log(`   ${VERSION_LOG_FILENAME}: ${log}`);
      console.log(`   .gitattributes (${UNION_MERGE_ATTRIBUTE}): ${attribute}`);
      console.log(
        `   Commit both. The log must be tracked, and the attribute must be`,
      );
      console.log(`   on every branch for the union merge to apply.`);
    }
  }

  // Generate the version file
  if (versionMode === 'event-log') {
    await generateEventLogVersionFile(
      output,
      format,
      generateTypes,
      gitHook ? 'git-hook' : 'cli',
    );
  } else {
    await generateVersionFile(output, format, generateTypes, gitHook);
  }

  if (!silent) {
    console.log('\n📦 Installing git hooks...');
  }

  installGitHooks(incrementPatch, silent, noFail, versionMode);

  // The merge driver needs BOTH conditions, and neither is redundant
  // (version-manager-70i.8 D11, version-manager-70i.24).
  //
  // package-json mode, because only that mode rewrites the version on every
  // commit, so only there do two branches that both commit ALWAYS conflict on
  // that line. dynamic-file mode changes package.json's version when someone
  // bumps it deliberately, and silently picking a side of a deliberate bump is
  // not something to install on anyone's behalf.
  //
  // mergeDriver.enabled, because registering the driver is what exposes a repo
  // to version-manager-70i.22: when the registered COMMAND cannot run — `npx`
  // with no node_modules, which is exactly what `git worktree add` produces
  // while sharing .git/config — git reports a conflict but leaves package.json
  // as ours with NO conflict markers, and `git add`ing it discards the other
  // side. Off by default makes that a considered opt-in rather than an ambush.
  //
  // When the knob is off, install says NOTHING about merge drivers: an install
  // that advertises a feature nobody asked for is noise.
  //
  // A failure here is not caught: an install that reports success while the
  // driver is not registered would send the author looking at git the next
  // time a merge conflicts.
  if (versionMode === 'package-json' && isMergeDriverEnabled()) {
    const registration = registerMergeDriver(detectRunCommand(silent));

    if (registration.gitAttributes === 'claimed-by-another') {
      console.warn(
        `⚠️  .gitattributes already points package.json at a different merge driver, so it was left alone. Add \`${MERGE_DRIVER_ATTRIBUTE}\` yourself if you want version-manager to resolve package.json merges.`,
      );
    }

    if (!silent) {
      console.log('\n🔀 Registering the package.json merge driver...');
      console.log(`   git config merge driver: ${registration.gitConfig}`);
      console.log(`   .gitattributes: ${registration.gitAttributes}`);
      console.log(
        '   Local merges and squashes keep OUR version (the branch merged into).',
      );
      console.log(
        "   GitHub's merge buttons do NOT run merge drivers, so a PR whose",
      );
      console.log(
        '   package.json versions diverge still conflicts there. Merge locally',
      );
      console.log('   or resolve it by hand.');
    }
  }

  if (!silent) {
    console.log('✅ Git hooks installed successfully');
    if (versionMode === 'package-json') {
      console.log(
        '   Pre-commit hook will auto-update package.json version on commits',
      );
      console.log(
        '   No post-* hooks installed: this mode writes no dynamic-version.local.json',
      );
    } else if (versionMode === 'event-log') {
      console.log(
        `   Pre-commit hook will append one commit event to ${VERSION_LOG_FILENAME}`,
      );
      console.log(
        '   No post-* hooks installed: this mode writes no dynamic-version.local.json',
      );
      console.log(
        '   Nothing stores a computed version, so nothing can go stale',
      );
    } else {
      console.log('   Hooks will auto-update dynamic-version.local.json on:');
      console.log('   - Commits (post-commit)');
      console.log('   - Checkouts (post-checkout)');
      console.log('   - Merges (post-merge)');
      console.log('   - Rebases (post-rewrite)');
    }

    // Add scripts to package.json during install
    console.log('\n📝 Checking package.json scripts...');
    const projectPackageJson = readPackageJson();
    if (projectPackageJson) {
      const hasExisting = hasExistingDynamicVersionScripts(projectPackageJson);
      if (hasExisting && !force) {
        console.log(
          '   ℹ️  Existing dynamic-version scripts detected. Preserving customizations.',
        );
        console.log(
          '   💡 Use --force to overwrite existing scripts with defaults',
        );
      } else {
        // The lifecycle scripts (prepare/prebuild/predev/prestart) exist only
        // to regenerate the generated file. In package-json mode there is no
        // generated file, so they would shell out on every build for nothing.
        const result = addScriptsToPackageJson(force, usesGeneratedFile);
        if (result.success) {
          console.log(`   ✅ ${result.message}`);
          if (result.conflictsOverwritten.length > 0) {
            console.log(
              `   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`,
            );
          }
          console.log('\n   Added scripts:');
          console.log(
            '   - npm run dynamic-version           # Reinstall/update',
          );
          console.log(
            '   - npm run dynamic-version:generate   # Generate version file',
          );
          console.log(
            '   - npm run dynamic-version:install-scripts  # Update scripts',
          );
          if (usesGeneratedFile) {
            console.log(
              '\n   Added lifecycle scripts (auto-regenerate version):',
            );
            console.log('   - prebuild   # Runs before npm run build');
            console.log('   - predev     # Runs before npm run dev');
            console.log('   - prestart   # Runs before npm run start');
          }
        } else {
          console.log(`   ⚠️  ${result.message}`);
        }
      }
    } else {
      console.log('   ⚠️  No package.json found. Scripts not installed.');
    }
  }
}

// Install scripts command handler
async function installScriptsCommand(force: boolean): Promise<void> {
  const projectPackageJson = readPackageJson();
  if (!projectPackageJson) {
    console.error('❌ No package.json found in current directory');
    process.exit(1);
  }

  const hasExisting = hasExistingDynamicVersionScripts(projectPackageJson);
  const conflicts = getConflictingScripts(projectPackageJson);

  if (hasExisting) {
    console.log('⚠️  Existing dynamic-version scripts detected:');
    if (conflicts.length > 0) {
      console.log('\nThe following scripts would be overwritten:');
      for (const conflict of conflicts) {
        console.log(
          `  - ${conflict.name}: ${projectPackageJson.scripts?.[conflict.name]}`,
        );
      }
    }

    let shouldForce = force;
    if (!force) {
      shouldForce = await confirm({
        default: false,
        message: 'Do you want to add/update the scripts anyway?',
      });
    }

    if (!shouldForce) {
      console.log('Script installation cancelled.');
      process.exit(0);
    }

    const result = addScriptsToPackageJson(true);
    if (result.success) {
      console.log('✅', result.message);
      if (result.conflictsOverwritten.length > 0) {
        console.log(
          `   Scripts overwritten: ${result.conflictsOverwritten.join(', ')}`,
        );
      }
      listDefaultScripts();
    } else {
      console.error('❌', result.message);
      process.exit(1);
    }
  } else {
    const result = addScriptsToPackageJson(false);
    if (result.success) {
      console.log('✅', result.message);
      listDefaultScripts();
    } else {
      console.error('❌', result.message);
    }
  }
}

// Bump version command handler
async function bumpCommand(
  bumpType: BumpType,
  customVersionsToUpdate: string[],
  output: OutputPathOption,
  format: OutputFormat | null,
  nonInteractive: boolean,
  generateTypes: boolean,
  commit: boolean,
  tag: boolean,
  push: boolean,
  message?: string,
  gitHook = false,
): Promise<void> {
  const silent = format === 'silent';
  const versionMode = getVersionMode();
  const eventLogMode = versionMode === 'event-log';

  // Bump the version.
  //
  // In event-log mode that means appending a base event (E2): package.json is
  // not touched, and the custom `versions` in version-manager.json are not a
  // thing this mode syncs, so naming any is an error rather than a silent
  // no-op.
  if (eventLogMode && customVersionsToUpdate.length > 0) {
    throw new Error(
      `event-log mode does not sync custom versions, so ${customVersionsToUpdate.join(', ')} cannot be bumped. Remove them from the command.`,
    );
  }

  const result = eventLogMode
    ? await bumpEventLogVersion(bumpType, silent)
    : await bumpVersion(bumpType, customVersionsToUpdate, silent);

  // Regenerate dynamic version file.
  //
  // version-manager-70i.13 F4: this used to announce the file unconditionally,
  // so in package-json mode the tool named a file it does not produce (D12).
  // The write decision is the same single decision generateVersionFile() makes
  // below, so both read it from shouldWriteGeneratedFiles().
  if (!silent) {
    if (shouldWriteGeneratedFiles(versionMode, output)) {
      // The default wording is left exactly as it was, so dynamic-file mode's
      // output is unchanged; an explicit --output names the path the user chose.
      const target = output.explicit
        ? output.path
        : 'dynamic-version.local.json';
      console.log(`📝 Regenerating ${target}...`);
    } else {
      console.log(
        '📝 Recomputing version (this mode writes no version file)...',
      );
    }
  }

  if (eventLogMode) {
    await generateEventLogVersionFile(
      output,
      format,
      generateTypes,
      gitHook ? 'git-hook' : 'cli',
    );
  } else {
    await generateVersionFile(output, format, generateTypes, gitHook);
  }

  // Optionally commit
  if (commit) {
    if (!silent) {
      console.log('\n📦 Committing changes...');
    }

    const {execSync} = await import('child_process');
    const commitMessage = message ?? `Bump version to ${result.newVersion}`;

    try {
      // Stage what this mode actually changed. In event-log mode that is the
      // log and nothing else: package.json is deliberately untouched (E11),
      // and `git add`ing it here would sweep in whatever else the author has
      // edited in it.
      // TODO: Extract these CLI calls to git-utils so we have a function to call for `gitAddPackageJson`, etc instead of manually writing out the commands here
      if (eventLogMode) {
        execSync(`git add ${VERSION_LOG_FILENAME}`, {stdio: 'pipe'});
      } else {
        execSync('git add package.json', {stdio: 'pipe'});
      }
      if (result.updatedVersions.length > 0) {
        execSync('git add version-manager.json', {stdio: 'pipe'});
      }
      execSync(`git commit -m '${commitMessage.replace(/'/g, "'\\''")}'`, {
        stdio: 'pipe',
      });

      if (!silent) {
        console.log('✅ Changes committed');
      }

      // Optionally create git tag
      if (tag) {
        if (!silent) {
          console.log(`🏷️  Creating git tag ${result.newVersion}...`);
        }

        const tagMessage = `Version ${result.newVersion}`;
        try {
          execSync(
            `git tag -a ${result.newVersion} -m '${tagMessage.replace(/'/g, "'\\''")}'`,
            {stdio: 'pipe'},
          );

          if (!silent) {
            console.log(`✅ Tag ${result.newVersion} created`);
          }
        } catch (error) {
          if (!silent) {
            console.error('❌ Failed to create tag:', error);
          }
          throw error;
        }
      }

      // Optionally push to remote
      if (push) {
        if (!silent) {
          console.log('🚀 Pushing to remote...');
        }

        try {
          // Push commits and tags together
          if (tag) {
            execSync('git push --follow-tags', {stdio: 'pipe'});
            if (!silent) {
              console.log('✅ Pushed commit and tag to remote');
            }
          } else {
            execSync('git push', {stdio: 'pipe'});
            if (!silent) {
              console.log('✅ Pushed commit to remote');
            }
          }
        } catch (error) {
          if (!silent) {
            console.error('❌ Failed to push:', error);
          }
          throw error;
        }
      }
    } catch (error) {
      if (!silent) {
        console.error('❌ Failed to commit:', error);
      }
      throw error;
    }
  } else if (!silent) {
    // Name the file this mode actually changed. In event-log mode the bump is
    // one appended line in the log, and telling the author to stage
    // version-manager.json would stage nothing and commit nothing. The other
    // modes' wording is left exactly as it was.
    const bumpedFile = eventLogMode
      ? VERSION_LOG_FILENAME
      : 'version-manager.json';
    let tip = `\n💡 Tip: Commit this change with: git add ${bumpedFile} && git commit -m "Bump version to ${result.newVersion}"`;
    if (tag && !commit) {
      tip += `\n💡 Note: --tag requires --commit to create a git tag`;
    }
    if (push && !commit) {
      tip += `\n💡 Note: --push requires --commit to push changes`;
    }
    console.log(tip);
  }
}

// Watch command handler
async function watchCommand(
  output: OutputPathOption,
  debounce: number,
  silent: boolean,
  failOnError: boolean,
  generateTypes: boolean,
): Promise<void> {
  const watcher = await startWatcher({
    debounce,
    failOnError,
    generateTypes,
    output,
    silent,
  });

  // A mode with no generated file, and no explicit --output: there is nothing
  // to watch for. startWatcher() has already said so and started nothing, so
  // returning lets main() exit 0 (version-manager-70i.11, W3).
  if (watcher.status === 'not-started') {
    return;
  }

  // Handle graceful shutdown on Ctrl+C
  const handleShutdown = (): void => {
    watcher.cleanup();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);

  // Keep process alive
  await new Promise(() => {
    // Never resolves - keeps watching until interrupted
  });
}

/**
 * The exit code to use when a command has failed.
 *
 * `--no-fail` normally means "a version-generation hiccup must not break the
 * thing that invoked us": a post-checkout hook, a build step, an npm
 * lifecycle script. In the PRE-COMMIT path it would mean something entirely
 * different — commit anyway, with a package.json version that is not the one
 * that was computed — so it is ignored there (version-manager-70i.4, D10).
 *
 * This reads process.argv rather than the parsed yargs options because it
 * also runs for failures thrown before or during parsing.
 *
 * @returns 0 only when the caller asked to ignore failures and this is not a
 *   pre-commit run; 1 otherwise
 */
function failureExitCode(): 0 | 1 {
  const isPreCommit = process.argv.includes('--pre-commit');
  const hasNoFail = process.argv.includes('--no-fail');

  return hasNoFail && !isPreCommit ? 0 : 1;
}

async function main() {
  try {
    await yargs(hideBin(process.argv))
      .scriptName('npx @justinhaaheim/version-manager')
      .usage('$0 [command]')
      .command(
        '$0',
        'Generate version file',
        (yargsInstance) => yargsInstance.options(globalOptions),
        async (args) => {
          const format = getFormat(args.silent, args.compact, args.verbose);
          const output = resolveOutputPathOption(args.output);

          // Event-log mode derives from version.jsonl rather than from
          // package.json's history, so it takes its own path through both the
          // hook and the plain read (version-manager-cza, E3).
          if (getVersionMode() === 'event-log') {
            if (args['pre-commit']) {
              await preCommitEventLogHandler(output, format, args.types);
            } else {
              await generateEventLogVersionFile(
                output,
                format,
                args.types,
                args['git-hook'] ? 'git-hook' : 'cli',
              );
            }
            return;
          }

          if (args['pre-commit']) {
            await preCommitHandler(output, format, args.types);
          } else {
            await generateVersionFile(
              output,
              format,
              args.types,
              args['git-hook'],
            );
          }
        },
      )
      .command(
        'install',
        'Install git hooks and scripts',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            force: {
              default: false,
              describe:
                'Force script installation even if existing scripts are detected',
              type: 'boolean' as const,
            },
            'increment-patch': {
              default: false,
              describe: 'Increment patch version with each commit',
              type: 'boolean' as const,
            },
          }),
        async (args) => {
          const format = getFormat(args.silent, args.compact, args.verbose);
          await installCommand(
            args['increment-patch'],
            resolveOutputPathOption(args.output),
            format,
            args['non-interactive'],
            !args.fail,
            args.force,
            args.types,
            args['git-hook'],
          );
        },
      )
      .command(
        'install-scripts',
        'Add/update dynamic-version scripts in package.json',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            force: {
              default: false,
              describe:
                'Force script installation without prompting (skip confirmation)',
              type: 'boolean' as const,
            },
          }),
        async (args) => {
          await installScriptsCommand(args.force);
        },
      )
      .command(
        'bump [versions..]',
        'Bump version to next major, minor, or patch',
        (yargsInstance) =>
          yargsInstance
            .positional('versions', {
              array: true,
              default: [],
              describe: 'Custom version names to sync (e.g., runtime, pancake)',
              type: 'string' as const,
            })
            .options({
              ...globalOptions,
              commit: {
                alias: 'c',
                default: false,
                describe: 'Commit the version change automatically',
                type: 'boolean' as const,
              },
              major: {
                default: false,
                describe: 'Bump major version (e.g., 1.2.3 -> 2.0.0)',
                type: 'boolean' as const,
              },
              message: {
                alias: 'm',
                describe: 'Custom commit message (only with --commit)',
                type: 'string' as const,
              },
              minor: {
                default: false,
                describe: 'Bump minor version (e.g., 1.2.3 -> 1.3.0)',
                type: 'boolean' as const,
              },
              patch: {
                default: false,
                describe: 'Bump patch version (e.g., 1.2.3 -> 1.2.4)',
                type: 'boolean' as const,
              },
              push: {
                alias: 'p',
                default: false,
                describe: 'Push commit and tag to remote (requires --commit)',
                type: 'boolean' as const,
              },
              tag: {
                alias: 't',
                default: false,
                describe: 'Create git tag (requires --commit)',
                type: 'boolean' as const,
              },
            }),
        async (args) => {
          // Validate that only one bump type is specified
          const bumpTypes = [args.major, args.minor, args.patch].filter(
            Boolean,
          );
          if (bumpTypes.length > 1) {
            throw new Error(
              'Only one of --major, --minor, or --patch can be specified',
            );
          }

          // Determine bump type - default to patch if none specified
          let bumpType: BumpType = 'patch';
          if (args.major) {
            bumpType = 'major';
          } else if (args.minor) {
            bumpType = 'minor';
          }

          // Get custom versions to update from positional args
          const customVersionsToUpdate = (args.versions ?? []) as string[];

          const format = getFormat(args.silent, args.compact, args.verbose);
          await bumpCommand(
            bumpType,
            customVersionsToUpdate,
            resolveOutputPathOption(args.output),
            format,
            args['non-interactive'],
            args.types,
            args.commit,
            args.tag,
            args.push,
            args.message,
            args['git-hook'],
          );
        },
      )
      .command(
        'merge-driver <ancestor> <ours> <theirs>',
        false, // Hidden: git invokes this, people do not.
        (yargsInstance) =>
          yargsInstance
            .positional('ancestor', {
              describe: 'The merge base copy of package.json (git %O)',
              type: 'string' as const,
            })
            .positional('ours', {
              describe:
                'Our copy of package.json, and where the result must be left (git %A)',
              type: 'string' as const,
            })
            .positional('theirs', {
              describe: 'Their copy of package.json (git %B)',
              type: 'string' as const,
            }),
        (args) => {
          const result = runMergeDriver({
            ancestor: args.ancestor ?? '',
            ours: args.ours ?? '',
            theirs: args.theirs ?? '',
          });

          if (result.note !== null) {
            console.warn(result.note);
          }

          // git reads the exit status directly: 0 merged cleanly, non-zero
          // means conflicts. Exiting here rather than returning keeps main()'s
          // process.exit(0) from reporting every conflict as a clean merge.
          process.exit(result.exitCode);
        },
      )
      .command(
        'watch',
        'Watch files and auto-regenerate version on changes',
        (yargsInstance) =>
          yargsInstance.options({
            ...globalOptions,
            debounce: {
              default: 2000,
              describe: 'Debounce delay in milliseconds',
              type: 'number' as const,
            },
          }),
        async (args) => {
          // W2 (version-manager-70i.11): pass the OutputPathOption, not a
          // bare path, so the watcher can tell an explicit --output from the
          // default. The same write policy as every other command follows.
          await watchCommand(
            resolveOutputPathOption(args.output),
            args.debounce,
            args.silent,
            args.fail,
            args.types,
          );
        },
      )
      .help()
      .alias('help', 'h')
      .version(packageJson.version)
      .alias('version', 'v')
      .example('$0', 'Generate version file only')
      .example('$0 install', 'Install git hooks and scripts')
      .example('$0 install --force', 'Install and force-overwrite scripts')
      .example('$0 install --increment-patch', 'Install with patch increment')
      .example('$0 install --silent --no-fail', 'Install with quiet hooks')
      .example('$0 install-scripts', 'Add/update scripts only')
      .example('$0 install-scripts --force', 'Force-overwrite scripts')
      .example('$0 bump', 'Bump patch version (default)')
      .example('$0 bump --minor', 'Bump minor version')
      .example('$0 bump --major', 'Bump major version')
      .example('$0 bump runtime', 'Bump patch and sync runtime version')
      .example('$0 bump runtime --minor', 'Bump minor and sync runtime')
      .example('$0 bump runtime pancake', 'Bump and sync multiple versions')
      .example('$0 bump --commit', 'Bump and commit automatically')
      .example('$0 watch', 'Watch files and auto-regenerate')
      .example('$0 watch --debounce 500', 'Watch with 500ms debounce')
      .example('$0 watch --silent', 'Watch in silent mode')
      .epilog(
        `Output verbosity:
  (default)   Single-line summary
  --verbose   Full status dashboard with details
  --silent    No output (for scripts/hooks)`,
      )
      .strict()
      // Own the failure path (version-manager-70i.4, D10). yargs' default
      // prints the entire usage screen followed by a raw stack trace and
      // exits 1 itself — so a pre-commit hook that aborts a commit buries the
      // one line the author needs under seventy lines of help text, and the
      // --no-fail decision below never ran at all.
      .fail((msg: string | null, err: Error | null, yargsInstance) => {
        if (err !== null && err !== undefined) {
          // A command failed. The message is the whole story; the usage
          // screen is noise. This is the kind of failure --no-fail is about,
          // so it goes through failureExitCode().
          console.error('❌ Failed:', err.message);
          process.exit(failureExitCode());
        }

        // A usage or validation problem (unknown flag, bad argument), where
        // the help screen IS the useful answer.
        yargsInstance.showHelp();
        console.error(`\n❌ ${msg ?? 'Invalid arguments'}`);

        // ALWAYS exit 1 here, --no-fail or not (finding F9). "the command ran
        // and hit a hiccup" and "you invoked me wrongly" are different facts,
        // and --no-fail only ever meant the first one. Reporting a typo'd flag
        // as success would let a mistake inside an installed hook fail
        // silently forever. yargs itself exited 1 on usage errors before this
        // handler existed; that behaviour is preserved deliberately.
        process.exit(1);
      })
      .parseAsync();

    process.exit(0);
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Failed:', error.message);
    } else {
      console.error('❌ Failed:', error);
    }

    process.exit(failureExitCode());
  }
}

// Run immediately if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(failureExitCode());
  });
}
