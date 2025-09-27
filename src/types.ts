export interface VersionInfo {
  branch: string;
  components: VersionComponents | null;
  describe: string;
  dirty: boolean;
  humanReadable: string;
  timestamp: string;
}

export interface VersionComponents {
  baseVersion: string;
  commitsSince: number;
  shortHash: string;
}

export interface GenerateVersionOptions {
  outputPath?: string;
  silent?: boolean;
}
