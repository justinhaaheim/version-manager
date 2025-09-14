# Medication Timeline Refactor Plan

## Goals

1. Fix text overflow using `numberOfLines` ✅
2. Clean up previous overflow attempts ✅
3. Consolidate pill rendering logic ✅
4. Extract MedicationPill component ✅
5. Consider other refactoring opportunities ✅

## Steps

### Step 1: Add numberOfLines to fix text overflow ✅

- Add `numberOfLines={1}` to all Text components in pills
- Remove `whiteSpace: "nowrap"` properties
- Commit after this works

### Step 2: Clean up previous attempts (multiple commits) ✅

- Remove `overflow="visible"` from Views
- Remove unnecessary wrapper Views
- Remove text shadow properties if not needed
- Clean up commented code
- Commit after each cleanup pass

### Step 3: Consolidate pill rendering ✅

- Create single rendering path for both configured and unconfigured medications
- Use conditional logic for gradient vs solid background
- Eliminate duplicate code

### Step 4: Extract MedicationPill component ✅

- Create new file: `src/components/MedicationPill.tsx`
- Define clear props interface
- Handle all pill rendering logic
- Make it reusable and testable

### Step 5: Additional refactoring ✅

- Extracted time formatting utilities to `src/utils/timeFormatting.ts`
- Kept timeline grid and labels in main component for simplicity
- Good balance achieved between abstraction and maintainability

## Implementation Notes

- Commit frequently for easy debugging
- Test after each major change
- Keep components focused and single-purpose
- Use TypeScript interfaces for clear contracts

## Results

Successfully refactored the medication timeline component:

- Fixed text overflow issues using React Native's `numberOfLines` prop
- Extracted reusable `MedicationPill` component
- Consolidated duplicate rendering logic
- Extracted time formatting utilities
- Maintained good balance between abstraction and complexity
