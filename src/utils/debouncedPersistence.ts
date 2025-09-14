import AsyncStorage from '@react-native-async-storage/async-storage';
import debounce from 'lodash.debounce';

const DEBUG_DEBOUNCE = false;

export function createDebouncedSpreadsheetUrlPersistence(
  storageKey: string,
  delayMs = 1500,
) {
  return debounce(async (urlToPersist: string, isUrlValid: boolean) => {
    if (DEBUG_DEBOUNCE) {
      console.log('[debounce] Executing debounced persist', {
        isUrlValid,
        urlToPersist,
      });
    }

    if (isUrlValid && urlToPersist !== '') {
      if (DEBUG_DEBOUNCE) {
        console.log('[debounce] Saving spreadsheet URL to storage', {
          urlToPersist,
        });
      }
      try {
        await AsyncStorage.setItem(storageKey, urlToPersist);
      } catch (error) {
        console.error('Error saving spreadsheet URL to storage:', error);
      }
    } else if (urlToPersist === '') {
      if (DEBUG_DEBOUNCE) {
        console.log('[debounce] Removing spreadsheet URL from storage');
      }
      try {
        await AsyncStorage.removeItem(storageKey);
      } catch (error) {
        console.error('Error removing spreadsheet URL from storage:', error);
      }
    }
  }, delayMs);
}
