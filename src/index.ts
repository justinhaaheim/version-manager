/**
 * @justinhaaheim/version-manager
 *
 * A comprehensive version tracking system for JavaScript/TypeScript projects
 */

// Re-export the main functions for programmatic use
import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import {z} from 'zod';

// Custom Zod refinement for semver validation
const semverString = z.string().refine((val) => semver.valid(val) !== null, {
  message: 'Must be a valid semantic version',
});

// Zod schema for version history entry
const versionHistoryEntrySchema = z.object({
  branch: z.string().optional(),
  channel: z.string().optional(),
  commit: z.string().optional(),
  message: z.string().optional(),
  profile: z.string().optional(),
  timestamp: z.string(),
  type: z.enum(['build', 'update']),
});

// Zod schema for runtime version entry
const runtimeVersionEntrySchema = z.object({
  createdAt: z.string(),
  fingerprints: z.array(z.string()),
  message: z.string().optional(),
});

// Zod schema for ProjectVersions
const projectVersionsSchema = z.object({
  buildNumber: z
    .string()
    .regex(/^\d+$/, 'Build number must be a numeric string'),
  codeVersion: semverString,
  codeVersionHistory: z.record(z.string(), versionHistoryEntrySchema),
  releaseVersion: semverString,
  runtimeVersion: semverString,
  runtimeVersions: z.record(z.string(), runtimeVersionEntrySchema),
});

export type ProjectVersions = z.infer<typeof projectVersionsSchema>;

export interface VersionManagerOptions {
  versionsFilePath?: string;
}

export class VersionManager {
  private versionsFilePath: string;

  constructor(options: VersionManagerOptions = {}) {
    this.versionsFilePath =
      options.versionsFilePath ??
      path.join(process.cwd(), 'projectVersions.json');
  }

  readVersions(): ProjectVersions {
    const content = fs.readFileSync(this.versionsFilePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    const result = projectVersionsSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid projectVersions.json schema: ${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }

    return result.data;
  }

  writeVersions(versions: ProjectVersions): void {
    const result = projectVersionsSchema.safeParse(versions);
    if (!result.success) {
      throw new Error(
        `Cannot write invalid schema: ${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }

    fs.writeFileSync(
      this.versionsFilePath,
      JSON.stringify(versions, null, 2) + '\n',
    );
  }

  incrementCodeVersion(
    currentVersion: string,
    type: 'major' | 'minor' | 'patch' = 'patch',
  ): string {
    const newVersion = semver.inc(currentVersion, type);
    if (!newVersion) {
      throw new Error(`Failed to increment version: ${currentVersion}`);
    }
    return newVersion;
  }

  incrementBuildNumber(currentBuildNumber: string): string {
    const num = parseInt(currentBuildNumber, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid build number: ${currentBuildNumber}`);
    }
    return String(num + 1);
  }

  getGitInfo(): {branch?: string; commit?: string} {
    try {
      const commit = execSync('git rev-parse HEAD', {encoding: 'utf-8'}).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
      }).trim();
      return {branch, commit};
    } catch {
      return {};
    }
  }
}
