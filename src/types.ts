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

// New file-based versioning types
export type VersionCalculationMode = 'add-to-patch' | 'append-commits';

export interface VersionManagerConfig {
  codeVersionBase: string;
  runtimeVersion: string;
  versionCalculationMode: VersionCalculationMode;
}

export interface DynamicVersion {
  buildNumber?: string;
  codeVersion: string;
  runtimeVersion: string;
}
