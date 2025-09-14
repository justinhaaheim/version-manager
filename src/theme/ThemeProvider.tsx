import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Appearance, useColorScheme} from 'react-native';
import {LaunchArguments} from 'react-native-launch-arguments';

import {DEFAULT_APPEARANCE_MODE} from './themeConstants';
import {ThemeContext} from './ThemeContextDefinition';
import {type AppearanceMode, isValidTheme, type ThemeType} from './themeTypes';

const EXPLICIT_APPEARANCE_MODE_PREFERENCE_KEY =
  'explicitAppearanceModePreference';

// Handle test appearance mode for E2E testing from Launch Arguments
function getTestAppearanceMode(): ThemeType | null {
  try {
    const args = LaunchArguments.value();
    const mode = args?.testAppearanceMode as string | undefined;
    console.log('🧪 [ThemeContext] LaunchArguments', args);
    if (mode === 'light' || mode === 'dark') {
      // console.log(
      //   `🧪 [ThemeContext] Launch argument testAppearanceMode: ${mode}`,
      // );
      return mode;
    }
  } catch (e) {
    // This will happen on first launch before launch args are set, or if the library isn't properly linked.
    // It's not necessarily an error, so we can log it gently.
    console.error(
      '🧪 [ThemeContext] LaunchArguments.value() not available or testAppearanceMode not set.',
      e,
    );
  }
  return null;
}

const testAppearanceMode = getTestAppearanceMode();

