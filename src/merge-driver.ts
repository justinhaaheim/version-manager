/**
 * A git merge driver for package.json (version-manager-70i.8, D11).
 *
 * THE PROBLEM. In `versionMode: 'package-json'` the computed version is
 * written into package.json on every commit, so two branches that both
 * commit have both edited the same line. Every merge of such branches
 * conflicts on that line, every time, even when nothing else disagrees.
 *
 * THE POLICY (Justin, 2026-09-19, D11): take OURS — the version on the branch
 * being merged INTO, which for a normal PR merge is main. main's version then
 * counts the commits that landed ON MAIN: monotonic, stable however people
 * branched, and a squash of a 500-commit branch lands at main + 1 rather than
 * jumping 500. The pre-commit hook adds its usual 1 on top when the merge
 * result is committed by hand.
 *
 * HOW, AND WHY IT IS NOT A JSON MERGER. The driver does not merge anything
 * itself. It reads the version out of OURS, writes that same version into its
 * copies of the ancestor and theirs, and then hands all three to
 * `git merge-file`. The version line is now byte-identical on all three
 * sides, so it cannot conflict, while every other key in package.json merges
 * by git's own line rules — including conflicting, loudly, when the two sides
 * genuinely disagree about something else. Re-implementing a JSON merge would
 * be both harder and worse.
 *
 * WHAT IT DOES NOT FIX — and this is not a limitation of the implementation.
 * GitHub's "Merge pull request" / "Squash and merge" buttons do NOT apply the
 * .gitattributes `merge` attribute at all: a custom driver needs a
 * `merge.<name>.driver` entry in local git config, which by design never
 * travels with a repository, so GitHub has nowhere to learn the command.
 * (Even the built-in `merge=union`, which needs no external command, is not
 * applied server side — an open GitHub feature request and
 * kubernetes/kubernetes#70576 both attest to it.) A PR whose package.json
 * versions diverge is therefore still reported as conflicting and its merge
 * buttons are still blocked. This driver fixes LOCAL merges, squashes
 * included. Researched 2026-09-19; see the README.
 */

import {execFileSync, spawnSync} from 'child_process';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {
  findTopLevelStringValueSpan,
  replaceTopLevelStringValue,
} from './json-text-edit';
import {assertVersionReplaced} from './script-manager';

/** The driver's name, as it appears in .gitattributes and in git config. */
export const MERGE_DRIVER_NAME = 'version-manager';

/** The path whose merges this driver takes over. */
export const MERGE_DRIVER_PATH = 'package.json';

/** The exact .gitattributes line the install command writes. */
export const MERGE_DRIVER_ATTRIBUTE = `${MERGE_DRIVER_PATH} merge=${MERGE_DRIVER_NAME}`;

/** The human-readable name git prints for the driver. */
export const MERGE_DRIVER_DESCRIPTION =
  'Keep our package.json version on merge (version-manager)';

/** The three temporary files git hands a merge driver. */
export interface MergeDriverPaths {
  /** %O — the common ancestor's copy. */
  ancestor: string;
  /** %A — OUR copy, and the file the merged result must be left in. */
  ours: string;
  /** %B — THEIR copy. */
  theirs: string;
}

export interface MergeDriverResult {
  /** What to hand back to git: 0 merged cleanly, non-zero means conflicts. */
  exitCode: number;
  /**
   * Whether the version line was actually neutralised before merging. False
   * means the merge ran exactly as git's built-in driver would have, which is
   * the deliberate fallback whenever the version could not be read or the
   * rewrite could not be verified.
   */
  neutralised: boolean;
  /** Something worth saying on stderr, or null when there is nothing. */
  note: string | null;
}

/**
 * Read the top-level "version" string out of package.json text.
 *
 * @returns The value, or null when there is no top-level string `version`.
 *   Null is "absent", never "could not look": malformed text throws out of
 *   the scanner instead.
 */
function readTopLevelVersion(text: string): string | null {
  const span = findTopLevelStringValueSpan(text, 'version');

  if (span === null) {
    return null;
  }

  // The span covers the quotes, so the slice is a JSON string literal and
  // JSON.parse decodes its escapes exactly as the file means them.
  return JSON.parse(text.slice(span.start, span.end)) as string;
}

/**
 * Check that the version the scanner read is the version JSON itself means.
 *
 * The read side of finding F7: a package.json with two top-level `version`
 * keys is valid JSON whose value is the LAST one, while the scanner returns
 * the FIRST. Propagating the wrong one of those into both other sides would
 * write a version nobody chose into a merge result.
 *
 * Skipped when our copy does not parse at all — that file is the author's
 * own, and the caller falls back to a plain merge either way.
 *
 * @throws If the text parses and disagrees with what the scanner read
 */
