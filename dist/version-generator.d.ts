import type { DynamicVersion, GenerationTrigger } from './types';
/**
 * Create default version-manager.json configuration
 * @param configPath - Path to version-manager.json
 * @param silent - Suppress console output
 */
export declare function createDefaultVersionManagerConfig(configPath: string, silent?: boolean): void;
/**
 * Generate dynamic version using file-based approach
 * @param generationTrigger - What triggered the version generation
 * @returns DynamicVersion object
 */
export declare function generateFileBasedVersion(generationTrigger?: GenerationTrigger): Promise<DynamicVersion>;
/**
 * Bump version type
 */
export type BumpType = 'major' | 'minor' | 'patch';
/**
 * Result of bumping version
 */
export interface BumpVersionResult {
    newVersion: string;
    oldVersion: string;
    updatedVersions: string[];
}
/**
 * Bump the version in package.json and optionally sync custom versions
 * @param bumpType - Type of bump (major, minor, patch)
 * @param customVersionsToUpdate - Names of custom versions to sync to new version
 * @param silent - Suppress console output
 * @returns Result with old/new versions
 */
export declare function bumpVersion(bumpType: BumpType, customVersionsToUpdate?: string[], silent?: boolean): Promise<BumpVersionResult>;
//# sourceMappingURL=version-generator.d.ts.map