import type {VersionMode} from './types';

import chokidar from 'chokidar';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

import {
  describeNoGeneratedFile,
  type OutputPathOption,
  shouldWriteGeneratedFiles,
} from './generated-file-policy';
import {
  generateTypeDefinitions,
  generateVersionDataForMode,
  getVersionMode,
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
  /**
   * Where to write, and whether the user asked for that path
   * (version-manager-70i.11, W2). The flag matters: in a mode with no
   * generated file, only an explicit --output produces one.
   */
  output: OutputPathOption;
  /** Suppress console output */
  silent: boolean;
}

/**
 * What startWatcher() did.
 *
 * "Not started" is its own case rather than a no-op cleanup function, so the
 * caller cannot mistake it for a running watcher and wait on it forever
 * (version-manager-70i.11, W3).
 */
export type WatcherStartResult =
  | {
      /** Stops the watcher */
      cleanup: () => void;
      status: 'started';
    }
  | {
      status: 'not-started';
      /** The mode that has nothing for the watcher to write */
      versionMode: VersionMode;
    };

/**
 * The one message printed when the watcher declines to start (W3).
 */
function describeWatcherNotStarted(versionMode: VersionMode): string {
  return [
    `ℹ️  Not watching: ${describeNoGeneratedFile(versionMode)}`,
    '   Pass --output <path> to watch and write a version file there anyway.',
  ].join('\n');
}

/**
 * Start watching files and auto-regenerate version on changes.
 *
 * In a mode that writes no generated file (package-json, event-log), and
 * without an explicit --output, there is nothing for the watcher to do. It
 * says so once, does not start chokidar, and returns `not-started`
 * (version-manager-70i.11, W3).
 *
 * @param options - Watcher configuration options
 * @returns Whether the watcher started, and how to stop it if it did
 */
export async function startWatcher(
  options: WatcherOptions,
): Promise<WatcherStartResult> {
  const {output, debounce, silent, failOnError, generateTypes} = options;
  const outputPath = output.path;

  // W3: the same single decision every other writer asks
  // (generated-file-policy, 70i.2 D12). No new policy here.
  const startupVersionMode = getVersionMode();
  if (!shouldWriteGeneratedFiles(startupVersionMode, output)) {
    if (!silent) {
      console.log(describeWatcherNotStarted(startupVersionMode));
    }
    return {status: 'not-started', versionMode: startupVersionMode};
  }

  if (!silent) {
    console.log('🚀 Starting file watcher...\n');
  }

  // Track debounce timer
  let debounceTimer: NodeJS.Timeout | null = null;
  let changesPending = false;
  let lastChangedFile: string | null = null;

  /**
   * Regenerate version file (debounced)
   */
  const regenerateVersion = async (reason: string): Promise<void> => {
    try {
      // W4: version-manager.json is itself watched, so the mode can change
      // under a running watcher. Read it again on every regeneration, and use
      // THAT reading for both the write decision and the derivation.
      const versionMode = getVersionMode();
      if (!shouldWriteGeneratedFiles(versionMode, output)) {
        if (!silent) {
          console.log(
            `ℹ️  Nothing written (${reason}): ${describeNoGeneratedFile(versionMode)}`,
          );
        }
        return;
      }

      // W1: the same per-mode derivation the CLI uses. In event-log mode that
      // is version.jsonl, never package.json's history.
      const {versionData, warnings} = await generateVersionDataForMode(
        versionMode,
        'cli',
      );

      // A fallen-back measurement or an unreadable log line must not be
      // silent here any more than it is in the CLI (critical rule 6).
      if (!silent) {
        for (const warning of warnings) {
          console.warn(warning);
        }
      }

      const content = JSON.stringify(versionData, null, 2) + '\n';

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

  return {cleanup, status: 'started'};
}
