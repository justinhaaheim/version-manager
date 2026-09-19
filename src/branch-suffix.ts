/**
 * Branch-name suffix support.
 *
 * When `branchSuffix.enabled` is on and the current branch is not one of the
 * configured main branches, the computed version carries a semver PRERELEASE
 * identifying the branch and how many commits it has of its own:
 *
 *   0.32.3          -> 0.32.3-feat-x.3
 *   0.32.1+3        -> 0.32.1-feat-x.3+3
 *
 * A prerelease sorts BEFORE the release it decorates, which is correct: a
 * branch build is a prerelease of the version it will become.
 *
 * Everything in this module is a pure function. No file I/O, no git.
 */

import type {RefCommitCountFailure} from './git-utils';

/** Used when sanitisation leaves nothing behind (D4e). */
export const FALLBACK_BRANCH_LABEL = 'branch';

/**
 * Turn a git branch name into a legal semver prerelease identifier (D4).
 *
 * a. every character outside [0-9A-Za-z-] becomes '-'
 * b. runs of '-' collapse to one
 * c. leading/trailing '-' are trimmed
 * d. an empty result becomes the literal 'branch'
 * e. an all-digits result is prefixed with 'b', because semver forbids
 *    leading zeros in a numeric identifier (007 -> b007)
 *
 * Sanitisation is lossy and may collide: `feat/x` and `feat-x` both produce
 * `feat-x`. That is accepted and documented in the README.
 */
