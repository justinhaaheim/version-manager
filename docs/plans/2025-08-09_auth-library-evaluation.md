# Google Authentication Library Evaluation for Health Logger RN

## Current Situation

- Built custom OAuth implementation using expo-auth-session
- Getting "invalid_request" error from Google OAuth
- Redirect URI is `health-logger-dev://` (custom scheme)
- Need to evaluate if switching to a library would be better

## Requirements

- React Native Expo app (managed workflow preferred)
- Google OAuth authentication
- Google Sheets API access (read-only)
- Secure token storage
- Token refresh capability
- iOS primary target (Android future)

## Library Options to Evaluate

### 1. expo-auth-session (Current Implementation)

**What we're using now**

#### Pros

- Native Expo support
- Works with managed workflow
- Handles redirect URIs properly for mobile
- Good documentation
- Secure token storage with expo-secure-store

#### Cons

- Manual token management
- Manual API integration
- Current issue with Google OAuth configuration

#### Complexity

- Medium - requires understanding OAuth flow
- Already implemented

### 2. @react-native-google-signin/google-signin

**Native Google Sign-In SDK wrapper**

#### Pros

- Official Google Sign-In SDK
- Native UI components (familiar to users)
- Handles token refresh automatically
- Well-maintained
- Large community
- Battle-tested in production apps
- Simpler OAuth flow (no redirect URI issues)
- Better error handling
- Offline token support built-in

#### Cons

- More complex initial setup (native configuration)
- iOS and Android configuration differs
- Need to configure in Xcode/Android Studio
- Larger app size (includes Google SDK)

#### Complexity

- High initial setup (but we already use dev builds)
- Low ongoing maintenance
- Would eliminate OAuth redirect complexity

### 3. google-auth-library-nodejs

**Google's official Node.js auth library**

#### Pros

- Official Google library
- Comprehensive auth support
- Well-maintained

#### Cons

- **NOT compatible with React Native**
- Node.js specific (uses fs, crypto modules)
- Would not work in mobile environment

#### Verdict

❌ Not suitable for React Native

### 4. googleapis (with google-auth-library)

**Google's Node.js client library**

#### Pros

- Official Google library
- Nice API wrappers for Sheets

#### Cons

- **NOT compatible with React Native**
- Node.js environment only
- Heavy dependencies

#### Verdict

❌ Not suitable for React Native

### 5. google-spreadsheet

**Nice wrapper around Google Sheets API**

#### Pros

- Clean API for Sheets operations
- Good abstraction

#### Cons

- **NOT compatible with React Native**
- Requires Node.js environment
- Uses google-auth-library under the hood

#### Verdict

❌ Not suitable for React Native (Node.js only)

### 6. React Native Firebase (with Google Auth)

**Firebase SDK with Google authentication**

#### Pros

- Well-maintained
- Good React Native support
- Handles auth complexity

#### Cons

- Requires Firebase project setup
- Overkill for just auth + Sheets
- Additional dependency/service
- Requires development builds

#### Complexity

- High setup
- Additional service to manage

## Analysis

### Key Findings

1. **Most Google libraries are Node.js only** - googleapis, google-auth-library, google-spreadsheet all require Node.js environment
2. **React Native limitations** - Can't use Node.js specific modules (fs, crypto, etc.)
3. **Current expo-auth-session is actually good** - It's the right tool for OAuth in React Native

### The Real Issue

The "invalid_request" error isn't because we're using the wrong library - it's a configuration issue:

1. Need to add `health-logger-dev://` as authorized redirect URI in Google Cloud Console
2. May need to configure OAuth consent screen properly
3. Possible issue with mixing PKCE and client secret (already fixed)

## Recommendation (Updated)

Since you already use Expo development builds, **consider switching to @react-native-google-signin/google-signin**:

### Why Switch

1. **No redirect URI headaches** - Uses native Google Sign-In SDK, no custom schemes needed
2. **Better UX** - Native Google sign-in UI that users recognize
3. **More reliable** - Battle-tested in thousands of production apps
4. **Simpler token management** - Handles refresh automatically
5. **You already pay the "dev build cost"** - No additional workflow impact

### Implementation Effort

- ~2-3 hours to set up and configure
- Need to configure in both Xcode and EAS build config
- Would replace our entire googleAuth.ts service
- Google Sheets API calls would remain the same (just different token source)

### Alternative: Fix Current Implementation

If you prefer to keep expo-auth-session:

1. Add `health-logger-dev://` to authorized redirect URIs in Google Cloud Console
2. Ensure OAuth consent screen is configured
3. Test with the PKCE removal we already did

### My Recommendation

**Switch to @react-native-google-signin/google-signin** because:

- Eliminates the entire class of redirect URI problems
- More maintainable long-term
- Better user experience
- You're already using dev builds anyway

## Configuration Fix Steps

1. Go to Google Cloud Console
2. Navigate to APIs & Services > Credentials
3. Edit OAuth 2.0 Client ID
4. Add to Authorized redirect URIs:
   - `health-logger-dev://`
   - `com.jhaa.healthlogger.dev://` (alternative format)
   - `exp://192.168.1.x:8081` (for local development if needed)
5. Save and test

## Conclusion

Our current implementation with expo-auth-session is correct. The issue is configuration, not the library choice. Switching libraries would add complexity without solving the core problem.
