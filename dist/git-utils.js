"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execCommand = execCommand;
exports.isGitRepository = isGitRepository;
exports.getGitDescribe = getGitDescribe;
exports.getCurrentBranch = getCurrentBranch;
exports.hasUncommittedChanges = hasUncommittedChanges;
exports.isFileTrackedByGit = isFileTrackedByGit;
exports.findLastCommitWhereFieldChanged = findLastCommitWhereFieldChanged;
exports.countCommitsBetween = countCommitsBetween;
exports.readFieldFromCommit = readFieldFromCommit;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function execCommand(command) {
    try {
        const { stdout } = await execAsync(command);
        return stdout.trim();
    }
    catch (error) {
        if (error instanceof Error &&
            error.message.includes('not a git repository')) {
            throw new Error('Not a git repository. Please run this command in a git project.');
        }
        if (error instanceof Error && error.message.includes('no names found')) {
            return await execCommand('git rev-parse --short HEAD');
        }
        throw error;
    }
}
async function isGitRepository() {
    try {
        await execCommand('git rev-parse --git-dir');
        return true;
    }
    catch {
        return false;
    }
}
async function getGitDescribe() {
    return await execCommand('git describe --always --tags --dirty');
}
async function getCurrentBranch() {
    try {
        const branch = await execCommand('git rev-parse --abbrev-ref HEAD');
        return branch;
    }
    catch {
        return 'HEAD';
    }
}
async function hasUncommittedChanges() {
    try {
        const status = await execCommand('git status --porcelain');
        return status.length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Check if a file is tracked by git (not gitignored)
 * @param filePath - Path to the file (relative to repo root or absolute)
 * @returns true if the file is tracked, false if gitignored or not in repo
 */
async function isFileTrackedByGit(filePath) {
    try {
        // git ls-files returns the filename if it's tracked, empty if not
        const result = await execCommand(`git ls-files -- "${filePath}"`);
        return result.length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Find the last commit where a specific field value changed in a JSON file
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to track (e.g., 'codeVersionBase')
 * @returns The commit hash where the field last changed, or null if not found
 */
async function findLastCommitWhereFieldChanged(filePath, fieldName) {
    try {
        // Get all commits that touched this file
        const commitList = await execCommand(`git log --format=%H -- ${filePath}`);
        if (!commitList) {
            return null; // File has never been committed
        }
        const commits = commitList.split('\n').filter(Boolean);
        if (commits.length === 0) {
            return null;
        }
        // Get current value of the field
        let currentValue;
        try {
            const currentContent = await execCommand(`git show HEAD:${filePath}`);
            const currentJson = JSON.parse(currentContent);
            currentValue = currentJson[fieldName];
        }
        catch {
            // If we can't read current value, return the first commit
            return commits[0];
        }
        // Walk backwards through commits to find where value changed
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            try {
                const content = await execCommand(`git show ${commit}:${filePath}`);
                const json = JSON.parse(content);
                const value = json[fieldName];
                // If value differs from current, this is where it last changed
                if (value !== currentValue) {
                    // Return the commit AFTER this one (where the change happened)
                    return i > 0 ? commits[i - 1] : commits[0];
                }
            }
            catch {
                // If we can't parse JSON from this commit, skip it
                continue;
            }
        }
        // If we've gone through all commits and value never changed,
        // return the oldest commit (where it was first set)
        return commits[commits.length - 1];
    }
    catch {
        return null;
    }
}
/**
 * Count commits between two refs
 * @param fromRef - Starting commit hash or ref
 * @param toRef - Ending commit hash or ref
 * @returns Number of commits between the two refs
 */
async function countCommitsBetween(fromRef, toRef) {
    try {
        const count = await execCommand(`git rev-list --count ${fromRef}..${toRef}`);
        return parseInt(count, 10);
    }
    catch {
        return 0;
    }
}
/**
 * Read a field value from a JSON file at a specific commit
 * @param commit - Commit hash or ref
 * @param filePath - Path to the JSON file (relative to repo root)
 * @param fieldName - Name of the field to read
 * @returns The field value, or null if not found
 */
async function readFieldFromCommit(commit, filePath, fieldName) {
    try {
        const content = await execCommand(`git show ${commit}:${filePath}`);
        const json = JSON.parse(content);
        return json[fieldName] ?? null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=git-utils.js.map