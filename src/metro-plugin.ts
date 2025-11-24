import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {generateFileBasedVersion} from './version-generator';

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
type MetroSerializer = (
  entryPoint: string,
  preModules: readonly unknown[],
  graph: unknown,
  options: unknown,
) => Promise<string> | string;

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
export function withVersionManager(config: MetroConfig): MetroConfig {
  const existingSerializer = config.serializer?.customSerializer;

  return {
    ...config,
    serializer: {
      ...config.serializer,
      customSerializer: async (
        entryPoint: string,
        preModules: readonly unknown[],
        graph: unknown,
        options: unknown,
      ): Promise<string> => {
        // Generate version data in memory
        try {
          const outputPath = join(process.cwd(), 'dynamic-version.local.json');
          const {versionData} = await generateFileBasedVersion('cli');
          const newContent = JSON.stringify(versionData, null, 2) + '\n';

          // Read existing file if it exists
          const existingContent = existsSync(outputPath)
            ? readFileSync(outputPath, 'utf8')
            : null;

          // Only write if content has changed
          if (existingContent !== newContent) {
            writeFileSync(outputPath, newContent);
          }
        } catch (error) {
          // Silently fail - don't break the build if version generation fails
          // (e.g., not in a git repo, missing config files, etc.)
          if (process.env.DEBUG) {
            console.error(
              '[version-manager] Failed to generate version:',
              error,
            );
          }
        }

        // Get original serializer
        const originalSerializer =
          existingSerializer ??
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require('metro/src/lib/bundleToString') as MetroSerializer);

        const result = await originalSerializer(
          entryPoint,
          preModules,
          graph,
          options,
        );

        // Handle both sync and async serializers
        return typeof result === 'string' ? result : String(result);
      },
    },
  };
}
