import type {MedicationEntry, ParsedDataRow} from '@/types/medication';

import {
  parseHealthLoggerData,
  transformToMedicationEntries,
} from '@/utils/medicationParser';

// Helper to parse CSV-like data (similar to what Google Sheets API returns)
function parseCSVData(headers: string[], rows: string[][]): ParsedDataRow[] {
  return rows.map((row) => {
    const parsedRow: ParsedDataRow = {};
    headers.forEach((header, index) => {
      parsedRow[header] = row[index] ?? '';
    });
    return parsedRow;
  });
}

// Common headers that match your actual Google Sheets
const HEADERS = ['Timestamp (Calculated)', '💊💊 Medicine Taken:', 'User'];

// Scenario type definition
export interface TestScenario {
  data: ParsedDataRow[];
  description: string;
  name: string;
  nowTimestampForTest: string; // The "current time" when this test data was captured
}

// Function to adjust timestamps relative to current time
export function adjustTimestampsForTesting(
  data: ParsedDataRow[],
  nowTimestampForTest: string,
): MedicationEntry[] {
  const testNowTime = new Date(nowTimestampForTest).getTime();
  const actualNowTime = Date.now();
  const timeDifference = actualNowTime - testNowTime;

  // Adjust timestamps in the raw data before parsing
  const adjustedData = data.map((row) => {
    const originalTimestamp = row['Timestamp (Calculated)'] || '';
    const originalTime = new Date(originalTimestamp).getTime();

    // Check if date is valid
    if (isNaN(originalTime)) {
      console.warn('Invalid timestamp in test data:', originalTimestamp);
      return row;
    }

    const adjustedTime = originalTime + timeDifference;
    const adjustedTimestamp = new Date(adjustedTime).toISOString();

    return {
      ...row,
      'Timestamp (Calculated)': adjustedTimestamp,
    };
  });

  // Parse and transform the adjusted data
  const parsedData = parseHealthLoggerData(adjustedData);
  return transformToMedicationEntries(parsedData);
}

// Test scenario data - you can copy/paste actual data from your spreadsheet
export const TEST_SCENARIOS: Record<string, TestScenario> = {
  // Edge cases
  aboutToExpire: {
    data: parseCSVData(HEADERS, [
      // Medications about to expire (7.9 hours ago for 8-hour medication)
      ['8/17/2025 4:06:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/17/2025 8:00:00', 'Percocet 5-325 (1 tablet)', 'justin'], // 4 hours ago
      ['8/17/2025 3:00:00', 'Gabapentin 300mg (1 capsule)', 'justin'], // 9 hours ago
    ]),
    description: 'Medications about to expire from system',
    name: 'About to Expire',
    nowTimestampForTest: '8/17/2025 21:00:00',
  },

  empty: {
    data: parseCSVData(HEADERS, []),
    description: 'No medication data',
    name: 'Empty Data',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  maxDosage: {
    data: parseCSVData(HEADERS, [
      // Approaching daily maximums
      ['8/17/2025 11:00:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/17/2025 10:30:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 7:00:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/17/2025 6:30:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 3:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 2:30:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/16/2025 23:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/16/2025 22:30:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
    ]),
    description: 'Approaching daily maximum dosages',
    name: 'Max Dosage',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  multipleUsers: {
    data: parseCSVData(HEADERS, [
      // Mix of users
      ['8/17/2025 11:00:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
      ['8/17/2025 10:30:00', 'Ibuprofen 400mg (2 tablets)', 'kesa'],
      ['8/17/2025 10:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 9:30:00', 'Acetaminophen 8 hour (1 tablet)', 'kesa'],
      ['8/17/2025 8:00:00', 'Gabapentin 300mg (1 capsule)', 'justin'],
      ['8/17/2025 7:30:00', 'Migraine medication', 'kesa'],
    ]),
    description: 'Multiple users with different medications',
    name: 'Multiple Users',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  overlapping: {
    data: parseCSVData(HEADERS, [
      // Multiple overlapping medications taken at different times
      ['8/17/2025 11:00:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/17/2025 10:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 9:30:00', 'Gabapentin 300mg (1 capsule)', 'justin'],
      ['8/17/2025 8:00:00', 'Ibuprofen 400mg (2 tablets)', 'justin'],
      ['8/17/2025 7:30:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
    ]),
    description: 'Multiple overlapping active medications',
    name: 'Overlapping Medications',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  // Real-world scenario you can update with actual data
  realData: {
    data: parseCSVData(HEADERS, [
      // Paste your actual CSV data here
      // This is a placeholder - replace with real data when needed
      ['8/17/2025 11:00:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
    ]),
    description: 'Real data from actual spreadsheet',
    name: 'Real Data Sample',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  recentDoses: {
    data: parseCSVData(HEADERS, [
      // Just took medications
      ['8/17/2025 11:55:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 11:50:00', 'Gabapentin 300mg (1 capsule)', 'justin'],
      ['8/17/2025 11:45:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
    ]),
    description: 'Medications taken in the last 15 minutes',
    name: 'Recent Doses',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },

  standard: {
    data: parseCSVData(HEADERS, [
      // Standard day with spaced medications - paste your actual data here
      ['8/17/2025 10:00:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
      ['8/17/2025 6:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/17/2025 2:00:00', 'Gabapentin 300mg (1 capsule)', 'justin'],
      ['8/16/2025 22:00:00', 'Acetaminophen 8 hour (2 tablets)', 'justin'],
      ['8/16/2025 18:00:00', 'Ibuprofen 400mg (2 tablets)', 'justin'],
      ['8/16/2025 14:00:00', 'Percocet 5-325 (1 tablet)', 'justin'],
      ['8/16/2025 10:00:00', 'Acetaminophen 8 hour (1 tablet)', 'justin'],
    ]),
    description: 'Normal day with regular medication spacing',
    name: 'Standard Day',
    nowTimestampForTest: '2025-08-17T12:00:00',
  },
};

// Get scenario by ID
export function getTestScenario(scenarioId: string): TestScenario | null {
  return TEST_SCENARIOS[scenarioId] ?? null;
}

// Get all scenario IDs
export function getTestScenarioIds(): string[] {
  return Object.keys(TEST_SCENARIOS);
}

// Get scenario info
export function getTestScenarioInfo(scenarioId: string) {
  const scenario = TEST_SCENARIOS[scenarioId];
  return scenario
    ? {
        description: scenario.description,
        name: scenario.name,
        rowCount: scenario.data.length,
      }
    : null;
}

// Get raw scenario data (for backward compatibility)
export function getTestScenarioData(
  scenarioId: string,
): ParsedDataRow[] | null {
  const scenario = TEST_SCENARIOS[scenarioId];
  return scenario?.data ?? null;
}
