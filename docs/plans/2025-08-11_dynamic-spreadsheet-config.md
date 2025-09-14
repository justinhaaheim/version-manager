# Dynamic Spreadsheet Configuration Plan

## Overview

Replace hardcoded environment variable for spreadsheet ID with user-configurable URL input on settings page.

## Implementation Plan

### 1. Store Structure Updates

- Add `spreadsheetUrl` field for the raw URL text input value
- Add debounced parsing to extract and validate spreadsheet ID
- Keep existing `sheetsConfig` but make it derive from parsed URL
- Add async storage integration for persistence

### 2. URL Parsing

- Parse spreadsheet ID from Google Sheets URL format
- Common formats:
  - `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
  - `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/`
- Validate extracted ID format

### 3. Settings Page UI

- Text input field for Google Sheets URL
- Visual feedback for validation (red ring on error)
- Show current URL from store/async storage
- Debounced validation (1-2 seconds)

### 4. Async Storage Integration

- Save spreadsheet URL when valid
- Load on app initialization
- Create `initializeApp` action in store

### 5. Data Fetching Guards

- Check for valid spreadsheet ID before API calls
- Handle missing/invalid configuration gracefully

## Technical Considerations

- Use Tamagui components for consistent styling
- Implement proper debouncing for validation
- Ensure smooth UX with loading states
- Handle edge cases (invalid URLs, network errors)

## Files to Modify

- `/src/store/mainStore.ts` - Add URL state, actions, async storage
- `/app/(tabs)/settings.tsx` - Add URL input field
- `/src/services/googleSheets.ts` - Update to use dynamic config
- Create new helper for URL parsing
- Update app initialization to load from async storage

## Implementation Complete

All tasks have been successfully implemented:

1. ✅ Created URL parser utility (`src/helpers/googleSheetsUrl.ts`)
2. ✅ Updated store with spreadsheet URL state and async storage integration
3. ✅ Added `initializeApp` action to load from async storage
4. ✅ Added initialization hook in root layout
5. ✅ Added URL input field to settings page with validation
6. ✅ Verified data fetching guards (already in place)

### Refactoring for Single Source of Truth

After initial implementation, refactored to eliminate duplicate state:

- ✅ Moved all state management to Zustand store (no local component state)
- ✅ Implemented debouncing within the store's `setSpreadsheetUrl` action
- ✅ Validation happens immediately on every keystroke for responsive UX
- ✅ Persistence to AsyncStorage is debounced (1.5 seconds)
- ✅ `initializeApp` now uses the same `setSpreadsheetUrl` action for consistency

The app now supports dynamic spreadsheet configuration where users can:

- Paste their Google Sheets URL in settings
- See real-time validation feedback on every keystroke
- Have their configuration persist across app restarts (with debouncing)
- Fallback to environment variable if no user config exists

The architecture maintains a single source of truth in the Zustand store, making the data flow predictable and maintainable.
