import { z } from 'zod';
export declare const VersionComponentsSchema: z.ZodObject<{
    baseVersion: z.ZodString;
    commitsSince: z.ZodNumber;
    shortHash: z.ZodString;
}, z.core.$strip>;
export declare const VersionInfoSchema: z.ZodObject<{
    branch: z.ZodString;
    components: z.ZodNullable<z.ZodObject<{
        baseVersion: z.ZodString;
        commitsSince: z.ZodNumber;
        shortHash: z.ZodString;
    }, z.core.$strip>>;
    describe: z.ZodString;
    dirty: z.ZodBoolean;
    error: z.ZodOptional<z.ZodBoolean>;
    humanReadable: z.ZodString;
    timestamp: z.ZodString;
    version: z.ZodString;
}, z.core.$strip>;
export declare const GenerateVersionOptionsSchema: z.ZodObject<{
    incrementPatch: z.ZodOptional<z.ZodBoolean>;
    outputPath: z.ZodOptional<z.ZodString>;
    silent: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const VersionCalculationModeSchema: z.ZodEnum<{
    "add-to-patch": "add-to-patch";
    "append-commits": "append-commits";
}>;
export declare const VersionManagerConfigSchema: z.ZodObject<{
    runtimeVersion: z.ZodString;
    versionCalculationMode: z.ZodEnum<{
        "add-to-patch": "add-to-patch";
        "append-commits": "append-commits";
    }>;
}, z.core.$strip>;
export declare const GenerationTriggerSchema: z.ZodEnum<{
    "git-hook": "git-hook";
    cli: "cli";
}>;
export declare const DynamicVersionSchema: z.ZodObject<{
    baseVersion: z.ZodString;
    branch: z.ZodString;
    buildNumber: z.ZodString;
    dirty: z.ZodBoolean;
    dynamicVersion: z.ZodString;
    generationTrigger: z.ZodEnum<{
        "git-hook": "git-hook";
        cli: "cli";
    }>;
    runtimeVersion: z.ZodString;
    timestamp: z.ZodString;
}, z.core.$strip>;
export type VersionComponents = z.infer<typeof VersionComponentsSchema>;
export type VersionInfo = z.infer<typeof VersionInfoSchema>;
export type GenerateVersionOptions = z.infer<typeof GenerateVersionOptionsSchema>;
export type VersionCalculationMode = z.infer<typeof VersionCalculationModeSchema>;
export type VersionManagerConfig = z.infer<typeof VersionManagerConfigSchema>;
export type GenerationTrigger = z.infer<typeof GenerationTriggerSchema>;
export type DynamicVersion = z.infer<typeof DynamicVersionSchema>;
//# sourceMappingURL=types.d.ts.map