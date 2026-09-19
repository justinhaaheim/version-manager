import {exec, execFile, execFileSync} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Cap on the output of the index plumbing below. The default (1 MB) is enough
 * for any sane package.json, but a generous limit turns a pathological file
 * into a slow read rather than a truncated one.
 */
const GIT_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * One entry of the git INDEX, read as a single measurement.
 *
 * The three fields are grouped rather than returned separately on purpose
 * (critical rule 6.2, "one nullable field, not many"): a mode without its
 * content, or content without the path git files it under, is a half-known
 * state that the write below must never be handed. Either the whole entry is
 * there or it is not.
 */
export interface GitIndexEntry {
  /**
   * The blob's exact bytes, decoded as UTF-8 and NEVER trimmed. Callers
   * rewrite this text and hand it back, so a stripped trailing newline would
   * show up as a spurious diff in the user's commit.
   */
  content: string;
  /** The index entry's file mode, e.g. '100644'. Passed back verbatim. */
  mode: string;
  /** The path as git records it: relative to the repository root. */
  repoPath: string;
}

/**
 * `git <args>` from the current directory, output untouched.
 *
 * A failure throws, and the thrown message NAMES THE COMMAND AND CARRIES
 * GIT'S STDERR (version-manager-70i.4, D10). stderr is piped rather than
 * inherited for exactly that reason: this runs inside a git hook, where the
 * one thing the author will see is the message that aborts their commit, and
 * "Command failed: git update-index" without git's own explanation sends them
 * looking in the wrong place.
 *
 * @throws If git cannot be run, or exits non-zero
 */
function gitSync(args: string[], input?: string): string {
  const printable = `git ${args.join(' ')}`;

  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf-8',
      ...(input === undefined ? {} : {input}),
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failure = error as {status?: number; stderr?: Buffer | string};
    const stderr = failure.stderr?.toString().trim() ?? '';
    const status =
      typeof failure.status === 'number' ? ` (exit ${failure.status})` : '';
    const detail =
      stderr === ''
        ? error instanceof Error
          ? error.message
          : String(error)
        : stderr;

    throw new Error(`\`${printable}\` failed${status}: ${detail}`);
  }
}

/**
 * Read a path's staged blob out of the git index.
 *
 * Used by the pre-commit path, where the index — not the working tree — is
 * what the commit is actually made from (version-manager-70i.3, D9). When the
 * path is unstaged, the index still holds HEAD's content, so one rule covers
 * both the staged and the unstaged case.
 *
 * Synchronous, and argv-based rather than going through execCommand(), for
 * three reasons: the write side needs stdin (execFileSync's `input`), the
 * callers in script-manager are synchronous, and execCommand() both goes
 * through a shell and `.trim()`s its output — which would silently eat the
 * file's trailing newline.
 *
 * @param path - A path relative to the current directory
 * @returns The entry, or null STRICTLY when the path is not in the index. A
 *   failed read (not a repository, unreadable object, an unmerged entry)
 *   throws instead — "could not look" must never arrive as "there is none"
 *   (critical rule 6).
 * @throws If git fails, or the index entry is not a single resolved blob
 */
export function readIndexEntry(path: string): GitIndexEntry | null {
  // --full-name makes the printed path repo-root-relative while the `--`
  // operand is still matched relative to the current directory. Both halves
  // matter: `git update-index --cacheinfo` resolves its path from the REPO
  // ROOT, so handing it a bare 'package.json' from a subdirectory silently
  // overwrites the root package.json (measured, 2026-09-19).
  const listing = gitSync(['ls-files', '--full-name', '--stage', '--', path]);

  const lines = listing.split('\n').filter((line) => line !== '');

  if (lines.length === 0) {
    return null;
  }

  if (lines.length > 1) {
    throw new Error(
      `Expected one index entry for ${path}, found ${lines.length}. Is it unmerged? git ls-files said:\n${listing}`,
    );
  }

  const match = /^(\d{6}) ([0-9a-f]{40,64}) (\d)\t(.*)$/.exec(lines[0]);

  if (match === null) {
    throw new Error(
      `Could not parse the git index entry for ${path}: ${lines[0]}`,
    );
  }

  const [, mode, objectId, stage, repoPath] = match;

  if (stage !== '0') {
    throw new Error(
      `${path} is at merge stage ${stage} in the git index. Resolve the conflict and stage the result first.`,
    );
  }

  if (repoPath.startsWith('"')) {
    // git C-quotes paths with unusual bytes. Rather than decode that here,
    // refuse: passing the quoted form on to update-index would file the blob
    // under a literally wrong path.
    throw new Error(
      `git reported a quoted path for ${path} (${repoPath}); refusing to rewrite it.`,
    );
  }

  return {
    content: gitSync(['cat-file', 'blob', objectId]),
    mode,
    repoPath,
  };
}

