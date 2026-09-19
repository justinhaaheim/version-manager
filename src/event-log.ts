import type {VersionCalculationMode} from './types';

import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {z} from 'zod';

import {calculateCodeVersion} from './version-math';

/**
 * EVENT-LOG MODE: the log itself (version-manager-cza, E1–E6).
 *
 * `version.jsonl` is an append-only log of EVIDENCE — one JSON object per
 * line, committed to git. The version is DERIVED from it and stored nowhere,
 * which is the whole point: a number that is never written cannot be stale,
 * and evidence unions associatively, so merging two branches needs no policy
 * and no reconciliation. `version.jsonl merge=union` in .gitattributes is the
 * entire merge story (E4).
 *
 * Everything here is pure except readEventLogText(), which reads one file.
 * NO GIT. This module is on the public reader's import path
 * (src/version-reader.ts), which must work in a checkout with no .git at all.
 */

/** The one file, at the repository root (E1). */
export const VERSION_LOG_FILENAME = 'version.jsonl';

/**
 * Timestamps are ISO 8601 and are VALIDATED, not merely typed as strings.
 *
 * deriveVersion() orders events by timestamp, and `Date.parse('whenever')` is
 * NaN — which compares false against everything and would silently reorder
 * the log rather than fail. A line whose timestamp does not parse is reported
 * as skipped instead (critical rule 6).
 */
const TimestampSchema = z.iso.datetime({offset: true});

/** A commit happened on a branch. Appended by the pre-commit hook. */
export const CommitEventSchema = z.object({
  /** The branch the commit was made on, verbatim and unsanitised. */
  b: z.string(),
  e: z.literal('commit'),
  t: TimestampSchema,
});

/** Somebody deliberately set the base version. Appended by `bump` (E2). */
export const BaseEventSchema = z.object({
  e: z.literal('base'),
  t: TimestampSchema,
  /** The new base version, e.g. "0.37.0". */
  v: z.string(),
});

/**
 * The two event kinds.
 *
 * NOT `.strict()`, deliberately: an older installed copy of version-manager
 * must be able to read a log written by a newer one. Unknown FIELDS are
 * ignored and the line keeps counting; an unknown event KIND is reported as
 * skipped rather than counted as something it is not.
 */
export const VersionEventSchema = z.discriminatedUnion('e', [
  BaseEventSchema,
  CommitEventSchema,
]);

export type CommitEvent = z.infer<typeof CommitEventSchema>;
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type VersionEvent = z.infer<typeof VersionEventSchema>;

/**
 * A line that produced no event.
 *
 * These are COUNTED AND RETURNED, never swallowed (critical rule 6): "the log
 * has 12 events" and "the log has 12 events and 3 lines I could not read" are
 * different facts, and only one of them is a clean measurement.
 */
export interface SkippedLogLine {
  /** 1-based line number, so a human can go and look at it. */
  lineNumber: number;
  /** Why this line produced no event, in a sentence. */
  reason: string;
  /** The line itself, truncated, so the report is actionable. */
  text: string;
}

export interface ParsedEventLog {
  events: VersionEvent[];
  /** Empty means "every non-blank line parsed", never "I did not look". */
  skippedLines: SkippedLogLine[];
}

/** Keep a corrupt line from turning a warning into a wall of text. */
const MAX_REPORTED_LINE_LENGTH = 120;

function truncate(line: string): string {
  return line.length <= MAX_REPORTED_LINE_LENGTH
    ? line
    : `${line.slice(0, MAX_REPORTED_LINE_LENGTH)}…`;
}

/**
 * Parse the log text into events.
 *
 * A bad line is SKIPPED, not fatal: one mangled line — a hand edit, a stray
 * merge artefact — must not stop a build from knowing its version. What it
 * must not do is disappear, so every skipped line comes back with its number
 * and the reason.
 *
 * Blank lines are not skipped lines: a file that ends in "\n" has an empty
 * final element by construction (E5), and reporting that as damage would make
 * every healthy log look broken.
 *
 * @param text - The whole file
 * @returns The events in FILE order, plus every line that produced none
 */
export function parseEventLog(text: string): ParsedEventLog {
  const events: VersionEvent[] = [];
  const skippedLines: SkippedLogLine[] = [];

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (line.trim() === '') {
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (error) {
      skippedLines.push({
        lineNumber,
        reason: `not valid JSON (${
          error instanceof Error ? error.message : String(error)
        })`,
        text: truncate(line),
      });
      continue;
    }

    const parsed = VersionEventSchema.safeParse(json);

    if (!parsed.success) {
      skippedLines.push({
        lineNumber,
        reason: `not a version-manager event (${parsed.error.issues
          .map((issue) => issue.message)
          .join('; ')})`,
        text: truncate(line),
      });
      continue;
    }

    events.push(parsed.data);
  }

  return {events, skippedLines};
}

/** Where the base version came from, so a caller can say which it used. */
export type VersionBaseSource = 'base-event' | 'package.json';

