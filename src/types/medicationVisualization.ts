import type {CustomThemeNames} from '@/theme/tamaguiCustomThemes';

export interface MedicationVisualizationConfig {
  users: Record<string, UserMedicationConfig>;
}

export interface UserMedicationConfig {
  globalLimits?: GlobalLimit[];
  visualizedMedications: VisualizationMedication[];
}

export interface MedicationDuration {
  citations: string[]; // Array of citation URLs
  halfLife?: number; // Plasma half-life in hours if relevant
  max?: number; // Maximum duration in hours from research
  min?: number; // Minimum duration in hours from research
  notes?: string; // Any important notes about duration
  typical: number; // The typical/usual duration in hours (used for calculations)
}

export interface VisualizationMedication {
  activeDuration: MedicationDuration | null;
  displayName: string;
  id: string;
  ingredients?: {
    amountPerUnit: number;
    name: string;
    unit: string;
  }[];
  parser: MedicationParser;
  standardDoses?: {
    amount: number;
    label?: string;
    unit: string;
  }[];
  theme: CustomThemeNames;
}

export interface MedicationParser {
  extractDose: (matchedString: string) => {
    amount: number;
    unit: string;
  } | null;
  patterns: RegExp[];
}

export interface GlobalLimit {
  ingredientName: string;
  maxAmount: number;
  unit: string;
  windowHours: number;
}

export interface ParsedDose {
  activeDurationHours: number | null;
  amount: number | null;
  displayName: string;
  isConfigured: boolean;
  medicationId: string;
  theme: CustomThemeNames;
  timestamp: Date;
  unit: string;
}

export interface ProcessedMedicationDose {
  amount: number | null;
  displayName: string;
  endTime: Date;
  // isActive: boolean;
  isConfigured?: boolean;
  medicationId: string;
  startTime: Date;
  theme: CustomThemeNames;
  unit: string;
}

export interface TimelineData {
  rows: TimelineRow[];
}

export interface TimelineRow {
  displayName: string;
  doses: ProcessedMedicationDose[];
  medicationId: string;
  theme: CustomThemeNames;
}
