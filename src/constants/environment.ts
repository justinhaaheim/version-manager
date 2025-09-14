import Constants from 'expo-constants';
import nullthrows from 'nullthrows';

// Environment configuration
export const DEV_MODE = process.env.NODE_ENV === 'development';

// Google OAuth Configuration
export const GOOGLE_IOS_CLIENT_ID = nullthrows(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  Constants.expoConfig?.extra?.googleClientIds?.ios as string | undefined,
);

export const GOOGLE_WEB_CLIENT_ID = nullthrows(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  Constants.expoConfig?.extra?.googleClientIds?.web as string | undefined,
);
