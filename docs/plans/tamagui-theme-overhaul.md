# Tamagui Theme Overhaul Plan

## Status: IN PROGRESS

## Overview

This plan outlines the complete overhaul of the app's Tamagui theming to adopt the default v4 configuration and use Tamagui's built-in theming capabilities idiomatically.

## Progress Update (2025-08-18)

### Completed

✅ Created minimal Tamagui v4 config (`src/theme/tamagui.config.ts`)
✅ Updated main tamagui.config.ts to use new v4 config
✅ Migrated TestMedicationView to use red theme idiomatically
✅ Fixed deprecated 'space' props (now using 'gap')
✅ Updated HomeHeaderTitle to use palette colors ($color11, $color12)
✅ Updated MedicationList to remove custom tokens
✅ Updated SettingsScreen to use v4 palette colors
✅ Updated ThemeToggle to use correct style props
✅ Updated MedicationTimeline style props and tokens

### Remaining Work - CLEANUP PHASE

Now that the Tamagui v4 migration is working, we need to clean up the old color scheme system while keeping the light/dark mode management.

## Cleanup Plan (2025-08-19)

### Analysis of Current State

The app previously had a "color scheme" system with different palettes (like "polished"). This has been replaced by Tamagui's default themes, but the old code remains. We need to:

1. Keep the light/dark/system mode switching functionality
2. Remove all the old color scheme code
3. Simplify the theme management to just handle appearance modes

### Files to Delete Completely

1. **`src/theme/enhancedTamaguiConfig.ts`** - Old custom Tamagui configuration
2. **`src/theme/themeBuilder.ts`** - Old theme builder system
3. **`src/theme/designTokens.ts`** - Old design token definitions
4. **`src/theme/themeConstants.ts`** - Contains the "polished" color scheme definitions

### Files to Refactor

#### 1. `src/theme/useThemeManager.ts`

**Remove:**

- `currentColorScheme` property
- `switchColorScheme` function
- `availableColorSchemes` property
- `getColorsForScheme` function
- `tamaguiThemeName` property (was generating "polishedLight", etc.)
- All imports from `themeConstants.ts`
- `ThemeColors` type import

**Keep:**

- `theme` ('light' | 'dark')
- `toggleTheme()`
- `isDarkMode` boolean
- `setAppearanceModePreference()`
- `explicitAppearanceModePreference`
- `clearExplicitThemePreference()`
- `appearanceModeTestId` for E2E testing

#### 2. `src/theme/ThemeProvider.tsx`

**Remove:**

- `currentColorScheme` state (line 63-64)
- `setCurrentColorScheme` setter
- `switchColorScheme` callback (lines 102-107)
- `DEFAULT_COLOR_SCHEME` import
- `availableSchemes` import
- Pass of `currentColorScheme` and `switchColorScheme` to context

**Keep:**

- All appearance mode management logic
- Test appearance mode handling
- AsyncStorage for preference persistence

#### 3. `src/theme/ThemeContextDefinition.tsx`

**Remove:**

- `currentColorScheme` from context type
- `switchColorScheme` from context type
- `DEFAULT_COLOR_SCHEME` import

**Keep:**

- Theme mode context values
- Appearance mode preferences

#### 4. `src/theme/themeTypes.ts`

**Remove:**

- `ThemeColors` type (if present)
- Any color scheme related types

**Keep:**

- `AppearanceMode` type
- `ThemeType` type
- `ThemeContextType` (after removing color scheme properties)

#### 5. `src/app/_layout.tsx`

**Remove:**

- Line 74: `currentColorScheme` from useThemeManager destructuring
- Line 112: Logging that references `currentColorScheme`
- Any `tamaguiThemeName` references

**Update:**

- TamaguiProvider should use `theme` directly ('light' or 'dark')

### Implementation Order

1. **Start with \_layout.tsx** - Remove unused variables
2. **Update useThemeManager.ts** - Remove color scheme logic
3. **Update ThemeProvider.tsx** - Remove color scheme state
4. **Update ThemeContextDefinition.tsx** - Simplify context type
5. **Update themeTypes.ts** - Remove unused types
6. **Delete old files** - Remove the 4 files completely
7. **Test thoroughly** - Ensure theme switching still works

### Testing Checklist

- [ ] Light mode works correctly
- [ ] Dark mode works correctly
- [ ] System mode follows device preference
- [ ] Theme toggle in settings works
- [ ] Theme preference persists after app restart
- [ ] All screens render correctly in both modes
- [ ] No console errors about missing theme properties

## Core Philosophy

**Stop fighting Tamagui, start using it as intended.**

Instead of creating custom tokens like `$danger`, `$secondaryText`, etc., we'll use Tamagui's powerful theme system with its 12-step palette system and semantic theme names.

## Phase 1: Replace Theme Configuration

### 1.1 Delete Custom Theme Files

**Files to delete:**

- `/src/theme/enhancedTamaguiConfig.ts`
- `/src/theme/themeBuilder.ts`
- `/src/theme/themeConstants.ts`
- `/src/theme/designTokens.ts`

