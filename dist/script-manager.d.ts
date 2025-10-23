interface PackageJson {
    [key: string]: unknown;
    scripts?: Record<string, string>;
    version?: string;
}
interface ScriptEntry {
    command: string;
    description: string;
    name: string;
}
export declare function hasExistingDynamicVersionScripts(packageJson: PackageJson): boolean;
export declare function getConflictingScripts(packageJson: PackageJson): ScriptEntry[];
export declare function readPackageJson(): PackageJson | null;
export declare function writePackageJson(packageJson: PackageJson): boolean;
export declare function addScriptsToPackageJson(force?: boolean, includeLifecycleScripts?: boolean): {
    conflictsOverwritten: string[];
    message: string;
    success: boolean;
};
export declare function listDefaultScripts(includeLifecycleScripts?: boolean): void;
/**
 * Get the version from package.json
 * @returns The version string or null if not found
 */
export declare function getPackageVersion(): string | null;
/**
 * Update the version in package.json
 * @param newVersion - The new version string
 * @returns True if successful, false otherwise
 */
export declare function updatePackageVersion(newVersion: string): boolean;
export {};
//# sourceMappingURL=script-manager.d.ts.map