#!/usr/bin/env ts-node

import {execSync} from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

// Load environment variables from .env.local (and .env as fallback)
dotenv.config({path: '.env.local'});
dotenv.config(); // This loads .env as fallback if .env.local doesn't exist

const SCREENSHOTS_DIR = path.join(process.cwd(), 'e2e', 'screenshots');
const ARCHIVE_DIR = process.env.SCREENSHOT_ARCHIVE_DIR;

/**
 * Get the current git branch name
 */
function getCurrentBranch(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim();
    return branch;
  } catch (error) {
    console.warn('Warning: Could not get git branch name:', error);
    return 'unknown-branch';
  }
}

/**
 * Get the abbreviated commit hash for current HEAD
 */
function getCurrentCommitHash(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
    }).trim();
    return hash;
  } catch (error) {
    console.warn('Warning: Could not get git commit hash:', error);
    return 'unknown-hash';
  }
}

/**
 * Format date for filename (YYYY-MM-DD_HH-MM-SS)
 */
function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Get file creation time (or modification time as fallback)
 */
function getFileCreationTime(filePath: string): Date {
  try {
    const stats = fs.statSync(filePath);
    // Use birthtime (creation time) if available, otherwise use mtime
    return stats.birthtime || stats.mtime;
  } catch (error) {
    console.warn(`Warning: Could not get file stats for ${filePath}:`, error);
    return new Date();
  }
}

/**
 * Resolve tilde (~) in paths and check if a directory exists and is accessible
 */
