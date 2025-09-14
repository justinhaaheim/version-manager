# Split Google Client IDs (iOS vs Web)

## Objective

Use separate Google OAuth client IDs for iOS native sign-in and for the web (AuthSession) flow.

## Current State

- Single env var `EXPO_PUBLIC_GOOGLE_CLIENT_ID` used everywhere via `GOOGLE_CLIENT_ID`.
- `src/services/googleSignIn.ts` passes the same value to both `iosClientId` and `webClientId`.
- `src/services/googleAuth.ts` uses the same `EXPO_PUBLIC_GOOGLE_CLIENT_ID` for AuthSession.

## Plan

1. Add two env variables:
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (iOS OAuth client)
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Web OAuth client)
2. Update `src/constants/environment.ts` to export:
   - `GOOGLE_IOS_CLIENT_ID`
   - `GOOGLE_WEB_CLIENT_ID`
3. Update `src/services/googleSignIn.ts` to use:
   - `iosClientId: GOOGLE_IOS_CLIENT_ID`
   - `webClientId: GOOGLE_WEB_CLIENT_ID`
4. Update `src/services/googleAuth.ts` to use `GOOGLE_WEB_CLIENT_ID` for AuthSession flows.
5. Validate build with `npm run signal`.

## Notes

- iOS client ID typically ends with `.apps.googleusercontent.com` with an iOS bundle attached in Google Cloud.
- Web client ID is the OAuth 2.0 Client of type Web; required by AuthSession and for `webClientId` in Google Sign-In.
