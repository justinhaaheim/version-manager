# Force Reload and Cache Indicators Implementation

## Overview

Add a way to force reload medications data (bypassing cache) and provide visual feedback about data freshness and loading state.

## Current State

- React Query caching with 5 minute stale time, 10 minute cache time
- Pull-to-refresh triggers `refetch()` which respects cache
- No visual indication when data is cached vs fresh
- No way to force bypass the cache

## Proposed Solution

### 1. Force Refresh Capability

- Add a `forceRefresh` function that bypasses React Query cache
- Use `queryClient.invalidateQueries()` before refetch to clear cache
- Available via both pull-to-refresh (with long press) and header button

### 2. Visual Feedback

- **Loading indicator**: Show when network fetch is happening (not just cached data)
- **Cache status**: Subtle indicator showing if data is from cache or fresh
- **Toast notification**: Feedback when force refresh completes

### 3. UI Implementation

- **Header button**: Small refresh icon that shows loading state when fetching
- **Pull-to-refresh enhancement**: Normal pull = regular refresh, longer pull or specific gesture = force refresh
- **Status indicators**:
  - Green dot/checkmark = fresh data from network
  - Gray dot = cached data
  - Spinning = fetching from network

## Implementation Steps

1. ✅ Extend `useHealthLogData` hook to support force refresh
2. ✅ Add loading state tracking for network fetches specifically
3. ✅ Create header refresh button component
4. ✅ Add visual indicators for cache status
5. ✅ Implement toast feedback for force refresh
6. ✅ Test the implementation

## Technical Details

### React Query Cache Control

- Use `queryClient.invalidateQueries()` to mark data as stale
- Use `queryClient.removeQueries()` for complete cache clear
- Track `isFetching` vs `isLoading` to distinguish network activity

### State Management

- Track whether last data came from cache or network
- Add timestamp for last network fetch (different from last cache hit)

## Files to Modify

- `/src/hooks/useHealthLogData.ts` - Add force refresh logic
- `/src/app/(tabs)/index.tsx` - Add header button and update UI
- `/src/components/MedicationList.tsx` - Enhanced pull-to-refresh
- `/src/services/ToastService.ts` - Toast notifications

## Status

- [x] Planning complete
- [x] Implementation in progress
  - [x] Extended `useHealthLogData` hook with force refresh capability
  - [x] Added cache status tracking (isFromCache)
  - [x] Added refresh button in header with visual indicators
  - [x] Added visual feedback showing cached vs fresh data
  - [x] Integrated toast notifications for force refresh
  - [x] Fixed TypeScript and lint issues
- [ ] Testing
- [ ] Complete

## Implementation Details

### What was implemented:

1. **Force Refresh Function**: Added `forceRefresh` method that clears React Query cache before fetching
2. **Cache Status Tracking**: Added `isFromCache` flag to track if data is from cache
3. **Visual Indicators**:
   - Refresh button in header that shows spinner when loading
   - Button color changes: orange when cached, green when fresh
   - "(cached)" label appears next to update time when data is from cache
4. **Toast Feedback**: Shows success/error toast when force refresh completes
5. **Pull-to-refresh**: Still works as before (respects cache), force refresh via header button
