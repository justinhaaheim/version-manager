import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

export async function execCommand(command: string): Promise<string> {
  try {
    const {stdout} = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('not a git repository')
    ) {
      throw new Error(
        'Not a git repository. Please run this command in a git project.',
      );
    }
    if (error instanceof Error && error.message.includes('no names found')) {
      return await execCommand('git rev-parse --short HEAD');
    }
    throw error;
  }
}

export async function isGitRepository(): Promise<boolean> {
  try {
    await execCommand('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

export async function getGitDescribe(): Promise<string> {
  return await execCommand('git describe --always --tags --dirty');
}

export async function getCurrentBranch(): Promise<string> {
  try {
    const branch = await execCommand('git rev-parse --abbrev-ref HEAD');
    return branch;
  } catch {
    return 'HEAD';
  }
}

export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const status = await execCommand('git status --porcelain');
    return status.length > 0;
  } catch {
    return false;
  }
}
