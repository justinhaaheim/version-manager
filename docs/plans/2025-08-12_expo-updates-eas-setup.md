# Expo Updates & EAS Update Setup

Date: 2025-08-12

## Goal

Add expo-updates to enable OTA updates via EAS Update service, specifically for previewing updates in development builds.

## Key Concepts to Understand

- How iOS builds work with EAS Update
- Versioning strategy for native builds vs JS/React Native code
- Compatibility between builds and updates

## Work Plan

### 1. Install expo-updates package

- Add expo-updates dependency
- Run prebuild if needed

### 2. Configure EAS Update

- Set up eas.json configuration
- Configure app.json/app.config.js for updates
- Set up update channels

### 3. Configure for Development Builds

- Enable development client features
- Set up update preview functionality
- Configure runtime version strategy

### 4. Test & Document

- Verify configuration
- Document the update flow
- Explain versioning strategy

## Progress

- [x] Install expo-updates
- [x] Configure EAS settings
- [x] Set up development build preview
- [x] Test configuration
- [x] Document findings

## Notes

- Development builds can preview updates directly from the device
- Need to understand runtime version vs native version
- Updates only affect JS bundle, not native code

## Key Findings - How EAS Update Works with iOS Builds

### Runtime Version Strategy

We're using `policy: 'appVersion'` which means the runtime version is derived from the app version in package.json. This ensures:

- Updates can only be applied to builds with matching runtime versions
- Prevents incompatible JS from running on older native code
- Simple versioning: bump package.json version when native code changes

### The Build/Update Relationship

1. **Native Build** = iOS binary with specific native modules compiled in
2. **JS Bundle Update** = JavaScript/React Native code that runs on top of the native layer
3. **Runtime Version** = The compatibility contract between them

### Update Channels

- `development` - For dev builds (testing updates)
- `preview` - For preview/beta builds
- `production` - For production releases

### Development Build Preview Flow

1. Build a development build with expo-updates included
2. Publish updates via `eas update --branch development --message "..."`
3. In the app's Settings screen, tap "Check for Updates"
4. Download and apply updates without rebuilding the native app

### When You Need a New Native Build

- Adding/removing native modules
- Changing iOS permissions or Info.plist
- Updating Expo SDK version
- Changing native configuration

### When OTA Updates Work

- Changing React components
- Updating business logic
- Modifying styles
- Adding/removing JS-only dependencies
- Asset changes (images, fonts)
