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
  dtsPath?: string;
  dynamicVersion: string;
  outputPath: string;
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
  lines.push('');
  lines.push(`   💾 → ${data.outputPath}`);

  if (data.dtsPath) {
    lines.push(`   📘 → ${data.dtsPath}`);
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
  lines.push(`💾 → ${data.outputPath}`);

  if (data.dtsPath) {
    lines.push(`📘 → ${data.dtsPath}`);
  }

  return lines.join('\n');
}

/**
 * Compact format: Ultra Compact (single line)
 *
 * 📦 0.4.4+2 🌿main 💾✓
 */
function formatCompact(data: VersionOutputData): string {
  const dirtyIndicator = data.dirty ? '*' : '';
  return `📦 ${data.dynamicVersion}${dirtyIndicator} 🌿${data.branch} 💾✓`;
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
