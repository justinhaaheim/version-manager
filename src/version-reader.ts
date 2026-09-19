import type {SkippedLogLine, VersionBaseSource} from './event-log';
import type {VersionCalculationMode} from './types';

import {existsSync, readFileSync} from 'fs';
import {join} from 'path';

import {
  deriveVersion,
  parseEventLog,
  readEventLogText,
  VERSION_LOG_FILENAME,
} from './event-log';
import {
  DEFAULT_VERSION_CALCULATION_MODE,
  VersionCalculationModeSchema,
} from './types';

/**
 * THE PUBLIC CONSUMER API for event-log mode (version-manager-cza.1).
 *
 * ```ts
 * import {readVersion} from '@justinhaaheim/version-manager/version-reader';
 * console.log(readVersion().version);
 * ```
 *
 * NO GIT AND NO GENERATED FILE. It reads `version.jsonl` and `package.json`
 * and derives the answer, so it works in a source tarball, in an Expo EAS
 * build, in CI with a shallow or absent .git, and in a directory that was
 * never a repository — which is the failure that started all of this: someone
 * testing a build with no way to tell which code they are running.
 *
 * Kept separate from src/reader.ts, which reads the generated
 * dynamic-version.local.json that the other two modes produce.
 */

export interface VersionReading {
  /** The version the count was applied to. */
  base: string;
  /** Whether `base` came from a base event or from package.json. */
  baseSource: VersionBaseSource;
  /** The calculation mode the version was computed with. */
  calculationMode: VersionCalculationMode;
  /** How many commit events were counted. */
  commitCount: number;
  /**
   * Whether version.jsonl is there at all. False is a legal, zero-friction
   * state (E6), and it is reported rather than being indistinguishable from
   * an empty log.
   */
  logExists: boolean;
  /**
   * Lines of the log that could not be read. EMPTY MEANS "every line parsed"
   * — this function never returns a version while hiding the fact that part
   * of the evidence was unreadable (critical rule 6).
   */
  skippedLines: SkippedLogLine[];
  /** The derived version. This is the number to show people. */
  version: string;
}

/**
 * package.json's `version`.
 *
 * @returns The version, or null when package.json is absent or has no
 *   top-level string `version`. A package.json that cannot be PARSED is a
 *   failure and throws.
 * @throws If package.json exists and is not valid JSON
 */
function readPackageVersion(cwd: string): string | null {
  const path = join(cwd, 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const version = (json as {version?: unknown}).version;

  return typeof version === 'string' ? version : null;
}

/**
 * The calculation mode from version-manager.json.
 *
 * An ABSENT config is a normal, documented state and gets the default. A
 * config that is present but unreadable, or that names a mode that does not
 * exist, THROWS: silently computing `0.1.0+3` where the project asked for
 * `0.1.3` would be a wrong answer delivered calmly.
 *
 * @throws If version-manager.json is unparseable or names an unknown mode
 */
function readCalculationMode(cwd: string): VersionCalculationMode {
  const path = join(cwd, 'version-manager.json');

  if (!existsSync(path)) {
    return DEFAULT_VERSION_CALCULATION_MODE;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(
      `${path} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const raw = (json as {versionCalculationMode?: unknown})
    .versionCalculationMode;

  if (raw === undefined) {
    return DEFAULT_VERSION_CALCULATION_MODE;
  }

  const parsed = VersionCalculationModeSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `${path} has versionCalculationMode ${JSON.stringify(
        raw,
      )}, which is not one of: add-to-patch, append-commits.`,
    );
  }

  return parsed.data;
}

/**
 * Derive this project's version from its event log.
 *
 * @param cwd - The project root. Defaults to the current directory.
 * @returns The derived version and everything needed to explain it
 * @throws If package.json or version-manager.json is unreadable, or if there
 *   is no base to derive from at all (no base event and no package.json
 *   version)
 */
export function readVersion(cwd: string = process.cwd()): VersionReading {
  const text = readEventLogText(cwd);
  const {events, skippedLines} = parseEventLog(text ?? '');
  const calculationMode = readCalculationMode(cwd);

  const derived = deriveVersion({
    calculationMode,
    events,
    packageVersion: readPackageVersion(cwd),
  });

  return {
    base: derived.base,
    baseSource: derived.baseSource,
    calculationMode,
    commitCount: derived.commitCount,
    logExists: text !== null,
    skippedLines,
    version: derived.version,
  };
}

export {VERSION_LOG_FILENAME};
export type {SkippedLogLine, VersionBaseSource};
