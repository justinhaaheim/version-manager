# Google Sheets API Visibility & Debug Store Implementation

## Goal

Add visibility into Google Sheets API request lifecycle, implement retry strategies, and centralize debug parameters in a new devStore.

## Plan

### 1. Create devStore with debug parameters

- Create `/src/store/devStore.ts`
- Add debug flags:
  - `DEBUG_QUERY_LIFECYCLE`: Enable console.debug for query lifecycle
  - `SHOW_REQUEST_INFO_ON_HOME_SCREEN`: Show request status on home screen
  - Any other existing debug flags in codebase
- Add request status messages to devStore state
- Export hooks for individual parameters (not the store itself)

### 2. Add comprehensive logging to useGoogleSheetsData

- Log query lifecycle events (start, success, error, retry)
- Use tanstack query callbacks:
  - `onSuccess`
  - `onError`
  - `onSettled`
- Track retry attempts
- Measure request timing

### 3. Add logging to googleSheetsService

- Log request start/end times
- Log connection errors vs timeouts
- Track response times

### 4. Display request info on home screen

- Find the component showing "Updated Xm ago"
- Add conditional rendering based on `SHOW_REQUEST_INFO_ON_HOME_SCREEN`
- Show current request status from devStore

### 5. Add Dev Settings card to SettingsScreen

- Display all debug parameters from devStore
- Show current values at bottom of settings

### 6. Search for existing debug/logging patterns

- Find any existing DEBUG constants
- Consolidate into devStore

## Implementation Steps

1. ✅ Search for existing debug patterns in codebase
2. ✅ Create devStore with all parameters
3. ✅ Update useGoogleSheetsData with comprehensive logging
4. ✅ Update googleSheetsService with timing logs
5. ✅ Find and update home screen component
6. ✅ Add Dev Settings card to SettingsScreen
7. Test the implementation

## Completed Features

### devStore Created

- Created `/src/store/devStore.ts` with centralized debug flags
- Debug flags include:
  - `DEBUG_QUERY_LIFECYCLE`: Enable console.debug for query lifecycle
  - `SHOW_REQUEST_INFO_ON_HOME_SCREEN`: Show request status on home screen
  - `DEBUG_DATE_PARSING`, `DEBUG_DEBOUNCE`, `DEBUG_MEDICATION_PARSER`, `DEBUG_MEDICATION_VISUALIZATION`
- Request status tracking with type (start, success, error, retry, info)
- Convenience logging methods that check debug flags

### Enhanced Logging in useGoogleSheetsData

- Added unique query IDs for tracking requests
- Comprehensive timing measurements at each stage
- TanStack Query lifecycle callbacks (onSuccess, onError, onSettled)
- Retry tracking and status updates
- Auto-clear status after successful requests

### Enhanced Logging in googleSheetsService

- Request IDs for tracking individual API calls
- Detailed timing for each phase:
  - Token acquisition time
  - API request time
  - Data parsing time
- Network error detection (timeout vs connection error)
- Better error categorization

### Home Screen Request Status Display

- Shows current request status below "Updated X ago" text
- Color-coded by status type (blue for info, green for success, red for error, orange for retry)
- Only visible when `SHOW_REQUEST_INFO_ON_HOME_SCREEN` is enabled

### Settings Screen Dev Settings Card

- New card showing all debug flags and their current state
- Visual ON/OFF indicators with color coding
- Positioned before Build Details card for easy access
