#!/usr/bin/env ts-node

import type * as semverTypes from 'semver';

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import projectVersions from '../../projectVersions.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const semver = require('semver') as typeof semverTypes;

const E2E_SIMULATOR_NAME = '[E2E][VR] iPhone 16 Pro';
const DEVICE_TYPE = 'iPhone 16 Pro';
const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-18-3'; // Match development environment
const APP_BUNDLE_ID = 'com.jhaa.healthlogger.devtest'; // Your app's bundle ID

interface SimulatorDevice {
  name: string;
  state: string;
  udid: string;
}

interface SimulatorList {
  devices: Record<string, SimulatorDevice[]>;
}

/**
 * Get simulator UUID by name
 */
function getSimulatorUUID(name: string): string | null {
  try {
    const output = execSync('xcrun simctl list devices --json', {
      encoding: 'utf8',
    });
    const devices = JSON.parse(output) as SimulatorList;

    // Look through all runtime versions
    for (const runtime of Object.keys(devices.devices)) {
      for (const device of devices.devices[runtime]) {
        if (device.name === name) {
          return device.udid;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to list simulators:', error);
    return null;
  }
}

interface CreateSimulatorConfig {
  deviceType: string;
  name: string;
  runtime: string;
}

/**
 * Create a new simulator
 */
function createSimulator({
  name,
  deviceType,
  runtime,
}: CreateSimulatorConfig): string {
  try {
    console.log(`📱 Creating E2E simulator: ${name}...`);
    const output = execSync(
      `xcrun simctl create "${name}" "${deviceType}" "${runtime}"`,
      {encoding: 'utf8'},
    );
    const uuid = output.trim();
    console.log(`✅ Created simulator with UUID: ${uuid}`);
    return uuid;
  } catch (error) {
    console.error('Failed to create simulator:', error);
    throw error;
  }
}

/**
 * Reset simulator to clean state
 */
function _resetSimulator(uuid: string): void {
  try {
    console.log(`🧹 Resetting simulator to clean state...`);
    execSync(`xcrun simctl erase "${uuid}"`, {stdio: 'inherit'});
    console.log(`✅ Simulator reset complete`);
  } catch (error) {
    console.error('Failed to reset simulator:', error);
    throw error;
  }
}

/**
 * Check simulator state
 */
function getSimulatorState(uuid: string): string {
  try {
    const output = execSync(`xcrun simctl list devices | grep "${uuid}"`, {
      encoding: 'utf8',
    });

    if (output.includes('(Booted)')) return 'Booted';
    if (output.includes('(Shutdown)')) return 'Shutdown';
    return 'Unknown';
  } catch (error) {
    console.error('Failed to get simulator state:', error);
    return 'Unknown';
  }
}

/**
 * Boot simulator if not already booted
 */
function bootSimulator(uuid: string): void {
  // Check current state first
  const currentState = getSimulatorState(uuid);
  console.log(`📱 Simulator state: ${currentState}`);

  if (currentState === 'Booted') {
    console.log(`ℹ️  Simulator already booted`);
    return;
  }

  try {
    console.log(`🚀 Booting simulator...`);
    execSync(`xcrun simctl boot "${uuid}"`, {stdio: 'inherit'});

    // Wait for boot to complete
    console.log(`⏳ Waiting for simulator to boot...`);
    execSync(`xcrun simctl bootstatus "${uuid}" -b`, {stdio: 'inherit'});
    console.log(`✅ Simulator booted successfully`);
  } catch (error) {
    console.error('Failed to boot simulator:', error);
    throw error;
  }
}

interface PackageJsonType {
  version?: string;
}

/**
 * Get current project version from package.json
 * @deprecated Use direct import instead: projectVersions.appVersion
 */
function getCurrentProjectVersionLegacy(): string {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const parsedPackageJson = JSON.parse(packageContent) as PackageJsonType;
    return parsedPackageJson.version ?? 'unknown';
  } catch (error) {
    console.error('Failed to read project version:', error);
    return 'unknown';
  }
}

/**
 * Format version string to valid semver (copied from app.config.ts)
 */
function getFormattedVersion(versionString: string): string | null {
  return semver.valid(semver.coerce(versionString));
}

/**
 * Get current project version from package.json
 */
function getCurrentProjectVersion(): string {
  try {
    const rawVersion = projectVersions.codeVersion ?? 'unknown';
    if (rawVersion === 'unknown') {
      return rawVersion;
    }

    // Format version to valid semver
    const formattedVersion = getFormattedVersion(rawVersion);
    return formattedVersion ?? rawVersion;
  } catch (error) {
    console.error(
      'Failed to get project version from import, falling back to legacy method:',
      error,
    );
    return getCurrentProjectVersionLegacy();
  }
}

interface AppQueryConfig {
  bundleId: string;
  uuid: string;
}

/**
 * Check if app is installed on simulator
 */
function isAppInstalled({uuid, bundleId}: AppQueryConfig): boolean {
  try {
    const output = execSync(`xcrun simctl listapps "${uuid}"`, {
      encoding: 'utf8',
    });
    return output.includes(bundleId);
  } catch (error) {
    console.error('Failed to check installed apps:', error);
    return false;
  }
}

type AppInfo = Record<
  string,
  {
    ApplicationType?: string;
    Bundle?: string;
    CFBundleDisplayName?: string;
    CFBundleShortVersionString?: string;
    CFBundleVersion?: string;
  }
>;

/**
 * Get installed app version from simulator
 */
function getInstalledAppVersion({
  uuid,
  bundleId,
}: AppQueryConfig): string | null {
  try {
    // Get apps list and convert to JSON using plutil
    const plistOutput = execSync(`xcrun simctl listapps "${uuid}"`, {
      encoding: 'utf8',
    });

    // Convert plist to JSON using plutil
    const jsonOutput = execSync('plutil -convert json -o - -', {
      encoding: 'utf8',
      input: plistOutput,
    });

    const appsData = JSON.parse(jsonOutput) as AppInfo;

    if (appsData[bundleId]) {
      // Return CFBundleShortVersionString (marketing version) if available, otherwise CFBundleVersion
      return (
        appsData[bundleId].CFBundleShortVersionString ??
        appsData[bundleId].CFBundleVersion ??
        null
      );
    }
    return null;
  } catch (error) {
    console.error('Failed to get app version:', error);
    return null;
  }
}

/**
 * Get app info if installed
 */
function getAppInfo({uuid, bundleId}: AppQueryConfig): string | null {
  try {
    const output = execSync(
      `xcrun simctl listapps "${uuid}" | grep -A 10 -B 2 "${bundleId}"`,
      {
        encoding: 'utf8',
      },
    );
    return output.trim();
  } catch (error) {
    console.error('Failed to get app info:', error);
    return null;
  }
}

/**
 * Install app on simulator using the build:development script
 */
function installAppOnSimulator(uuid: string): void {
  try {
    console.log(
      `📦 Installing app on simulator using build:development script...`,
    );
    console.log(
      `   This includes prebuild:clean and may take a few minutes...`,
    );

    // Use the build:development script which includes prebuild:clean
    execSync(`npm run build:development:no-device -- --device "${uuid}"`, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    console.log(`✅ App installation completed`);
  } catch (error) {
    console.error('Failed to install app:', error);
    throw error;
  }
}

interface EnsureE2ESimulatorConfig {
  autoInstallApp?: boolean;
  resetToCleanState?: boolean;
}

/**
 * Ensure E2E simulator exists and is ready
 * Returns the simulator UUID
 */
export function ensureE2ESimulator({
  resetToCleanState = false,
  autoInstallApp = true,
}: EnsureE2ESimulatorConfig = {}): string {
  console.log(`🔧 Setting up E2E simulator: ${E2E_SIMULATOR_NAME}...`);

  // Check if simulator already exists
  let uuid = getSimulatorUUID(E2E_SIMULATOR_NAME);

  if (!uuid) {
    // Create new simulator
    uuid = createSimulator({
      deviceType: DEVICE_TYPE,
      name: E2E_SIMULATOR_NAME,
      runtime: RUNTIME,
    });
  } else {
    console.log(`📱 Found existing E2E simulator: ${uuid}`);
  }

  // Reset to clean state if requested (currently disabled - use Maestro clearState instead)
  if (resetToCleanState) {
    console.log(
      `⚠️  Simulator reset requested but disabled. Use Maestro clearState: ${APP_BUNDLE_ID} instead.`,
    );
    // resetSimulator(uuid); // Disabled - causes issues with booted simulators
  }

  // Boot simulator
  bootSimulator(uuid);

  // Check if app is installed and version
  console.log(`🔍 Checking if app is installed...`);
  const appQueryConfig = {bundleId: APP_BUNDLE_ID, uuid};
  const appInstalled = isAppInstalled(appQueryConfig);
  const currentProjectVersion = getCurrentProjectVersion();

  if (appInstalled) {
    console.log(`✅ App is already installed: ${APP_BUNDLE_ID}`);

    // Check version compatibility
    const installedVersion = getInstalledAppVersion(appQueryConfig);
    console.log(`📦 Project version: ${currentProjectVersion}`);
    console.log(`📱 Installed version: ${installedVersion ?? 'unknown'}`);

    if (installedVersion && installedVersion === currentProjectVersion) {
      console.log(`✅ Version match! App is up to date.`);
      const appInfo = getAppInfo(appQueryConfig);
      if (appInfo) {
        console.log(`ℹ️  App details:\n${appInfo}`);
      }
    } else {
      console.log(`⚠️  Version mismatch detected!`);
      if (autoInstallApp) {
        console.log(`🔄 Updating app to current version...`);

        try {
          installAppOnSimulator(uuid);

          // Verify new version
          const newInstalledVersion = getInstalledAppVersion(appQueryConfig);
          if (newInstalledVersion === currentProjectVersion) {
            console.log(
              `✅ App successfully updated to version ${newInstalledVersion}`,
            );
          } else {
            console.log(
              `⚠️  App update completed but version may not match. This might be normal.`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to update app. You can manually update with:`,
          );
          console.log(`   npm run build:development -- --device "${uuid}"`);
          throw error;
        }
      } else {
        console.log(`💡 To update the app manually, run:`);
        console.log(`   npm run build:development -- --device "${uuid}"`);
      }
    }
  } else {
    console.log(`⚠️  App not found: ${APP_BUNDLE_ID}`);

    if (autoInstallApp) {
      console.log(`🚀 Installing app automatically...`);

      try {
        installAppOnSimulator(uuid);

        // Verify installation
        const appNowInstalled = isAppInstalled(appQueryConfig);
        if (appNowInstalled) {
          console.log(`✅ App successfully installed: ${APP_BUNDLE_ID}`);
        } else {
          console.log(
            `⚠️  App installation completed but app not detected. This might be normal.`,
          );
        }
      } catch (error) {
        console.error(
          `❌ Automatic installation failed. You can manually install with:`,
        );
        console.log(`   npm run build:development -- --device "${uuid}"`);
        throw error;
      }
    } else {
      console.log(`💡 To install the app manually, run:`);
      console.log(`   npm run build:development -- --device "${uuid}"`);
    }
  }

  console.log(`✅ E2E simulator ready: ${E2E_SIMULATOR_NAME} (${uuid})`);
  return uuid;
}

/**
 * Get the E2E simulator name for use in Maestro commands
 */
export function getE2ESimulatorName(): string {
  return E2E_SIMULATOR_NAME;
}

/**
 * Check if the app is installed on the E2E simulator
 */
export function checkAppInstallation(): {
  installed: boolean;
  uuid: string | null;
} {
  const uuid = getSimulatorUUID(E2E_SIMULATOR_NAME);
  if (!uuid) {
    return {installed: false, uuid: null};
  }

  const installed = isAppInstalled({bundleId: APP_BUNDLE_ID, uuid});
  return {installed, uuid};
}

// If run directly, set up the simulator
if (require.main === module) {
  const resetFlag = process.argv.includes('--reset');
  const skipInstallFlag = process.argv.includes('--skip-install');

  try {
    const uuid = ensureE2ESimulator({
      autoInstallApp: !skipInstallFlag,
      resetToCleanState: resetFlag,
    });
    console.log(`\n🎯 E2E Simulator UUID: ${uuid}`);
    console.log(`🎯 E2E Simulator Name: ${E2E_SIMULATOR_NAME}`);

    if (skipInstallFlag) {
      console.log(
        `💡 App installation was skipped. Use --reset to enable automatic installation.`,
      );
    }
  } catch (error) {
    console.error('❌ Failed to set up E2E simulator:', error);
    process.exit(1);
  }
}
