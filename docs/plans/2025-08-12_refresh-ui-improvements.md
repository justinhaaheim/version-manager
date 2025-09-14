# Refresh UI Improvements

## Current Issues

- Unnecessary distinction between "refresh" and "force refresh"
- Refresh button in header is redundant with pull-to-refresh
- No clear visual feedback during fetch operations
- Need better stale data indicators

## New Requirements

### 1. Simplify Refresh Logic

- [x] Remove force refresh - regular refetch always hits server
- [x] Pull-to-refresh always fetches from server (already does)
- [x] Remove refresh button from header

### 2. Progress Bar Implementation

- [x] Add Tamagui Progress bar at top of screen
- [x] Invisible when not fetching
- [x] Shows outline when fetch starts
- [x] Animates to 80% after 150ms
- [x] Stays at 80% until fetch completes
- [x] Completes to 100% and fades out when done

### 3. Text Status Indicators

- [x] Replace "Updated X ago" with "Fetching..." during fetch
- [ ] Show stale data warning when fetch fails
- [ ] Consider showing "offline" indicator when no network

### 4. Implementation Details

- Use `isFetching` from React Query to trigger progress bar
- Create custom hook for progress bar animation logic
- Remove all force refresh related code
- Clean up the header UI

## Files to Modify

- `/src/app/(tabs)/index.tsx` - Remove button, add progress bar, update text
- `/src/hooks/useHealthLogData.ts` - Remove force refresh logic
- `/src/components/MedicationList.tsx` - Clean up props

## Progress Tracking

- [x] Create implementation plan
- [x] Remove force refresh functionality
- [x] Add progress bar with animation
- [x] Update status text during fetch
- [x] Test implementation

## What Was Implemented

1. **Simplified Refresh Logic**: Removed unnecessary force refresh - regular pull-to-refresh always fetches from server
2. **Progress Bar**: Added Tamagui Progress bar that:
   - Stays hidden when not fetching
   - Animates to 80% after 150ms
   - Completes to 100% when fetch finishes
   - Fades out after completion
3. **Status Text**: Shows "Fetching..." instead of "Updated X ago" during fetch
4. **Cleaner UI**: Removed refresh button from header since pull-to-refresh is sufficient
