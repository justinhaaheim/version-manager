# Fix Theme Switching Logic

## Problem Summary

1. Cannot switch to system mode via toggle
2. AsyncStorage doesn't save "system" preference
3. Ambiguity between "no preference" (null) vs "explicitly chose system"

## Solution Plan

### 1. Update Type Definitions

- Change `explicitAppearanceModePreference` type to: `'light' | 'dark' | 'system' | null`
- `null` = no preference set (initial state)
- `'system'` = user explicitly chose system mode
- `'light'` or `'dark'` = user explicitly chose that mode

### 2. Fix AsyncStorage Logic in ThemeProvider

- Load preference from AsyncStorage on mount (existing)
- Save preference to AsyncStorage whenever it changes (after initial load)
- Handle the new 'system' value when loading/saving

### 3. Fix Theme Toggle Cycling

- Use `useState` to freeze cycle order on mount
- Order based on current theme:
  - If light: `['light', 'dark', 'system']`
  - If dark: `['dark', 'light', 'system']`
- Simple cycling through the frozen order

### 4. Update Theme Resolution Logic

- When `explicitAppearanceModePreference` is:
  - `null`: use device mode or default
  - `'system'`: use device mode
  - `'light'` or `'dark'`: use that explicit mode

## Files to Modify

1. `src/theme/themeTypes.ts` - Update AppearanceMode type ✅
2. `src/theme/ThemeProvider.tsx` - Fix AsyncStorage and resolution logic ✅
3. `src/theme/ThemeToggle.tsx` - Fix cycling with frozen order ✅

## Implementation Complete

Successfully fixed the theme switching logic:

- Added 'system' as an explicit preference value separate from null
- Fixed AsyncStorage to properly save system preference
- Implemented frozen cycle order in ThemeToggle for consistent behavior
- All tests pass and code committed
