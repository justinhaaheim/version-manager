"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execCommand = execCommand;
exports.isGitRepository = isGitRepository;
exports.getGitDescribe = getGitDescribe;
exports.getCurrentBranch = getCurrentBranch;
exports.hasUncommittedChanges = hasUncommittedChanges;
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
//# sourceMappingURL=git-utils.js.map