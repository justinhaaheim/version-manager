import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {type GitIndexEntry, readIndexEntry, writeIndexEntry} from './git-utils';
import {replaceTopLevelStringValue} from './json-text-edit';

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

/** The one file the pre-commit path reads and writes. */
const PACKAGE_JSON = 'package.json';

/**
 * Where the pre-commit base version was measured.
 *
 * 'working-tree' is D9's documented fallback and only happens when
 * package.json is absent from the index entirely (a repo where it has never
 * been staged). It is reported, never silent.
 */
export interface PreCommitBaseVersion {
  source: 'index' | 'working-tree';
  version: string;
}

/**
 * Read the version the pre-commit calculation starts from — from the INDEX.
 *
 * THE INDEX IS WHAT THE COMMIT IS MADE FROM (version-manager-70i.3, D9). When
 * package.json is unstaged the index still holds HEAD's content, so one rule
 * covers both the staged and the unstaged case with no branching, and an
 * unstaged version edit in the working tree cannot steer the calculation.
 *
 * @returns The version and where it came from, or null if package.json has no
 *   top-level string `version`. Null is "no version there"; a read that FAILS
 *   throws (critical rule 6).
 * @throws If git fails, or the staged package.json is not valid JSON
 */
export function readPreCommitBaseVersion(): PreCommitBaseVersion | null {
  const entry = readIndexEntry(PACKAGE_JSON);

  if (entry === null) {
    // D9: nothing staged to read, so the working tree is all there is.
    const version = getPackageVersion();
    return version === null ? null : {source: 'working-tree', version};
  }

  let staged: unknown;
  try {
    staged = JSON.parse(entry.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The package.json staged in the git index is not valid JSON: ${message}`,
    );
  }

  const version = (staged as {version?: unknown}).version;

  if (typeof version !== 'string') {
    return null;
  }

  return {source: 'index', version};
}

/**
 * Check what the scanner actually produced, before anyone writes it
 * (version-manager-70i.13 F7).
 *
 * replaceTopLevelStringValue() is a hand-rolled JSON scanner. It is careful
 * and it has its own unit tests, but it is the one place in this codebase
 * where a parser bug would corrupt a user's package.json SILENTLY — written
 * into the index and the working tree, committed, and only noticed later by
 * something else that cannot read the file. That is precisely the failure
 * shape critical rule 6 exists to prevent, so the result is checked against
 * plain JSON.parse before it is written anywhere.
 *
 * It catches a real disagreement, not just a hypothetical bug: a package.json
 * with two top-level `version` keys is valid JSON whose value is the LAST
 * one, while the scanner replaces the FIRST. Without this check that file
 * gets rewritten to no effect and the commit records the old version.
 *
 * WHY THE CHECK IS CONDITIONAL ON THE INPUT PARSING. The working-tree
 * package.json may be mid-edit and not valid JSON at all — that is the case
 * D9 exists to protect, and the author's own broken file is not this hook's
 * to block a commit over. So when the input does not parse, the surgical
 * replacement is the best that can be offered and no post-condition is
 * demanded of the output. When the input DOES parse, the output must parse
 * too and must carry exactly the version intended; anything else is a bug in
 * the scanner and must not reach the disk. (The index content always parses
 * by the time this runs — readPreCommitBaseVersion() throws otherwise — so in
 * practice the tolerant branch only ever applies to the working-tree file.)
 *
 * Exported for its unit tests; nothing outside this module calls it.
 *
 * @param label - What to name in the error, e.g. the file's path
 * @param newVersion - The version the replacement was supposed to write
 * @param original - The text handed to the scanner
 * @param replaced - The text the scanner returned
 * @throws If the input parsed but the output does not, or does not carry
 *   `newVersion` as its top-level version
 */
export function assertVersionReplaced({
  label,
  newVersion,
  original,
  replaced,
}: {
  label: string;
  newVersion: string;
  original: string;
  replaced: string;
}): void {
  try {
    JSON.parse(original);
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(replaced);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Refusing to write ${label}: setting the version to ${newVersion} produced text that is no longer valid JSON (${message}). This is a bug in the version replacement, not in your package.json — nothing was written.`,
    );
  }

  const version = (parsed as {version?: unknown}).version;

  if (version !== newVersion) {
    throw new Error(
      `Refusing to write ${label}: after setting the version to ${newVersion} the file's top-level version reads ${JSON.stringify(version)}. Two top-level "version" keys will do this. Nothing was written.`,
    );
  }
}

