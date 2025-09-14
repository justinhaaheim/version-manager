# Refactor TanStack Query Usage - 2025-08-11

## Goal

Remove the pattern of syncing TanStack Query data to Zustand store and instead use the query return values directly. This is more idiomatic and reduces complexity.

## Current State

- `useHealthLogData` hook fetches data via `useGoogleSheetsData` (TanStack Query)
- Data is then synced to Zustand store (medicationData, lastUpdated, error, isLoading, isRefreshing)
- Components consume from Zustand store

## Target State

- `useHealthLogData` hook fetches data via `useGoogleSheetsData` (TanStack Query)
- Hook returns TanStack Query values directly (data, error, isLoading, etc.)
- Zustand store only contains `googleUser` and `sheetsConfig`

## Plan

### 1. Analyze current Zustand store usage

- Review what's in the store
- Identify what should remain (googleUser, sheetsConfig)
- Identify what should be removed (medicationData, lastUpdated, error, isLoading, isRefreshing)

### 2. Refactor useHealthLogData hook

- Remove syncing logic to Zustand
- Process data directly from useQuery
- Return processed data and query states directly

### 3. Update Zustand store

- Remove medication-related state
- Remove setters for removed state
- Keep only googleUser and sheetsConfig

### 4. Update consumers

- Find all components using the removed Zustand state
- Update them to use useHealthLogData return values instead

### 5. Testing & Validation

- Run type checks and linting
- Test the app functionality

## Progress

- [x] Analyze current store usage
- [x] Refactor useHealthLogData hook
- [x] Update Zustand store
- [x] Update consumers (HomeScreen and SettingsScreen)
- [x] Run validation checks - All passed!

## Notes

- Be careful to maintain the data processing pipeline (parseHealthLoggerData -> transformToMedicationEntries)
- Ensure refetch/refresh functionality still works
- Keep the authentication check logic
