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
 * Format version output based on format type
 */
export declare function formatVersionOutput(data: VersionOutputData, format: OutputFormat): string;
//# sourceMappingURL=output-formatter.d.ts.map