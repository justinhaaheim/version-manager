#!/usr/bin/env ts-node

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';

import {listSimulators} from './list-simulators';
import {ensureE2ESimulator, getE2ESimulatorName} from './setup-e2e-simulator';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'e2e', 'screenshots');
const TMP_SCREENSHOTS_DIR = path.join(SCREENSHOTS_DIR, 'tmp');
const FLOWS_DIR = path.join(process.cwd(), 'e2e', 'screenshot_flows');

// Define available themes and screenshot targets
const AVAILABLE_THEMES = ['light', 'dark'] as const;
type ThemeName = (typeof AVAILABLE_THEMES)[number];

const AVAILABLE_SCREENSHOT_TARGETS = ['home', 'settings'] as const;
type ScreenshotTarget = (typeof AVAILABLE_SCREENSHOT_TARGETS)[number];

// Define which flows can capture which screenshot targets
const FLOW_CAPABILITIES = {
  'home_screen_capture.yaml': ['home'] as const,
  'settings_screen_capture.yaml': ['settings'] as const,
} as const;

type FlowFile = keyof typeof FLOW_CAPABILITIES;

interface ScreenshotTest {
  description: string;
  env: Record<string, string>;
  flowFile: FlowFile;
  requiresSetup: boolean;
  targets: ScreenshotTarget[];
  theme: ThemeName; // whether this test needs recording setup
}

/**
 * Check if a directory exists and is accessible
 */
function isValidDirectory(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true});
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

interface RunMaestroTestConfig {
  deviceUUID?: string;
  env: Record<string, string>;
  flowFile: string;
}

/**
 * Run a maestro test with the specified environment
 */
