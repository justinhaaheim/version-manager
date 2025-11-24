import chokidar from 'chokidar';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {
  generateFileBasedVersion,
  generateTypeDefinitions,
} from './version-generator';

/**
 * Options for the file watcher
 */
export interface WatcherOptions {
  /** Debounce delay in milliseconds */
  debounce: number;
  /** Exit on errors */
  failOnError: boolean;
  /** Generate TypeScript definitions */
  generateTypes: boolean;
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
export async function startWatcher(
  options: WatcherOptions,
): Promise<() => void> {
  const {outputPath, debounce, silent, failOnError, generateTypes} = options;

  // Track debounce timer
  let debounceTimer: NodeJS.Timeout | null = null;
  let changesPending = false;
  let lastChangedFile: string | null = null;

  /**
   * Regenerate version file (debounced)
   */
  const regenerateVersion = async (reason: string): Promise<void> => {
    try {
      const versionData = await generateFileBasedVersion('cli');

      // Add $schema property for IDE support
      const versionDataWithSchema = {
        $schema:
          './node_modules/@justinhaaheim/version-manager/schemas/dynamic-version.schema.json',
        ...versionData,
      };

      const content = JSON.stringify(versionDataWithSchema, null, 2) + '\n';

      // Read existing file to check if content changed
      const existingContent = existsSync(outputPath)
        ? readFileSync(outputPath, 'utf8')
        : null;

      // Only write if content changed
      if (existingContent !== content) {
        writeFileSync(outputPath, content);

        // Generate TypeScript definitions if requested
        if (generateTypes) {
          const versionKeys = Object.keys(versionData.versions);
          generateTypeDefinitions(outputPath, versionKeys);
        }

        if (!silent) {
          console.log(
            `✅ Version regenerated (${reason}): ${versionData.dynamicVersion}`,
          );
        }
      } else if (!silent) {
        console.log(`ℹ️  No version change detected (${reason})`);
      }
    } catch (error) {
      if (!silent) {
        console.error('❌ Failed to regenerate version:', error);
      }

      if (failOnError) {
        throw error;
      }
    }
  };

  /**
   * Handle file change with debouncing
   */
  const handleChange = (path: string): void => {
    lastChangedFile = path;
    changesPending = true;

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = setTimeout(() => {
      if (changesPending) {
        const reason = lastChangedFile
          ? `changed: ${lastChangedFile}`
          : 'files changed';
        void regenerateVersion(reason);
        changesPending = false;
        lastChangedFile = null;
      }
    }, debounce);
  };

  // Read .gitignore if it exists
  const gitignorePath = join(process.cwd(), '.gitignore');
  const gitignorePatterns: string[] = [];

  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');
    const patterns = gitignoreContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    gitignorePatterns.push(...patterns);
  }

  // Always ignore node_modules, .git folder itself, and the output file
  const ignorePatterns = [
    '**/node_modules/**',
    '**/.git/**',
    '!**/.git/HEAD', // But DO watch .git/HEAD
    '!**/.git/refs/**', // And .git/refs
    outputPath, // Don't watch the output file itself
    ...gitignorePatterns,
  ];

  // Set up watcher
  const watcher = chokidar.watch(
    [
      '.git/HEAD', // Current branch/commit
      '.git/refs/**', // Branch references
      'package.json', // Base version
      'version-manager.json', // Config
      '**/*', // All project files
    ],
    {
      awaitWriteFinish: {
        pollInterval: 50,
        stabilityThreshold: 100,
      },
      cwd: process.cwd(),
      ignoreInitial: true,
      ignored: ignorePatterns,
      // Don't trigger on initial scan
      persistent: true,
    },
  );

  // Set up event handlers
  watcher
    .on('add', (path) => handleChange(path))
    .on('change', (path) => handleChange(path))
    .on('unlink', (path) => handleChange(path));

  // Wait for initial scan to complete
  await new Promise<void>((resolve) => {
    watcher.on('ready', () => {
      if (!silent) {
        console.log('👀 Watching for file changes...');
        console.log(`   Debounce: ${debounce}ms`);
        console.log(`   Output: ${outputPath}`);
        console.log('   Press Ctrl+C to stop\n');
      }
      resolve();
    });
  });

  // Handle graceful shutdown
  const cleanup = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    void watcher.close();
    if (!silent) {
      console.log('\n👋 Watcher stopped');
    }
  };

  // Return cleanup function
  return cleanup;
}