function assertVersionRead(oursText: string, version: string): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(oursText);
  } catch {
    return;
  }

  const actual = (parsed as {version?: unknown}).version;

  if (actual !== version) {
    throw new Error(
      `our ${MERGE_DRIVER_PATH} reads version ${JSON.stringify(
        actual,
      )} as JSON but ${JSON.stringify(
        version,
      )} to the scanner; two top-level "version" keys will do this`,
    );
  }
}

/**
 * Rewrite one side's version to match ours, verifying the result before it is
 * written anywhere.
 *
 * @returns The rewritten text, or null when this side needs no rewrite (it
 *   has no top-level version, or already carries ours)
 * @throws If the replacement did not take (assertVersionReplaced), which is a
 *   bug in the replacer and must never reach a file
 */
function versionMatchedTo(text: string, version: string, label: string) {
  const current = readTopLevelVersion(text);

  if (current === null || current === version) {
    return null;
  }

  const replaced = replaceTopLevelStringValue(text, 'version', version);

  if (replaced === null) {
    return null;
  }

  // The same post-condition the pre-commit hook demands (finding F7): a
  // package.json with two top-level version keys is valid JSON whose value is
  // the LAST one, while the scanner rewrites the FIRST.
  assertVersionReplaced({label, newVersion: version, original: text, replaced});

  return replaced;
}

/**
 * Run `git merge-file <ours> <ancestor> <theirs>`, leaving the result in
 * `ours` exactly as git's own merge machinery expects.
 *
 * The -L labels are supplied because without them git labels conflict hunks
 * with the temporary file names it generated (`.merge_file_a8Kd2P`), which
 * tells the reader nothing.
 *
 * @returns git merge-file's exit status: 0 clean, otherwise conflicts
 */
function runGitMergeFile(paths: MergeDriverPaths): {
  exitCode: number;
  note: string | null;
} {
  const args = [
    'merge-file',
    '-L',
    'ours',
    '-L',
    'base',
    '-L',
    'theirs',
    paths.ours,
    paths.ancestor,
    paths.theirs,
  ];

  const result = spawnSync('git', args, {encoding: 'utf-8'});

  if (result.error != null) {
    return {
      exitCode: 1,
      note: `version-manager merge driver: could not run \`git merge-file\` (${result.error.message}). Treating package.json as conflicted.`,
    };
  }

  if (result.status === null) {
    return {
      exitCode: 1,
      note: `version-manager merge driver: \`git merge-file\` died on signal ${
        result.signal ?? 'unknown'
      }. Treating package.json as conflicted.`,
    };
  }

  return {exitCode: result.status, note: null};
}

/**
 * The merge driver proper: neutralise the version field, then let git merge.
 *
 * EVERY failure path falls back to a plain `git merge-file`, i.e. to exactly
 * the behaviour the repository has today without this driver. A conflict the
 * author resolves by hand is a fine outcome; a silently wrong merge of their
 * package.json is not, so nothing is neutralised unless it verified.
 *
 * @param paths - The %O / %A / %B files git supplied
 * @returns The exit code to hand back to git, and whether anything was
 *   neutralised
 */
export function runMergeDriver(paths: MergeDriverPaths): MergeDriverResult {
  let neutralised = false;
  let note: string | null = null;

  try {
    const oursText = readFileSync(paths.ours, 'utf-8');
    const version = readTopLevelVersion(oursText);

    if (version === null) {
      note = `version-manager merge driver: our ${MERGE_DRIVER_PATH} has no top-level "version" string, so there is nothing to reconcile; merging normally.`;
    } else {
      assertVersionRead(oursText, version);

      const ancestorText = readFileSync(paths.ancestor, 'utf-8');
      const theirsText = readFileSync(paths.theirs, 'utf-8');

      // Compute BOTH rewrites before writing EITHER, so a failure on the
      // second one cannot leave the first half-applied.
      const ancestorRewrite = versionMatchedTo(
        ancestorText,
        version,
        'the merge base copy of package.json',
      );
      const theirsRewrite = versionMatchedTo(
        theirsText,
        version,
        'their copy of package.json',
      );

      if (ancestorRewrite !== null) {
        writeFileSync(paths.ancestor, ancestorRewrite);
      }
      if (theirsRewrite !== null) {
        writeFileSync(paths.theirs, theirsRewrite);
      }

      neutralised = true;
    }
  } catch (error) {
    // Unparseable JSON, an unreadable temp file, a replacement that did not
    // take. Say so and merge as git would have; never guess.
    neutralised = false;
    note = `version-manager merge driver: leaving the version field to the normal merge (${
      error instanceof Error ? error.message : String(error)
    }).`;
  }

  const merged = runGitMergeFile(paths);

  return {
    exitCode: merged.exitCode,
    neutralised,
    note: merged.note ?? note,
  };
}

/** What `registerMergeDriver` did, so the caller can report it accurately. */
export interface MergeDriverRegistration {
  /** The command string written into `merge.<name>.driver`. */
  driverCommand: string;
  gitAttributes: 'added' | 'already-present' | 'claimed-by-another' | 'created';
  gitConfig: 'already-set' | 'set';
}