export function sanitizeBranchName(branch: string): string {
  const replaced = branch.replace(/[^0-9A-Za-z-]/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');

  if (trimmed === '') {
    return FALLBACK_BRANCH_LABEL;
  }

  if (/^[0-9]+$/.test(trimmed)) {
    return `b${trimmed}`;
  }

  return trimmed;
}

/**
 * Remove the prerelease segment from a version, preserving any +build
 * metadata.
 *
 *   "1.2.3"           -> "1.2.3"
 *   "1.2.3-feat-x.2"  -> "1.2.3"
 *   "1.2.3-feat-x.2+5"-> "1.2.3+5"
 *   "1.2.3+5"         -> "1.2.3+5"
 *
 * This is the half of D3 that prevents the feedback loop: in package-json mode
 * the decorated version is committed and read back as the next computation's
 * input, and both calculateCodeVersion() and calculatePreCommitVersion()
 * return their input UNCHANGED when `version.split('.')` is not exactly three
 * parts. An undecorated-looking four-part string therefore does not error — it
 * silently freezes the version forever. Strip before either of them sees it.
 */
export function stripPrerelease(version: string): string {
  const plusIndex = version.indexOf('+');
  const core = plusIndex === -1 ? version : version.slice(0, plusIndex);
  const buildSuffix = plusIndex === -1 ? '' : version.slice(plusIndex);

  const hyphenIndex = core.indexOf('-');
  const withoutPrerelease =
    hyphenIndex === -1 ? core : core.slice(0, hyphenIndex);

  return `${withoutPrerelease}${buildSuffix}`;
}

/**
 * Insert `-<sanitisedBranch>.<n>` after the version core and before any +build
 * metadata (D2).
 *
 * Any prerelease already on `version` is discarded first: while the knob is on
 * version-manager owns that segment (D3), so this function is idempotent.
 *
 * `n` is expected to be a positive integer. n === 0 means "this branch has no
 * commits of its own", which gets the undecorated version (D7); a negative or
 * non-integer n is an upstream bug, and emitting a nonsense prerelease would
 * be worse than emitting none, so both return the stripped version.
 */
export function applyBranchSuffix(
  version: string,
  sanitisedBranch: string,
  n: number,
): string {
  const stripped = stripPrerelease(version);

  if (!Number.isInteger(n) || n <= 0) {
    return stripped;
  }

  const plusIndex = stripped.indexOf('+');
  const core = plusIndex === -1 ? stripped : stripped.slice(0, plusIndex);
  const buildSuffix = plusIndex === -1 ? '' : stripped.slice(plusIndex);

  return `${core}-${sanitisedBranch}.${n}${buildSuffix}`;
}

/**
 * Branches that never get a suffix (D6): the configured main branches, and a
 * detached HEAD (getCurrentBranch() returns the literal "HEAD" there, and a
 * detached checkout has no branch identity worth putting in a version).
 */
export function isSuffixExemptBranch(
  branch: string,
  mainBranches: string[],
): boolean {
  return branch === 'HEAD' || mainBranches.includes(branch);
}

/**
 * The two commit measurements the suffix decision needs, grouped so that
 * "half measured" is unrepresentable.
 */
export interface BranchCommitCounts {
  /**
   * Commits on HEAD that are not on the first configured main branch that
   * resolved, plus which ref that was. null means NO configured main branch
   * resolved — never 0, which would be a real measurement.
   */
  mergeBase: {count: number; ref: string} | null;
  /**
   * Why each main branch tried before `mergeBase` was not usable, in the
   * order they were tried (F1). Empty when the first ref counted, and also
   * when no main branches are configured at all — `mergeBase === null` with
   * an empty list is "there was nothing to try", which the warning says.
   */
  mergeBaseFailures: RefCommitCountFailure[];
  /** Total commits on HEAD. null means that measurement failed too. */
  total: number | null;
}

/**
 * Put a ref's failure into one clause a user can act on (F1). The three
 * causes send a reader to three different places: their config's spelling,
 * their repository's branches, or git itself.
 */
export function describeRefCountFailure(
  failure: RefCommitCountFailure,
): string {
  switch (failure.outcome) {
    case 'git-failed':
      return `${failure.ref}: ${failure.detail}`;
    case 'rejected-name':
      return `${failure.ref}: not a usable ref name (only letters, digits, '.', '_', '/' and '-' are accepted)`;
    case 'unresolved':
      return `${failure.ref}: no such ref in this repository`;
  }
}

/** The per-ref causes as one parenthesised clause. */
function describeRefCountFailures(failures: RefCommitCountFailure[]): string {
  if (failures.length === 0) {
    return 'none are configured';
  }

  return failures.map(describeRefCountFailure).join('; ');
}

export interface BranchSuffixDecision {
  /** null means: emit the undecorated version. */
  decoration: {n: number; sanitisedBranch: string} | null;
  /**
   * Non-null when a measurement fell back or failed, so the CLI can say so
   * instead of silently producing a different answer.
   */
  warning: string | null;
}

/**
 * Decide whether — and how — to decorate a version (D5, D6, D7).
 *
 * Pure: the caller performs the git measurements and hands them in.
 *
 * @param extraCommits - 1 in the pre-commit path, to account for the
 *   about-to-happen commit; 0 everywhere else.
 */
export function decideBranchSuffix(params: {
  branch: string;
  counts: BranchCommitCounts;
  enabled: boolean;
  extraCommits: number;
  mainBranches: string[];
}): BranchSuffixDecision {
  const {branch, counts, enabled, extraCommits, mainBranches} = params;

  if (!enabled) {
    return {decoration: null, warning: null};
  }

  if (isSuffixExemptBranch(branch, mainBranches)) {
    return {decoration: null, warning: null};
  }

  let base: number;
  let warning: string | null = null;

  if (counts.mergeBase !== null) {
    base = counts.mergeBase.count;
  } else if (counts.total !== null) {
    // D5 fallback: no configured main branch could be counted, so count
    // everything. The per-ref cause is named (F1) — a misspelt ref name and a
    // branch that simply does not exist here are different problems with
    // different fixes.
    base = counts.total;
    warning =
      `⚠️  branchSuffix: none of the configured main branches could be ` +
      `counted (${describeRefCountFailures(counts.mergeBaseFailures)}); ` +
      `counted all ${counts.total} commits on HEAD instead.`;
  } else {
    // D5 + critical rule 6: a failed measurement is not a zero. No suffix.
    return {
      decoration: null,
      warning:
        `⚠️  branchSuffix: could not count commits for branch "${branch}" ` +
        `(${describeRefCountFailures(counts.mergeBaseFailures)}), and ` +
        `counting all commits on HEAD failed too; emitting the undecorated ` +
        `version.`,
    };
  }

  const n = base + extraCommits;

  // D7: a branch with no commits of its own is bit-identical to its base, so
  // it keeps the undecorated version rather than sorting below it.
  if (n <= 0) {
    return {decoration: null, warning};
  }

  return {
    decoration: {n, sanitisedBranch: sanitizeBranchName(branch)},
    warning,
  };
}
