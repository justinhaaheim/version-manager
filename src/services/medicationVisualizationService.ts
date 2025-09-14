import type {MedicationEntry} from '@/types/medication';
import type {
  ParsedDose,
  ProcessedMedicationDose,
  TimelineData,
  TimelineRow,
  UserMedicationConfig,
} from '@/types/medicationVisualization';

import {DEFAULT_MEDICATION_DURATION_HOURS} from '@/config/medicationConfig';
import {ONE_HOUR_IN_MS} from '@/constants/timeConstants';
import {parseMedicationText} from '@/utils/medicationParser';

const DEBUG = false;
const DEFAULT_THEME_NAME_FOR_MEDICATIONS = 'jade';

/**
 * Parse a single medication entry using configured parsers
 */
function parseMedicationEntry(
  entry: MedicationEntry,
  config: UserMedicationConfig,
): ParsedDose[] {
  if (!entry.medicineTaken) return [];

  const medicationStrings = parseMedicationText(entry.medicineTaken);
  const parsedDoses: ParsedDose[] = [];
  const processedMedStrings = new Set<string>();

  for (const medString of medicationStrings) {
    let matched = false;

    for (const medication of config.visualizedMedications) {
      // Check if any pattern matches
      const matchedPattern = medication.parser.patterns.find((pattern) =>
        pattern.test(medString),
      );

      if (matchedPattern) {
        const doseInfo = medication.parser.extractDose(medString);
        if (doseInfo) {
          parsedDoses.push({
            activeDurationHours: medication.activeDuration?.typical ?? 6,
            amount: doseInfo.amount,
            displayName: medication.displayName,
            isConfigured: true,
            medicationId: medication.id,
            theme: medication.theme,
            timestamp: entry.timestamp,
            unit: doseInfo.unit,
          });
          matched = true;
          processedMedStrings.add(medString);
          break; // Stop checking other medications once we find a match
        }
      }
    }

    // If no configured medication matched, create an unconfigured entry
    if (!matched && medString.trim()) {
      parsedDoses.push({
        activeDurationHours: null, // Default for unknown medications
        amount: null,
        displayName: medString.trim(),

        isConfigured: false,

        medicationId: `unconfigured_${medString
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')}`,
        // Unknown amount
        theme: DEFAULT_THEME_NAME_FOR_MEDICATIONS,
        timestamp: entry.timestamp,
        unit: '',
      });
      processedMedStrings.add(medString);
    }
  }

  DEBUG &&
    console.debug('[parseMedicationEntry]', {
      entry: entry.medicineTaken,
      parsedCount: parsedDoses.length,
      parsedDoses,
    });

  return parsedDoses;
}

/**
 * Process parsed doses into timeline-ready format
 */
function processIntoTimelineDoses({
  parsedDoses,
}: {
  parsedDoses: ParsedDose[];
}): ProcessedMedicationDose[] {
  return parsedDoses.map((dose) => {
    const activeDurationHours =
      dose.activeDurationHours ?? DEFAULT_MEDICATION_DURATION_HOURS;
    const endTime = new Date(
      dose.timestamp.getTime() + activeDurationHours * ONE_HOUR_IN_MS,
    );

    return {
      amount: dose.amount,
      displayName: dose.displayName,
      endTime,
      isConfigured: dose.isConfigured,
      medicationId: dose.medicationId,
      startTime: dose.timestamp,
      theme: dose.theme,
      unit: dose.unit,
    };
  });
}

/**
 * Build timeline rows grouped by medication
 */
function buildTimelineRows({
  processedDoses,
  config,
}: {
  config: UserMedicationConfig;
  processedDoses: ProcessedMedicationDose[];
}): TimelineRow[] {
  const rows: TimelineRow[] = [];

  // Create a row for each configured medication
  // TODO: It makes more sense to loop over the doses and then look up the medication config for each dose.
  for (const medication of config.visualizedMedications) {
    // Filter doses for this medication within the time range
    const medicationDoses = processedDoses.filter(
      (dose) => dose.medicationId === medication.id,
    );

    if (medicationDoses.length === 0) {
      continue;
    }

    // Sort doses by start time (most recent first)
    medicationDoses.sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime(),
    );

    rows.push({
      displayName: medication.displayName,
      doses: medicationDoses,
      medicationId: medication.id,
      theme: medication.theme,
    });
  }

  // Add rows for unconfigured medications
  const unconfiguredDoses = processedDoses.filter((dose) => !dose.isConfigured);

  // TODO: Isn't this what we already do?? Why not just process unconfigured together with configured?
  // Group unconfigured doses by medicationId to create separate rows
  const unconfiguredGroups = new Map<string, ProcessedMedicationDose[]>();
  for (const dose of unconfiguredDoses) {
    const existing = unconfiguredGroups.get(dose.medicationId) ?? [];
    existing.push(dose);
    unconfiguredGroups.set(dose.medicationId, existing);
  }

  // Create a row for each unconfigured medication
  for (const [medicationId, doses] of unconfiguredGroups) {
    // Sort doses by start time (most recent first)
    doses.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Use the display name from the first dose
    const displayName = doses[0].displayName;
    const theme = doses[0].theme;

    rows.push({
      displayName,
      doses,
      medicationId,
      theme,
    });
  }

  return rows;
}

/**
 * Main processing function to transform medication entries into timeline data
 */
export function processTimelineData({
  entries,
  config,
}: {
  config: UserMedicationConfig;
  entries: MedicationEntry[];
}): TimelineData {
  // Parse all medication entries
  const allParsedDoses = entries.flatMap((entry) =>
    parseMedicationEntry(entry, config),
  );

  // Process into timeline format
  const processedDoses = processIntoTimelineDoses({
    parsedDoses: allParsedDoses,
  });

  // Build timeline rows
  const rows = buildTimelineRows({config, processedDoses});

  DEBUG &&
    console.debug('[processTimelineData]', {
      entriesCount: entries.length,
      parsedDosesCount: allParsedDoses.length,
      processedDosesCount: processedDoses.length,
      rowsCount: rows.length,
    });

  return {
    rows,
  };
}

/**
 * Calculate total ingredient consumption over a time window
 */
export function calculateIngredientConsumption(
  entries: MedicationEntry[],
  config: UserMedicationConfig,
  ingredientName: string,
  windowHours: number,
  nowTime: Date = new Date(),
): {total: number; unit: string} {
  const windowStart = new Date(
    nowTime.getTime() - windowHours * 60 * 60 * 1000,
  );

  let totalAmount = 0;
  let unit = '';

  // Parse entries within the window
  const relevantEntries = entries.filter(
    (entry) => entry.timestamp >= windowStart && entry.timestamp <= nowTime,
  );

  for (const entry of relevantEntries) {
    const parsedDoses = parseMedicationEntry(entry, config);

    for (const dose of parsedDoses) {
      // Find the medication config
      const medication = config.visualizedMedications.find(
        (med) => med.id === dose.medicationId,
      );

      if (medication?.ingredients && dose.amount != null) {
        for (const ingredient of medication.ingredients) {
          if (ingredient.name === ingredientName) {
            // Calculate amount based on dose
            const multiplier =
              dose.amount /
              (medication.standardDoses?.[0]?.amount ?? dose.amount);
            totalAmount += ingredient.amountPerUnit * multiplier;
            unit = ingredient.unit;
          }
        }
      }
    }
  }

  return {total: totalAmount, unit};
}
