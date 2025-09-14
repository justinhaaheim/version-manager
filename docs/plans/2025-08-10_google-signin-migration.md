# Migration from expo-auth-session to @react-native-google-signin/google-signin

## Objective

Replace the current expo-auth-session OAuth implementation with @react-native-google-signin/google-signin to eliminate redirect URI issues and provide a better native experience.

## Current State

- Using expo-auth-session with custom OAuth flow
- Getting "invalid_request" errors
- Manual token management
- Custom redirect URI scheme (health-logger-dev://)

## Migration Plan

### Phase 1: Setup and Installation

1. Install @react-native-google-signin/google-signin
2. Configure iOS native settings (Info.plist, URL schemes)
3. Update EAS build configuration
4. Configure Google Cloud Console

### Phase 2: Implementation

5. Create new Google Sign-In service to replace googleAuth.ts
6. Update authentication store to use new service
7. Migrate token storage and refresh logic
8. Update UI components to use native sign-in

### Phase 3: Testing and Cleanup

9. Test authentication flow
10. Test Google Sheets API access with new tokens
11. Remove old expo-auth-session dependencies
12. Clean up old OAuth code

## Benefits of Migration

- No redirect URI configuration needed
- Native Google sign-in UI
- Automatic token refresh
- Better error handling
- More reliable authentication

## Implementation Details

### TODO Items

- [x] Install @react-native-google-signin/google-signin
- [x] Configure iOS native settings
- [x] Update EAS build configuration
- [x] Create new Google Sign-In service
- [x] Update authentication store
- [x] Migrate UI components
- [ ] Test authentication flow (requires app rebuild)
- [ ] Test Sheets API access
- [ ] Remove old dependencies
- [ ] Clean up old code

## Notes

- Already using development builds, so no workflow impact
- Need to rebuild the app after native configuration changes
- Keep Google Sheets API calls unchanged (just different token source)
