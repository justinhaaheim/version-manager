# Test Scenario Timestamp Improvements

## Problem

- Test scenarios have fixed timestamps from the past
- MedicationTimeline shows them as very old entries
- Need to make test data appear recent relative to current system time

## Solution

1. Add `nowTimestampForTest` field to test scenarios
   - Represents the "current time" when the test data was captured
   - Used to calculate relative time offsets
2. When rendering test data:
   - Calculate time difference between each entry and `nowTimestampForTest`
   - Apply those offsets to current system time
   - Pass adjusted data to MedicationTimeline

## Implementation Plan

### 1. Update Test Scenario Type

- Add `nowTimestampForTest: string` field to scenario interface
- This represents what "now" was when the test data was captured

### 2. Add Timestamp Adjustment Logic

- Create function to adjust timestamps relative to current time
- Calculate offset from original timestamp to nowTimestampForTest
- Apply same offset from current system time

### 3. Update TestMedicationView

- Apply timestamp adjustment before passing to MedicationTimeline
- Keep original data unchanged (for display/debugging)

### 4. Update Existing Scenarios

- Add appropriate nowTimestampForTest to each scenario
- Use a time slightly after the last medication entry

## Benefits

- MedicationTimeline continues to use real current time
- Test data appears recent and relevant
- Original timestamps preserved in scenario data
- Easy to create new test cases from real data

## Progress

- [x] Read scenarios.ts to understand current structure
- [x] Update scenario type definition
- [x] Create timestamp adjustment function
- [x] Update existing scenarios with nowTimestampForTest
- [x] Update TestMedicationView to use adjusted data
- [x] Test the changes
