import type {DynamicVersion} from '../../src/types';

import {expect} from 'bun:test';
import * as fs from 'fs';
import {z} from 'zod';

import {DynamicVersionSchema} from '../../src/types';

// Schema for validating package.json with version-manager scripts
const PackageJsonWithScriptsSchema = z.object({
  scripts: z.object({
    'dynamic-version': z.string(),
    'dynamic-version:generate': z.string(),
    'dynamic-version:install-scripts': z.string(),
  }),
});

/**
 * Assert that a JSON object is a valid DynamicVersion
 */
export function assertValidVersionJson(
  json: unknown,
): asserts json is DynamicVersion {
  // Use Zod to validate and assert the structure
  const result = DynamicVersionSchema.safeParse(json);

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Invalid DynamicVersion: ${JSON.stringify(result.error.format())}`,
    );
  }
}

/**
 * Assert that a string is valid semantic version format
 */
export function assertSemver(version: string): void {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  expect(version).toMatch(semverRegex);
}

/**
 * Assert that a version string matches add-to-patch format (e.g., "0.1.5")
 */
export function assertAddToPatchFormat(
  version: string,
  expectedBase: string,
  expectedCommits: number,
): void {
  const [major, minor, patch] = expectedBase.split('.').map(Number);
  const expectedVersion = `${major}.${minor}.${patch + expectedCommits}`;
  expect(version).toBe(expectedVersion);
}

/**
 * Assert that a version string matches append-commits format (e.g., "0.1.0+5")
 */
export function assertAppendCommitsFormat(
  version: string,
  expectedBase: string,
  expectedCommits: number,
): void {
  if (expectedCommits === 0) {
    expect(version).toBe(expectedBase);
  } else {
    expect(version).toBe(`${expectedBase}+${expectedCommits}`);
  }
}

/**
 * Assert that a git hook file exists and is executable
 */
export function assertHookExists(hookPath: string): void {
  expect(fs.existsSync(hookPath)).toBe(true);

  const stats = fs.statSync(hookPath);
  const isExecutable = Boolean(stats.mode & 0o111);
  expect(isExecutable).toBe(true);
}

/**
 * Assert that a git hook contains a specific command
 */
export function assertHookContainsCommand(
  hookPath: string,
  command: string,
): void {
  const content = fs.readFileSync(hookPath, 'utf-8');
  expect(content).toContain(command);
}

/**
 * Assert that a git hook contains exactly one instance of a pattern
 */
export function assertHookContainsSingleMatch(
  hookPath: string,
  pattern: string | RegExp,
): void {
  const content = fs.readFileSync(hookPath, 'utf-8');

  let matches: RegExpMatchArray | null;
  if (typeof pattern === 'string') {
    const regex = new RegExp(
      pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'g',
    );
    matches = content.match(regex);
  } else {
    matches = content.match(pattern);
  }

  expect(matches).not.toBeNull();
  expect(matches?.length).toBe(1);
}

/**
 * Assert that package.json has version-manager scripts installed
 */
export function assertPackageHasVersionScripts(packageJsonPath: string): void {
  expect(fs.existsSync(packageJsonPath)).toBe(true);

  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  const json: unknown = JSON.parse(content);

  // Use Zod to validate the package.json structure
  const result = PackageJsonWithScriptsSchema.safeParse(json);

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Invalid package.json structure: ${JSON.stringify(result.error.format())}`,
    );
  }
}