**Reasoning:** These files create non-standard tokens and color schemes that fight against Tamagui's design. The default v4 config already provides everything we need.

### 1.2 Create New Minimal Config

**Create:** `/src/theme/tamagui.config.ts`

```typescript
import {defaultConfig} from '@tamagui/config/v4';
import {createTamagui} from 'tamagui';

export const config = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    allowedStyleValues: 'strict',
    styleCompat: 'react-native', // Aligns flexBasis to match React Native
  },
});

export type AppConfig = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
```

**Reasoning:**

- Uses v4 defaults which are battle-tested and well-designed
- Includes all the themes we need: base (light/dark), accent, red, green, blue, yellow
- Provides proper component themes for variants
- Works seamlessly with Tamagui's documentation and examples

## Phase 2: Fix Token Usage Throughout Codebase

### 2.1 Custom Token Replacements

| Old Token                   | New Approach                                                          | Reasoning                                           |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `$danger`                   | `theme="red"` on component or `<Theme name="red">` wrapper            | Uses Tamagui's red palette theme                    |
| `$primary`                  | `theme="accent"` or `$color9`                                         | Accent theme for CTAs, or color9 for solid elements |
| `$secondary`                | `$color11`                                                            | Secondary text uses the muted text position         |
| `$secondaryText`            | `$color11`                                                            | Position 11 in palette is for secondary text        |
| `$headingText`              | `$color12`                                                            | Position 12 is for high-contrast primary text       |
| `$titleText`                | `$color12`                                                            | Same as heading - primary text                      |
| `$cardBackground`           | `$color3`                                                             | Position 3 is for card/surface backgrounds          |
| `$secondaryBackground`      | `$color2`                                                             | Position 2 is for subtle backgrounds                |
| `$border`                   | `$color6`                                                             | Position 6 is for interactive borders               |
| `$icon`                     | `$color11`                                                            | Icons typically use same color as text              |
| `$accent`                   | `theme="accent"`                                                      | Use the accent theme instead of a token             |
| `backgroundColor="$danger"` | Wrap in `<Theme name="red">` or use `theme="red"` prop                | Semantic theming instead of manual colors           |
| `color="white"`             | `color="$color1"` when in dark theme context, or use `theme="accent"` | Use palette positions or theme inversions           |

### 2.2 Component Pattern Replacements

#### Before (Manual styling):

```tsx
<YStack
  backgroundColor="$danger"
  borderBottomColor="$borderColor"
  borderBottomWidth={1}
  opacity={0.95}
  paddingHorizontal="$4"
  paddingTop="$12"
  paddingVertical="$4"
  space="$2">
  <H2 color="white">Test Mode</H2>
  <Text color="white" fontSize="$5" fontWeight="bold">
    {scenarioName}
  </Text>
  <Button
    backgroundColor="white"
    color="$danger"
    marginTop="$2"
    onPress={onExit}
    size="$4">
    Exit Test Mode
  </Button>
</YStack>
```

#### After (Idiomatic Tamagui):

```tsx
<Theme name="red">
  <YStack
    backgroundColor="$color9" // Use strong color from red palette
    paddingHorizontal="$4"
    paddingTop="$12"
    paddingVertical="$4"
    space="$2">
    <H2 color="$color1">Test Mode</H2> {/* color1 = white in red theme */}
    <Text color="$color1" fontSize="$5" fontWeight="bold">
      {scenarioName}
    </Text>
    <Text color="$color2" fontSize="$4">
      {' '}
      {/* color2 = slightly transparent white */}
      {scenarioDescription}
    </Text>
    <Text color="$color3" fontSize="$3">
      {' '}
      {/* color3 = more transparent */}
      {data.length} medication entries
    </Text>
    <Button
      theme="white" // Use white theme for inverted button
      marginTop="$2"
      onPress={onExit}
      size="$4">
      Exit Test Mode
    </Button>
  </YStack>
</Theme>
```

**Reasoning:**

- The Theme wrapper provides context - everything inside uses the red color palette
- No manual color specifications needed - components know what colors to use
- The button can use `theme="white"` to stand out against the red background
- Much more maintainable and consistent with Tamagui's design

### 2.3 Common Patterns to Fix

#### Danger/Error States

**Before:** `backgroundColor="$danger"` or `color="$danger"`
**After:**

```tsx
// For a single component:
<Button theme="red">Delete</Button>

// For a section:
<Theme name="red">
  <Card>
    <Text>Error content here</Text>
  </Card>
</Theme>
```

#### Primary Actions/CTAs

**Before:** `backgroundColor="$primary"`
**After:**

```tsx
<Button theme="accent">Save Changes</Button>
```

#### Card Components

**Before:** `backgroundColor="$cardBackground"`
**After:**

```tsx
<Card>  {/* Card already uses appropriate background */}
  {/* content */}
</Card>

// Or for custom cards:
<YStack backgroundColor="$color3">  {/* color3 = card background */}
  {/* content */}
</YStack>
```

