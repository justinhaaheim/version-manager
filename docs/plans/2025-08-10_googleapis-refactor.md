# Google Sheets API Refactor - Using TanStack Query with Exponential Backoff

## Task

Refactor Google Sheets data fetching to use @tanstack/react-query for better retry logic and rate limit handling to fix 429 errors.

## Problem Analysis

- Getting 429 (Too Many Requests) errors with current axios implementation
- googleapis package won't work in React Native (Node.js dependencies)
- Need proper retry logic with exponential backoff
- Manual token refresh logic is error-prone

## New Plan - TanStack Query Implementation

### 1. Install @tanstack/react-query

- Add TanStack Query for React Native

### 2. Create Query Provider Setup

- Add QueryClient with retry configuration
- Wrap app with QueryClientProvider

### 3. Refactor to Use React Query

- Keep existing googleSheets service for the actual API call
- Create useGoogleSheetsData hook using useQuery
- Configure retry logic with exponential backoff for 429 errors
- Leverage built-in caching and background refetching

### 4. Benefits of TanStack Query

- Built-in exponential backoff retry logic
- Automatic background refetching
- Request deduplication (prevents multiple simultaneous requests)
- Caching to reduce API calls
- Better error and loading states
- Stale-while-revalidate pattern

### 5. Implementation Details

- Configure retry specifically for 429 and network errors
- Set appropriate staleTime and cacheTime
- Keep existing googleSheetsService.fetchSpreadsheetData for the actual fetch
- Handle token refresh within the query function

## Progress

- [x] Research React Native compatible solutions
- [x] Update plan for TanStack Query approach
- [x] Install @tanstack/react-query
- [x] Create React Query provider setup
- [x] Create custom hook with useQuery
- [x] Configure retry logic with exponential backoff
- [x] Update components to use new hook
- [x] Test the solution
- [x] Run signal checks
- [x] Commit changes

## Completed Implementation

Successfully refactored to use TanStack Query for Google Sheets data fetching:

1. **Removed googleapis** - Not compatible with React Native (Node.js dependencies)
2. **Added @tanstack/react-query** - Perfect for React Native with built-in retry logic
3. **Created ReactQueryProvider** with:
   - Exponential backoff retry logic (1s, 2s, 4s delays)
   - Special handling for 429 rate limit errors (retry up to 3 times)
   - Respects Retry-After headers from Google API
   - 5-minute stale time, 10-minute cache time
4. **Created useGoogleSheetsData hook** - Clean abstraction using useQuery
5. **Updated useMedicationData** - Now uses React Query for all fetching
6. **Kept existing googleSheetsService** - Still uses axios for the actual API calls

This solution provides robust rate limit handling while being fully compatible with React Native.
