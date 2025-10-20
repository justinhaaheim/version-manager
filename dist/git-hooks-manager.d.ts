/**
 * Detect which package manager to use based on lock files
 * @returns 'bun' if bun.lock exists, 'npm' if package-lock.json exists,
 *          or 'npm' with warning if neither exists
 */
export declare function detectPackageManager(): 'bun' | 'npm';
export declare function checkGitignore(): boolean;
/**
 * Install git hooks using Husky
 */
export declare function installGitHooks(incrementPatch?: boolean, silent?: boolean, noFail?: boolean): void;
//# sourceMappingURL=git-hooks-manager.d.ts.map