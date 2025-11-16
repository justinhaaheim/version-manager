import {z} from 'zod';

// Zod schemas for runtime validation
export const VersionCalculationModeSchema = z.enum([
  'add-to-patch',
  'append-commits',
]);

// Legacy schema for migration - accepts old runtimeVersion field
export const LegacyVersionManagerConfigSchema = z.object({
  runtimeVersion: z.string(),
  versionCalculationMode: VersionCalculationModeSchema,
  versions: z.record(z.string(), z.string()).optional(),
});

// Current schema - does not accept runtimeVersion
// Use .strict() to reject unknown fields like runtimeVersion
export const VersionManagerConfigSchema = z
  .object({
    versionCalculationMode: VersionCalculationModeSchema,
    versions: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export const GenerationTriggerSchema = z.enum(['git-hook', 'cli']);

export const DynamicVersionSchema = z.object({
  baseVersion: z.string(),
  branch: z.string(),
  buildNumber: z.string(),
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
export type LegacyVersionManagerConfig = z.infer<
  typeof LegacyVersionManagerConfigSchema
>;
export type VersionManagerConfig = z.infer<typeof VersionManagerConfigSchema>;
export type GenerationTrigger = z.infer<typeof GenerationTriggerSchema>;
export type DynamicVersion = z.infer<typeof DynamicVersionSchema>;
