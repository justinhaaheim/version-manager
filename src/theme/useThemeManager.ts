import type {AppearanceMode} from '@/theme/themeTypes';

import {useContext, useMemo} from 'react';

import {ThemeContext} from '@/theme/ThemeContext';

interface UseThemeManagerReturn {
  appearanceModeTestId: string;
  clearExplicitThemePreference: () => void;
  explicitAppearanceModePreference: AppearanceMode;
  isDarkMode: boolean;
  setAppearanceModePreference: (mode: AppearanceMode) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useThemeManager = (): UseThemeManagerReturn => {
  const {
    theme,
    toggleTheme,
    clearExplicitThemePreference,
    setAppearanceModePreference,
    explicitAppearanceModePreference,
  } = useContext(ThemeContext);

  // Generate appearance mode test ID for E2E testing
  const appearanceModeTestId = `test-appearance-mode-is-${theme}`;

  const result = useMemo(
    () => ({
      appearanceModeTestId,
      clearExplicitThemePreference,
      explicitAppearanceModePreference,
      isDarkMode: theme === 'dark',
      setAppearanceModePreference,
      theme,
      toggleTheme,
    }),
    [
      appearanceModeTestId,
      clearExplicitThemePreference,
      setAppearanceModePreference,
      explicitAppearanceModePreference,
      theme,
      toggleTheme,
    ],
  );

  return result;
};
