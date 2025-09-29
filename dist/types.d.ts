export interface VersionInfo {
    branch: string;
    components: VersionComponents | null;
    describe: string;
    dirty: boolean;
    error?: boolean;
    humanReadable: string;
    timestamp: string;
    version: string;
}
export interface VersionComponents {
    baseVersion: string;
    commitsSince: number;
    shortHash: string;
}
export interface GenerateVersionOptions {
    incrementPatch?: boolean;
    outputPath?: string;
    silent?: boolean;
}
//# sourceMappingURL=types.d.ts.map