import type {DynamicVersion} from '../../src/types';

import {expect} from 'bun:test';
import * as fs from 'fs';

/**
 * Assert that a JSON object is a valid DynamicVersion
 */
export function assertValidVersionJson(
  json: any,
): asserts json is DynamicVersion {
  expect(json).toBeDefined();
  expect(typeof json).toBe('object');
  expect(json).toHaveProperty('codeVersion');
  expect(json).toHaveProperty('runtimeVersion');

  // Validate types
  expect(typeof json.codeVersion).toBe('string');
  expect(typeof json.runtimeVersion).toBe('string');

  // buildNumber is optional but should be string if present
  if (json.buildNumber !== undefined) {
    expect(typeof json.buildNumber).toBe('string');
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

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  expect(pkg.scripts).toBeDefined();
  expect(pkg.scripts).toHaveProperty('dynamic-version');
  expect(pkg.scripts).toHaveProperty('dynamic-version:generate');
  expect(pkg.scripts).toHaveProperty('dynamic-version:install-scripts');
}
