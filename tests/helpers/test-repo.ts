import {execSync} from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CliResult {
  exitCode: number;
  json?: unknown;
  stderr: string;
  stdout: string;
}

/**
 * TestRepo manages a temporary git repository for testing.
 * Each instance creates an isolated temp directory outside the project.
 */
export class TestRepo {
  private tempDir: string;

  constructor() {
    // Create unique temp directory outside project (avoids nested .git issues)
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-test-'));
  }

  /**
   * Initialize a git repository in the temp directory
   */
  initGit(): void {
    execSync('git init', {
      cwd: this.tempDir,
      env: {
        ...process.env,
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_AUTHOR_NAME: 'Test User',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test User',
      },
      stdio: 'ignore',
    });
  }

  /**
   * Create a git tag at the current commit
   */
  createTag(tagName: string): void {
    execSync(`git tag ${tagName}`, {
      cwd: this.tempDir,
      stdio: 'ignore',
    });
  }

  /**
   * Checkout a new branch
   */
  createBranch(branchName: string, checkout = true): void {
    const checkoutFlag = checkout ? '-b' : '';
    execSync(`git checkout ${checkoutFlag} ${branchName}`, {
      cwd: this.tempDir,
      stdio: 'ignore',
    });
  }

  /**
   * Get absolute path to the test repository
   */
  getPath(): string {
    return this.tempDir;
  }

  /**
   * Run version-manager CLI in this repository
   */
  runCli(command: string): CliResult {
    const cliPath = path.join(__dirname, '..', '..', 'src', 'index.ts');

    // Parse command to handle flags
    const fullCommand = `bun ${cliPath} ${command}`.trim();

    try {
      const stdout = execSync(fullCommand, {
        cwd: this.tempDir,
        encoding: 'utf-8',
        env: {
          ...process.env,
          // Ensure git user is configured for test commits
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_AUTHOR_NAME: 'Test User',
          GIT_COMMITTER_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test User',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Try to parse as JSON if it looks like JSON
      let json: unknown;
      try {
        json = JSON.parse(stdout);
      } catch {
        // Not JSON, that's fine
      }

      return {
        exitCode: 0,
        json,
        stderr: '',
        stdout,
      };
    } catch (error: unknown) {
      // Type guard for execSync error with status, stderr, and stdout properties
      const err = error as {
        status?: number;
        stderr?: Buffer | string;
        stdout?: Buffer | string;
      };

      return {
        exitCode: err.status ?? 1,
        stderr: err.stderr?.toString() ?? '',
        stdout: err.stdout?.toString() ?? '',
      };
    }
  }

  /**
   * Read a file from the repository
   */
  readFile(relativePath: string): string {
    const fullPath = path.join(this.tempDir, relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Write a file to the repository
   */
  writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.tempDir, relativePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  /**
   * Check if a file exists in the repository
   */
  fileExists(relativePath: string): boolean {
    const fullPath = path.join(this.tempDir, relativePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Make a commit in the repository
   */
  makeCommit(message: string, addAll = true): void {
    try {
      if (addAll) {
        execSync('git add .', {
          cwd: this.tempDir,
          env: {
            ...process.env,
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_AUTHOR_NAME: 'Test User',
            GIT_COMMITTER_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test User',
          },
          stdio: 'ignore',
        });
      }
      execSync(`git commit -m "${message}"`, {
        cwd: this.tempDir,
        env: {
          ...process.env,
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_AUTHOR_NAME: 'Test User',
          GIT_COMMITTER_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test User',
        },
        stdio: 'ignore',
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to make commit: ${errorMessage}`);
    }
  }

  /**
   * Modify a file to create dirty state (uncommitted changes)
   */
  dirtyFile(relativePath: string): void {
    const fullPath = path.join(this.tempDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      // Create file if it doesn't exist
      this.writeFile(relativePath, 'dirty content');
    } else {
      // Append to existing file
      fs.appendFileSync(fullPath, '\n// Modified for dirty state\n');
    }
  }

  /**
   * Get git hooks directory path (.git/hooks)
   */
  getHooksDir(): string {
    return path.join(this.tempDir, '.git', 'hooks');
  }

  /**
   * Check if a git hook exists and is executable (.git/hooks)
   */
  hookExists(hookName: string): boolean {
    const hookPath = path.join(this.getHooksDir(), hookName);
    if (!fs.existsSync(hookPath)) {
      return false;
    }

    const stats = fs.statSync(hookPath);
    return Boolean(stats.mode & 0o111); // Check executable bit
  }

  /**
   * Read a git hook file (.git/hooks)
   */
  readHook(hookName: string): string {
    const hookPath = path.join(this.getHooksDir(), hookName);
    return fs.readFileSync(hookPath, 'utf-8');
  }

  /**
   * Get Husky hooks directory path (.husky)
   */
  getHuskyHooksDir(): string {
    return path.join(this.tempDir, '.husky');
  }

  /**
   * Check if Husky is initialized (.husky directory exists)
   */
  isHuskyInitialized(): boolean {
    return fs.existsSync(this.getHuskyHooksDir());
  }

  /**
   * Check if a Husky hook exists and is executable
   */
  huskyHookExists(hookName: string): boolean {
    const hookPath = path.join(this.getHuskyHooksDir(), hookName);
    if (!fs.existsSync(hookPath)) {
      return false;
    }

    const stats = fs.statSync(hookPath);
    return Boolean(stats.mode & 0o111); // Check executable bit
  }

  /**
   * Read a Husky hook file
   */
  readHuskyHook(hookName: string): string {
    const hookPath = path.join(this.getHuskyHooksDir(), hookName);
    return fs.readFileSync(hookPath, 'utf-8');
  }

  /**
   * Clean up the temporary directory
   */
  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, {force: true, recursive: true});
    }
  }
}
