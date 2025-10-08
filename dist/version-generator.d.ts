import type { DynamicVersion, VersionInfo } from './types';
export declare function generateVersion(options?: {
    incrementPatch?: boolean;
}): Promise<VersionInfo>;
/**
 * Create default version-manager.json configuration
 * @param configPath - Path to version-manager.json
 * @param silent - Suppress console output
 */
export declare function createDefaultVersionManagerConfig(configPath: string, silent?: boolean): void;
/**
 * Generate dynamic version using file-based approach
 * @returns DynamicVersion object
 */
export declare function generateFileBasedVersion(): Promise<DynamicVersion>;
//# sourceMappingURL=version-generator.d.ts.map