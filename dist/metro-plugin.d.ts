/**
 * Metro configuration interface (simplified subset)
 */
interface MetroConfig {
    [key: string]: unknown;
    serializer?: {
        [key: string]: unknown;
        customSerializer?: MetroSerializer;
    };
}
/**
 * Metro serializer function type
 */
type MetroSerializer = (entryPoint: string, preModules: readonly unknown[], graph: unknown, options: unknown) => Promise<string> | string;
/**
 * Metro bundler plugin that auto-regenerates dynamic-version.local.json
 * during development without causing infinite rebuild loops.
 *
 * How it works:
 * 1. Runs during Metro's serialization phase (before bundle output)
 * 2. Generates version data in memory
 * 3. Compares with existing file content
 * 4. Only writes if content has changed
 *
 * This prevents rebuild loops while ensuring git hook changes are detected:
 * - Normal HMR: Same version → no write → no rebuild
 * - After commit: Git hook writes → Metro rebuilds → plugin generates same → no extra write
 * - After checkout: Git hook writes new version → Metro detects change → rebuilds fresh
 *
 * @param config - Metro configuration object
 * @returns Enhanced Metro configuration with version regeneration
 *
 * @example
 * ```javascript
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config');
 * const { withVersionManager } = require('@justinhaaheim/version-manager/metro-plugin');
 *
 * const config = getDefaultConfig(__dirname);
 * module.exports = withVersionManager(config);
 * ```
 */
export declare function withVersionManager(config: MetroConfig): MetroConfig;
export {};
//# sourceMappingURL=metro-plugin.d.ts.map