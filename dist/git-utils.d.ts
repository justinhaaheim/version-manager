export declare function execCommand(command: string): Promise<string>;
export declare function isGitRepository(): Promise<boolean>;
export declare function getGitDescribe(): Promise<string>;
export declare function getCurrentBranch(): Promise<string>;
export declare function hasUncommittedChanges(): Promise<boolean>;
/**
 * Find the last commit where a specific field value changed in a JSON file
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to track (e.g., 'codeVersionBase')
 * @returns The commit hash where the field last changed, or null if not found
 */
export declare function findLastCommitWhereFieldChanged(filePath: string, fieldName: string): Promise<string | null>;
/**
 * Count commits between two refs
 * @param fromRef - Starting commit hash or ref
 * @param toRef - Ending commit hash or ref
 * @returns Number of commits between the two refs
 */
export declare function countCommitsBetween(fromRef: string, toRef: string): Promise<number>;
/**
 * Read a field value from a JSON file at a specific commit
 * @param commit - Commit hash or ref
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to read
 * @returns The field value, or null if not found
 */
export declare function readFieldFromCommit(commit: string, filePath: string, fieldName: string): Promise<string | null>;
//# sourceMappingURL=git-utils.d.ts.map