// Define theme types
export const THEME_TYPES = ['light', 'dark'] as const;
export type ThemeType = (typeof THEME_TYPES)[number];

export function isValidTheme(value: unknown): value is ThemeType {
  return (THEME_TYPES as readonly unknown[]).includes(value);
}

// Define appearance mode including 'system'
export type AppearanceMode = ThemeType | 'system' | null;

// Define theme context interface
export interface ThemeContextType {
  clearExplicitThemePreference: () => void;
  explicitAppearanceModePreference: AppearanceMode;
  setAppearanceModePreference: (mode: AppearanceMode) => void;
  theme: ThemeType;
  toggleTheme: () => void;
}
