# Authentication Persistence & Elapsed Time Fix

Date: 2025-08-11

## Goals

1. **Primary**: Persist authentication between app loads to avoid re-authentication
2. **Secondary**: Fix elapsed time updates not working after app is backgrounded

## Current Issues

### Authentication Issue

- User must sign in every time app closes or is backgrounded for >1 hour
- Need to persist tokens between app sessions
- Should only show sign-in if authentication expired or user hasn't authenticated

### Elapsed Time Issue

- Medication elapsed times stop updating after app is backgrounded
- "Updated X ago" text continues working correctly
- Suggests issue with rendering/memoization of elapsed time values
- Uses requestAnimationFrame in store's initialize function

## Investigation Notes

### Authentication

**Current Implementation:**

- Using @react-native-google-signin library
- Sign-in state stored in Zustand store (`googleUser`)
- HomeScreen checks `isSignedIn()` on mount but doesn't persist tokens
- Google Sign-In SDK handles token refresh automatically via `getTokens()`
- Currently no persistence between app sessions

**Key Issues:**

- `googleUser` state is lost when app closes/restarts
- Even though Google Sign-In SDK can maintain session, we're not leveraging it
- Need to persist authentication state and attempt silent sign-in on app launch

### Elapsed Time

**Current Implementation:**

- Using `useSecondsSinceAppInit` hook in MedicationListItem
- RAF loop started in `initializeApp()` that updates every second
- Each medication item subscribes to the seconds counter
- Time calculations done dynamically on each render

**Potential Issues:**

- RAF might be getting cancelled when app backgrounds
- Need to restart RAF when app comes to foreground
- Check if there's a React Native app state listener needed

## Implementation Plan

### Phase 1: Authentication Persistence

1. **Use Google Sign-In SDK's built-in session persistence**
   - The SDK already maintains authentication state
   - We just need to attempt silent sign-in on app launch
   - Add `signInSilently()` method to googleSignInService

2. **Modify app initialization flow**
   - In `initializeApp()`, attempt silent sign-in first
   - If successful, set the user in store
   - If fails, user will see sign-in screen as normal

3. **Handle token refresh**
   - Google SDK handles this automatically
   - We can call `getTokens()` which will refresh if needed

### Phase 2: Elapsed Time Fix

1. **Add AppState listener**
   - Listen for app state changes (active/background)
   - Restart RAF when app becomes active
   - Stop RAF when app backgrounds

2. **Ensure RAF restarts properly**
   - Check if RAF is running before starting
   - Reset time references when restarting

## Progress

### Authentication Persistence

- [x] Investigate current auth implementation
- [x] Design auth persistence solution
- [x] Refactor googleSignInService to be a thin wrapper
- [x] Add signInSilently with hasPreviousSignIn check
- [x] Update app initialization to attempt silent sign-in
- [x] Ready for user testing

### Elapsed Time Fix

- [x] Investigate elapsed time issue
- [x] Add AppState listener to manage RAF lifecycle
- [x] Fix RAF time tracking after resume
- [x] Ready for user testing

## Testing Instructions

### Auth Persistence Testing

1. Build and run the app
2. Sign in with Google account
3. Force close the app completely
4. Reopen the app - should automatically sign in without showing sign-in screen
5. Background the app for >1 hour
6. Return to app - should remain signed in

### What Was Changed

#### Authentication Persistence

- Refactored googleSignInService to be a thin wrapper, removing duplicate state
- Added `signInSilently()` method that uses SDK's `hasPreviousSignIn()`
- App initialization now attempts silent sign-in before showing UI
- Removed manual auth checks from HomeScreen
- Updated hooks to use store state instead of SDK directly

#### Elapsed Time Fix

- Added AppState listener to detect when app goes to background/foreground
- RAF loop now stops when app backgrounds (saves battery)
- RAF loop restarts when app becomes active again
- Preserves original app init time when restarting to maintain accurate elapsed times
- Time tracking now continues correctly after backgrounding

### Testing the Elapsed Time Fix

1. Open the app and note medication elapsed times
2. Switch to another app for a few minutes
3. Return to the app - elapsed times should continue updating from where they left off
4. The "Updated X ago" text should also continue working correctly