export interface DerivedVersion {
  /** The version the count was applied to. */
  base: string;
  baseSource: VersionBaseSource;
  /** How many commit events are being counted. */
  commitCount: number;
  /**
   * The commit events that were counted, in log order. Exposed so a caller
   * can ask a further question of the SAME set — the branch suffix needs the
   * per-branch count (E12) — without re-deriving "since the base" and risking
   * a second, subtly different answer.
   */
  countedCommits: CommitEvent[];
  /** base with commitCount applied by versionCalculationMode (E3). */
  version: string;
}

/**
 * Order events into one total, deterministic sequence.
 *
 * By TIMESTAMP, not file position: after a union merge the file is two
 * branches' lines interleaved by text, which says nothing about when anything
 * happened. File position breaks ties, so the answer never depends on sort
 * stability.
 */
function chronological(events: VersionEvent[]): VersionEvent[] {
  return events
    .map((event, index) => ({event, index, time: Date.parse(event.t)}))
    .sort((left, right) =>
      left.time === right.time
        ? left.index - right.index
        : left.time - right.time,
    )
    .map((entry) => entry.event);
}

/**
 * THE DERIVATION (E3). The version is this function's return value and is
 * written nowhere.
 *
 * base   = the LAST base event by timestamp, or package.json's version when
 *          the log has none
 * count  = the commit events after that base event
 * version= base with count applied by versionCalculationMode
 *
 * Why this needs no merge policy: unioning two branches' lines produces the
 * union of their evidence, and a count over a union is the same number
 * whichever order the lines arrived in.
 *
 * @param params.packageVersion - package.json's version, or null when it has
 *   none. Null is only fatal when the log has no base event either, because
 *   then there is nothing to derive from at all.
 * @throws If there is no base to start from
 */
export function deriveVersion(params: {
  calculationMode: VersionCalculationMode;
  events: VersionEvent[];
  packageVersion: string | null;
}): DerivedVersion {
  const {calculationMode, events, packageVersion} = params;

  const ordered = chronological(events);

  let lastBase: BaseEvent | null = null;
  let lastBaseIndex = -1;
  for (let index = 0; index < ordered.length; index++) {
    const event = ordered[index];
    if (event.e === 'base') {
      lastBase = event;
      lastBaseIndex = index;
    }
  }

  let base: string;
  let baseSource: VersionBaseSource;

  if (lastBase !== null) {
    base = lastBase.v;
    baseSource = 'base-event';
  } else if (packageVersion !== null) {
    base = packageVersion;
    baseSource = 'package.json';
  } else {
    // Not "the version is 0.0.0", and not an empty result either: there is
    // genuinely nothing to measure from (critical rule 6).
    throw new Error(
      `Cannot derive a version: ${VERSION_LOG_FILENAME} has no base event and package.json has no "version" field. Add a version to package.json, or run \`bump\`.`,
    );
  }

  const countedCommits = ordered
    .slice(lastBaseIndex + 1)
    .filter((event): event is CommitEvent => event.e === 'commit');

  return {
    base,
    baseSource,
    commitCount: countedCommits.length,
    countedCommits,
    version: calculateCodeVersion(base, countedCommits.length, calculationMode),
  };
}

/**
 * How many of the counted commits were made on one branch (E12).
 *
 * This is the branch suffix's `n`, and in this mode it is a REAL per-branch
 * number — each commit event records the branch it happened on — rather than
 * the always-1 that package-json mode could produce. No merge-base
 * measurement, and no git.
 */
export function countCommitEventsOnBranch(
  commits: CommitEvent[],
  branch: string,
): number {
  return commits.filter((commit) => commit.b === branch).length;
}

/** One commit event, as exactly one line ENDING IN "\n" (E5). */
export function formatCommitEvent(branch: string, now: Date): string {
  return `${JSON.stringify({b: branch, e: 'commit', t: now.toISOString()})}\n`;
}

/** One base event, as exactly one line ENDING IN "\n" (E5). */
export function formatBaseEvent(version: string, now: Date): string {
  return `${JSON.stringify({e: 'base', t: now.toISOString(), v: version})}\n`;
}

/** The log's path for a given directory. */
export function versionLogPath(cwd: string): string {
  return join(cwd, VERSION_LOG_FILENAME);
}

/**
 * Read the log.
 *
 * @returns The file's text, or null STRICTLY when there is no log there. An
 *   absent log is legal and means zero events (E6); a read that FAILS throws
 *   rather than arriving as "there is none" (critical rule 6).
 * @throws If the file exists and cannot be read
 */
export function readEventLogText(cwd: string): string | null {
  const path = versionLogPath(cwd);

  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, 'utf-8');
}

/** One sentence naming what could not be read, or null when nothing was. */
export function describeSkippedLines(
  skippedLines: SkippedLogLine[],
): string | null {
  if (skippedLines.length === 0) {
    return null;
  }

  const detail = skippedLines
    .map((skipped) => `line ${skipped.lineNumber}: ${skipped.reason}`)
    .join('; ');

  return `⚠️  ${VERSION_LOG_FILENAME}: skipped ${skippedLines.length} unreadable line${
    skippedLines.length === 1 ? '' : 's'
  } (${detail}). The version below counts everything else.`;
}
