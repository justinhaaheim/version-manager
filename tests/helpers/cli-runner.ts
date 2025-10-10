import type {DynamicVersion} from '../../src/types';

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: any;
}

/**
 * Execute the version-manager CLI as a subprocess
 */
export async function runCli(
  command: string,
  cwd: string,
  options?: {silent?: boolean},
): Promise<CliResult> {
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
    let json;
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
  } catch (error: any) {
    return {
      exitCode: error.status || 1,
      stderr: error.stderr?.toString() || '',
      stdout: error.stdout?.toString() || '',
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
    return JSON.parse(content) as DynamicVersion;
  } catch {
    return null;
  }
}

/**
 * Parse the version-manager config file if it exists
 */
export function parseConfigFile(repoPath: string) {
  const configPath = path.join(repoPath, 'version-manager.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
