/**
 * `install --mode` (version-manager-70i.7): record the requested versionMode
 * in version-manager.json, and name what the previous mode left behind.
 *
 * M2, RECORD FIRST: the file is made to say the mode, and install then runs
 * exactly as if it always had. Only `versionMode` is ever written (epic
 * decision P4): every other field is optional, and writing the defaults would
 * freeze today's defaults into the user's repository.
 *
 * M3, WARN, DO NOT CLEAN UP: removing the old mode's hooks, scripts and
 * generated file is version-manager-70i.6 and 70i.15. This module only says
 * what is still there.
 */

import type {VersionManagerConfig, VersionMode} from './types';

import {readFileSync, statSync, writeFileSync} from 'fs';
import {join} from 'path';
import {isDeepStrictEqual} from 'util';

import {
  DEFAULT_OUTPUT_PATH,
  describeNoGeneratedFile,
} from './generated-file-policy';
import {
  HUSKY_DIR_NAME,
  isVersionManagerHookLine,
  POST_HOOK_NAMES,
} from './git-hooks-manager';
import {
  appendTopLevelStringProperty,
  replaceTopLevelStringValue,
} from './json-text-edit';
import {isVersionManagerScript, LIFECYCLE_SCRIPT_NAMES} from './script-manager';
import {VersionManagerConfigSchema} from './types';
import {
  parseVersionManagerConfigText,
  readVersionManagerConfig,
  type VersionManagerConfigRead,
} from './version-generator';

/** How the file came to say the requested mode. */
export type VersionModeChange =
  /** The file had no versionMode key; one was added at the end. */
  | 'added'
  /** There was no file; one holding only versionMode was created. */
  | 'created'
  /** A legacy file (top-level runtimeVersion) was migrated and given the mode. */
  | 'migrated'
  /** The file named another mode; only that value was replaced. */
  | 'replaced'
  /** The file already named this mode; nothing was written. */
  | 'unchanged';

export interface RecordedVersionMode {
  change: VersionModeChange;
  configPath: string;
  mode: VersionMode;
  /**
   * The mode the project was in before: the file's versionMode, or
   * 'dynamic-file' when the file was absent or did not set one.
   */
  previousMode: VersionMode;
}

/** An unknown thrown value, as readable text. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Node error code of a failed fs call, or null when there is none. */
function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const {code} = error as {code: unknown};
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * The text the file should hold, or null when nothing needs writing.
 *
 * @throws When versionMode is present but cannot be located in the text for a
 *   surgical edit (an escaped key, for example). Nothing is written.
 */
function planConfigText(
  configPath: string,
  read: Exclude<VersionManagerConfigRead, {outcome: 'invalid'}>,
  mode: VersionMode,
): {change: VersionModeChange; newText: string | null} {
  if (read.outcome === 'absent') {
    // Exactly `{\n  "versionMode": "<m>"\n}\n` and nothing else (M2).
    return {
      change: 'created',
      newText: JSON.stringify({versionMode: mode}, null, 2) + '\n',
    };
  }

  if (read.migrated) {
    // A legacy file does not parse under the current schema, so it cannot be
    // edited in place. It is rewritten with exactly the fields the existing
    // migration carries over from it — versionCalculationMode, and versions
    // with runtimeVersion moved to versions.runtime — plus the mode, and NOT
    // the defaults migrateLegacyConfig() fills in (P4).
    return {
      change: 'migrated',
      newText:
        JSON.stringify(
          {
            versionCalculationMode: read.config.versionCalculationMode,
            versionMode: mode,
            versions: read.config.versions,
          },
          null,
          2,
        ) + '\n',
    };
  }

  const text = readFileSync(configPath, 'utf-8');
  // It parsed a moment ago, as an object: the schema accepted it.
  const raw = JSON.parse(text) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(raw, 'versionMode')) {
    return {
      change: 'added',
      newText: appendTopLevelStringProperty(text, 'versionMode', mode),
    };
  }

  if (raw.versionMode === mode) {
    return {change: 'unchanged', newText: null};
  }

  const replaced = replaceTopLevelStringValue(text, 'versionMode', mode);

  if (replaced === null) {
    throw new Error(
      `${configPath} sets versionMode in a form install --mode cannot edit in place (an escaped key, for example). Nothing was written and nothing was installed. Set "versionMode": "${mode}" by hand and run install again.`,
    );
  }

  return {change: 'replaced', newText: replaced};
}

