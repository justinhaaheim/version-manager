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
 * console.log(version.codeVersion); // e.g., "1.2.3"
 * ```
 */
export declare function validateDynamicVersion(version: unknown): {
    branch: string;
    buildNumber: string;
    codeVersion: string;
    dirty: boolean;
    generationTrigger: "git-hook" | "cli";
    runtimeVersion: string;
    timestamp: string;
};
//# sourceMappingURL=reader.d.ts.map