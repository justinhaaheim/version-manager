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
 * Hash `entry.content` and file it in the index at `entry.repoPath`.
 *
 * @param entry - The content, mode and repo-root-relative path
 * @param allowNew - Whether a path that is not already in the index may be
 *   added. False is the safe default: for a path that is supposed to exist,
 *   "it is not in the index" is a fact worth failing on rather than papering
 *   over by creating an entry.
 * @throws If git fails, or returns an object id we do not recognise
 */
function stageBlob(entry: GitIndexEntry, allowNew: boolean): void {
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
    ...(allowNew ? ['--add'] : []),
    '--cacheinfo',
    `${entry.mode},${objectId},${entry.repoPath}`,
  ]);
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
  stageBlob(entry, false);
}

/**
 * Add a path to the git index that is not in it yet (version-manager-cza.1).
 *
 * The one case that needs this: event-log mode's first hooked commit in a
 * repository where version.jsonl exists but has never been staged. Everything
 * else goes through writeIndexEntry(), which refuses to invent an entry.
 *
 * `repoPath` MUST be repo-root-relative — `update-index --cacheinfo` resolves
 * from the repository root, not from the current directory (measured,
 * 2026-09-19; see readIndexEntry). Use repoRelativePath() to build it.
 *
 * @param entry - The content, mode (usually '100644') and repo-root path
 * @throws If git fails, or returns an object id we do not recognise
 */
export function addIndexEntry(entry: GitIndexEntry): void {
  stageBlob(entry, true);
}

/**
 * Turn a path relative to the CURRENT DIRECTORY into one relative to the
 * repository root, which is the only kind `update-index --cacheinfo` accepts.
 *
 * @param path - A path relative to the current directory, e.g. 'version.jsonl'
 * @returns The same file, spelled from the repository root
 * @throws If git fails (e.g. this is not a repository)
 */
export function repoRelativePath(path: string): string {
  // `--show-prefix` prints the current directory relative to the repo root,
  // with a trailing slash, or nothing at all at the root itself.
  const prefix = gitSync(['rev-parse', '--show-prefix']).trim();

  return `${prefix}${path}`;
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
 * A git measurement that could not be taken (version-manager-70i.18.1).
 *
 * The failure member of every measurement below. It is its own type member,
 * never a sentinel that is also a legal answer — not 0 commits, not "never
 * changed", not the string "HEAD", not "untracked" (critical rule 6). `detail`
 * names the git command and carries git's own stderr, so a caller can end the
 * command with it as it stands (70i.18 F1).
 */
export interface GitMeasurementFailure {
  detail: string;
  outcome: 'git-failed';
}

/** One git invocation, or the reason it could not be run at all. */
type GitRun = {attempt: GitAttempt; outcome: 'ran'} | GitMeasurementFailure;

/**
 * gitAttempt(), with "git could not be run at all" folded into the failure
 * member instead of thrown, so every measurement below has one failure path.
 */
async function runGit(args: string[]): Promise<GitRun> {
  try {
    return {attempt: await gitAttempt(args), outcome: 'ran'};
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      outcome: 'git-failed',
    };
  }
}

/** The failure member for a git command that ran and exited badly. */
function gitFailed(args: string[], attempt: GitAttempt): GitMeasurementFailure {
  return {detail: gitFailureDetail(args, attempt), outcome: 'git-failed'};
}

/** The current branch: a name, "HEAD" when detached, or the failure. */
export type CurrentBranch =
  | {branch: string; outcome: 'read'}
  | GitMeasurementFailure;

/**
 * Read the current branch (version-manager-70i.18.1, S3).
 *
 * `git symbolic-ref --quiet --short HEAD` rather than `git rev-parse
 * --abbrev-ref HEAD`, because the latter FAILS on an unborn branch (exit
 * 128), and the old catch turned that into "HEAD" (F3). Exit codes MEASURED
 * 2026-09-26 with git 2.54.0: 0 with the name on a branch, unborn or not;
 * 1 with no output on a detached HEAD; 128 when git fails (not a repository,
 * a corrupt HEAD).
 *
 * @returns The branch name, "HEAD" for a detached HEAD (D6 keys off that
 *   literal), or the failure member. A failure is NEVER "HEAD": that would
 *   silently read as detached and suppress the branch suffix.
 */
export async function getCurrentBranch(): Promise<CurrentBranch> {
  const args = ['symbolic-ref', '--quiet', '--short', 'HEAD'];
  const run = await runGit(args);

  if (run.outcome === 'git-failed') {
    return run;
  }

  const {attempt} = run;
  const printed = attempt.stdout.trim();

  if (attempt.exitCode === 0 && printed !== '') {
    return {branch: printed, outcome: 'read'};
  }

  if (attempt.exitCode === 1 && printed === '') {
    return {branch: 'HEAD', outcome: 'read'};
  }

  return gitFailed(args, attempt);
}

