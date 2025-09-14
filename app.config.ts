import type {ConfigContext, ExpoConfig} from 'expo/config';
import type {ProjectVersions} from 'scripts/version-manager';

const projectVersions = require('./projectVersions.json') as ProjectVersions;

/******************************************
 * DEBUG & ENVIRONMENT SETUP
 ******************************************/

// const DEBUG = process.env.DEBUG_LOG === 'false' ? false : true;
const DEBUG = false;
// eslint-disable-next-line @typescript-eslint/no-empty-function
const logger = DEBUG ? console.debug : () => {};

const APP_VARIANT_TYPES = [
  'development',
  'preview',
  'production',
  'dev-test',
] as const;
type AppVariant = (typeof APP_VARIANT_TYPES)[number];

const APP_VARIANT: AppVariant = APP_VARIANT_TYPES.includes(
  process.env.APP_VARIANT as AppVariant,
)
  ? (process.env.APP_VARIANT as AppVariant)
  : 'development';

// console.log(JSON.stringify(process.env, null, 2));

// const EAS_USE_CONSISTENT_SLUG = process.env.EAS_USE_CONSISTENT_SLUG === 'true';

// const IS_DEV = APP_VARIANT === 'development';
// const IS_PREVIEW = APP_VARIANT === 'preview';

/******************************************
 * BASE CONSTANTS
 ******************************************/

const BASE_BUNDLE_IDENTIFIER = 'com.jhaa.healthlogger';
const BASE_APP_NAME = 'Health Logger';
const BASE_SLUG = 'health-logger';

/******************************************
 * APP CONFIGURATION FUNCTIONS
 ******************************************/

function getAppBundleIdentifier(variant: AppVariant | null): string {
  switch (variant) {
    case 'development':
      return `${BASE_BUNDLE_IDENTIFIER}.dev`;
    case 'dev-test':
      return `${BASE_BUNDLE_IDENTIFIER}.devtest`;
    case 'preview':
      return `${BASE_BUNDLE_IDENTIFIER}.preview`;
    default:
      return BASE_BUNDLE_IDENTIFIER;
  }
}

function getAppName(variant: AppVariant | null): string {
  switch (variant) {
    case 'development':
      return `${BASE_APP_NAME} (Dev)`;
    case 'dev-test':
      return `${BASE_APP_NAME} (DevTest)`;
    case 'preview':
      return `${BASE_APP_NAME} (Preview)`;
    default:
      return BASE_APP_NAME;
  }
}

function getAppSlug(
  variant: AppVariant | null,
  useConsistentSlug: boolean,
): string {
  if (useConsistentSlug) {
    return BASE_SLUG;
  }

  switch (variant) {
    case 'development':
      return `${BASE_SLUG}-dev`;
    case 'dev-test':
      return `${BASE_SLUG}-dev-test`;
    case 'preview':
      return `${BASE_SLUG}-preview`;
    default:
      return BASE_SLUG;
  }
}

function showAppVersion(variant: AppVariant | null): boolean {
  switch (variant) {
    case 'production':
      return false;
    default:
      return true;
  }
}

function getDevelopmentClientParams(): {silentLaunch: boolean} | undefined {
  switch (APP_VARIANT) {
    case 'dev-test':
      return {
        silentLaunch: true,
      };
    default:
      return undefined;
  }
}

function getExpoUpdatesChannelName(variant: AppVariant | null): string {
  switch (variant) {
    case 'development':
      return 'development';
    case 'preview':
      return 'preview';
    default:
      return 'production';
  }
}

/******************************************
 * GOOGLE CLIENT CONFIGURATION
 ******************************************/

type ClientIds = {
  ios: string;
  iosUrlScheme: string;
  web: string;
};

const GOOGLE_WEB_CLIENT_ID =
  '182746556148-ne5prs1t4lrhrksotaolbaq23squ9o9b.apps.googleusercontent.com';

