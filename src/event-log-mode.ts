import type {GitAttributesOutcome} from './gitattributes';

import {existsSync, readFileSync, writeFileSync} from 'fs';

import {
  formatBaseEvent,
  formatCommitEvent,
  VERSION_LOG_FILENAME,
  versionLogPath,
} from './event-log';
import {
  addIndexEntry,
  readIndexEntry,
  repoRelativePath,
  writeIndexEntry,
} from './git-utils';
import {ensureGitAttributesLine} from './gitattributes';

/**
 * EVENT-LOG MODE: the writes (version-manager-cza, E4, E5, E9, E10).
 *
 * This is the only module in the mode that touches git. Everything it writes
 * is an APPEND of one line ending in "\n" — there is no in-place edit, no
 * computed version stored anywhere, and therefore nothing to reconcile.
 *
 * Every function here works on process.cwd(), exactly as the rest of the CLI
 * does. Git runs hooks at the top level of the working tree, so in the
 * pre-commit path that is the repository root, where E1 puts the log.
 */

/** The one .gitattributes line the whole merge story rests on (E4). */
export const UNION_MERGE_ATTRIBUTE = `${VERSION_LOG_FILENAME} merge=union`;

const UNION_MERGE_COMMENT =
  'version-manager: union the append-only version log instead of conflicting on it';

/** The mode git files a normal, non-executable file under. */
const REGULAR_FILE_MODE = '100644';

/**
 * Put `version.jsonl merge=union` in .gitattributes, idempotently (E4).
 *
 * `union` is a git BUILT-IN. Unlike a custom `merge=<name>` driver it needs
 * no git config, so it travels with the repository, works in a fresh clone
 * and in a worktree, and CANNOT fail because a command is missing — which is
 * the entire hazard recorded in version-manager-70i.22.
 *
 * @returns What was done; 'claimed-by-another' means the user already points
 *   version.jsonl at a different merge driver and we left it alone
 * @throws If .gitattributes cannot be read or written
 */
export function ensureUnionMergeAttribute(): GitAttributesOutcome {
  return ensureGitAttributesLine({
    attributeName: 'merge',
    attributeValue: 'union',
    comment: UNION_MERGE_COMMENT,
    cwd: process.cwd(),
    path: VERSION_LOG_FILENAME,
  });
}

/**
 * Create an empty version.jsonl if there is none (E6).
 *
 * An empty log is legal and derives package.json's version with a count of
 * zero, so this is about having something to commit and to append to — not
 * about the file needing content to be valid.
 *
 * @returns Whether a file was created
 * @throws If the file cannot be written
 */
export function ensureVersionLogExists(): 'already-present' | 'created' {
  const path = versionLogPath(process.cwd());

  if (existsSync(path)) {
    return 'already-present';
  }

  writeFileSync(path, '');

  return 'created';
}

/**
 * Append one line to text that may or may not end in a newline.
 *
 * THE NEWLINE IS LOAD-BEARING (E5). A log whose last line has no "\n" makes
 * `merge=union` splice the next branch's first object onto it — two JSON
 * objects on one line, which parses as neither. Every append therefore
 * repairs a missing trailing newline before adding to it.
 */
function appendLine(existing: string, line: string): string {
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';

  return `${existing}${separator}${line}`;
}

/** Where the appended event landed in the git index. */
export type IndexAppendOutcome =
  /** version.jsonl was not in the index and was added to it. */
  | 'added'
  /** The staged copy was rewritten with the event appended. */
  | 'updated';

export interface CommitEventAppend {
  indexOutcome: IndexAppendOutcome;
  /** The exact line written, newline included. */
  line: string;
}

/**
 * Append one commit event to version.jsonl, in the working tree AND in the
 * git index, so that it lands INSIDE the commit being made (E9).
 *
 * WORKING TREE FIRST, INDEX SECOND, and deliberately so. Both writes throw on
 * failure and a failure aborts the commit (E10, and 70i.4's contract), so the
 * question is only what a half-done append leaves behind:
 *
 * - This order leaves an extra line in the working tree, which the next
 *   commit stages. An over-count by one is the inexactness Justin has already
 *   accepted for `--amend` (E7).
 * - The other order leaves the index holding an event the working-tree file
 *   does not have, and the next `git add version.jsonl` DELETES it. Losing
 *   evidence is the one failure this design cannot tolerate, so the order is
 *   chosen to make it impossible rather than unlikely.
 *
 * The index side reads the STAGED bytes, never the working tree, so an
 * unstaged edit to version.jsonl is not swept into the commit (70i.3, D9).
 *
 * @param branch - The branch name to record
 * @param now - The event's timestamp
 * @returns The line written and what happened in the index
 * @throws If git fails, if the log is at a merge stage, or if either write
 *   fails. Nothing here returns a status for a caller to ignore.
 */
export function appendCommitEvent(
  branch: string,
  now: Date,
): CommitEventAppend {
  const line = formatCommitEvent(branch, now);
  const path = versionLogPath(process.cwd());

  // Read both sides BEFORE writing either: readIndexEntry throws on an
  // unmerged entry, and finding that out after the working-tree write would
  // leave the two copies disagreeing.
  const entry = readIndexEntry(VERSION_LOG_FILENAME);
  const workingTreeContent = existsSync(path)
    ? readFileSync(path, 'utf-8')
    : '';

  writeFileSync(path, appendLine(workingTreeContent, line));

  if (entry === null) {
    // The log exists in the working tree but has never been staged — the
    // state a repository is in between `install` and the first `git add`.
    // Stage the file we just wrote; this mode exists to commit it.
    addIndexEntry({
      content: appendLine(workingTreeContent, line),
      mode: REGULAR_FILE_MODE,
      repoPath: repoRelativePath(VERSION_LOG_FILENAME),
    });

    return {indexOutcome: 'added', line};
  }

  writeIndexEntry({...entry, content: appendLine(entry.content, line)});

  return {indexOutcome: 'updated', line};
}

/**
 * Append one base event to version.jsonl in the WORKING TREE (E2).
 *
 * The index is not touched: `bump` is not running inside a commit, so the
 * author stages and commits the change like any other edit — and when they
 * do, the pre-commit hook appends the commit event for it as usual.
 *
 * @param version - The new base version
 * @param now - The event's timestamp
 * @returns The exact line written, newline included
 * @throws If the log cannot be read or written
 */
export function appendBaseEvent(version: string, now: Date): string {
  const line = formatBaseEvent(version, now);
  const path = versionLogPath(process.cwd());
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '';

  writeFileSync(path, appendLine(existing, line));

  return line;
}