/**
 * The current branch, or an Error that ends the command (70i.18 F1, F2).
 *
 * Every caller writes the branch into DynamicVersion.branch or into an
 * event-log commit event's "b" field, and there is no honest string to put
 * there when it could not be read — so a failed read is not handed on.
 *
 * @throws If git failed, naming the command and git's stderr
 */
export async function requireCurrentBranch(): Promise<string> {
  const reading = await getCurrentBranch();

  if (reading.outcome === 'git-failed') {
    throw new Error(`Could not read the current branch: ${reading.detail}`);
  }

  return reading.branch;
}

export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const status = await execCommand('git status --porcelain');
    return status.length > 0;
  } catch {
    return false;
  }
}

/** Whether a path is tracked, or the failure. */
export type FileTracking =
  | {outcome: 'measured'; tracked: boolean}
  | GitMeasurementFailure;

/**
 * Check if a file is tracked by git (version-manager-70i.18.1, S7).
 *
 * The one caller guards "never modify a tracked file" with this, so a failure
 * must stay distinguishable from "untracked": reading it as untracked is what
 * would OPEN the guard.
 *
 * @param filePath - Path to the file, relative to the current directory
 * @returns tracked true/false, or the failure member
 */
export async function isFileTrackedByGit(
  filePath: string,
): Promise<FileTracking> {
  // argv, not a shell string: the path is passed through verbatim.
  const args = ['ls-files', '--', filePath];
  const run = await runGit(args);

  if (run.outcome === 'git-failed') {
    return run;
  }

  if (run.attempt.exitCode !== 0) {
    return gitFailed(args, run.attempt);
  }

  // ls-files prints the path if it is tracked and nothing if it is not.
  return {outcome: 'measured', tracked: run.attempt.stdout.trim() !== ''};
}

/** A file's content at one commit: the text, absent, or the failure. */
type FileAtCommit =
  | {content: string; outcome: 'read'}
  | {outcome: 'absent'}
  | GitMeasurementFailure;

/**
 * Read `<commit>:<filePath>` out of git, keeping "that commit has no such
 * file" apart from "git failed" — the old `git show` in a catch-all could not.
 *
 * The path is resolved from the repository root, exactly as the `git show
 * <commit>:<path>` this replaces did. Exit codes of `rev-parse --verify
 * --quiet <commit>:<path>` MEASURED 2026-09-26 with git 2.54.0: 0 with the
 * blob id when the path is there, 1 with no output when it is not, 128 when
 * git fails.
 */
async function readFileAtCommit(
  commit: string,
  filePath: string,
): Promise<FileAtCommit> {
  const resolveArgs = [
    'rev-parse',
    '--verify',
    '--quiet',
    `${commit}:${filePath}`,
  ];
  const resolved = await runGit(resolveArgs);

  if (resolved.outcome === 'git-failed') {
    return resolved;
  }

  const objectId = resolved.attempt.stdout.trim();

  if (resolved.attempt.exitCode === 1 && objectId === '') {
    return {outcome: 'absent'};
  }

  if (resolved.attempt.exitCode !== 0) {
    return gitFailed(resolveArgs, resolved.attempt);
  }

  const readArgs = ['cat-file', 'blob', objectId];
  const read = await runGit(readArgs);

  if (read.outcome === 'git-failed') {
    return read;
  }

  if (read.attempt.exitCode !== 0) {
    return gitFailed(readArgs, read.attempt);
  }

  return {content: read.attempt.stdout, outcome: 'read'};
}

/** JSON text parsed as an object, or null when it is not one. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Where a JSON field last changed, as one of four distinct facts
 * (version-manager-70i.18.1, S2).
 *
 * - `found`: the commit where the value last changed.
 * - `never-committed`: the branch has no commits yet, or the file has never
 *   been committed. A REAL answer (F3): zero commits since.
 * - `unreadable-at-head`: the file at HEAD is not a JSON object, so there is
 *   no current value to compare history against, and any commit named would
 *   be made up (F5 b).
 * - `git-failed`: a git command failed.
 */
export type FieldChangeLookup =
  | {commit: string; outcome: 'found'}
  | {detail: string; outcome: 'unreadable-at-head'}
  | {outcome: 'never-committed'}
  | GitMeasurementFailure;

/**
 * Find the last commit where a specific field value changed in a JSON file.
 *
 * Each of the three old catch-alls is now dispositioned on its own (70i.18 F5):
 * (a) a failed `git log` is a failure, not "never changed";
 * (b) a failed read of HEAD is a failure, and HEAD content that is not a JSON
 *     object is `unreadable-at-head` — neither returns the newest commit;
 * (c) a historical commit whose file is absent or not a JSON object is still
 *     skipped, which is legitimate history, but a failed git read is a failure.
 *
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to track (e.g., 'version')
 * @returns One of the four outcomes of FieldChangeLookup
 */
