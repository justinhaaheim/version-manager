import type {VersionComponents, VersionInfo} from './types';

import {getCurrentBranch, getGitDescribe, isGitRepository} from './git-utils';

function parseGitDescribe(describe: string): VersionComponents | null {
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

function formatHumanReadable(
  components: VersionComponents | null,
  branch: string,
  dirty: boolean,
): string {
  let result = '';

  if (components) {
    if (components.commitsSince === 0 && !components.shortHash) {
      result = components.baseVersion;
    } else {
      result = `${components.baseVersion}+${components.commitsSince}`;
    }
  } else {
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

export async function generateVersion(): Promise<VersionInfo> {
  const isRepo = await isGitRepository();
  if (!isRepo) {
    throw new Error(
      'Not a git repository. Please run this command in a git project.',
    );
  }

  const describe = await getGitDescribe();
  const branch = await getCurrentBranch();
  const dirty = describe.includes('-dirty');

  const components = parseGitDescribe(describe);
  const humanReadable = formatHumanReadable(components, branch, dirty);

  return {
    branch: branch,
    components,
    describe: describe,
    dirty,
    humanReadable,
    timestamp: new Date().toISOString(),
  };
}
