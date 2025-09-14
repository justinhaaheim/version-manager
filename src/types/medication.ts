export type ParsedDataRow = Record<string, string>;

export interface ParsedHealthLoggerDataRow {
  allRowData: Record<string, string>;
  medicineTaken: string | null;
  timestamp: Date;
}

export interface MedicationEntry {
  id: string;
  medicineTaken: string | null;
  timestamp: Date;
}

export interface HourlyConstraint {
  hours: number;
  maxAmount: number;
  unit: string;
}

export interface AmountParser {
  amountIndex: number;
  multiplier?: number;
  regex: RegExp;
}

export interface MedicationRule {
  aliases?: string[];
  amountParser: AmountParser;
  constraints: HourlyConstraint[];
  crossMedicationParsers?: {
    medicationName: string;
    parser: AmountParser;
  }[];
  name: string;
}

export interface PersonConfig {
  medications: MedicationRule[];
  name: string;
}

// export interface ParsedDose {
//   amount: number;
//   medicationName: string;
//   timestamp: Date;
//   unit: string;
// }
