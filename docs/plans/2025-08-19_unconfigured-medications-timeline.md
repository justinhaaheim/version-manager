# Unconfigured Medications Timeline Support

## Goal

Display all medications from the Google spreadsheet in the medication timeline, even if they're not configured in medicationConfig.ts

## Current State

- Only medications defined in medicationConfig.ts are shown in the timeline
- Configured medications have:
  - Duration information
  - Dosing rules
  - Regex parsers for extracting details (mg, etc.)
  - Assigned rows in the timeline

## Proposed Solution

### 1. Visual Treatment for Unconfigured Medications

- Show pill shape starting at the logged time
- Fade out over 4 hours to indicate unknown duration
- Clear visual distinction from configured medications

### 2. Timeline Row Handling

- Add dynamic "Other" rows below configured medication rows
- Each unconfigured medication gets its own row
- Rows are created as needed

### 3. Implementation Changes

#### A. Update MedicationTimeline component

- Detect unconfigured medications in the data
- Create dynamic rows for them
- Apply fade-out styling (gradient or opacity)

#### B. Modify data processing

- Include all medications from spreadsheet, not just configured ones
- Mark medications as configured/unconfigured
- Assign to appropriate rows

#### C. Visual implementation options

- Option 1: Linear gradient mask (fade to transparent)
- Option 2: Opacity animation over the 4-hour period
- Option 3: Dashed/dotted border after certain point

## Implementation Plan

1. **Analyze current code structure**
   - Review MedicationTimeline.tsx
   - Check how medications are filtered/processed
   - Understand row assignment logic

2. **Update data processing**
   - Modify to include all medications
   - Add flag for configured vs unconfigured
   - Handle row assignment for unconfigured meds

3. **Update timeline rendering**
   - Add dynamic row creation
   - Implement fade-out effect (start simple)
   - Test with sample unconfigured medications

4. **Polish and test**
   - Ensure all medications appear
   - Verify visual clarity
   - Test with various medication combinations

## Notes

- Priority: Get it working first, polish later
- Fade effect can be simplified if complex
- Important to clearly communicate "unknown duration" to user

## Current Code Analysis

### Data Flow

1. `MedicationTimeline` receives `MedicationEntry[]` data
2. `processTimelineData` in `medicationVisualizationService.ts`:
   - Calls `parseMedicationEntry` for each entry
   - Only parses medications that match configured patterns
   - Builds rows only for configured medications
3. Unconfigured medications are currently ignored

### Key Files to Modify

1. `medicationVisualizationService.ts`:
   - Update `parseMedicationEntry` to track unparsed medications
   - Create new function to handle unconfigured medications
   - Update `buildTimelineRows` to add dynamic rows

2. `MedicationTimeline.tsx`:
   - Handle rendering of fade-out effect
   - Support dynamic row labels

3. `types/medicationVisualization.ts`:
   - May need to add `isConfigured` flag to `ProcessedMedicationDose`

## Implementation Details

### Unconfigured Medication Handling

- Default duration: 4 hours (fade out period)
- Color: Use a neutral gray color (#9E9E9E)
- Display name: Use the raw medication text
- Row assignment: Dynamic "Other" rows

## Phase 2: Enhanced Timeline Display (Completed)

### Requirements

1. **Tick Marks System**
   - Major tick marks every 3 hours, aligned with noon (12pm)
   - Minor tick marks every hour
   - Major ticks: 12am, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm
   - Labels closer to the bars

2. **Responsive Component**
   - Dynamic time range (before/after now)
   - Adapt divisions based on range
   - Maintain readability at any scale

3. **Two-Row Pill Display**
   - Top row: Medication name (normal size)
   - Bottom row: Relative time (smaller, dimmer)
   - Better visual hierarchy

### Implementation Plan

#### A. Tick Mark System

- Calculate major ticks to align with noon (12pm, 3pm, 6pm, etc.)
- Add minor ticks between majors
- Visual distinction between major/minor grid lines
- Move labels closer to medication bars

#### B. Responsive Scaling

- Add props for timeRange (hoursBeforeNow, hoursAfterNow)
- Calculate appropriate tick intervals based on range
- Adjust label frequency for readability

#### C. Two-Row Pill Layout

- Stack medication name and time vertically
- Use flexbox for centering
- Adjust font sizes and opacity for hierarchy
- Ensure readability at various pill widths

## Implementation Completed

### Changes Made

1. **Types** (`medicationVisualization.ts`)
   - Added `isConfigured?: boolean` to `ProcessedMedicationDose`

2. **Service** (`medicationVisualizationService.ts`)
   - Updated `parseMedicationEntry` to detect and handle unconfigured medications
   - Creates entries for medications not matching any configured patterns
   - Default 4-hour duration for unknown medications
   - Gray color (#9E9E9E) for visual distinction
   - Modified `buildTimelineRows` to add dynamic rows for unconfigured medications

3. **Component** (`MedicationTimeline.tsx`)
   - Added SVG linear gradient for fade-out effect
   - Unconfigured medications fade from 80% opacity to 0% over the bar width
   - Shows medication name instead of dose amount for unconfigured meds

### Result

- All medications from the spreadsheet now appear in the timeline
- Configured medications display as before with known durations
- Unconfigured medications show with a fade-out effect to indicate unknown duration
- Each unconfigured medication gets its own row below the configured ones
