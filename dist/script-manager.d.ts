interface PackageJson {
    [key: string]: unknown;
    scripts?: Record<string, string>;
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
export {};
//# sourceMappingURL=script-manager.d.ts.map