const GOOGLE_CLIENT_IDS: Record<string, ClientIds> = {
  'com.jhaa.healthlogger': {
    ios: '182746556148-lklq7fisqms4ubsn15d3sb4214scf7pf.apps.googleusercontent.com',
    iosUrlScheme:
      'com.googleusercontent.apps.182746556148-lklq7fisqms4ubsn15d3sb4214scf7pf',
    web: GOOGLE_WEB_CLIENT_ID,
  },
  'com.jhaa.healthlogger.dev': {
    ios: '182746556148-d2q720bbnf8hqbdedcdmuju36psn2u6a.apps.googleusercontent.com',
    iosUrlScheme:
      'com.googleusercontent.apps.182746556148-d2q720bbnf8hqbdedcdmuju36psn2u6a',
    web: GOOGLE_WEB_CLIENT_ID,
  },
  'com.jhaa.healthlogger.preview': {
    ios: '182746556148-93dfb4otltpvdcet3gb5ujo7h5vt1tgd.apps.googleusercontent.com',
    iosUrlScheme:
      'com.googleusercontent.apps.182746556148-93dfb4otltpvdcet3gb5ujo7h5vt1tgd',
    web: GOOGLE_WEB_CLIENT_ID,
  },
};

function getGoogleClientIds(variant: AppVariant): ClientIds {
  const ids = GOOGLE_CLIENT_IDS[getAppBundleIdentifier(variant)];
  if (ids == null) {
    throw new Error(`No Google client IDs found for variant: ${variant}`);
  }
  return ids;
}

/******************************************
 * RUNTIME INITIALIZATION
 ******************************************/

const googleClientIds = getGoogleClientIds(APP_VARIANT);

/******************************************
 * DEBUG LOGGING
 ******************************************/

if (DEBUG) {
  logger('APP_VARIANT:', APP_VARIANT ?? 'null');
  logger('IOS_BUNDLE_VERSION (aka build number):', projectVersions.buildNumber);
}

/******************************************
 * EXPO CONFIG EXPORT
 ******************************************/

/* eslint-disable sort-keys-fix/sort-keys-fix */
export default function createExpoConfig({config}: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: getAppName(APP_VARIANT),
    slug: BASE_SLUG,
    version: projectVersions.codeVersion,
    developmentClient: getDevelopmentClientParams(),
    orientation: 'portrait',
    icon: './src/assets/images/favicon.png',
    scheme: getAppSlug(APP_VARIANT, false),
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      ...config.ios,
      supportsTablet: true,
      buildNumber: projectVersions.buildNumber,
      bundleIdentifier: getAppBundleIdentifier(APP_VARIANT),
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true, // This is to allow other apps to directly edit these files. We don't want that.
      },
    },
    // android: {
    //   ...config.android,
    //   adaptiveIcon: {
    //     foregroundImage: './src/assets/images/favicon.png',
    //     backgroundColor: '#1C1C1E',
    //   },
    //   package: getAppBundleIdentifier(APP_VARIANT),
    // },
    // web: {
    //   bundler: 'metro',
    //   output: 'static',
    //   favicon: './src/assets/images/favicon.png',
    // },
    platforms: ['ios'],
    plugins: [
      [
        'expo-dev-client',
        {
          launchMode: 'most-recent',
          addGeneratedScheme: false,
        },
      ],
      // [
      //   'expo-updates',
      //   // { // These are all the default values anyway:
      //   //   // enabled: true,
      //   //   // checkAutomatically: 'ON_LOAD',
      //   //   // fallbackToCacheTimeout: 0,
      //   // },
      // ],
      [
        'expo-font',
        {
          fonts: ['./src/assets/fonts/SF-Mono-Regular.otf'],
        },
      ],
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './src/assets/images/favicon.png',
          imageWidth: 300,
          resizeMode: 'contain',
          // backgroundColor: '#1C1C1E',
          // Use a light background if we're not in dark mode
          backgroundColor: '#F7F7F7',
          dark: {
            image: './src/assets/images/favicon.png',
            backgroundColor: '#1C1C1E',
          },
        },
      ],
      'expo-web-browser', // TODO: I don't think we need this anymore
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleClientIds.iosUrlScheme,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    runtimeVersion: projectVersions.runtimeVersion,
    updates: {
      url: 'https://u.expo.dev/fee32fc5-d401-4054-a5d6-8539fc8cdc6c',
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      requestHeaders: {
        'expo-channel-name': getExpoUpdatesChannelName(APP_VARIANT),
      },
      // fallbackToCacheTimeout: 0,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: 'fee32fc5-d401-4054-a5d6-8539fc8cdc6c',
      },
      showAppVersion: showAppVersion(APP_VARIANT),
      codeVersion: projectVersions.codeVersion,
      buildNumber: projectVersions.buildNumber,
      googleClientIds,
    },
  };
}
