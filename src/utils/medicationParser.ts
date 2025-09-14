import type {
  MedicationEntry,
  ParsedDataRow,
  ParsedHealthLoggerDataRow,
} from '@/types/medication';

import {parseDateToNativeDate} from '@/utils/dateUtils';

const DEBUG = false;

function isNonNullable<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function parseHealthLoggerData(
  data: ParsedDataRow[],
): ParsedHealthLoggerDataRow[] {
  DEBUG &&
    console.debug('[parseHealthLoggerData] Starting parse', {
      firstRow: data[0],
      inputDataLength: data.length,
    });

  const mapped = data.map((row, index) => {
    const timestampValue = row['Timestamp (Calculated)'];
    DEBUG &&
      console.debug(`[parseHealthLoggerData] Processing row ${index}`, {
        medicineTakenValue: row['💊💊 Medicine Taken:'],
        rowKeys: Object.keys(row),
        timestampValue,
      });

    const timestamp = parseDateToNativeDate(timestampValue);
    if (timestamp == null) {
      console.warn('Parsed Timestamp (Calculated) is null for row', row);
      return null;
    }
    return {
      allRowData: row,
      medicineTaken: row['💊💊 Medicine Taken:'] ?? null,
      timestamp: timestamp,
    };
  });

  const filtered = mapped.filter(isNonNullable);

  console.debug('[parseHealthLoggerData] Parse complete', {
    filteredLength: filtered.length,
    firstParsedRow: filtered[0],
    mappedLength: mapped.length,
    nullCount: mapped.filter((item) => item === null).length,
    originalLength: data.length,
  });

  return filtered;
}

export function transformToMedicationEntries(
  data: ParsedHealthLoggerDataRow[],
): MedicationEntry[] {
  DEBUG &&
    console.debug('[transformToMedicationEntries] Starting transform', {
      // firstRow: data[0],
      data,
      inputDataLength: data.length,
    });

  const entries = data.map((row, index) => {
    const entry = {
      id: row.timestamp.toISOString(),
      medicineTaken: row.medicineTaken,
      timestamp: row.timestamp,
    };

    if (DEBUG && index < 3) {
      console.debug(`[transformToMedicationEntries] Entry ${index}`, {
        medicineTaken: entry.medicineTaken,
        timestamp: entry.timestamp,
      });
    }

    return entry;
  });

  DEBUG &&
    console.debug('[transformToMedicationEntries] Transform complete', {
      entriesLength: entries.length,
    });

  return entries;
}

export function parseMedicationText(medicationText: string | null): string[] {
  if (!medicationText) return [];

  return medicationText
    .split(',')
    .filter((item) => item.trim().length > 0)
    .map((item) => item.trim());
}