/**
 * Throw unless `read` is a current-schema config equal to `expected`.
 *
 * Deep equality, not just the mode: the edit must change versionMode and
 * NOTHING else about what the config means.
 */
function assertRecorded(
  read: VersionManagerConfigRead,
  expected: VersionManagerConfig,
  failure: string,
): void {
  if (read.outcome !== 'ok') {
    const found =
      read.outcome === 'invalid' ? read.reason : 'the file is not there';
    throw new Error(`${failure}: ${found}`);
  }

  if (read.migrated) {
    throw new Error(
      `${failure}: the result only parses as the legacy format, not the current one.`,
    );
  }

  if (!isDeepStrictEqual(read.config, expected)) {
    throw new Error(
      `${failure}: it reads as ${JSON.stringify(read.config)}, expected ${JSON.stringify(expected)}.`,
    );
  }
}

/**
 * Make version-manager.json say `mode` (version-manager-70i.7, M2).
 *
 * - No file: create one holding only versionMode.
 * - versionMode present: replace just that value; every other byte stays.
 * - versionMode absent: add it at the end; nothing else changes and no
 *   default field is added.
 * - Legacy file: migrate it as the existing migration does, plus the mode.
 * - Already that mode: write nothing.
 * - Present but invalid: throw, write nothing. --mode never "repairs" a
 *   broken file by overwriting it.
 *
 * The new text is checked BEFORE it is written, through the same parser every
 * command uses, and read back from disk AFTER (the post-condition, in the
 * spirit of assertVersionReplaced()).
 *
 * @param configPath - Path to version-manager.json
 * @param mode - The requested mode
 * @throws If the file is invalid, cannot be edited surgically, or the result
 *   does not read back as the requested mode with everything else unchanged
 */
export function recordVersionMode(
  configPath: string,
  mode: VersionMode,
): RecordedVersionMode {
  const read = readVersionManagerConfig(configPath);

  if (read.outcome === 'invalid') {
    throw new Error(
      `${read.reason}\ninstall --mode never overwrites a version-manager.json it cannot read, so nothing was written and nothing was installed. Fix the file and run install again.`,
    );
  }

  const before: VersionManagerConfig =
    read.outcome === 'ok' ? read.config : VersionManagerConfigSchema.parse({});
  const previousMode = before.versionMode;
  const {change, newText} = planConfigText(configPath, read, mode);

  if (newText === null) {
    return {change, configPath, mode, previousMode};
  }

  const expected: VersionManagerConfig = {...before, versionMode: mode};

  assertRecorded(
    parseVersionManagerConfigText(newText, configPath),
    expected,
    `Refusing to write ${configPath}: setting versionMode to "${mode}" did not produce the intended config. This is a bug in version-manager, not in your file. Nothing was written`,
  );

  writeFileSync(configPath, newText);

  assertRecorded(
    readVersionManagerConfig(configPath),
    expected,
    `${configPath} was written, but reading it back does not give versionMode "${mode}" with everything else unchanged. Check the file before committing it`,
  );

  return {change, configPath, mode, previousMode};
}

/**
 * The one line install prints about the record step.
 */
export function describeRecordedVersionMode(
  recorded: RecordedVersionMode,
): string {
  const {change, mode, previousMode} = recorded;
  const was = previousMode === mode ? '' : ` (it was "${previousMode}" before)`;

  switch (change) {
    case 'unchanged':
      return `ℹ️  version-manager.json already sets versionMode to "${mode}", so it was left unchanged.`;
    case 'created':
      return `✅ Created version-manager.json with versionMode "${mode}"${was}.`;
    case 'added':
      return `✅ Added versionMode "${mode}" to version-manager.json${was}.`;
    case 'replaced':
      return `✅ Set versionMode to "${mode}" in version-manager.json${was}.`;
    case 'migrated':
      return `✅ Migrated version-manager.json to the current format (runtimeVersion moved to versions.runtime) and set versionMode to "${mode}"${was}.`;
  }
}

