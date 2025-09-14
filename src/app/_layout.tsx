// Gesture handler must be imported first

import '@/helpers/gestureHandler';

import {ToastProvider, ToastViewport} from '@tamagui/toast';
import Constants from 'expo-constants';
import {Stack} from 'expo-router/stack';
// import * as SplashScreen from 'expo-splash-screen';
import {StatusBar} from 'expo-status-bar';
import React, {useEffect} from 'react';
import {View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {PortalProvider, TamaguiProvider} from 'tamagui';

import projectVersions from '@/../projectVersions.json';
import ToastComponent from '@/components/ToastComponent';
import {ReactQueryProvider} from '@/providers/ReactQueryProvider';
import {useMainStoreActions} from '@/store/mainStore';
// Import config directly to avoid re-export issues
import {config as tamaguiConfig} from '@/theme/tamagui.config';
import {ThemeProvider} from '@/theme/ThemeContext';
import {useThemeManager} from '@/theme/useThemeManager';

// // Keep splash screen visible until we're ready to hide it
// void SplashScreen.preventAutoHideAsync().catch((error) => {
//   console.error('Failed to prevent splash screen auto-hide:', error);
// });

// SplashScreen.setOptions({duration: 300, fade: true});

// // Hide the splash screen immediately. Put this after any initialization code/steps.
// void SplashScreen.hideAsync();

// // Wrapper component to manage DrizzleMigrationRunner state and signal completion
// // Defined *before* RootLayoutNavigation to avoid definition order issues
// // TODO: Refactor this. We already moved this to DrizzleMigrationRunner but aren't using it there yet. We should just track dbIsReady in the main store and put this all in a hook instead of a component
// function DrizzleMigrationRunnerWrapper({onComplete}: {onComplete: () => void}) {
//   const {success, error} = useMigrations(db, migrations);

//   useEffect(() => {
//     if (success) {
//       console.log('Drizzle migrations applied successfully via wrapper.');
//       onComplete();
//     }
//   }, [success, onComplete]);

//   if (error) {
//     console.error('Migration error:', error);
//     const errorMessage =
//       error instanceof Error ? error.message : 'Unknown migration error';
//     // Hide splash screen even on migration error to avoid getting stuck
//     void SplashScreen.hideAsync();
//     return (
//       <View style={{alignItems: 'center', flex: 1, justifyContent: 'center'}}>
//         <Text style={{color: 'red'}}>Database Migration Failed!</Text>
//         <Text style={{color: 'red'}}>{errorMessage}</Text>
//       </View>
//     );
//   }

//   if (!success) {
//     return (
//       <View style={{alignItems: 'center', flex: 1, justifyContent: 'center'}}>
//         <Text>Running database migrations...</Text>
//       </View>
//     );
//   }

//   // Should not be reached if success triggers onComplete
//   return null;
// }

function RootLayoutNavigation() {
  // const tamaguiTheme = useTamaguiTheme(); // Use Tamagui theme instead of old themeColors
  // const router = useRouter();

  // Get test ID for current appearance mode (for E2E testing verification)
  const {appearanceModeTestId} = useThemeManager();

  // Initialize app on mount (load spreadsheet URL from async storage)
  const {initializeApp} = useMainStoreActions();

  useEffect(() => {
    const appVersion = Constants.expoConfig?.version ?? 'unknown';
    console.log(
      'App Version (projectVersions.json):',
      projectVersions.codeVersion,
    );
    console.log('App Version (Expo Build):', appVersion);

    // Initialize app (load spreadsheet URL from async storage)
    void initializeApp();
  }, [initializeApp]);

  // Pragmatic theme value access
  // const cardBackgroundColor = tamaguiTheme.cardBackground?.val as string;
  // const primaryColor = tamaguiTheme.primary?.val as string;
  // const textColor = tamaguiTheme.color?.val as string;

  // Determine status bar style based on theme with proper type checking
  // const backgroundValue = tamaguiTheme.background?.val as string | undefined;
  // const statusBarStyle =
  //   backgroundValue &&
  //   (backgroundValue === '#000000' || backgroundValue.startsWith('#0'))
  //     ? 'light'
  //     : 'dark';

  // Render migration runner first. Once successful, render the main app.
  return (
    <View style={{flex: 1}} testID={appearanceModeTestId}>
      <StatusBar />
      <Stack>
        <Stack.Screen name="(tabs)" options={{headerShown: false}} />
      </Stack>
    </View>
  );
}

// Component that uses Tamagui hooks - must be inside TamaguiProvider
function TamaguiContent() {
  return (
    <ToastProvider>
      <GestureHandlerRootView style={{flex: 1}}>
        {/* Render RootLayoutNavigation only after SSR is done and theme is ready */}
        <RootLayoutNavigation />
        <ToastComponent />
        <ToastViewport />
      </GestureHandlerRootView>
    </ToastProvider>
  );
}

// Separate component to use ThemeProvider context
function TamaguiProviderWrapper() {
  const {theme} = useThemeManager();

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
      <TamaguiContent />
    </TamaguiProvider>
  );
}

export default function RootLayout() {
  const [isReady, setIsReady] = React.useState(false);

  // Ensure config is loaded before rendering
  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <ReactQueryProvider>
      <ThemeProvider>
        <PortalProvider shouldAddRootHost>
          <TamaguiProviderWrapper />
        </PortalProvider>
      </ThemeProvider>
    </ReactQueryProvider>
  );
}
