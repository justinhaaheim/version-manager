# Test Scenarios with Deep Linking - Implementation Plan

## Overview

Implement deep linking to load test scenarios with mock Google Sheets data, accessible via Maestro tests or clickable links in the Settings screen.

## Goals

1. Deep link to specific test scenarios (e.g., `healthlogger://test/overlapping-meds`)
2. Mock data at the API return level (can paste real spreadsheet CSV data)
3. Add clickable test scenario links in Settings screen (dev mode only)
4. Make it easy to test different medication timeline configurations

## Implementation Plan

### 1. Deep Linking Setup

- [ ] Configure Expo deep linking for `healthlogger://` scheme
- [ ] Add test route handler for `healthlogger://test/:scenario`
- [ ] Ensure deep links work in development build

### 2. Mock Data Infrastructure

- [ ] Create test scenarios with real CSV format data
- [ ] Mock at the Google Sheets API response level
- [ ] Store mock scenarios with descriptive names
- [ ] Support dynamic scenario loading

### 3. Settings Screen Integration

- [ ] Add "Test Scenarios" section in Settings (dev only)
- [ ] Create clickable links for each scenario
- [ ] Show current active scenario
- [ ] Add "Clear Test Data" option

### 4. Test Scenarios

- [ ] Standard day scenario
- [ ] Overlapping medications scenario
- [ ] Edge cases (near expiry, max doses)
- [ ] Empty/no data scenario
- [ ] Multiple users scenario

## Technical Details

### Deep Link Format

```
healthlogger://test/[scenario-name]
```

### Mock Data Storage

Store CSV-format mock data that matches actual Google Sheets response format:

- Location: `src/test/scenarios/`
- Format: CSV strings matching real data
- Can copy/paste from actual spreadsheet

### State Management

- Add test scenario state to store
- Override API responses when test scenario active
- Clear on app restart or manual clear

## Progress

### Step 1: Configure Deep Linking ✅

- ✅ Added Expo Linking import to root layout
- ✅ Created deep link handler for test scenarios
- ✅ Added support for `healthlogger://test/:scenario` URLs

### Step 2: Create Mock Data Infrastructure ✅

- ✅ Created test store with Zustand for managing mock data
- ✅ Built test scenarios with real CSV format
- ✅ Modified Google Sheets service to return mock data when test mode is active

### Step 3: Update Settings Screen ✅

- ✅ Added Test Scenarios card (dev mode only)
- ✅ Created clickable links for each scenario
- ✅ Shows current active scenario
- ✅ Added "Clear Test Data" option

### Step 4: Create Test Scenarios ✅

- ✅ Standard day scenario
- ✅ Overlapping medications scenario
- ✅ Edge cases (near expiry, max doses)
- ✅ Empty/no data scenario
- ✅ Multiple users scenario
- ✅ Created Maestro test file demonstrating usage

## Implementation Complete

The test scenario infrastructure is now ready to use. You can:

1. **Via Deep Links**: Open `health-logger-dev://test/standard` to load the standard scenario
2. **Via Settings UI**: Go to Settings > Test Scenarios and tap any scenario button
3. **Via Maestro**: Run `maestro test e2e/test-scenarios.yaml`
4. **Copy Real Data**: Edit `src/test/scenarios/index.ts` and paste CSV data into the `realData` scenario

## Notes

- Deep links only work in development builds
- Mock data persists until cleared or app restart
- Can paste real spreadsheet data for testing
