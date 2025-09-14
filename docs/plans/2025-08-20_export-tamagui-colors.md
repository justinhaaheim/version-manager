# Export Tamagui Colors - 2025-08-20

## Task

Change all color constants in `src/theme/tamaguiColors.ts` to be exports so they can be used in other files.

## Current State

- All color constants are declared with `const` keyword but not exported
- File contains multiple color palettes: jadeDark, jadeLight, supremeDark, supremeLight, etc.

## Plan

1. Convert all `const` declarations to `export const` declarations
2. This will make all color arrays available for import in other files
3. No other changes needed - just adding `export` keyword to each constant

## Implementation

- Use search_replace to change each `const` to `export const`
- Total of 16 color constant arrays to update

## Files to modify

- `src/theme/tamaguiColors.ts`
