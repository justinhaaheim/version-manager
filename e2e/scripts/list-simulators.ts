#!/usr/bin/env ts-node

import {execSync} from 'child_process';

const APP_BUNDLE_ID = 'com.jhaa.healthlogger.devtest';

interface SimulatorDevice {
  dataPath: string;
  dataPathSize: number;
  deviceTypeIdentifier: string;
  isAvailable: boolean;
  lastBootedAt?: string;
  logPath: string;
  name: string;
  state: string;
  udid: string;
}

interface SimulatorList {
  devices: Record<string, SimulatorDevice[]>;
}

interface AppInfo {
  ApplicationType?: string;
  Bundle?: string;
  CFBundleDisplayName?: string;
  CFBundleShortVersionString?: string;
  CFBundleVersion?: string;
}

/**
 * Check if app is installed on a specific simulator
 */
function checkAppInstalled(
  udid: string,
  isBooted: boolean,
): {
  installed: boolean;
  version?: string;
} {
  // Can only check apps on booted simulators
  if (!isBooted) {
    return {installed: false};
  }

  try {
    const output = execSync(`xcrun simctl listapps "${udid}"`, {
      encoding: 'utf8',
    });

    if (!output.includes(APP_BUNDLE_ID)) {
      return {installed: false};
    }

    // Try to get version info
    try {
      const jsonOutput = execSync('plutil -convert json -o - -', {
        encoding: 'utf8',
        input: output,
      });

      const appsData = JSON.parse(jsonOutput) as Record<string, AppInfo>;
      if (appsData[APP_BUNDLE_ID]) {
        const version =
          appsData[APP_BUNDLE_ID].CFBundleShortVersionString ??
          appsData[APP_BUNDLE_ID].CFBundleVersion;
        return {installed: true, version};
      }
    } catch {
      // Failed to get version, but app is installed
      return {installed: true};
    }

    return {installed: true};
  } catch {
    return {installed: false};
  }
}

/**
 * List all available simulators
 */
function listSimulators(): void {
  try {
    const output = execSync('xcrun simctl list devices --json', {
      encoding: 'utf8',
    });
    const data = JSON.parse(output) as SimulatorList;

    console.log('📱 Available iOS Simulators:\n');

    const allDevices: {
      appInfo: ReturnType<typeof checkAppInstalled>;
      device: SimulatorDevice;
      runtime: string;
    }[] = [];

    // Collect all devices
    for (const [runtime, devices] of Object.entries(data.devices)) {
      // Only show iOS simulators
      if (!runtime.includes('iOS')) continue;

      for (const device of devices) {
        if (device.isAvailable) {
          const isBooted = device.state === 'Booted';
          const appInfo = checkAppInstalled(device.udid, isBooted);
          allDevices.push({appInfo, device, runtime});
        }
      }
    }

    // Sort by state (Booted first), then by whether app is installed, then by name
    allDevices.sort((a, b) => {
      // Booted devices first
      if (a.device.state === 'Booted' && b.device.state !== 'Booted') return -1;
      if (a.device.state !== 'Booted' && b.device.state === 'Booted') return 1;

      // Devices with app installed next
      if (a.appInfo.installed && !b.appInfo.installed) return -1;
      if (!a.appInfo.installed && b.appInfo.installed) return 1;

      // Then by name
      return a.device.name.localeCompare(b.device.name);
    });

    // Display devices
    let currentRuntime = '';
    for (const {device, runtime, appInfo} of allDevices) {
      // Show runtime header when it changes
      const runtimeDisplay = runtime.replace(
        'com.apple.CoreSimulator.SimRuntime.',
        '',
      );
      if (runtime !== currentRuntime) {
        currentRuntime = runtime;
        console.log(`\n${runtimeDisplay}:`);
        console.log('─'.repeat(60));
      }

      // Build status indicators
      const stateIcon = device.state === 'Booted' ? '🟢' : '⚪';
      let appStatus = '';

      if (device.state === 'Booted') {
        appStatus = appInfo.installed
          ? `✅ App v${appInfo.version ?? 'unknown'}`
          : '❌ App not installed';
      }

      console.log(
        `${stateIcon} ${device.name.padEnd(25)} ${device.udid}  ${appStatus}`,
      );
    }

    console.log('\n💡 Tips:');
    console.log('- 🟢 = Currently booted (app status shown)');
    console.log('- ⚪ = Shutdown (boot simulator to check app status)');
    console.log(`- ✅ = ${APP_BUNDLE_ID} is installed`);
    console.log(`- ❌ = ${APP_BUNDLE_ID} is not installed`);
    console.log(
      '\n📋 Copy a UUID and use it with: npm run test-e2e:all -- --device "UUID"',
    );
    console.log('📋 To boot a simulator: xcrun simctl boot "UUID"');
    console.log('📋 To shutdown a simulator: xcrun simctl shutdown "UUID"');
  } catch (error) {
    console.error('❌ Failed to list simulators:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  listSimulators();
}

export {listSimulators};
