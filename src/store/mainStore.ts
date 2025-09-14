import type {PreciseDurationForDisplayManager} from '@/helpers/PreciseDurationForDisplayManager';
import type {GoogleSheetsConfig} from '@/services/googleSheets';
import type {User} from '@react-native-google-signin/google-signin';
import type {UpdateCheckResult} from 'expo-updates';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import {AppState, type AppStateStatus} from 'react-native';
import {create} from 'zustand';
import {devtools} from 'zustand/middleware';

import {parseSpreadsheetId} from '@/helpers/googleSheetsUrl';
import {createDebouncedSpreadsheetUrlPersistence} from '@/utils/debouncedPersistence';

const DEBUG_DEBOUNCE = false;

const SPREADSHEET_URL_STORAGE_KEY = 'spreadsheetUrl';

// Create a module-level debounced persistence function
const persistSpreadsheetUrlDebounced = createDebouncedSpreadsheetUrlPersistence(
  SPREADSHEET_URL_STORAGE_KEY,
);

// Keep the default for backwards compatibility, but it will be overridden by user config
const DEFAULT_SPREADSHEET_ID =
  process.env.EXPO_PUBLIC_DEFAULT_SPREADSHEET_ID != null &&
  process.env.EXPO_PUBLIC_DEFAULT_SPREADSHEET_ID.length > 0
    ? process.env.EXPO_PUBLIC_DEFAULT_SPREADSHEET_ID
    : null;

const DEFAULT_RANGE = 'Recent Meds (Pivot) for CSV!A:ZZZ';
const DEFAULT_HEADER_ROW_INDEX = 0;

/* eslint-disable sort-keys-fix/sort-keys-fix */
/* eslint-disable typescript-sort-keys/interface */

interface MainStore {
  actions: {
    _placeholderAction: () => void;
    setGoogleUser: (user: User['user'] | null) => void;
    setSheetsConfig: (config: GoogleSheetsConfig) => void;
    setSpreadsheetUrl: (url: string, skipPersist?: boolean) => void;
    initializeApp: () => Promise<void>;
    startSecondsTicker: () => void;
    stopSecondsTicker: () => void;
    _updateSecondsSinceInit: () => void;
    checkForUpdate: () => Promise<void>;
    fetchUpdate: () => Promise<void>;
    reloadWithUpdate: () => Promise<void>;
  };

  _preciseDurationManager: PreciseDurationForDisplayManager | null;
  _rafId: number | null;
  _appInitTime: number | null;
  _lastSecondUpdate: number;

  // Auth & Config
  googleUser: User['user'] | null;
  sheetsConfig: GoogleSheetsConfig | null;
  spreadsheetUrl: string;
  isSpreadsheetUrlValid: boolean;
  secondsSinceAppInit: number;

  // Updates
  updateCheckResult: UpdateCheckResult | null;
  isCheckingForUpdate: boolean;
  isFetchingUpdate: boolean;
  isUpdateDownloaded: boolean;
}

/**
 * ALWAYS use a dedicated hook to access state properties instead
 * of exporting and using the overall zustand store hook. (This
 * prevents unnecessary react rerenders by ensuring components
 * only ever subscribe to the properties they explicitly need.)
 *
 * NEVER export or directly use the overall zustand store hook unless
 * absolutely necessary.
 */
