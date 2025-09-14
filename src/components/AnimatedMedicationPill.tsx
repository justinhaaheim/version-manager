import type {ProcessedMedicationDose} from '@/types/medicationVisualization';
import type {StyleProp, ViewStyle} from 'react-native';

import React from 'react';

import {MedicationPill} from '@/components/MedicationPill';

interface AnimatedMedicationPillProps {
  barWidth: number;
  dose: ProcessedMedicationDose;
  isActive: boolean;
  relativeTime: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedMedicationPill({
  dose,
  barWidth,
  isActive,
  relativeTime,
  style,
}: AnimatedMedicationPillProps) {
  // For now, just render the pill directly with absolute positioning
  // The parent AnimatedSubRow will handle the height animation
  return (
    <MedicationPill
      barWidth={barWidth}
      dose={dose}
      isActive={isActive}
      relativeTime={relativeTime}
      style={style}
    />
  );
}