/**
 * What a cheap check of one thing on disk found. "unknown" carries why: a
 * failed check is never reported as "absent" (critical rule 6), and is worded
 * conditionally instead.
 */
type Presence =
  | {state: 'absent'}
  | {state: 'present'}
  | {detail: string; state: 'unknown'};

/** Whether a path exists. ENOENT is "absent"; any other failure is unknown. */
function checkPath(path: string): Presence {
  try {
    statSync(path);
    return {state: 'present'};
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? {state: 'absent'}
      : {detail: errorMessage(error), state: 'unknown'};
  }
}

/**
 * Whether a hook file holds a version-manager line, optionally one that also
 * contains `mustInclude`.
 */
function checkHook(
  projectDir: string,
  hookName: string,
  mustInclude: string | null,
): Presence {
  let content: string;
  try {
    content = readFileSync(join(projectDir, HUSKY_DIR_NAME, hookName), 'utf-8');
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? {state: 'absent'}
      : {detail: errorMessage(error), state: 'unknown'};
  }

  const ours = content
    .split('\n')
    .some(
      (line) =>
        isVersionManagerHookLine(line) &&
        (mustInclude === null || line.includes(mustInclude)),
    );

  return ours ? {state: 'present'} : {state: 'absent'};
}

/** The lifecycle scripts in package.json that run version-manager. */
function checkLifecycleScripts(projectDir: string):
  | {names: string[]; state: 'present'}
  | {state: 'absent'}
  | {
      detail: string;
      state: 'unknown';
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      readFileSync(join(projectDir, 'package.json'), 'utf-8'),
    );
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? {state: 'absent'}
      : {detail: errorMessage(error), state: 'unknown'};
  }

  const scripts =
    typeof parsed === 'object' && parsed !== null && 'scripts' in parsed
      ? (parsed as {scripts: unknown}).scripts
      : null;

  if (typeof scripts !== 'object' || scripts === null) {
    return {state: 'absent'};
  }

  const names = LIFECYCLE_SCRIPT_NAMES.filter((name) => {
    const command = (scripts as Record<string, unknown>)[name];
    return typeof command === 'string' && isVersionManagerScript(command);
  });

  return names.length > 0 ? {names, state: 'present'} : {state: 'absent'};
}