/**
 * Write the version computed for the commit that is about to happen.
 *
 * Two writes, one string (version-manager-70i.3, D9):
 *
 * 1. THE INDEX gets the staged content with only the version value replaced,
 *    written surgically with hash-object + update-index. Nothing else about
 *    the index moves, so unstaged edits sitting in the working-tree
 *    package.json are NOT swept into the commit. The caller must not `git
 *    add` package.json afterwards — that would undo exactly this.
 * 2. THE WORKING-TREE FILE gets a string-level replacement of the same value.
 *    Deliberately NOT a parse-and-re-stringify: reformatting the file is how
 *    a half-finished edit gets destroyed, which is the harm this bead exists
 *    to prevent.
 *
 * Both replacements are computed AND CHECKED before either is written, so
 * neither the common failure — no top-level `version` to replace — nor a
 * scanner that produced the wrong text can leave the index and the working
 * tree disagreeing. See assertVersionReplaced() for what is checked.
 *
 * FAILURE ABORTS THE COMMIT (version-manager-70i.4, D10). Nothing here
 * returns a status for a caller to ignore: every failure throws, naming the
 * file and the operation. A blocked commit is strictly better than a commit
 * that records a version different from the one on disk, and `--no-verify`
 * self-heals on the next hooked commit by design.
 *
 * ORDER MATTERS, and it is index-then-working-tree:
 *
 * - If the index write fails, the working tree has not been touched yet, so
 *   the repository is exactly as it was. The next hooked commit recomputes
 *   from the same index and lands on the same version.
 * - If the WORKING-TREE write then fails, the index is rolled back to the
 *   content it held before. Without that, the index would keep a version the
 *   aborted commit never recorded, and the next hooked commit would read it
 *   back as its base and skip a version.
 *
 * @param newVersion - The version string to record
 * @throws If package.json has no top-level `version` to replace, if it is
 *   missing from the working tree, or if either write fails
 */
export function writePreCommitVersion(newVersion: string): void {
  const entry = readIndexEntry(PACKAGE_JSON);
  const workingTreePath = join(process.cwd(), PACKAGE_JSON);

  let newIndexContent: string | null = null;
  if (entry !== null) {
    newIndexContent = replaceTopLevelStringValue(
      entry.content,
      'version',
      newVersion,
    );

    if (newIndexContent === null) {
      throw new Error(
        'Failed to update package.json version: the package.json staged in the git index has no top-level "version" string.',
      );
    }

    assertVersionReplaced({
      label: 'the package.json staged in the git index',
      newVersion,
      original: entry.content,
      replaced: newIndexContent,
    });
  }

  if (!existsSync(workingTreePath)) {
    throw new Error(
      'Failed to update package.json version: package.json is in the git index but missing from the working tree.',
    );
  }

  const workingTreeContent = readFileSync(workingTreePath, 'utf-8');
  const newWorkingTreeContent = replaceTopLevelStringValue(
    workingTreeContent,
    'version',
    newVersion,
  );

  if (newWorkingTreeContent === null) {
    throw new Error(
      'Failed to update package.json version: the working-tree package.json has no top-level "version" string.',
    );
  }

  assertVersionReplaced({
    label: workingTreePath,
    newVersion,
    original: workingTreeContent,
    replaced: newWorkingTreeContent,
  });

  // The entry exactly as git had it, kept only so the write below can put it
  // back. Null means the index was never touched, so there is nothing to undo.
  let rollbackEntry: GitIndexEntry | null = null;
  if (entry !== null && newIndexContent !== null) {
    // Throws with the failing git command and git's stderr (gitSync).
    writeIndexEntry({...entry, content: newIndexContent});
    rollbackEntry = entry;
  }

  try {
    writeFileSync(workingTreePath, newWorkingTreeContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (rollbackEntry === null) {
      throw new Error(
        `Failed to write ${workingTreePath}: ${message}. Nothing was changed.`,
      );
    }

    // Put the index back the way it was. A rollback that ITSELF fails must
    // not hide the original failure, and must not be reported as a clean
    // abort either — both go in the message.
    try {
      writeIndexEntry(rollbackEntry);
    } catch (rollbackError) {
      const rollbackMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);

      throw new Error(
        `Failed to write ${workingTreePath}: ${message}. The git index was already updated to version ${newVersion} and could NOT be rolled back: ${rollbackMessage}. Run \`git checkout -- package.json\` or re-stage package.json before committing again.`,
      );
    }

    throw new Error(
      `Failed to write ${workingTreePath}: ${message}. The git index was rolled back, so nothing was changed.`,
    );
  }
}

// THREE FUNCTIONS WERE REMOVED HERE by version-manager-70i.5: the lockfile
// refresher, the lockfile-aware package-manager detector it used, and the
// `git add` wrapper. Do not reintroduce them without reading that bead.
//
// The refresher ran `npm install` / `bun install` on every hooked commit to
// close a version drift that, measured, no supported workflow notices:
// bun.lock does not record the root package's version at all and `bun install
// --frozen-lockfile` exits 0 after a version-only bump; package-lock.json does
// record it and `npm ci` also exits 0. `npm version X --no-git-tag-version
// --offline` closes the drift instantly and offline if it is ever wanted.
//
// The other two had no callers left once it went: the only thing the
// pre-commit path staged was the lockfile that had just been rewritten, and
// package.json goes into the index directly via writePreCommitVersion(), never
// through `git add` (70i.3, D9). Husky installation still detects a package
// manager — through the separate detectPackageManager() in
// git-hooks-manager.ts, which is untouched.
