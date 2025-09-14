import type {CustomThemeNames} from '@/theme/tamaguiCustomThemes';
import type {SharedValue} from 'react-native-reanimated';

import React from 'react';
import {StyleSheet} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {Text, Theme, View} from 'tamagui';

interface AnimatedMedicationLabelProps {
  cardWidth: number | null;
  displayName: string;
  scrollX: SharedValue<number>;
  theme?: CustomThemeNames;
}

const LABEL_PADDING_FROM_EDGE = 8;

const styles = StyleSheet.create({
  medicationLabel: {
    alignItems: 'flex-start',
    display: 'flex',
    height: 20,
    justifyContent: 'center',
    left: LABEL_PADDING_FROM_EDGE,
    opacity: 0.6,
    position: 'absolute',
    top: 0,
  },
});

export function AnimatedMedicationLabel({
  cardWidth: _cardWidth,
  displayName,
  scrollX,
  theme,
}: AnimatedMedicationLabelProps) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';

    // Use transform for smooth GPU-accelerated animation
    return {
      transform: [{translateX: scrollX.value}],
    };
  });

  return (
    <Theme reset>
      <Animated.View style={[styles.medicationLabel, animatedStyle]}>
        <View
          backgroundColor="$color4"
          borderRadius={4}
          opacity={0.85}
          paddingHorizontal={8}
          theme={theme}>
          <Text color="$color12" fontSize="$2" fontWeight="500">
            {displayName}
          </Text>
        </View>
      </Animated.View>
    </Theme>
  );
}
