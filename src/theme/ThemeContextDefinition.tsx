import {createContext} from 'react';

import {DEFAULT_APPEARANCE_MODE} from './themeConstants';
import {type ThemeContextType} from './themeTypes';

// Create the context with default values
export const ThemeContext = createContext<ThemeContextType>({
  clearExplicitThemePreference: () => {
    throw new Error(
      'ThemeContext has no provider. Default context values used.',
    );
  },
  explicitAppearanceModePreference: null,
  setAppearanceModePreference: () => {
    throw new Error(
      'ThemeContext has no provider. Default context values used.',
    );
  },
  theme: DEFAULT_APPEARANCE_MODE,
  toggleTheme: () => {
    throw new Error(
      'ThemeContext has no provider. Default context values used.',
    );
  },
});
