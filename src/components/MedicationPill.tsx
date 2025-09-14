import type {ProcessedMedicationDose} from '@/types/medicationVisualization';
import type {StyleProp, ViewStyle} from 'react-native';

import {LinearGradient} from '@tamagui/linear-gradient';
import React from 'react';
import {Text, Theme, View} from 'tamagui';

interface MedicationPillProps {
  barWidth: number;
  dose: ProcessedMedicationDose;
  isActive: boolean;
  relativeTime: string;
  style?: StyleProp<ViewStyle>;
}

const BAR_HEIGHT = 32;
const BAR_RADIUS = 16;

const ACTIVE_OPACITY = 1;
const INACTIVE_OPACITY = 0.85;

export function MedicationPill({
  dose,
  barWidth,
  isActive,
  relativeTime,
  style,
}: MedicationPillProps) {
  const showContent = dose.isConfigured ? barWidth > 40 : barWidth > 60;
  const showRelativeTime = barWidth > 60;

  // Build the label text
  const labelText =
    dose.isConfigured && dose.amount
      ? `${dose.amount}${dose.unit} ${dose.displayName}`
      : dose.displayName;

  // Common content component
  const pillContent = showContent ? (
    <View
      alignItems="flex-start"
      flex={1}
      flexDirection="column"
      justifyContent="center"
      paddingHorizontal={6}>
      <Text
        color="$white1"
        fontSize={12}
        fontWeight="600"
        numberOfLines={1}
        textAlign="left">
        {labelText}
      </Text>
      {showRelativeTime && (
        <Text
          color="$white5"
          fontSize={10}
          marginTop={-2}
          numberOfLines={1}
          // opacity={0.85}
          textAlign="left">
          {relativeTime}
        </Text>
      )}
    </View>
  ) : null;

  // For unconfigured medications, use gradient background
  if (!dose.isConfigured) {
    return (
      <View
        style={style}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        theme={dose.theme as any}
        width={barWidth}>
        <LinearGradient
          borderRadius={BAR_RADIUS}
          colors={[`$color9`, `$color9`, `$color1`]}
          end={[1, 0]}
          height={BAR_HEIGHT}
          locations={[0, 0.5, 1]}
          start={[0, 0]}
          width={barWidth}>
          {pillContent}
        </LinearGradient>
      </View>
    );
  }

  // For configured medications, use solid background
  return (
    <Theme name="dark">
      <View
        backgroundColor="$color8"
        borderColor="$color7"
        borderRadius={BAR_RADIUS}
        borderWidth="$0.5"
        opacity={isActive ? ACTIVE_OPACITY : INACTIVE_OPACITY}
        paddingHorizontal="$2"
        // shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.5}
        shadowRadius={2}
        style={style}
        theme={dose.theme}
        width={barWidth}>
        {pillContent}
      </View>
    </Theme>
  );
}
