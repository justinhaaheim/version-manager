import type {DynamicVersion, VersionManagerConfig} from '../../src/types';

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  DynamicVersionSchema,
  VersionManagerConfigSchema,
} from '../../src/types';

export interface CliResult {
  exitCode: number;
  json?: unknown;
  stderr: string;
  stdout: string;
}

/**
 * Execute the version-manager CLI as a subprocess
 */
export function runCli(
  command: string,
  cwd: string,
  options?: {silent?: boolean},
): CliResult {
  const cliPath = path.join(__dirname, '..', '..', 'src', 'index.ts');
  const fullCommand = `bun ${cliPath} ${command}`.trim();

  try {
    const stdout = execSync(fullCommand, {
      cwd,
      encoding: 'utf-8',
      env: {
        ...process.env,
        // Ensure git user is configured for test commits
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_AUTHOR_NAME: 'Test User',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test User',
      },
      stdio: options?.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
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
 * Parse the dynamic version file if it exists
 */
export function parseVersionFile(repoPath: string): DynamicVersion | null {
  const versionFilePath = path.join(repoPath, 'dynamic-version.local.json');

  if (!fs.existsSync(versionFilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(versionFilePath, 'utf-8');
    const json: unknown = JSON.parse(content);

    // Use Zod to validate the JSON
    const result = DynamicVersionSchema.safeParse(json);

    if (!result.success) {
      console.warn('Invalid dynamic-version.local.json format:', result.error);
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Parse the version-manager config file if it exists
 */
export function parseConfigFile(repoPath: string): VersionManagerConfig | null {
  const configPath = path.join(repoPath, 'version-manager.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const json: unknown = JSON.parse(content);

    // Use Zod to validate the JSON
    const result = VersionManagerConfigSchema.safeParse(json);

    if (!result.success) {
      console.warn('Invalid version-manager.json format:', result.error);
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}
