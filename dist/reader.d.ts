export type { DynamicVersion, GenerationTrigger } from './types';
/**
 * Validate and parse dynamic version data from imported JSON
 *
 * @param version - Raw imported dynamic-version.local.json data
 * @returns Validated DynamicVersion object
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * import rawVersion from './dynamic-version.local.json';
 * import { validateDynamicVersion } from '@justinhaaheim/version-manager';
 *
 * const version = validateDynamicVersion(rawVersion);
 * console.log(version.baseVersion);    // e.g., "1.2.3"
 * console.log(version.dynamicVersion); // e.g., "1.2.3+5"
 * ```
 */
export declare function validateDynamicVersion(version: unknown): {
    baseVersion: string;
    branch: string;
    buildNumber: string;
    dirty: boolean;
    dynamicVersion: string;
    generationTrigger: "git-hook" | "cli";
    timestamp: string;
    timestampUnix: number;
    versions: Record<string, string>;
};
//# sourceMappingURL=reader.d.ts.map