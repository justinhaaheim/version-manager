"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicVersionSchema = exports.GenerationTriggerSchema = exports.VersionManagerConfigSchema = exports.LegacyVersionManagerConfigSchema = exports.VersionCalculationModeSchema = void 0;
const zod_1 = require("zod");
// Zod schemas for runtime validation
exports.VersionCalculationModeSchema = zod_1.z.enum([
    'add-to-patch',
    'append-commits',
]);
// Legacy schema for migration - accepts old runtimeVersion field
exports.LegacyVersionManagerConfigSchema = zod_1.z.object({
    runtimeVersion: zod_1.z.string(),
    versionCalculationMode: exports.VersionCalculationModeSchema,
    versions: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
});
// Current schema - does not accept runtimeVersion
// Use .strict() to reject unknown fields like runtimeVersion
exports.VersionManagerConfigSchema = zod_1.z
    .object({
    versionCalculationMode: exports.VersionCalculationModeSchema,
    versions: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({}),
})
    .strict();
exports.GenerationTriggerSchema = zod_1.z.enum(['git-hook', 'cli']);
exports.DynamicVersionSchema = zod_1.z.object({
    baseVersion: zod_1.z.string(),
    branch: zod_1.z.string(),
    buildNumber: zod_1.z.string(),
    dirty: zod_1.z.boolean(),
    dynamicVersion: zod_1.z.string(),
    generationTrigger: exports.GenerationTriggerSchema,
    timestamp: zod_1.z.string(),
    timestampUnix: zod_1.z.number(),
    versions: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({}),
});
//# sourceMappingURL=types.js.map