function runMaestroTest({
  flowFile,
  env,
  deviceUUID,
}: RunMaestroTestConfig): void {
  const flowPath = path.join(FLOWS_DIR, flowFile);

  if (!fs.existsSync(flowPath)) {
    console.error(`❌ Flow file not found: ${flowPath}`);
    return;
  }

  try {
    console.log(`📸 Running ${flowFile}...`);

    // Build command with -e parameters for Maestro
    const envParams = Object.entries(env)
      .map(([key, value]) => `-e ${key}=${value}`)
      .join(' ');

    // Add device specification if provided (use --device for UUID)
    const deviceParam = deviceUUID ? `--device "${deviceUUID}"` : '';

    const command = `maestro ${deviceParam} test ${envParams} "${flowPath}"`
      .replace(/\s+/g, ' ')
      .trim();
    execSync(command, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log(`✅ Completed ${flowFile}`);
  } catch (error) {
    console.error(`❌ Failed to run ${flowFile}:`, error);
    throw error;
  }
}

/**
 * Parse and validate screenshot target selection
 */
function parseScreenshotTargets(targets?: string[]): ScreenshotTarget[] {
  if (!targets || targets.length === 0) {
    // Return all targets if none specified
    return [...AVAILABLE_SCREENSHOT_TARGETS];
  }

  const selectedTargets: ScreenshotTarget[] = [];
  const invalidTargets: string[] = [];

  for (const target of targets) {
    if (AVAILABLE_SCREENSHOT_TARGETS.includes(target as ScreenshotTarget)) {
      selectedTargets.push(target as ScreenshotTarget);
    } else {
      invalidTargets.push(target);
    }
  }

  if (invalidTargets.length > 0) {
    console.error(
      `❌ Invalid screenshot targets: ${invalidTargets.join(', ')}`,
    );
    console.error(
      `Available targets: ${AVAILABLE_SCREENSHOT_TARGETS.join(', ')}`,
    );
    process.exit(1);
  }

  return selectedTargets;
}

/**
 * Generate optimized test queue from requested targets and themes
 */
function generateTestQueue(
  targets: ScreenshotTarget[],
  themes: ThemeName[],
  screenshotDir: string,
): ScreenshotTest[] {
  const tests: ScreenshotTest[] = [];

  for (const theme of themes) {
    // Group targets by the flows that can capture them
    const flowGroups = new Map<FlowFile, ScreenshotTarget[]>();

    for (const target of targets) {
      // Find which flow can capture this target
      let flowFile: FlowFile | undefined;

      if (target === 'home') {
        flowFile = 'home_screen_capture.yaml';
      } else if (target === 'settings') {
        flowFile = 'settings_screen_capture.yaml';
      }

      if (!flowFile) {
        console.error(`❌ No flow found for target: ${target}`);
        process.exit(1);
      }

      if (!flowGroups.has(flowFile)) {
        flowGroups.set(flowFile, []);
      }
      const existingTargets = flowGroups.get(flowFile);
      if (existingTargets) {
        existingTargets.push(target);
      }
    }

    // Create tests for each flow group
    for (const [flowFile, flowTargets] of flowGroups) {
      const baseEnv: Record<string, string> = {
        MAESTRO_SCREENSHOT_OUTPUT_DIR: screenshotDir,
        clearState: 'false',
        testAppearanceMode: theme,
      };

      const testEnv = {...baseEnv};
      const description = `${theme} mode: ${flowTargets.join(', ')}`;
      let requiresSetup = false;

      if (flowFile === 'home_screen_capture.yaml') {
        // The home screen is the only screen that we want to setup recordings for
        requiresSetup = true;
      }

      tests.push({
        description,
        env: testEnv,
        flowFile,
        requiresSetup,
        targets: flowTargets,
        theme,
      });
    }
  }

  return tests;
}

/**
 * Validate that all required flow files exist
 */
function validateFlowFiles(): void {
  const requiredFlows = Object.keys(FLOW_CAPABILITIES);
  for (const flowFile of requiredFlows) {
    const flowPath = path.join(FLOWS_DIR, flowFile);
    if (!fs.existsSync(flowPath)) {
      console.error(`❌ Required flow file not found: ${flowPath}`);
      process.exit(1);
    }
  }
}

interface LaunchAppWithThemeConfig {
  clearState: boolean;
  deviceUUID?: string;
  theme: ThemeName;
}

/**
 * Launch app with specific theme and run setup
 */
function launchAppWithTheme({
  theme,
  clearState,
  deviceUUID,
}: LaunchAppWithThemeConfig): void {
  console.log(
    `🚀 Launching app in ${theme} mode${clearState ? ' (clearing state)' : ''}...`,
  );
  try {
    const testEnv = {
      clearState: 'false',
      testAppearanceMode: theme,
    };

    const launchFlow = clearState
      ? 'launch_app_and_clear_state.yaml'
      : 'launch_app_only.yaml';
    runMaestroTest({
      deviceUUID,
      env: testEnv,
      flowFile: launchFlow,
    });
  } catch (error) {
    console.error(`❌ Failed to launch app in ${theme} mode:`, error);
    throw error;
  }
}

/**
 * Execute a queue of screenshot tests
 */
function executeTestQueue(
  tests: ScreenshotTest[],
  deviceUUID: string,
  clearState: boolean,
): void {
  console.log(`\n📋 Executing ${tests.length} screenshot tests...\n`);

  let currentTheme: ThemeName | null = null;

  for (const [index, test] of tests.entries()) {
    console.log(`📸 Test ${index + 1}/${tests.length}: ${test.description}`);

    // Launch app if theme changed or if this is the first test
    if (currentTheme !== test.theme) {
      console.log(`🚀 Launching app in ${test.theme} mode...`);
      launchAppWithTheme({
        clearState: clearState && currentTheme === null,
        // Only clear state on first launch
        deviceUUID,
        theme: test.theme,
      });
      currentTheme = test.theme;
    }

    // Run the test
    console.log(
      `🎬 Running ${test.flowFile} for ${test.targets.join(', ')}...`,
    );
    runMaestroTest({
      deviceUUID,
      env: test.env,
      flowFile: test.flowFile,
    });

    console.log(`✅ Completed: ${test.description}\n`);
  }

  console.log(`🎉 All ${tests.length} tests completed successfully!`);
}

/**
 * Main function to run screenshot tests
 */
async function runScreenshotTests(): Promise<void> {
  // Parse command line arguments
  const argv = await yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('renderToTmpDir', {
      alias: 'tmp',
      default: false,
      description:
        'Save screenshots to e2e/screenshots/tmp instead of e2e/screenshots',
      type: 'boolean',
    })
    .option('screenshotDir', {
      alias: 'dir',
      description: 'Custom screenshot directory (overrides --renderToTmpDir)',
      type: 'string',
    })
    .option('targets', {
      alias: 't',
      default: AVAILABLE_SCREENSHOT_TARGETS,
      description: `Screenshot targets to capture: ${AVAILABLE_SCREENSHOT_TARGETS.join(', ')}`,
      type: 'array',
    })
    .option('themes', {
      alias: 'theme',
      default: AVAILABLE_THEMES,
      description: `Themes to test: ${AVAILABLE_THEMES.join(', ')}`,
      type: 'array',
    })
    .option('clearState', {
      alias: 'clear-state',
      default: false,
      description:
        'Clear app state before launching (use launch_app_and_clear_state.yaml)',
      type: 'boolean',
    })
    .option('skipInstall', {
      alias: 'skip-install',
      default: false,
      description:
        'Skip automatic app installation/rebuild (app must already be installed)',
      type: 'boolean',
    })
    .option('deviceUuid', {
      alias: 'device',
      description:
        'Use specific device UUID instead of E2E simulator (implies --skip-install)',
      type: 'string',
    })
    .option('listDevices', {
      alias: 'list',
      default: false,
      description:
        'List available simulators with their UUIDs and app installation status',
      type: 'boolean',
    })
    .help('h')
    .alias('h', 'help')
    .version(false)
    .example('$0', 'Run all tests with default settings')
    .example('$0 --renderToTmpDir', 'Run all tests, save to tmp directory')
    .example(
      '$0 --targets home --themes light',
      'Capture only home screenshots in light mode',
    )
    .example(
      '$0 -t home recording -theme dark --tmp',
      'Capture home and recording screenshots in dark mode to tmp directory',
    )
    .example('$0 --clear-state', 'Run all tests with app state cleared')
    .example(
      '$0 --skip-install',
      'Run tests without rebuilding the app (app must be already installed)',
    )
    .example(
      '$0 --device "ABCD-1234-5678"',
      'Run tests on specific device UUID (skips rebuild)',
    )
    .example(
      '$0 --list-devices',
      'List available simulators with their UUIDs and app status',
    ).argv;

  // Handle list devices option
  if (argv.listDevices) {
    listSimulators();
    process.exit(0);
  }

  console.log('🎬 Starting orchestrated Maestro screenshot tests...\n');

  // Parse and validate selections
  const selectedTargets = parseScreenshotTargets(argv.targets as string[]);
  const selectedThemes = (argv.themes as string[]) || AVAILABLE_THEMES;

  // Validate themes
  const invalidThemes = selectedThemes.filter(
    (theme) => !AVAILABLE_THEMES.includes(theme as ThemeName),
  );
  if (invalidThemes.length > 0) {
    console.error(`❌ Invalid theme names: ${invalidThemes.join(', ')}`);
    console.error(`Available themes: ${AVAILABLE_THEMES.join(', ')}`);
    process.exit(1);
  }

  // Log what we're capturing
  if (selectedTargets.length < AVAILABLE_SCREENSHOT_TARGETS.length) {
    console.log(`🎯 Capturing selected targets: ${selectedTargets.join(', ')}`);
  }

  if (selectedThemes.length < AVAILABLE_THEMES.length) {
    console.log(`🎨 Using selected themes: ${selectedThemes.join(', ')}`);
  }

  // Determine screenshot directory
  let screenshotDir: string;

  if (argv.screenshotDir) {
    screenshotDir = path.resolve(argv.screenshotDir);
    console.log(`📁 Using custom screenshot directory: ${screenshotDir}`);
  } else if (argv.renderToTmpDir) {
    screenshotDir = TMP_SCREENSHOTS_DIR;
    console.log(`📁 Using tmp screenshot directory: ${screenshotDir}`);
  } else {
    screenshotDir = SCREENSHOTS_DIR;
    console.log(`📁 Using default screenshot directory: ${screenshotDir}`);
  }

  // Ensure the target directory exists
  ensureDirectoryExists(screenshotDir);

  // Validate flows directory exists
  if (!isValidDirectory(FLOWS_DIR)) {
    console.error(`❌ Screenshot flows directory not found: ${FLOWS_DIR}`);
    process.exit(1);
  }

  // Validate that all required flow files exist
  validateFlowFiles();

  // Generate optimized test queue
  const testQueue = generateTestQueue(
    selectedTargets,
    selectedThemes as ThemeName[],
    screenshotDir,
  );

  console.log(
    `📋 Generated ${testQueue.length} optimized tests from ${selectedTargets.length} targets × ${selectedThemes.length} themes`,
  );

  let deviceUUID: string;
  let deviceName: string;

  // Determine which device to use
  if (argv.deviceUuid) {
    // Use specified device UUID
    deviceUUID = argv.deviceUuid;
    deviceName = `Custom Device (${deviceUUID})`;
    console.log(`📱 Using specified device: ${deviceName}`);

    if (!argv.skipInstall) {
      console.log(`💡 Note: --device-uuid implies --skip-install`);
    }
  } else {
    // Set up E2E simulator
    console.log('🔧 Setting up E2E testing environment...');

    // Skip install if requested or if using custom device
    const skipInstall = argv.skipInstall || !!argv.deviceUuid;

    deviceUUID = ensureE2ESimulator({
      autoInstallApp: !skipInstall,
      resetToCleanState: false, // Reset is controlled by clearState flag
    });
    deviceName = getE2ESimulatorName();
    console.log(`📱 Using E2E simulator: ${deviceName} (${deviceUUID})`);

    if (skipInstall) {
      console.log(
        `⚠️  Skipping app installation/rebuild. App must already be installed.`,
      );
    }
  }

  try {
    // Execute the test queue
    executeTestQueue(testQueue, deviceUUID, argv.clearState);

    console.log(`📁 Screenshots saved to: ${screenshotDir}`);

    if (argv.renderToTmpDir || argv.screenshotDir) {
      console.log(
        "💡 Tip: These screenshots are in a temporary location and won't overwrite your committed screenshots.",
      );
    }

    console.log('\n✨ Screenshot tests complete!');
  } catch (error) {
    console.error(`\n❌ Test execution failed:`, error);
    console.error('Screenshots may be partially generated.');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  runScreenshotTests().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}
