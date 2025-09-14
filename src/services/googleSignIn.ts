import {
  GoogleSignin,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';

import {
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from '@/constants/environment';

export interface GoogleSignInResult {
  accessToken: string;
  idToken: string | null;
  user: User['user'];
}

/**
 * Thin wrapper around Google Sign-In SDK.
 * The SDK itself is the source of truth for authentication state.
 */
class GoogleSignInService {
  private isConfigured = false;

  /**
   * Configure the Google Sign-In SDK. Safe to call multiple times.
   */
  configure(): void {
    if (this.isConfigured) return;

    GoogleSignin.configure({
      accountName: '',
      forceCodeForRefreshToken: true,
      hostedDomain: '',
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      offlineAccess: true,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      webClientId: GOOGLE_WEB_CLIENT_ID,
    });

    this.isConfigured = true;
  }

  /**
   * Sign in with user interaction (shows sign-in UI).
   */
  async signIn(): Promise<GoogleSignInResult> {
    try {
      this.configure();

      const hasPlayServices = await GoogleSignin.hasPlayServices();
      if (!hasPlayServices) {
        throw new Error('Google Play Services are not available');
      }

      const userInfo = await GoogleSignin.signIn();

      // Check if sign in was successful
      if (userInfo.type !== 'success') {
        throw new Error('Sign in was not successful');
      }

      const tokens = await GoogleSignin.getTokens();

      return {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken ?? null,
        user: userInfo.data.user,
      };
    } catch (error) {
      if (this.isSignInCancelledError(error)) {
        throw new Error('Sign in was cancelled');
      }
      throw error;
    }
  }

  /**
   * Attempt to sign in silently using a previous session.
   * Returns null if no previous session exists or if silent sign-in fails.
   */
  async signInSilently(): Promise<GoogleSignInResult | null> {
    try {
      this.configure();

      // Check if there was a previous sign-in
      if (!GoogleSignin.hasPreviousSignIn()) {
        return null;
      }

      // Attempt to restore the session
      const userInfo = await GoogleSignin.signInSilently();

      // Check if sign in was successful
      if (userInfo.type !== 'success') {
        return null;
      }

      const tokens = await GoogleSignin.getTokens();

      return {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken ?? null,
        user: userInfo.data.user,
      };
    } catch (error) {
      // Silent sign-in can fail for various reasons (network, expired session, etc.)
      // We treat all failures as "no previous session" and return null
      console.log('Silent sign-in failed:', error);
      return null;
    }
  }

  /**
   * Sign out the current user.
   */
  async signOut(): Promise<void> {
    this.configure();
    await GoogleSignin.signOut();
  }

  /**
   * Get the current user from the SDK's cache.
   * Returns null if no user is currently signed in.
   */
  getCurrentUser(): User['user'] | null {
    this.configure();
    const user = GoogleSignin.getCurrentUser();
    return user?.user ?? null;
  }

  /**
   * Get current tokens. The SDK will automatically refresh if needed.
   */
  async getTokens(): Promise<{accessToken: string; idToken: string | null}> {
    this.configure();
    const tokens = await GoogleSignin.getTokens();
    return {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken ?? null,
    };
  }

  private isSignInCancelledError(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === statusCodes.SIGN_IN_CANCELLED
    );
  }
}

export const googleSignInService = new GoogleSignInService();