export async function findLastCommitWhereFieldChanged(
  filePath: string,
  fieldName: string,
): Promise<FieldChangeLookup> {
  // "No commits yet" is a legitimate state (F3), and `git log` fails in it
  // (exit 128, measured), so it is asked about first. `rev-parse --verify
  // --quiet HEAD` exits 1 with no output on an unborn branch (measured).
  const headArgs = ['rev-parse', '--verify', '--quiet', 'HEAD'];
  const head = await runGit(headArgs);

  if (head.outcome === 'git-failed') {
    return head;
  }

  if (head.attempt.exitCode === 1 && head.attempt.stdout.trim() === '') {
    return {outcome: 'never-committed'};
  }

  if (head.attempt.exitCode !== 0) {
    return gitFailed(headArgs, head.attempt);
  }

  // (a) Every commit that touched the file, newest first.
  const logArgs = ['log', '--format=%H', '--', filePath];
  const log = await runGit(logArgs);

  if (log.outcome === 'git-failed') {
    return log;
  }

  if (log.attempt.exitCode !== 0) {
    return gitFailed(logArgs, log.attempt);
  }

  const commits = log.attempt.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (commits.length === 0) {
    return {outcome: 'never-committed'};
  }

  // (b) The value at HEAD, which the walk compares every commit against.
  const current = await readFileAtCommit('HEAD', filePath);

  if (current.outcome === 'git-failed') {
    return current;
  }

  let currentValue: unknown;

  if (current.outcome === 'read') {
    const currentJson = parseJsonObject(current.content);

    if (currentJson === null) {
      return {
        detail: `${filePath} as committed at HEAD is not a JSON object, so there is no current ${fieldName} to compare its history against. Commit a valid ${filePath} (in package-json mode, with --no-verify).`,
        outcome: 'unreadable-at-head',
      };
    }

    currentValue = currentJson[fieldName];
  }
  // Absent at HEAD: the file was deleted there, and "absent" is a real value.
  // The walk below skips absent commits, so it names the deletion commit —
  // the same answer the old code gave, now reached rather than defaulted to.

  // Walk backwards through commits to find where value changed
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const read = await readFileAtCommit(commit, filePath);

    // (c) A failed read is a failure...
    if (read.outcome === 'git-failed') {
      return read;
    }

    // ...but absent or unparseable historical content is legitimate history,
    // and is skipped exactly as before.
    if (read.outcome === 'absent') {
      continue;
    }

    const json = parseJsonObject(read.content);

    if (json === null) {
      continue;
    }

    // If value differs from current, this is where it last changed
    if (json[fieldName] !== currentValue) {
      // Return the commit AFTER this one (where the change happened)
      return {commit: i > 0 ? commits[i - 1] : commits[0], outcome: 'found'};
    }
  }

  // If we've gone through all commits and value never changed,
  // return the oldest commit (where it was first set)
  return {commit: commits[commits.length - 1], outcome: 'found'};
}

/** A commit count, or the failure. */
export type CommitCount =
  | {count: number; outcome: 'counted'}
  | GitMeasurementFailure;

/**
 * Count commits between two refs (version-manager-70i.18.1, S1).
 *
 * @param fromRef - Starting commit hash or ref
 * @param toRef - Ending commit hash or ref
 * @returns The count, or the failure member. NEVER 0 on failure: 0 is a real
 *   answer meaning "no commits since" (critical rule 6).
 */
export async function countCommitsBetween(
  fromRef: string,
  toRef: string,
): Promise<CommitCount> {
  const args = ['rev-list', '--count', `${fromRef}..${toRef}`];
  const run = await runGit(args);

  if (run.outcome === 'git-failed') {
    return run;
  }

  if (run.attempt.exitCode !== 0) {
    return gitFailed(args, run.attempt);
  }

  const printed = run.attempt.stdout.trim();
  const count = parseInt(printed, 10);

  if (isNaN(count)) {
    return {
      detail: `\`git ${args.join(' ')}\` printed ${JSON.stringify(printed)}, which is not a number`,
      outcome: 'git-failed',
    };
  }

  return {count, outcome: 'counted'};
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

/** A field's value at one commit, or the failure. */
export type FieldAtCommit =
  | {outcome: 'read'; value: string | null}
  | GitMeasurementFailure;

/**
 * Read a field value from a JSON file at a specific commit
 * (version-manager-70i.18.1, S6).
 *
 * @param commit - Commit hash or ref
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to read
 * @returns `value` null when the file or the field is absent at that commit,
 *   or the file there is not a JSON object — facts about the content, which
 *   is what null meant before. A failed git read is the failure member, and
 *   no longer also null.
 */
export async function readFieldFromCommit(
  commit: string,
  filePath: string,
  fieldName: string,
): Promise<FieldAtCommit> {
  const read = await readFileAtCommit(commit, filePath);

  if (read.outcome === 'git-failed') {
    return read;
  }

  if (read.outcome === 'absent') {
    return {outcome: 'read', value: null};
  }

  const json = parseJsonObject(read.content);

  return {
    outcome: 'read',
    value:
      json === null ? null : ((json[fieldName] as string | undefined) ?? null),
  };
}
