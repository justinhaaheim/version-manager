/**
 * Options for the file watcher
 */
export interface WatcherOptions {
    /** Debounce delay in milliseconds */
    debounce: number;
    /** Exit on errors */
    failOnError: boolean;
    /** Output path for version file */
    outputPath: string;
    /** Suppress console output */
    silent: boolean;
}
/**
 * Start watching files and auto-regenerate version on changes
 * @param options - Watcher configuration options
 * @returns Promise that resolves when watcher is initialized
 */
export declare function startWatcher(options: WatcherOptions): Promise<() => void>;
//# sourceMappingURL=watcher.d.ts.map