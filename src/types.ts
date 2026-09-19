import {z} from 'zod';

// Zod schemas for runtime validation
export const VersionCalculationModeSchema = z.enum([
  'add-to-patch',
  'append-commits',
]);

export const VersionModeSchema = z.enum(['dynamic-file', 'package-json']);

export const OutputFormatSchema = z.enum([
  'silent',
  'compact',
  'normal',
  'verbose',
]);

// Legacy schema for migration - accepts old runtimeVersion field
export const LegacyVersionManagerConfigSchema = z.object({
  runtimeVersion: z.string(),
  versionCalculationMode: VersionCalculationModeSchema,
  versions: z.record(z.string(), z.string()).optional(),
});

// Branch-name suffix knob. Off by default: turning it on makes every branch
// build carry a semver prerelease naming the branch (see src/branch-suffix.ts).
export const BranchSuffixConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    mainBranches: z.array(z.string()).default(['main', 'master']),
  })
  .default({enabled: false, mainBranches: ['main', 'master']});

// package.json merge-driver knob. Off by default (version-manager-70i.24):
// registering the driver is what exposes a repository to the measured hazard
// in version-manager-70i.22 — a driver COMMAND that cannot run turns a merge
// into a conflict with no markers in it, which an author can stage away,
// silently discarding the other side. The code ships; the feature is opted
// into. See src/merge-driver.ts and the README.
export const MergeDriverConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({enabled: false});

// Current schema - does not accept runtimeVersion
// Use .strict() to reject unknown fields like runtimeVersion
export const VersionManagerConfigSchema = z
  .object({
    branchSuffix: BranchSuffixConfigSchema,
    mergeDriver: MergeDriverConfigSchema,
    outputFormat: OutputFormatSchema.optional(),
    versionCalculationMode: VersionCalculationModeSchema,
    versionMode: VersionModeSchema.optional().default('dynamic-file'),
    versions: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export const GenerationTriggerSchema = z.enum(['git-hook', 'cli']);

export const DynamicVersionSchema = z.object({
  _generated: z.string(),
  baseVersion: z.string(),
  branch: z.string(),
  buildNumber: z.string(),
  commitsSince: z.number(),
  dirty: z.boolean(),
  dynamicVersion: z.string(),
  generationTrigger: GenerationTriggerSchema,
  timestamp: z.string(),
  timestampUnix: z.number(),
  versions: z.record(z.string(), z.string()).default({}),
});

// Infer TypeScript types from Zod schemas (single source of truth)
export type VersionCalculationMode = z.infer<
  typeof VersionCalculationModeSchema
>;
export type VersionMode = z.infer<typeof VersionModeSchema>;
export type BranchSuffixConfig = z.infer<typeof BranchSuffixConfigSchema>;
export type MergeDriverConfig = z.infer<typeof MergeDriverConfigSchema>;
export type LegacyVersionManagerConfig = z.infer<
  typeof LegacyVersionManagerConfigSchema
>;
export type VersionManagerConfig = z.infer<typeof VersionManagerConfigSchema>;
export type GenerationTrigger = z.infer<typeof GenerationTriggerSchema>;
export type DynamicVersion = z.infer<typeof DynamicVersionSchema>;