function isValidDirectory(dirPath: string): boolean {
  try {
    // Handle tilde expansion
    const resolvedPath = dirPath.startsWith('~')
      ? path.join(os.homedir(), dirPath.slice(1))
      : path.resolve(dirPath);

    const stats = fs.statSync(resolvedPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve tilde (~) in paths
 */
function resolvePath(dirPath: string): string {
  return dirPath.startsWith('~')
    ? path.join(os.homedir(), dirPath.slice(1))
    : path.resolve(dirPath);
}

interface FindUniqueFilenameConfig {
  baseFilename: string;
  targetDir: string;
}

/**
 * Find a unique filename to avoid collisions by adding a number suffix
 */
function findUniqueFilename({
  targetDir,
  baseFilename,
}: FindUniqueFilenameConfig): string {
  const extension = path.extname(baseFilename);
  const nameWithoutExt = path.basename(baseFilename, extension);

  let counter = 0;
  let filename = baseFilename;
  let fullPath = path.join(targetDir, filename);

  // Keep incrementing counter until we find a filename that doesn't exist
  // Limit to 100 attempts to prevent infinite loops
  while (fs.existsSync(fullPath)) {
    counter++;

    if (counter > 100) {
      throw new Error(
        `Unable to find unique filename after 100 attempts for: ${baseFilename}\n` +
          `Target directory: ${targetDir}\n` +
          `This suggests a serious problem with the archive directory or filename generation.`,
      );
    }

    filename = `${nameWithoutExt}_${counter}${extension}`;
    fullPath = path.join(targetDir, filename);
  }

  return filename;
}

interface CreateArchivedFilenameConfig {
  branch: string;
  commitHash: string;
  creationTime: Date;
  optionalString?: string;
  originalFilename: string;
}

/**
 * Create archived filename with timestamp, branch, commit hash, and optional string
 */
function createArchivedFilename({
  originalFilename,
  creationTime,
  branch,
  commitHash,
  optionalString,
}: CreateArchivedFilenameConfig): string {
  const timestamp = formatDateForFilename(creationTime);
  const extension = path.extname(originalFilename);
  const nameWithoutExt = path.basename(originalFilename, extension);

  // Build filename: originalName__timestamp__branch__commitHash[__optionalString].ext
  let filename = `${nameWithoutExt}__${timestamp}__${branch}__${commitHash}`;

  if (optionalString) {
    filename += `__${optionalString}`;
  }

  return `${filename}${extension}`;
}

/**
 * Main function to archive screenshots
 */
async function archiveScreenshots(): Promise<void> {
  // Parse command line arguments
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 [optional-string]')
    .positional('optional-string', {
      describe: 'Optional string to append to archived filenames',
      type: 'string',
    })
    .help('h')
    .alias('h', 'help')
    .version(false).argv;

  // Validate command line arguments
  const args = argv._ as string[];
  let optionalStringArg: string | undefined;

  if (args.length === 0) {
    // No optional string provided - that's fine
    optionalStringArg = undefined;
  } else if (args.length === 1) {
    // One optional string provided - perfect
    optionalStringArg = args[0];
  } else {
    // Too many arguments
    console.error('❌ Error: Too many arguments provided.');
    console.error('Usage: npm run archive-screenshots [optional-string]');
    console.error('Example: npm run archive-screenshots "feature-demo"');
    process.exit(1);
  }

  console.log('🗂️  Starting screenshot archival process...\n');

  // Check if screenshots directory exists
  if (!isValidDirectory(SCREENSHOTS_DIR)) {
    console.error(`❌ Screenshots directory not found: ${SCREENSHOTS_DIR}`);
    process.exit(1);
  }

  // Check if we have an archive directory and if it's valid
  let resolvedArchiveDir: string | null = null;
  if (ARCHIVE_DIR) {
    if (isValidDirectory(ARCHIVE_DIR)) {
      resolvedArchiveDir = resolvePath(ARCHIVE_DIR);
      console.log(`🗄️  Archive directory: ${resolvedArchiveDir}`);
    } else {
      console.error(
        `❌ SCREENSHOT_ARCHIVE_DIR is set but is not a valid directory: ${ARCHIVE_DIR}`,
      );
      console.log('   Please check the path and try again.');
      process.exit(1);
    }
  } else {
    console.log('💡 SCREENSHOT_ARCHIVE_DIR not set.');
    console.log(
      '   Set SCREENSHOT_ARCHIVE_DIR in .env.local to archive screenshots to an external directory.',
    );
    process.exit(0);
  }

  // Get git info
  const branch = getCurrentBranch();
  const commitHash = getCurrentCommitHash();
  console.log(`📋 Git Info: ${branch} (${commitHash})\n`);

  if (optionalStringArg) {
    console.log(`🏷️  Optional string: ${optionalStringArg}`);
  }
  console.log('');

  // Get all PNG files in screenshots directory
  const files = fs
    .readdirSync(SCREENSHOTS_DIR)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .map((file) => path.join(SCREENSHOTS_DIR, file));

  if (files.length === 0) {
    console.log('📷 No PNG screenshots found to archive.');
    return;
  }

  console.log(`📷 Found ${files.length} screenshots to archive:\n`);

  let archivedCount = 0;

  // Process each screenshot file
  for (const filePath of files) {
    const originalFilename = path.basename(filePath);
    const creationTime = getFileCreationTime(filePath);
    const archivedFilename = createArchivedFilename({
      branch,
      commitHash,
      creationTime,
      optionalString: optionalStringArg,
      originalFilename,
    });

    // Find a unique filename to avoid collisions
    const uniqueFilename = findUniqueFilename({
      baseFilename: archivedFilename,
      targetDir: resolvedArchiveDir,
    });
    const destinationPath = path.join(resolvedArchiveDir, uniqueFilename);

    try {
      // Copy file directly to archive directory with COPYFILE_EXCL flag to prevent overwriting
      fs.copyFileSync(filePath, destinationPath, fs.constants.COPYFILE_EXCL);
      console.log(`✅ ${originalFilename} → ${uniqueFilename}`);
      archivedCount++;
    } catch (error) {
      console.error(`❌ Failed to archive ${originalFilename}:`, error);
    }
  }

  console.log(
    `\n🎉 Successfully archived ${archivedCount} screenshots to archive directory!`,
  );
  console.log(`📁 Archive location: ${resolvedArchiveDir}`);
  console.log('\n✨ Screenshot archival complete!');
}

// Run the script
if (require.main === module) {
  archiveScreenshots().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}
