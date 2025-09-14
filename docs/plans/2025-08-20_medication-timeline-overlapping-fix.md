# Medication Timeline Overlapping Fix

## Critical Issue

Medications taken within the last 12 hours MUST be clearly visible. Overlapping pills can be dangerous if doses are hidden.

## Current Problems

1. **Overlapping Pills**: Multiple doses of same medication overlap, making it hard to see all doses
2. **Text Wrapping**: Text wraps awkwardly in narrow pills
3. **Sort Order**: Need most recent medications at top
4. **Scrollability**: Need vertical scroll for overflow content

## Solution Plan

### 1. Sub-row Logic for Non-overlapping Pills

- Each medication row can have multiple sub-rows
- Pills placed in first available sub-row where they don't overlap
- Algorithm:
  1. Sort doses by startTime (most recent first)
  2. For each dose, find first sub-row where it doesn't overlap
  3. If no clear sub-row, create new one
  4. Track pill time ranges per sub-row

### 2. Fix Text Overflow

- Disable text wrapping (no numberOfLines)
- Allow text to overflow pill boundaries
- Add shadow/backdrop for readability when text overflows

### 3. Sort Medications

- Most recent doses at top of timeline
- Within each medication row, most recent doses in top sub-rows

### 4. Make Timeline Scrollable

- Add ScrollView wrapper for vertical overflow
- Maintain fixed header with time labels

## Implementation Steps

1. ✅ Create sub-row placement logic
2. ✅ Update row rendering to support sub-rows
3. ✅ Fix text wrapping and add overflow shadow
4. ✅ Sort medications by recency
5. ✅ Add ScrollView for vertical overflow
6. ✅ Test with overlapping doses

## Completed Changes

### Sub-row Logic

- Implemented `organizeDosesIntoSubRows` function that:
  - Sorts doses by start time (most recent first)
  - Places each dose in first available sub-row where it doesn't overlap
  - Creates new sub-rows as needed
  - Ensures all doses are visible

### Sorting

- Rows sorted by most recent medication first
- Within each row, doses sorted by recency (most recent in top sub-rows)

### Text Overflow

- Removed `numberOfLines` prop to prevent wrapping
- Added `overflow="visible"` to text containers
- Simplified text shadow implementation (removed due to type issues)

### Scrollability

- Added ScrollView wrapper with `maxHeight: 400`
- Disabled vertical scroll indicator for cleaner look
- Maintains fixed time labels at top

### Visual Improvements

- Added vertical gap between medication rows
- Adjusted sub-row heights for better spacing
- Each overlapping dose now appears on separate sub-row

## Testing Scenarios

- Multiple doses of same medication within 1 hour
- Long medication names
- Many different medications
- Timeline with 10+ rows