// Theme provider component
export const ThemeProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  // useColorScheme can return null OR undefined, so let's coalesce to null
  const deviceAppearanceMode = useColorScheme() ?? null;

  // If we have a test appearance mode, consider it the explicit appearance mode preference
  const [
    explicitAppearanceModePreference,
    setExplicitAppearanceModePreference,
  ] = useState<AppearanceMode>(testAppearanceMode);

  // NOTE: We want to give preference to the explicit appearance mode preference here
  // **EVEN IF** it's different from the device appearance mode. This will minimize
  // flicker, and the system mode will be set immediately thereafter in a layout effect
  const resolvedAppearanceMode =
    explicitAppearanceModePreference === null ||
    explicitAppearanceModePreference === 'system'
      ? (deviceAppearanceMode ?? DEFAULT_APPEARANCE_MODE)
      : explicitAppearanceModePreference;

  useLayoutEffect(() => {
    /**
     * If the user has an explicit appearance mode preference (including from testAppearanceMode)
     * we need to use the Appearance API to set the color scheme, so that the rest
     * of the app can react to it. Components like StatusBar depend on
     * Appearance.getColorScheme() being right so that they can appropriately render text
     * color in the status bar.
     *
     * This effect syncs any explicit appearance mode preference with the Appearance API,
     * thus making the appearance API the source of truth for light/dark/null mode.
     */
    if (
      explicitAppearanceModePreference === 'light' ||
      explicitAppearanceModePreference === 'dark'
    ) {
      // User has explicitly chosen light or dark
      Appearance.setColorScheme(explicitAppearanceModePreference);
    } else if (
      explicitAppearanceModePreference === 'system' ||
      explicitAppearanceModePreference === null
    ) {
      // User chose system or has no preference - let device appearance take over
      Appearance.setColorScheme(null);
    }
  }, [explicitAppearanceModePreference, deviceAppearanceMode]);

  // useLayoutEffect(() => {
  //   /**
  //    * If the user has an explicit appearance mode preference (including from testAppearanceMode)
  //    * we need to use the Appearance API to set the color scheme, so that the rest
  //    * of the app can react to it. Components like StatusBar depend on
  //    * Appearance.getColorScheme() being right so that they can appropriately render text
  //    * color in the status bar.
  //    *
  //    * This effect syncs any explicit appearance mode preference with the Appearance API,
  //    * thus making the appearance API the source of truth for light/dark/null mode.
  //    */
  //   if (
  //     explicitAppearanceModePreference != null &&
  //     deviceAppearanceMode !== explicitAppearanceModePreference
  //   ) {
  //     Appearance.setColorScheme(explicitAppearanceModePreference);
  //     return;
  //   }

  //   /**
  //    * If the device color scheme is null we will use our DEFAULT_APPEARANCE_MODE
  //    * value. But it's important that that value be synced to the Appearance API
  //    * so that the rest of the app (including elements that we don't style ourselves like
  //    * StatusBar) can react to it.
  //    */
  //   if (deviceAppearanceMode == null) {
  //     Appearance.setColorScheme(DEFAULT_APPEARANCE_MODE);
  //     return;
  //   }
  // }, [explicitAppearanceModePreference, deviceAppearanceMode]);

  const didInitialAsyncStorageCheck = useRef<boolean>(false);

  // Load saved theme preference from AsyncStorage on mount
  useLayoutEffect(() => {
    if (didInitialAsyncStorageCheck.current) {
      return;
    }

    didInitialAsyncStorageCheck.current = true;

    if (explicitAppearanceModePreference != null) {
      return;
    }

    /**
     * Only load the theme preference from AsyncStorage if this
     * is the initial mount and there's no explicit preference
     * already (ie from launch arguments)
     */

    /**
     * TODO: We may want to wait to unhide the splash screen when loading the app until
     * this function returns, to avoid a flicker from one appearance mode to another
     */
    const loadTheme = async () => {
      try {
        const savedExplicitAppearanceModePreference =
          await AsyncStorage.getItem(EXPLICIT_APPEARANCE_MODE_PREFERENCE_KEY);
        console.debug(
          '[ThemeProvider] async storage theme preference:',
          savedExplicitAppearanceModePreference,
        );
        if (savedExplicitAppearanceModePreference != null) {
          if (
            isValidTheme(savedExplicitAppearanceModePreference) ||
            savedExplicitAppearanceModePreference === 'system'
          ) {
            console.log(
              '[ThemeProvider] setting explicit appearance mode preference to async storage value:',
              savedExplicitAppearanceModePreference,
            );
            setExplicitAppearanceModePreference(
              savedExplicitAppearanceModePreference as AppearanceMode,
            );
          } else {
            /**
             * If it's invalid we can just ignore it. The next time the user makes an
             * explicit choice the preference in async storage will be overwritten.
             */
            console.warn(
              'Invalid theme preference found in AsyncStorage:',
              savedExplicitAppearanceModePreference,
            );
          }
        }
      } catch (error) {
        console.error('Failed to load theme', error);
      }
    };

    void loadTheme();
  }, [deviceAppearanceMode, explicitAppearanceModePreference]);

  // Track if we've done the initial load from AsyncStorage
  const hasLoadedFromStorage = useRef(false);

  // Save the theme preference to AsyncStorage
  useEffect(() => {
    // Don't save on the very first render before we've loaded from storage
    if (!hasLoadedFromStorage.current) {
      hasLoadedFromStorage.current = true;
      return;
    }

    if (explicitAppearanceModePreference == null) {
      // If null, remove from storage
      void AsyncStorage.removeItem(EXPLICIT_APPEARANCE_MODE_PREFERENCE_KEY);
      return;
    }

    void (async () => {
      try {
        await AsyncStorage.setItem(
          EXPLICIT_APPEARANCE_MODE_PREFERENCE_KEY,
          explicitAppearanceModePreference,
        );
        console.log(
          'Explicit theme preference saved to AsyncStorage:',
          explicitAppearanceModePreference,
        );
      } catch (error) {
        console.error('Failed to save explicit theme preference', error);
      }
    })();
  }, [explicitAppearanceModePreference]);

  // Toggle between light and dark themes
  // TODO: We really just want this to be a setting for the user of dark/light/auto. So we shouldn't need a toggle going forward.
  const toggleTheme = useCallback(() => {
    // We depend on `theme` here because that's the basis for the toggle, whether or not an explicit preference is set
    const newTheme = resolvedAppearanceMode === 'light' ? 'dark' : 'light';
    setExplicitAppearanceModePreference(newTheme);
  }, [resolvedAppearanceMode]);

  const setAppearanceModePreference = useCallback((mode: AppearanceMode) => {
    setExplicitAppearanceModePreference(mode);
  }, []);

  // Function to clear explicit theme preference (for testing purposes)
  // TODO: Do we need this anymore?
  const clearExplicitThemePreference = useCallback(async () => {
    console.log('🧪 [Theme Context] Clearing explicit theme preference');
    setExplicitAppearanceModePreference(null);
    try {
      await AsyncStorage.removeItem(EXPLICIT_APPEARANCE_MODE_PREFERENCE_KEY);
      console.log(
        '🧪 [Theme Context] Explicit theme preference cleared from AsyncStorage',
      );
    } catch (error) {
      console.error(
        'Failed to clear explicit theme preference from AsyncStorage',
        error,
      );
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      clearExplicitThemePreference,
      explicitAppearanceModePreference,
      setAppearanceModePreference,
      theme: resolvedAppearanceMode,
      toggleTheme,
    }),
    [
      resolvedAppearanceMode,
      toggleTheme,
      explicitAppearanceModePreference,
      clearExplicitThemePreference,
      setAppearanceModePreference,
    ],
  );

  useEffect(() => {
    console.log(`🌙 Current theme state (from ThemeContext)`, {
      deviceAppearanceMode,
      resolvedAppearanceMode,
    });
  }, [resolvedAppearanceMode, deviceAppearanceMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
