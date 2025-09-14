# Remove Barrel Files - 2025-08-17

## Goal

Remove all barrel files (index.ts/tsx files that re-export) except for those needed by Expo Router in src/app/

## Identified Barrel Files

1. `/src/components/ui/index.ts` - Pure barrel file, exports Card, ControlButtons, DesignTokensDemo, Typography
2. `/src/components/MedicationTimeline/index.ts` - Pure barrel file, exports MedicationTimeline
3. `/src/test/scenarios/index.ts` - NOT a barrel file - contains actual implementation code

## Files to Keep

1. `/src/app/(tabs)/index.tsx` - Required by Expo Router for routing
2. `/src/test/scenarios/index.ts` - Not a barrel file, contains actual implementation

## Files to Remove

1. `/src/components/ui/index.ts`
2. `/src/components/MedicationTimeline/index.ts`

## Import Updates Needed

1. `/src/screens/HomeScreen.tsx` - imports from `@/components/MedicationTimeline`
2. `/src/screens/SettingsScreen.tsx` - imports from `@/test/scenarios` (no change needed)
3. `/src/app/test/[scenario].tsx` - imports from `@/test/scenarios` (no change needed)

## Plan

1. Check what's being imported from the barrel files
2. Update imports to direct file imports
3. Remove the barrel files
4. Run signal to verify no TypeScript/lint issues
5. Commit changes