const useMainStore = create<MainStore>()(
  devtools((set, get) => ({
    actions: {
      _placeholderAction: () => {
        console.log('placeholderAction');
      },
      setGoogleUser: (user) => set({googleUser: user}),
      setSheetsConfig: (config) => set({sheetsConfig: config}),
      setSpreadsheetUrl: (url: string, skipPersist = false) => {
        // Update the text input value immediately
        set({spreadsheetUrl: url});

        // Parse and validate the URL immediately on every keystroke
        const spreadsheetId = parseSpreadsheetId(url);
        const isValid = spreadsheetId !== null;
        set({isSpreadsheetUrlValid: isValid});

        // Update sheets config immediately if valid
        if (isValid && spreadsheetId) {
          const newConfig: GoogleSheetsConfig = {
            headerRowIndex: DEFAULT_HEADER_ROW_INDEX,
            range: DEFAULT_RANGE,
            spreadsheetId,
          };
          set({sheetsConfig: newConfig});
        } else if (url === '') {
          // Clear the config if the URL is empty
          set({sheetsConfig: null});
        }

        // Skip persistence if this is being called from initializeApp
        if (skipPersist) {
          if (DEBUG_DEBOUNCE) {
            console.log(
              '[debounce] skipPersist=true; not scheduling persistence',
              {url},
            );
          }
          return;
        }

        // Use the module-level debounced persistence function
        if (DEBUG_DEBOUNCE) {
          console.log('[debounce] Scheduling debounced persist', {
            url,
            isValid,
          });
        }
        void persistSpreadsheetUrlDebounced(url, isValid);
      },
      initializeApp: async () => {
        const actions = get().actions;

        // Attempt to restore previous Google sign-in session
        try {
          const {googleSignInService} = await import('@/services/googleSignIn');
          const result = await googleSignInService.signInSilently();
          if (result) {
            console.log('Successfully restored previous sign-in session');
            actions.setGoogleUser(result.user);
          } else {
            console.log('No previous sign-in session to restore');
          }
        } catch (error) {
          console.error('Error attempting silent sign-in:', error);
        }

        // Load spreadsheet URL from async storage
        try {
          const storedUrl = await AsyncStorage.getItem(
            SPREADSHEET_URL_STORAGE_KEY,
          );

          if (storedUrl) {
            // Use setSpreadsheetUrl to handle all the logic consistently
            // Pass skipPersist=true since we're loading from storage
            actions.setSpreadsheetUrl(storedUrl, true);
          } else if (DEFAULT_SPREADSHEET_ID) {
            // Fall back to environment variable if no stored URL
            const newConfig: GoogleSheetsConfig = {
              headerRowIndex: DEFAULT_HEADER_ROW_INDEX,
              range: DEFAULT_RANGE,
              spreadsheetId: DEFAULT_SPREADSHEET_ID,
            };
            set({sheetsConfig: newConfig});
          }
        } catch (error) {
          console.error('Error initializing app from storage:', error);

          // Fall back to environment variable on error
          if (DEFAULT_SPREADSHEET_ID) {
            const newConfig: GoogleSheetsConfig = {
              headerRowIndex: DEFAULT_HEADER_ROW_INDEX,
              range: DEFAULT_RANGE,
              spreadsheetId: DEFAULT_SPREADSHEET_ID,
            };
            set({sheetsConfig: newConfig});
          }
        }

        // Start the seconds ticker
        actions.startSecondsTicker();

        // Set up AppState listener to manage RAF lifecycle
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
          if (nextAppState === 'active') {
            console.log('App became active, restarting ticker');
            // Stop and restart to reset time tracking
            actions.stopSecondsTicker();
            actions.startSecondsTicker();
          } else if (nextAppState === 'background') {
            console.log('App going to background, stopping ticker');
            actions.stopSecondsTicker();
          }
        };

        // Add the listener
        // We're not storing the subscription since we want it to live for the app's lifetime
        AppState.addEventListener('change', handleAppStateChange);
      },
      startSecondsTicker: () => {
        const state = get();

        // Don't start if already running
        if (state._rafId !== null) {
          return;
        }

        const now = performance.now();

        // Only initialize app time on first start
        if (state._appInitTime === null) {
          set({
            _appInitTime: now,
            _lastSecondUpdate: Math.floor(now / 1000),
            secondsSinceAppInit: 0,
          });
        } else {
          // When restarting (e.g., after backgrounding), just update the last second update
          // to prevent the timer from jumping
          set({
            _lastSecondUpdate: Math.floor(now / 1000),
          });
        }

        // Start RAF loop
        const tick = () => {
          const actions = get().actions;
          actions._updateSecondsSinceInit();
          const rafId = requestAnimationFrame(tick);
          set({_rafId: rafId});
        };

        const rafId = requestAnimationFrame(tick);
        set({_rafId: rafId});
      },
      stopSecondsTicker: () => {
        const rafId = get()._rafId;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          set({_rafId: null});
        }
      },
      _updateSecondsSinceInit: () => {
        const state = get();
        if (state._appInitTime === null) return;

        const now = performance.now();
        const currentSecond = Math.floor(now / 1000);

        // Only update if a full second has passed
        if (currentSecond > state._lastSecondUpdate) {
          const elapsedMs = now - state._appInitTime;
          const elapsedSeconds = Math.floor(elapsedMs / 1000);

          set({
            secondsSinceAppInit: elapsedSeconds,
            _lastSecondUpdate: currentSecond,
          });
        }
      },
      checkForUpdate: async () => {
        // Don't check in development mode where updates aren't available
        if (__DEV__) {
          console.log('Skipping update check in development mode');
          return;
        }

        set({
          isCheckingForUpdate: true,
          updateCheckResult: null,
          isUpdateDownloaded: false,
        });

        try {
          const update = await Updates.checkForUpdateAsync();
          set({updateCheckResult: update});

          // Automatically fetch the update if available
          if (update.isAvailable) {
            const actions = get().actions;
            await actions.fetchUpdate();
          }
        } catch (error) {
          console.warn('Error when checking for updates:', error);
          // In dev mode or when updates are disabled, this will throw
          // We gracefully handle this by not setting any result
        } finally {
          set({isCheckingForUpdate: false});
        }
      },
      fetchUpdate: async () => {
        const state = get();

        // Only fetch if we have a pending update
        if (!state.updateCheckResult?.isAvailable) {
          console.log('No update available to fetch');
          return;
        }

        set({isFetchingUpdate: true});

        try {
          await Updates.fetchUpdateAsync();
          // Mark update as downloaded
          set({
            updateCheckResult: null,
            isUpdateDownloaded: true,
          });
        } catch (error) {
          console.warn('Failed to fetch update:', error);
        } finally {
          set({isFetchingUpdate: false});
        }
      },
      reloadWithUpdate: async () => {
        try {
          await Updates.reloadAsync();
          // Clear the downloaded flag (though app will restart)
          set({isUpdateDownloaded: false});
        } catch (error) {
          console.error('Failed to reload with update:', error);
        }
      },
    },

    _preciseDurationManager: null,
    _rafId: null,
    _appInitTime: null,
    _lastSecondUpdate: 0,

    // Initial state
    googleUser: null,
    sheetsConfig: null, // Will be set from async storage or env var
    spreadsheetUrl: '',
    isSpreadsheetUrlValid: false,
    secondsSinceAppInit: 0,

    // Updates initial state
    updateCheckResult: null,
    isCheckingForUpdate: false,
    isFetchingUpdate: false,
    isUpdateDownloaded: false,
  })),
);

/*************************************************************
 * Dedicated hooks for accessing state properties and actions
 *************************************************************/
export const useMainStoreActions = (): MainStore['actions'] =>
  useMainStore((state) => state.actions);
export const useGoogleUser = (): User['user'] | null =>
  useMainStore((state) => state.googleUser);
export const useSheetsConfig = (): GoogleSheetsConfig | null =>
  useMainStore((state) => state.sheetsConfig);
export const useSpreadsheetUrl = (): string =>
  useMainStore((state) => state.spreadsheetUrl);
export const useIsSpreadsheetUrlValid = (): boolean =>
  useMainStore((state) => state.isSpreadsheetUrlValid);
export const useSecondsSinceAppInit = (): number =>
  useMainStore((state) => state.secondsSinceAppInit);
export const useUpdateCheckResult = (): UpdateCheckResult | null =>
  useMainStore((state) => state.updateCheckResult);
export const useIsCheckingForUpdate = (): boolean =>
  useMainStore((state) => state.isCheckingForUpdate);
export const useIsFetchingUpdate = (): boolean =>
  useMainStore((state) => state.isFetchingUpdate);
export const useIsUpdateDownloaded = (): boolean =>
  useMainStore((state) => state.isUpdateDownloaded);