/**
 * Write content back into the git index for an existing entry, changing
 * nothing else about the index.
 *
 * This is the surgical counterpart to `git add`: `git add` replaces the index
 * entry with whatever the WORKING TREE currently holds, which is how an
 * unstaged half-finished edit gets swept into a commit nobody staged it for.
 * hash-object + update-index writes exactly the bytes given.
 *
 * @param entry - The entry to write. `mode` and `repoPath` come straight from
 *   readIndexEntry(), so the entry is filed exactly where git had it.
 * @throws If git fails, or returns an object id we do not recognise
 */
export function writeIndexEntry(entry: GitIndexEntry): void {
  const objectId = gitSync(
    ['hash-object', '-w', '--stdin'],
    entry.content,
  ).trim();

  if (!/^[0-9a-f]{40,64}$/.test(objectId)) {
    throw new Error(
      `git hash-object returned an unexpected object id: ${objectId}`,
    );
  }

  gitSync([
    'update-index',
    '--cacheinfo',
    `${entry.mode},${objectId},${entry.repoPath}`,
  ]);
}

export async function execCommand(command: string): Promise<string> {
  try {
    const {stdout} = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('not a git repository')
    ) {
      throw new Error(
        'Not a git repository. Please run this command in a git project.',
      );
    }
    if (error instanceof Error && error.message.includes('no names found')) {
      return await execCommand('git rev-parse --short HEAD');
    }
    throw error;
  }
}

