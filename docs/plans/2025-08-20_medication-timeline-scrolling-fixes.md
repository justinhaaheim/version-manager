# Medication Timeline Scrolling & Layout Fixes

## Problem Summary

1. MedicationTimeline component stretches vertically past screen height when many recent meds
2. This blocks access to MedicationList below it (can't scroll down)
3. Need pull-to-refresh on both timeline and list
4. Text alignment in pills needs fixing (should be left-aligned)

## Solution Plan [COMPLETED]

### 1. Integrate MedicationTimeline into MedicationList

- Move MedicationTimeline to be rendered as the first item in MedicationList's FlatList
- This will automatically enable pull-to-refresh for both components together
- Benefits:
  - Single scroll container for both components
  - Unified refresh behavior
  - Natural flow from timeline to list

### 2. Cap MedicationTimeline Height

- Add a maximum height constraint to MedicationTimeline
- Options for responsive height:
  - Use `maxHeight` based on screen dimensions (e.g., 40-50% of screen height)
  - Or use fixed maxHeight that ensures at least 2-3 list items visible below
- Make timeline scrollable within its container when content exceeds max height
- Use ScrollView with vertical scrolling for overflow content

### 3. Fix Text Alignment in Pills

- Ensure all text inside medication pills is consistently left-aligned
- Review and update TextComponent styling within pills

## Implementation Steps

1. **Update MedicationList.tsx**
   - Modify to render MedicationTimeline as header component in FlatList
   - Remove separate MedicationTimeline from parent component (likely index.tsx)

2. **Update MedicationTimeline.tsx**
   - Add maxHeight constraint (calculate based on screen dimensions)
   - Wrap content in ScrollView when needed
   - Fix text alignment in pills to be left-aligned

3. **Update parent component (app/(tabs)/index.tsx)**
   - Remove standalone MedicationTimeline rendering
   - Ensure MedicationList handles both timeline and list

4. **Test**
   - Verify scrolling works with many medications
   - Ensure pull-to-refresh works on both timeline and list
   - Check text alignment is consistent

## Technical Considerations

- Use `useWindowDimensions` or similar for responsive height calculation
- Consider using `ListHeaderComponent` prop of FlatList for cleaner integration
- Maintain existing functionality while improving UX

## Implementation Summary

✅ Successfully integrated MedicationTimeline as header component in MedicationList
✅ Added responsive height constraint (40% of screen height, max 400px)
✅ Implemented internal ScrollView for timeline when content overflows
✅ Fixed text alignment in medication pills (all left-aligned now)
✅ Unified pull-to-refresh behavior for both timeline and list
✅ Removed standalone timeline from HomeScreen
✅ All lint and TypeScript checks pass

The timeline now scrolls smoothly within its constrained height while maintaining access to the medication list below.
