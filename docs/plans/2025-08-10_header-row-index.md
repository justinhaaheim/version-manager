# Header Row Index Configuration

## Task

Add `headerRowIndex` to GoogleSheetsConfig type and use it in parseSheetData function to support spreadsheets where headers are not in the first row.

## Plan

1. **Update GoogleSheetsConfig interface**
   - Add `headerRowIndex: number` field (zero-indexed, non-nullable)
   - This will specify which row contains the column headers

2. **Update parseSheetData function**
   - Modify to accept a config parameter (or just headerRowIndex)
   - Use headerRowIndex to identify the header row
   - Skip rows before the header row
   - Parse data rows starting from headerRowIndex + 1

3. **Update call sites**
   - Update fetchSpreadsheetData to pass config to parseSheetData
   - Ensure all places creating GoogleSheetsConfig provide headerRowIndex

## Implementation Notes

- headerRowIndex is zero-indexed (0 = first row, 1 = second row, etc.)
- Need to handle edge cases where headerRowIndex >= values.length
- Data rows start at headerRowIndex + 1

## Progress

- [x] Update GoogleSheetsConfig interface
- [x] Update parseSheetData function signature and implementation
- [x] Update fetchSpreadsheetData to pass config
- [x] Find and update all config creation sites
- [x] Run npm run signal to check for issues

## Summary

Successfully added `headerRowIndex` field to GoogleSheetsConfig:

- Added `headerRowIndex: number` to the interface in googleSheets.ts
- Updated parseSheetData to accept config and use headerRowIndex
- Fixed duplicate GoogleSheetsConfig definition (removed from types/medication.ts)
- Updated import in mainStore.ts to use the single source of truth
- Set default headerRowIndex to 0 in SHEETS_CONFIG