/** Whether a .gitattributes line already points package.json at a driver. */
function findPackageJsonMergeLine(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const [pattern, ...attributes] = trimmed.split(/\s+/);

    if (pattern !== MERGE_DRIVER_PATH) {
      continue;
    }

    if (attributes.some((attribute) => attribute.startsWith('merge='))) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Put `package.json merge=version-manager` in .gitattributes, idempotently.
 *
 * Appends. An existing .gitattributes is never rewritten or reordered, and a
 * line that already points package.json at some OTHER merge driver is left
 * alone and reported rather than overridden — that is the user's own merge
 * policy, and quietly winning by appending after it would be a change they
 * never asked for.
 */
function ensureGitAttributesEntry(): MergeDriverRegistration['gitAttributes'] {
  const attributesPath = join(process.cwd(), '.gitattributes');

  if (!existsSync(attributesPath)) {
    writeFileSync(
      attributesPath,
      `# ${MERGE_DRIVER_DESCRIPTION}\n${MERGE_DRIVER_ATTRIBUTE}\n`,
    );
    return 'created';
  }

  const content = readFileSync(attributesPath, 'utf-8');
  const existing = findPackageJsonMergeLine(content.split('\n'));

  if (existing !== null) {
    return existing === MERGE_DRIVER_ATTRIBUTE ||
      existing.split(/\s+/).includes(`merge=${MERGE_DRIVER_NAME}`)
      ? 'already-present'
      : 'claimed-by-another';
  }

  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  writeFileSync(
    attributesPath,
    `${content}${separator}# ${MERGE_DRIVER_DESCRIPTION}\n${MERGE_DRIVER_ATTRIBUTE}\n`,
  );

  return 'added';
}

/**
 * Read one git config value.
 *
 * @returns The value, or null STRICTLY when the key is unset (git exits 1).
 *   Any other failure throws: "could not look" must not arrive as "not set".
 * @throws If git fails for any reason other than an unset key
 */
function readGitConfig(key: string): string | null {
  const result = spawnSync('git', ['config', '--get', key], {
    encoding: 'utf-8',
  });

  if (result.error != null) {
    throw new Error(
      `\`git config --get ${key}\` could not be run: ${result.error.message}`,
    );
  }

  if (result.status === 1) {
    return null;
  }

  if (result.status !== 0) {
    throw new Error(
      `\`git config --get ${key}\` failed (exit ${String(result.status)}): ${
        result.stderr?.trim() ?? ''
      }`,
    );
  }

  return result.stdout.trim();
}

/**
 * Register the merge driver in this repository (.gitattributes + git config).
 *
 * The git config half is the half that cannot be committed: `merge.<name>.
 * driver` lives in .git/config by design, so every clone has to run install
 * again. That is a property of git, not an oversight.
 *
 * @param runCommand - How to invoke version-manager here, e.g.
 *   `npx @justinhaaheim/version-manager`
 * @returns What was written and what was already in place
 * @throws If git config cannot be read or written
 */
export function registerMergeDriver(
  runCommand: string,
): MergeDriverRegistration {
  const driverCommand = `${runCommand} merge-driver %O %A %B`;
  const gitAttributes = ensureGitAttributesEntry();

  const configuredDriver = readGitConfig(`merge.${MERGE_DRIVER_NAME}.driver`);
  const configuredName = readGitConfig(`merge.${MERGE_DRIVER_NAME}.name`);

  if (
    configuredDriver === driverCommand &&
    configuredName === MERGE_DRIVER_DESCRIPTION
  ) {
    return {driverCommand, gitAttributes, gitConfig: 'already-set'};
  }

  // `git config <key> <value>` REPLACES the key's single value, so running
  // install twice cannot accumulate entries.
  //
  // THE DRIVER IS WRITTEN FIRST, AND THAT ORDER IS LOAD-BEARING. Measured
  // 2026-09-19, with `package.json merge=version-manager` in .gitattributes:
  //
  //   no merge.version-manager.* at all -> git falls back to its built-in
  //     merge and conflicts normally (exit 1). This is what a fresh clone
  //     and every collaborator who has not run install sees, and it is fine.
  //   .driver set, .name unset          -> works perfectly.
  //   .name set, .driver UNSET          -> `fatal: custom merge driver
  //     version-manager lacks command line.`, exit 128, and the merge does
  //     not start at all.
  //
  // Writing the driver first means an interrupted or partly-failed install
  // can only ever leave the first two states, never the fatal third.
  execFileSync(
    'git',
    ['config', `merge.${MERGE_DRIVER_NAME}.driver`, driverCommand],
    {stdio: ['pipe', 'pipe', 'pipe']},
  );
  execFileSync(
    'git',
    ['config', `merge.${MERGE_DRIVER_NAME}.name`, MERGE_DRIVER_DESCRIPTION],
    {stdio: ['pipe', 'pipe', 'pipe']},
  );

  return {driverCommand, gitAttributes, gitConfig: 'set'};
}
