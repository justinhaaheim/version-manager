"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicVersionSchema = exports.VersionManagerConfigSchema = exports.VersionCalculationModeSchema = exports.GenerateVersionOptionsSchema = exports.VersionInfoSchema = exports.VersionComponentsSchema = void 0;
const zod_1 = require("zod");
// Zod schemas for runtime validation
exports.VersionComponentsSchema = zod_1.z.object({
    baseVersion: zod_1.z.string(),
    commitsSince: zod_1.z.number(),
    shortHash: zod_1.z.string(),
});
exports.VersionInfoSchema = zod_1.z.object({
    branch: zod_1.z.string(),
    components: exports.VersionComponentsSchema.nullable(),
    describe: zod_1.z.string(),
    dirty: zod_1.z.boolean(),
    error: zod_1.z.boolean().optional(),
    humanReadable: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    version: zod_1.z.string(),
});
exports.GenerateVersionOptionsSchema = zod_1.z.object({
    incrementPatch: zod_1.z.boolean().optional(),
    outputPath: zod_1.z.string().optional(),
    silent: zod_1.z.boolean().optional(),
});
// New file-based versioning schemas
exports.VersionCalculationModeSchema = zod_1.z.enum([
    'add-to-patch',
    'append-commits',
]);
exports.VersionManagerConfigSchema = zod_1.z.object({
    codeVersionBase: zod_1.z.string(),
    runtimeVersion: zod_1.z.string(),
    versionCalculationMode: exports.VersionCalculationModeSchema,
});
exports.DynamicVersionSchema = zod_1.z.object({
    buildNumber: zod_1.z.string().optional(),
    codeVersion: zod_1.z.string(),
    runtimeVersion: zod_1.z.string(),
});
//# sourceMappingURL=types.js.map