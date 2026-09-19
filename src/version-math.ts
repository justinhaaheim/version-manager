import type {VersionCalculationMode} from './types';

/**
 * Version arithmetic, with no I/O of any kind.
 *
 * calculateCodeVersion() used to live in src/version-generator.ts and is
 * MOVED here unchanged (version-manager-cza.1). version-generator.ts re-exports
 * it, so every existing importer is unaffected. The move exists because
 * event-log mode's reader (src/version-reader.ts) is a PUBLIC consumer API
 * that must work with no git and no generated file: importing it from
 * version-generator would drag git-utils — and therefore `child_process` —
 * into a consumer's module graph, and would make src/event-log.ts import the
 * module that imports it.
 */

/**
 * Calculate code version based on calculation mode
 * @param baseVersion - Base version from config
 * @param commitsSince - Number of commits since last base version change
 * @param mode - Calculation mode
 * @returns Calculated code version
 */
export function calculateCodeVersion(
  baseVersion: string,
  commitsSince: number,
  mode: VersionCalculationMode,
): string {
  if (commitsSince === 0) {
    return baseVersion;
  }

  if (mode === 'add-to-patch') {
    // Mode A: Add commits to patch version
    const parts = baseVersion.split('.');
    if (parts.length !== 3) {
      return baseVersion; // Invalid semver format
    }

    const [major, minor, patch] = parts.map(Number);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return baseVersion; // Invalid semver format
    }

    return `${major}.${minor}.${patch + commitsSince}`;
  } else if (mode === 'append-commits') {
    // Mode B: Append commit count
    return `${baseVersion}+${commitsSince}`;
  }

  // Fallback to mode A if unrecognized mode
  const parts = baseVersion.split('.');
  if (parts.length !== 3) {
    return baseVersion;
  }

  const [major, minor, patch] = parts.map(Number);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return baseVersion;
  }

  return `${major}.${minor}.${patch + commitsSince}`;
}
