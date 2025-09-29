"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVersion = generateVersion;
const git_utils_1 = require("./git-utils");
function parseGitDescribe(describe) {
    const cleanDescribe = describe.replace('-dirty', '');
    const match = /^v?(\d+\.\d+\.\d+)-(\d+)-g([a-f0-9]+)$/.exec(cleanDescribe);
    if (match) {
        const [, baseVersion, commitsSince, shortHash] = match;
        return {
            baseVersion,
            commitsSince: parseInt(commitsSince, 10),
            shortHash,
        };
    }
    const tagMatch = /^v?(\d+\.\d+\.\d+)$/.exec(cleanDescribe);
    if (tagMatch) {
        const [, version] = tagMatch;
        return {
            baseVersion: version,
            commitsSince: 0,
            shortHash: '',
        };
    }
    const hashMatch = /^([a-f0-9]+)$/.exec(cleanDescribe);
    if (hashMatch) {
        return null;
    }
    return null;
}
function formatHumanReadable(components, branch, dirty) {
    let result = '';
    if (components) {
        if (components.commitsSince === 0 && !components.shortHash) {
            result = components.baseVersion;
        }
        else {
            result = `${components.baseVersion}+${components.commitsSince}`;
        }
    }
    else {
        result = 'untagged';
    }
    if (branch !== 'main' && branch !== 'master') {
        result += ` (${branch})`;
    }
    if (dirty) {
        result += ' *';
    }
    return result;
}
async function generateVersion(options = {}) {
    const { incrementPatch = false } = options;
    const isRepo = await (0, git_utils_1.isGitRepository)();
    if (!isRepo) {
        throw new Error('Not a git repository. Please run this command in a git project.');
    }
    const describe = await (0, git_utils_1.getGitDescribe)();
    const branch = await (0, git_utils_1.getCurrentBranch)();
    const dirty = describe.includes('-dirty');
    const components = parseGitDescribe(describe);
    let version;
    let humanReadable;
    if (incrementPatch && components) {
        const [major, minor, patch] = components.baseVersion.split('.').map(Number);
        const newPatch = patch + components.commitsSince;
        version = `${major}.${minor}.${newPatch}`;
        if (branch !== 'main' && branch !== 'master') {
            const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
            version += `-${safeBranch}`;
        }
        if (dirty) {
            version += '+dirty';
        }
        humanReadable = version;
    }
    else {
        humanReadable = formatHumanReadable(components, branch, dirty);
        version = components ? components.baseVersion : 'unknown';
    }
    return {
        branch: branch,
        components,
        describe: describe,
        dirty,
        humanReadable,
        timestamp: new Date().toISOString(),
        version,
    };
}
//# sourceMappingURL=version-generator.js.map