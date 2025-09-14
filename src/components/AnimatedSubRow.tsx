import type {ReactNode} from 'react';
import type {SharedValue} from 'react-native-reanimated';

import React from 'react';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

export interface DosePosition {
  barWidth: number;
  endX: number;
  startX: number;
}

interface AnimatedSubRowProps {
  cardWidth: number | null;
  children: ReactNode;
  dosePositions: DosePosition[];
  marginBottom?: number;
  marginTop?: number;
  scrollX: SharedValue<number>;
}

const SUB_ROW_HEIGHT = 36;
const SUB_ROW_MARGIN = 4;

// Configuration for row shrinking behavior
const ROW_SHRINK_CONFIG = {
  // Fully collapsed 35px past edge
  END_SHRINK_OFFSET: 35,

  // Full height
  MAX_HEIGHT: SUB_ROW_HEIGHT,

  // Margin configuration
  MAX_MARGIN: SUB_ROW_MARGIN,

  MIN_HEIGHT: 0,

  MIN_MARGIN: 0,
  // Start shrinking 15px past edge
  START_SHRINK_OFFSET: 15,
};

export function AnimatedSubRow({
  children,
  dosePositions,
  scrollX,
  cardWidth,
  marginTop = SUB_ROW_MARGIN,
  marginBottom = SUB_ROW_MARGIN,
}: AnimatedSubRowProps) {
  // Animated style for height and margins based on scroll position
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';

    if (cardWidth == null || cardWidth === 0 || dosePositions.length === 0) {
      // If we don't have card width yet or no doses, show at full height
      return {
        height: ROW_SHRINK_CONFIG.MAX_HEIGHT,
        marginBottom,
        marginTop,
        overflow: 'hidden',
      };
    }

    // Calculate height for each dose based on its distance from the visible window
    let maxHeight = 0;

    for (const pos of dosePositions) {
      // Calculate the pill's position relative to the current scroll
      const pillLeft = pos.startX - scrollX.value;
      const pillRight = pillLeft + pos.barWidth;

      // Find the nearest edge of the pill to the visible window
      let distanceFromWindow = 0;

      if (pillRight < 0) {
        // Pill is entirely to the left of the window
        distanceFromWindow = Math.abs(pillRight);
      } else if (pillLeft > cardWidth) {
        // Pill is entirely to the right of the window
        distanceFromWindow = pillLeft - cardWidth;
      } else {
        // Pill is at least partially in the window
        distanceFromWindow = 0;
      }

      // Calculate height based on distance from window
      let doseHeight = ROW_SHRINK_CONFIG.MAX_HEIGHT;

      if (distanceFromWindow <= ROW_SHRINK_CONFIG.START_SHRINK_OFFSET) {
        // Within the start offset - full height
        doseHeight = ROW_SHRINK_CONFIG.MAX_HEIGHT;
      } else if (distanceFromWindow >= ROW_SHRINK_CONFIG.END_SHRINK_OFFSET) {
        // Beyond the end offset - no height
        doseHeight = ROW_SHRINK_CONFIG.MIN_HEIGHT;
      } else {
        // Between start and end offsets - interpolate
        doseHeight = interpolate(
          distanceFromWindow,
          [
            ROW_SHRINK_CONFIG.START_SHRINK_OFFSET,
            ROW_SHRINK_CONFIG.END_SHRINK_OFFSET,
          ],
          [ROW_SHRINK_CONFIG.MAX_HEIGHT, ROW_SHRINK_CONFIG.MIN_HEIGHT],
          Extrapolation.CLAMP,
        );
      }

      // Keep track of the maximum height
      maxHeight = Math.max(maxHeight, doseHeight);
    }

    // Calculate margin based on height ratio
    const heightRatio = maxHeight / ROW_SHRINK_CONFIG.MAX_HEIGHT;
    const animatedMarginTop = marginTop * heightRatio;
    const animatedMarginBottom = marginBottom * heightRatio;

    return {
      height: maxHeight,
      marginBottom: animatedMarginBottom,
      marginTop: animatedMarginTop,
      overflow: 'hidden',
    };
  });

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'relative',
          width: '100%',
        },
      ]}>
      {children}
    </Animated.View>
  );
}