#### Text Hierarchy

**Before:**

- `color="$headingText"`
- `color="$text"`
- `color="$secondaryText"`

**After:**

- `color="$color12"` - Primary/heading text (highest contrast)
- `color="$color11"` - Secondary text (slightly muted)
- `color="$color10"` - Tertiary text (more muted)

#### Borders

**Before:** `borderColor="$borderColor"` or `borderColor="$border"`
**After:**

- `borderColor="$color6"` - Standard borders
- `borderColor="$color7"` - Hover state borders
- `borderColor="$color8"` - Active/pressed borders
- Often better: Don't specify, let components handle it

## Phase 3: Simplification Patterns

### 3.1 Remove Explicit Colors Where Possible

Many Tamagui components already know what colors to use. Stop overriding them.

**Before:**

```tsx
<Button backgroundColor="$primary" color="white">
  Save
</Button>
```

**After:**

```tsx
<Button theme="accent">Save</Button>
```

### 3.2 Use Theme Wrappers for Sections

Instead of manually coloring every element, wrap sections in themes.

**Before:**

```tsx
<YStack backgroundColor="$danger">
  <H2 color="white">Error</H2>
  <Text color="white">{errorMessage}</Text>
  <Button backgroundColor="white" color="$danger">
    Dismiss
  </Button>
</YStack>
```

**After:**

```tsx
<Theme name="red">
  <YStack backgroundColor="$color9">
    <H2>Error</H2> {/* Automatically uses appropriate text color */}
    <Text>{errorMessage}</Text>
    <Button theme="white">Dismiss</Button>
  </YStack>
</Theme>
```

### 3.3 Trust the Defaults

Stop specifying every visual property. Tamagui's defaults are well-designed.

**Before:**

```tsx
<Card
  backgroundColor="$cardBackground"
  borderRadius="$4"
  padding="$4"
  shadowColor="$shadowColor"
  shadowOffset={{ width: 0, height: 2 }}
  shadowOpacity={0.1}
  shadowRadius={4}>
```

**After:**

```tsx
<Card padding="$4">  {/* Card already has proper background, shadows, radius */}
```

## Phase 4: Testing & Validation

### 4.1 Visual Regression Testing

After each component update:

1. Screenshot before state
2. Apply changes
3. Screenshot after state
4. Verify the visual appearance is maintained or improved

### 4.2 Dark Mode Testing

Ensure all themed components work in both light and dark modes:

- Test theme="red" in both modes
- Test theme="accent" in both modes
- Verify text remains readable
- Check contrast ratios

### 4.3 Component Behavior

Verify interactive states still work:

- Hover states
- Press states
- Focus states
- Disabled states

## Phase 5: Benefits After Migration

### 5.1 Cleaner Code

- No more manual color specifications
- Components are self-describing with theme props
- Less brittle - changes to theme automatically propagate

### 5.2 Better Dark Mode

- Automatic color adjustments
- No manual dark mode color mappings
- Consistent contrast ratios

### 5.3 Easier Maintenance

- Following Tamagui conventions means:
  - Documentation examples work as-is
  - Updates to Tamagui improve your app
  - New developers understand the patterns
  - AI assistants can help more effectively

### 5.4 Performance

- Smaller bundle size (no custom theme code)
- Better optimization from Tamagui compiler
- Faster theme switching

## Implementation Order

1. **Update configuration file** - Replace with minimal v4 config
2. **Fix critical error states** - Replace $danger usage with theme="red"
3. **Fix primary CTAs** - Replace $primary with theme="accent"
4. **Fix text colors** - Use $color11/$color12 instead of custom tokens
5. **Fix cards and backgrounds** - Use default Card component or $color3
6. **Remove unnecessary styling** - Trust Tamagui defaults
7. **Add Theme wrappers** - For sections that need consistent coloring
8. **Clean up** - Remove all references to old theme files

## Common Gotchas to Avoid

1. **Don't use "white" or "black" as color values** - Use $color1 (background) or $color12 (foreground)
2. **Don't manually specify borders on Cards** - Cards already have appropriate styling
3. **Don't override Button colors manually** - Use theme prop instead
4. **Don't create new tokens** - Work within the 12-step palette system
5. **Don't fight the system** - If something feels hard, you're probably doing it wrong

## Success Metrics

- ✅ Zero custom color tokens defined
- ✅ All components use either palette positions ($color1-12) or theme props
- ✅ Dark mode "just works" without manual color mappings
- ✅ Code is 50% shorter and more readable
- ✅ New features can be built using Tamagui docs directly

## Final Note

The key insight: **Tamagui's theme system is not just about colors, it's about semantic relationships.** By using `theme="red"` instead of `backgroundColor="$danger"`, you're not just changing a color - you're applying a complete visual context that includes backgrounds, text colors, borders, and interactive states, all properly coordinated and accessible.

Stop thinking in terms of individual color tokens. Start thinking in terms of themed contexts.
