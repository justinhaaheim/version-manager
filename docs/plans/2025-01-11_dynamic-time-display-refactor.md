# Dynamic Time Display Refactor

## Problem

Currently computing "time since" values statically in medication parser - should be dynamic and update in real-time.

## Solution Plan

### 1. Add Global Seconds Counter to Zustand Store

- Add `secondsSinceAppInit` state value
- Add `appInitTime` to track when app started (performance.now)
- Add action to update seconds counter
- Create hook `useSecondsSinceAppInit` to subscribe to this value

### 2. Set Up RAF-based Second Counter

- Initialize on app start (in root \_layout.tsx or similar)
- Use requestAnimationFrame to check elapsed time each frame
- Update store when a full second has elapsed
- Use Math.floor(elapsed / 1000) to get clean second boundaries

### 3. Refactor Medication Parser

- Remove static `timeSince` computation from parseMedications
- Keep raw timestamp in parsed medication data

### 4. Update MedicationListItem Component

- Subscribe to seconds counter using new hook
- Dynamically compute time since based on medication timestamp
- This will cause re-render every second with updated elapsed time

### 5. Update "Updated X seconds ago" Display

- Use same seconds counter hook
- Compute elapsed time from TanStack Query's dataUpdatedAt

## Benefits

- All time displays update synchronously
- Frame-perfect second transitions
- Clean architecture with centralized time tracking
- Medications show real-time elapsed values (20s, 21s, 22s, etc.)

## Implementation Order

1. ✅ Create store state and actions
2. ✅ Set up RAF loop in app initialization
3. ✅ Create useSecondsSinceAppInit hook
4. ✅ Refactor medication parser
5. ✅ Update MedicationListItem
6. ✅ Update header "Updated X ago" display
7. ✅ Test and verify synchronous updates

## Implementation Complete

Successfully refactored the time display system to use a dynamic RAF-based seconds counter. Key changes:

- Added `secondsSinceAppInit` state and RAF-based ticker to mainStore
- Removed static `timeSince` and `isDimmed` from MedicationEntry type
- MedicationListItem now dynamically computes elapsed time each render
- Home screen "Updated X ago" also uses dynamic counter
- All time displays update synchronously every second using frame-perfect timing
