import { z } from 'zod';
export declare const VersionCalculationModeSchema: z.ZodEnum<{
    "add-to-patch": "add-to-patch";
    "append-commits": "append-commits";
}>;
export declare const OutputFormatSchema: z.ZodEnum<{
    silent: "silent";
    compact: "compact";
    normal: "normal";
    verbose: "verbose";
}>;
export declare const LegacyVersionManagerConfigSchema: z.ZodObject<{
    runtimeVersion: z.ZodString;
    versionCalculationMode: z.ZodEnum<{
        "add-to-patch": "add-to-patch";
        "append-commits": "append-commits";
    }>;
    versions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export declare const VersionManagerConfigSchema: z.ZodObject<{
    outputFormat: z.ZodOptional<z.ZodEnum<{
        silent: "silent";
        compact: "compact";
        normal: "normal";
        verbose: "verbose";
    }>>;
    versionCalculationMode: z.ZodEnum<{
        "add-to-patch": "add-to-patch";
        "append-commits": "append-commits";
    }>;
    versions: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strict>;
export declare const GenerationTriggerSchema: z.ZodEnum<{
    "git-hook": "git-hook";
    cli: "cli";
}>;
export declare const DynamicVersionSchema: z.ZodObject<{
    baseVersion: z.ZodString;
    branch: z.ZodString;
    buildNumber: z.ZodString;
    commitsSince: z.ZodNumber;
    dirty: z.ZodBoolean;
    dynamicVersion: z.ZodString;
    generationTrigger: z.ZodEnum<{
        "git-hook": "git-hook";
        cli: "cli";
    }>;
    timestamp: z.ZodString;
    timestampUnix: z.ZodNumber;
    versions: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type VersionCalculationMode = z.infer<typeof VersionCalculationModeSchema>;
export type LegacyVersionManagerConfig = z.infer<typeof LegacyVersionManagerConfigSchema>;
export type VersionManagerConfig = z.infer<typeof VersionManagerConfigSchema>;
export type GenerationTrigger = z.infer<typeof GenerationTriggerSchema>;
export type DynamicVersion = z.infer<typeof DynamicVersionSchema>;
//# sourceMappingURL=types.d.ts.map