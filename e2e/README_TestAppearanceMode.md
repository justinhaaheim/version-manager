# Test Appearance Mode for E2E Testing

This document explains how to control the app's appearance mode (light/dark) during E2E testing with Maestro.

## Overview

We've implemented custom hooks that handle appearance mode control via universal links and provide test IDs for verification. This provides a reliable way to test both light and dark modes without depending on simulator settings.

## Usage

### In Maestro Flows

Use universal links with the `testAppearanceMode` parameter to control appearance:

```yaml
# Light mode
- openLink:
    link: 'voice-recorder-dev://universal?testAppearanceMode=light'
    autoVerify: true

# Dark mode
- openLink:
    link: 'voice-recorder-dev://universal?testAppearanceMode=dark'
    autoVerify: true
```

### Verifying Appearance Mode

Test for the current appearance mode using the generated test IDs:

```yaml
# Verify light mode
- assertVisible: {id: 'testAppearanceModeIsLight'}

# Verify dark mode
- assertVisible: {id: 'testAppearanceModeIsDark'}
```

### Supported Values

- `'light'` - Forces the app into light mode
- `'dark'` - Forces the app into dark mode
- Any other value - Logs a warning but doesn't crash
- Omitted - App uses normal theme logic (device setting + user preference)

## Implementation Details

### Hook: `useTestAppearanceMode`

Located in `src/hooks/useTestAppearanceMode.ts`, this hook:

- Uses `useLayoutEffect` for synchronous execution before rendering
- Reads URL parameters using `useURL` from `expo-linking`
- Calls `Appearance.setColorScheme()` to set the appearance mode
- Gracefully handles errors when URLs can't be parsed
- Logs informative messages for debugging

### Hook: `useAppearanceModeTestId`

Located in `src/hooks/useAppearanceModeTestId.ts`, this hook:

- Subscribes to appearance mode changes using `Appearance.addChangeListener`
- Returns test ID strings based on current appearance mode:
  - `'testAppearanceModeIsLight'` for light mode
  - `'testAppearanceModeIsDark'` for dark mode
  - `'testAppearanceModeIsUnknown'` for unknown/null mode
- Updates automatically when appearance mode changes

### Universal Route Handler

Located in `src/app/universal.tsx`, this route:

- Processes the `testAppearanceMode` URL parameter
- **Automatically clears any saved explicit theme preference** from AsyncStorage to ensure the system appearance setting takes precedence
- Redirects to the home screen after processing
- Provides proper logging for debugging

### Integration

Both hooks are called in `RootLayoutWithTamagui` component in `src/app/_layout.tsx`:

- `useTestAppearanceMode` handles incoming universal link parameters
- `useAppearanceModeTestId` provides verification test IDs
- The appearance test ID is attached to the main container view for Maestro verification

## Benefits

1. **Reliability**: No dependency on simulator state or manual setup
2. **Consistency**: Same command works across different environments
3. **Verification**: Built-in test IDs to confirm appearance mode changes
4. **Parallelization**: Different test runs can use different modes simultaneously
5. **Debugging**: Clear logging for troubleshooting
6. **Graceful Degradation**: Works in development/production without errors

## Example Flows

See the updated screenshot flows in `e2e/screenshot_flows/` for examples of how this is used in practice.

## Testing the Implementation

Run the test flow to validate the functionality:

```bash
maestro test e2e/test_appearance_mode.yaml
```

## Universal Link Structure

The app expects universal links in this format:

```
voice-recorder-dev://universal?testAppearanceMode=<mode>
```

Where `<mode>` is either `light` or `dark`.