/** "a", "a and b", "a, b and c". */
function listNames(names: string[]): string {
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Leaving package-json or event-log for dynamic-file: the pre-commit hook. */
function describePreCommitLeftover(projectDir: string): string[] {
  const hookPath = `${HUSKY_DIR_NAME}/pre-commit`;
  const danger =
    'In dynamic-file mode that rewrites the version in package.json on every commit, so remove that line now. Read the file first: install appends to a hook that already exists, so it may hold lines that are not ours.';
  const check = checkHook(projectDir, 'pre-commit', '--pre-commit');

  switch (check.state) {
    case 'absent':
      return [];
    case 'present':
      return [`${hookPath} still runs version-manager --pre-commit. ${danger}`];
    case 'unknown':
      return [
        `Could not read ${hookPath} (${check.detail}). If it runs version-manager --pre-commit: ${danger}`,
      ];
  }
}

/** Leaving dynamic-file: the post-* hooks, the lifecycle scripts, the file. */
function describeDynamicFileLeftovers(
  projectDir: string,
  nextMode: VersionMode,
): string[] {
  const leftovers: string[] = [];

  const hookChecks = POST_HOOK_NAMES.map((name) => ({
    check: checkHook(projectDir, name, null),
    name,
  }));
  const presentHooks = hookChecks
    .filter(({check}) => check.state === 'present')
    .map(({name}) => name);

  if (presentHooks.length > 0) {
    leftovers.push(
      `The ${listNames(presentHooks)} hook${presentHooks.length === 1 ? '' : 's'} in ${HUSKY_DIR_NAME}/ still run${presentHooks.length === 1 ? 's' : ''} version-manager after every commit, checkout, merge or rebase. In ${nextMode} mode that writes nothing, so remove the version-manager line from each. Read each file first: install appends to a hook that already exists, so it may hold lines that are not ours.`,
    );
  }

  for (const {check, name} of hookChecks) {
    if (check.state === 'unknown') {
      leftovers.push(
        `Could not read ${HUSKY_DIR_NAME}/${name} (${check.detail}). If it runs version-manager, remove that line.`,
      );
    }
  }

  const scripts = checkLifecycleScripts(projectDir);

  if (scripts.state === 'present') {
    leftovers.push(
      `The ${listNames(scripts.names)} script${scripts.names.length === 1 ? '' : 's'} in package.json still run${scripts.names.length === 1 ? 's' : ''} version-manager to regenerate dynamic-version.local.json, which ${nextMode} mode does not write. Remove ${scripts.names.length === 1 ? 'it' : 'them'} (from prepare, only the version-manager part).`,
    );
  } else if (scripts.state === 'unknown') {
    leftovers.push(
      `Could not read package.json's scripts (${scripts.detail}). If ${listNames(LIFECYCLE_SCRIPT_NAMES)} run version-manager, remove them.`,
    );
  }

  const jsonPath = DEFAULT_OUTPUT_PATH.replace(/^\.\//, '');
  const generatedChecks = [jsonPath, jsonPath.replace(/\.json$/, '.d.ts')].map(
    (name) => ({check: checkPath(join(projectDir, name)), name}),
  );
  const presentFiles = generatedChecks
    .filter(({check}) => check.state === 'present')
    .map(({name}) => name);

  if (presentFiles.length > 0) {
    leftovers.push(
      `${listNames(presentFiles)} ${presentFiles.length === 1 ? 'is' : 'are'} still on disk and will never be updated again, so anything that imports ${presentFiles.length === 1 ? 'it' : 'them'} reads a stale version. Delete ${presentFiles.length === 1 ? 'it' : 'them'} once nothing imports ${presentFiles.length === 1 ? 'it' : 'them'}. ${describeNoGeneratedFile(nextMode)}`,
    );
  }

  for (const {check, name} of generatedChecks) {
    if (check.state === 'unknown') {
      leftovers.push(
        `Could not check for ${name} (${check.detail}). If it is there, it will never be updated again.`,
      );
    }
  }

  return leftovers;
}

/**
 * What the previous mode left behind, one sentence per item
 * (version-manager-70i.7, M3). Empty means CHECKED and nothing is left: a
 * check that failed produces a conditionally worded item instead.
 *
 * - Leaving dynamic-file: the four post-* hooks, the lifecycle scripts and
 *   dynamic-version.local.json (and its .d.ts).
 * - Leaving package-json or event-log for dynamic-file: the pre-commit hook.
 * - Between package-json and event-log: nothing about hooks. Both modes
 *   install the same pre-commit command, which picks its behaviour from the
 *   mode at run time (src/git-hooks-manager.ts).
 *
 * @param projectDir - The repository root (where .husky/ and package.json are)
 */
export function describeModeSwitchLeftovers(
  previousMode: VersionMode,
  nextMode: VersionMode,
  projectDir: string,
): string[] {
  if (previousMode === nextMode) {
    return [];
  }

  if (nextMode === 'dynamic-file') {
    return describePreCommitLeftover(projectDir);
  }

  if (previousMode === 'dynamic-file') {
    return describeDynamicFileLeftovers(projectDir, nextMode);
  }

  return [];
}

/**
 * The whole warning, or null when nothing was left behind.
 */
export function formatModeSwitchWarning(
  previousMode: VersionMode,
  nextMode: VersionMode,
  leftovers: string[],
): string | null {
  if (leftovers.length === 0) {
    return null;
  }

  return [
    `⚠️  versionMode changed from "${previousMode}" to "${nextMode}". install does not remove what the old mode set up, and this is still in place:`,
    ...leftovers.map((leftover) => `   - ${leftover}`),
  ].join('\n');
}