export async function isGitRepository(): Promise<boolean> {
  try {
    await execCommand('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

export async function getGitDescribe(): Promise<string> {
  return await execCommand('git describe --always --tags --dirty');
}

export async function getCurrentBranch(): Promise<string> {
  try {
    const branch = await execCommand('git rev-parse --abbrev-ref HEAD');
    return branch;
  } catch {
    return 'HEAD';
  }
}

export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const status = await execCommand('git status --porcelain');
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a file is tracked by git (not gitignored)
 * @param filePath - Path to the file (relative to repo root or absolute)
 * @returns true if the file is tracked, false if gitignored or not in repo
 */
export async function isFileTrackedByGit(filePath: string): Promise<boolean> {
  try {
    // git ls-files returns the filename if it's tracked, empty if not
    const result = await execCommand(`git ls-files -- "${filePath}"`);
    return result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Find the last commit where a specific field value changed in a JSON file
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to track (e.g., 'codeVersionBase')
 * @returns The commit hash where the field last changed, or null if not found
 */
export async function findLastCommitWhereFieldChanged(
  filePath: string,
  fieldName: string,
): Promise<string | null> {
  try {
    // Get all commits that touched this file
    const commitList = await execCommand(`git log --format=%H -- ${filePath}`);

    if (!commitList) {
      return null; // File has never been committed
    }

    const commits = commitList.split('\n').filter(Boolean);

    if (commits.length === 0) {
      return null;
    }

    // Get current value of the field
    let currentValue: string | undefined;
    try {
      const currentContent = await execCommand(`git show HEAD:${filePath}`);
      const currentJson = JSON.parse(currentContent) as Record<string, unknown>;
      currentValue = currentJson[fieldName] as string;
    } catch {
      // If we can't read current value, return the first commit
      return commits[0];
    }

    // Walk backwards through commits to find where value changed
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];

      try {
        const content = await execCommand(`git show ${commit}:${filePath}`);
        const json = JSON.parse(content) as Record<string, unknown>;
        const value = json[fieldName] as string;

        // If value differs from current, this is where it last changed
        if (value !== currentValue) {
          // Return the commit AFTER this one (where the change happened)
          return i > 0 ? commits[i - 1] : commits[0];
        }
      } catch {
        // If we can't parse JSON from this commit, skip it
        continue;
      }
    }

    // If we've gone through all commits and value never changed,
    // return the oldest commit (where it was first set)
    return commits[commits.length - 1];
  } catch {
    return null;
  }
}

/**
 * Count commits between two refs
 * @param fromRef - Starting commit hash or ref
 * @param toRef - Ending commit hash or ref
 * @returns Number of commits between the two refs
 */
export async function countCommitsBetween(
  fromRef: string,
  toRef: string,
): Promise<number> {
  try {
    const count = await execCommand(
      `git rev-list --count ${fromRef}..${toRef}`,
    );
    return parseInt(count, 10);
  } catch {
    return 0;
  }
}

/**
 * Refs we are willing to hand to git. Deliberately narrow: the ref comes from
 * version-manager.json (branchSuffix.mainBranches), so it is user-authored
 * text. The counting below is argv-based rather than shell-based, so this is
 * no longer about shell metacharacters — it is about whitespace and leading
 * dashes reaching git's own option parser as flags.
 */
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;

/**
 * Why a ref could not be counted. Three genuinely different facts, kept
 * apart so the message a user reads names the one that actually happened
 * (version-manager-70i.13 F1).
 */
export type RefCommitCountFailure =
  | {
      /** git's own stderr, or the reason git could not be run at all. */
      detail: string;
      outcome: 'git-failed';
      ref: string;
    }
  | {outcome: 'rejected-name'; ref: string}
  | {outcome: 'unresolved'; ref: string};

/** The outcome of counting commits since a ref: one count, or one cause. */
export type RefCommitCount =
  | {count: number; outcome: 'counted'; ref: string}
  | RefCommitCountFailure;

/** One git invocation's result, with a non-zero exit treated as data. */
interface GitAttempt {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * Run `git <args>` without a shell, reporting a non-zero exit as data rather
 * than as a throw — the callers below need the exit CODE to tell "this ref
 * does not exist" (1) from "git failed" (128) apart.
 *
 * @param args - argv for git, passed through verbatim
 * @returns The exit code and both streams
 * @throws If git could not be executed at all, or died on a signal. Neither
 *   is an exit code and must not be reported as one (critical rule 6).
 */
async function gitAttempt(args: string[]): Promise<GitAttempt> {
  try {
    const {stderr, stdout} = await execFileAsync('git', args, {
      maxBuffer: GIT_MAX_BUFFER,
    });
    return {exitCode: 0, stderr, stdout};
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stderr?: string;
      stdout?: string;
    };

    if (typeof failure.code !== 'number') {
      throw new Error(
        `\`git ${args.join(' ')}\` could not be run: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      exitCode: failure.code,
      stderr: failure.stderr ?? '',
      stdout: failure.stdout ?? '',
    };
  }
}

/** git's stderr if it said anything, else a bare description of the exit. */
function gitFailureDetail(args: string[], attempt: GitAttempt): string {
  const stderr = attempt.stderr.trim();
  const printable = `git ${args.join(' ')}`;

  return stderr === ''
    ? `\`${printable}\` exited ${attempt.exitCode}`
    : `\`${printable}\` failed (exit ${attempt.exitCode}): ${stderr}`;
}

/**
 * Count the commits on HEAD that are not reachable from `ref` — i.e. the
 * commits this branch has of its own since its merge base with `ref`.
 *
 * Resolution is a separate step from counting on purpose: `rev-parse --verify
 * --quiet` exits 1 with no output for a ref that does not exist and 128 when
 * git itself fails, which is the only way to keep those two apart. Collapsing
 * them (as this function used to, by returning a bare null for everything)
 * made the caller's warning blame the wrong thing.
 *
 * @param ref - A branch name or other ref (e.g. "main")
 * @returns A count, or the reason there is none. NEVER 0 on failure: 0 is a
 *   real answer meaning "this branch is identical to ref" (critical rule 6).
 */
export async function countCommitsSinceRef(
  ref: string,
): Promise<RefCommitCount> {
  if (!SAFE_REF_PATTERN.test(ref)) {
    return {outcome: 'rejected-name', ref};
  }

  try {
    const resolveArgs = ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`];
    const resolved = await gitAttempt(resolveArgs);

    if (resolved.exitCode === 1 && resolved.stdout.trim() === '') {
      return {outcome: 'unresolved', ref};
    }

    if (resolved.exitCode !== 0) {
      return {
        detail: gitFailureDetail(resolveArgs, resolved),
        outcome: 'git-failed',
        ref,
      };
    }

    const countArgs = ['rev-list', '--count', `${ref}..HEAD`];
    const counted = await gitAttempt(countArgs);

    if (counted.exitCode !== 0) {
      return {
        detail: gitFailureDetail(countArgs, counted),
        outcome: 'git-failed',
        ref,
      };
    }

    const printed = counted.stdout.trim();
    const count = parseInt(printed, 10);

    if (isNaN(count)) {
      return {
        detail: `\`git ${countArgs.join(' ')}\` printed ${JSON.stringify(
          printed,
        )}, which is not a number`,
        outcome: 'git-failed',
        ref,
      };
    }

    return {count, outcome: 'counted', ref};
  } catch (error) {
    // gitAttempt only throws when git could not be run at all. That is a
    // failure with a name, not an absent measurement.
    return {
      detail: error instanceof Error ? error.message : String(error),
      outcome: 'git-failed',
      ref,
    };
  }
}

/**
 * Count every commit reachable from HEAD.
 *
 * @returns The count, or null if git fails (e.g. no commits yet). NEVER 0 on
 *   failure (critical rule 6).
 */
export async function countCommitsOnHead(): Promise<number | null> {
  try {
    const output = await execCommand('git rev-list --count HEAD');
    const count = parseInt(output, 10);
    return isNaN(count) ? null : count;
  } catch {
    return null;
  }
}

/**
 * Read a field value from a JSON file at a specific commit
 * @param commit - Commit hash or ref
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to read
 * @returns The field value, or null if not found
 */
export async function readFieldFromCommit(
  commit: string,
  filePath: string,
  fieldName: string,
): Promise<string | null> {
  try {
    const content = await execCommand(`git show ${commit}:${filePath}`);
    const json = JSON.parse(content) as Record<string, unknown>;
    return (json[fieldName] as string) ?? null;
  } catch {
    return null;
  }
}
