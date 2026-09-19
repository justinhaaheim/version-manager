/**
 * Output formatting for version-manager CLI
 *
 * Provides four output formats:
 * - verbose: Full status dashboard with section dividers
 * - normal: Tree-style compact but informative (default)
 * - compact: Single line
 * - silent: No output
 */

export type OutputFormat = 'silent' | 'compact' | 'normal' | 'verbose';

export interface VersionOutputData {
  baseVersion: string;
  branch: string;
  buildNumber: string;
  commitsSince: number;
  dirty: boolean;
  dtsPath?: string | null;
  dynamicVersion: string;
  /**
   * Path the version file was written to, or null when nothing was written
   * (package-json mode writes no generated file — see
   * src/generated-file-policy.ts). null suppresses every "saved to" marker:
   * output must not claim a write that did not happen.
   */
  outputPath: string | null;
  versions: Record<string, string>;
}

/**
 * Pad a string to the right with spaces
 */
function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

/**
 * Verbose format: Status Dashboard
 *
 * 📦 version-manager
 *
 *    🔢 0.4.4+2
 *    ─────────────────────────
 *    📌 base      0.4.4
 *    🔄 commits   +2
 *    🏷️  runtime   0.3.1
 *    🌿 branch    main
 *    🔨 build     20251124.015536.11
 *
 *    💾 → dynamic-version.local.json
 */
function formatVerbose(data: VersionOutputData): string {
  const lines: string[] = [];

  lines.push('📦 version-manager');
  lines.push('');
  lines.push(`   🔢 ${data.dynamicVersion}${data.dirty ? ' *' : ''}`);
  lines.push('   ─────────────────────────');
  lines.push(`   📌 base      ${data.baseVersion}`);
  lines.push(`   🔄 commits   +${data.commitsSince}`);

  // Add custom versions
  for (const [name, version] of Object.entries(data.versions)) {
    lines.push(`   🏷️  ${padRight(name, 8)} ${version}`);
  }

  lines.push(`   🌿 branch    ${data.branch}`);
  lines.push(`   🔨 build     ${data.buildNumber}`);

  // Nothing written => no "saved to" section at all, not an empty one.
  if (data.outputPath !== null) {
    lines.push('');
    lines.push(`   💾 → ${data.outputPath}`);

    if (data.dtsPath) {
      lines.push(`   📘 → ${data.dtsPath}`);
    }
  }

  return lines.join('\n');
}

/**
 * Normal format: Minimal Emoji (tree-style)
 *
 * 📦 0.4.4+2 (🌿 main)
 *    └─ 📌 0.4.4 + 🔄 2 commits
 *    └─ 🏷️  runtime 0.3.1
 *    └─ 🔨 20251124.015536.11
 * 💾 → dynamic-version.local.json
 */
function formatNormal(data: VersionOutputData): string {
  const lines: string[] = [];

  const dirtyIndicator = data.dirty ? ' *' : '';
  lines.push(`📦 ${data.dynamicVersion}${dirtyIndicator} (🌿 ${data.branch})`);
  lines.push(
    `   └─ 📌 ${data.baseVersion} + 🔄 ${data.commitsSince} commit${data.commitsSince === 1 ? '' : 's'}`,
  );

  // Add custom versions
  for (const [name, version] of Object.entries(data.versions)) {
    lines.push(`   └─ 🏷️  ${name} ${version}`);
  }

  lines.push(`   └─ 🔨 ${data.buildNumber}`);

  // Nothing written => no "saved to" line.
  if (data.outputPath !== null) {
    lines.push(`💾 → ${data.outputPath}`);

    if (data.dtsPath) {
      lines.push(`📘 → ${data.dtsPath}`);
    }
  }

  return lines.join('\n');
}

/**
 * Compact format: Ultra Compact (single line)
 *
 * For append-commits mode: Dynamic version: 0.4.4+2 🌿main 💾✓
 * For add-to-patch mode:   Dynamic version: 0.4.6 (0.4.4+2) 🌿main 💾✓
 */
function formatCompact(data: VersionOutputData): string {
  const dirtyIndicator = data.dirty ? '*' : '';

  // The 💾✓ claims a file was saved, so it is dropped when none was.
  const savedIndicator = data.outputPath === null ? '' : ' 💾✓';

  // Detect add-to-patch mode: dynamicVersion differs from base and doesn't contain '+'
  const isAddToPatch =
    data.dynamicVersion !== data.baseVersion &&
    !data.dynamicVersion.includes('+') &&
    data.commitsSince > 0;

  if (isAddToPatch) {
    // Show derivation for add-to-patch mode: "0.4.6 (0.4.4+2)"
    return `Dynamic version: ${data.dynamicVersion}${dirtyIndicator} (${data.baseVersion}+${data.commitsSince}) 🌿${data.branch}${savedIndicator}`;
  }

  return `Dynamic version: ${data.dynamicVersion}${dirtyIndicator} 🌿${data.branch}${savedIndicator}`;
}

/**
 * Format version output based on format type
 */
export function formatVersionOutput(
  data: VersionOutputData,
  format: OutputFormat,
): string {
  switch (format) {
    case 'silent':
      return '';
    case 'compact':
      return formatCompact(data);
    case 'verbose':
      return formatVerbose(data);
    case 'normal':
    default:
      return formatNormal(data);
  }
}
