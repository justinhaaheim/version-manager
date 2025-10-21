import {z} from 'zod';

// Zod schemas for runtime validation
export const VersionComponentsSchema = z.object({
  baseVersion: z.string(),
  commitsSince: z.number(),
  shortHash: z.string(),
});

export const VersionInfoSchema = z.object({
  branch: z.string(),
  components: VersionComponentsSchema.nullable(),
  describe: z.string(),
  dirty: z.boolean(),
  error: z.boolean().optional(),
  humanReadable: z.string(),
  timestamp: z.string(),
  version: z.string(),
});

export const GenerateVersionOptionsSchema = z.object({
  incrementPatch: z.boolean().optional(),
  outputPath: z.string().optional(),
  silent: z.boolean().optional(),
});

// New file-based versioning schemas
export const VersionCalculationModeSchema = z.enum([
  'add-to-patch',
  'append-commits',
]);

export const VersionManagerConfigSchema = z.object({
  codeVersionBase: z.string(),
  runtimeVersion: z.string(),
  versionCalculationMode: VersionCalculationModeSchema,
});

export const GenerationTriggerSchema = z.enum(['git-hook', 'cli']);

export const DynamicVersionSchema = z.object({
  branch: z.string(),
  buildNumber: z.string(),
  codeVersion: z.string(),
  dirty: z.boolean(),
  generationTrigger: GenerationTriggerSchema,
  runtimeVersion: z.string(),
  timestamp: z.string(),
});

// Infer TypeScript types from Zod schemas (single source of truth)
export type VersionComponents = z.infer<typeof VersionComponentsSchema>;
export type VersionInfo = z.infer<typeof VersionInfoSchema>;
export type GenerateVersionOptions = z.infer<
  typeof GenerateVersionOptionsSchema
>;
export type VersionCalculationMode = z.infer<
  typeof VersionCalculationModeSchema
>;
export type VersionManagerConfig = z.infer<typeof VersionManagerConfigSchema>;
export type GenerationTrigger = z.infer<typeof GenerationTriggerSchema>;
export type DynamicVersion = z.infer<typeof DynamicVersionSchema>;
