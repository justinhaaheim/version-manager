import {Moon, Sun, SunMoon} from '@tamagui/lucide-icons';
import {useCallback, useState} from 'react';
import {Button, TooltipSimple, View} from 'tamagui';

import {useThemeManager} from '@/theme/useThemeManager';

export const ThemeToggle = function ThemeToggle() {
  const {theme, setAppearanceModePreference, explicitAppearanceModePreference} =
    useThemeManager();

  // Freeze the cycle order on mount based on current theme
  const [cycleOrder] = useState(() =>
    theme === 'light'
      ? (['light', 'dark', 'system'] as const)
      : (['dark', 'light', 'system'] as const),
  );

  const Icon =
    explicitAppearanceModePreference === null ||
    explicitAppearanceModePreference === 'system'
      ? SunMoon
      : explicitAppearanceModePreference === 'dark'
        ? Moon
        : Sun;

  const onPress = useCallback(() => {
    // Handle null (no preference) - start the cycle
    if (explicitAppearanceModePreference === null) {
      const next = cycleOrder[0];
      console.debug('[ThemeToggle] onPress (from null)', {
        current: null,
        cycleOrder,
        next,
        theme,
      });
      setAppearanceModePreference(next);
      return;
    }

    // Find current position in cycle and move to next
    const currentIndex = cycleOrder.indexOf(explicitAppearanceModePreference);
    const nextIndex = (currentIndex + 1) % 3;
    const next = cycleOrder[nextIndex];

    console.debug('[ThemeToggle] onPress', {
      current: explicitAppearanceModePreference,
      cycleOrder,
      next,
      theme,
    });
    setAppearanceModePreference(next);
  }, [
    explicitAppearanceModePreference,
    setAppearanceModePreference,
    cycleOrder,
    theme,
  ]);

  return (
    <View marginBottom="$2" marginHorizontal="$5">
      <TooltipSimple
        groupId="header-actions-theme"
        label={
          explicitAppearanceModePreference === null ||
          explicitAppearanceModePreference === 'system'
            ? 'System'
            : `${explicitAppearanceModePreference[0].toUpperCase()}${explicitAppearanceModePreference.slice(1)}`
        }>
        <Button
          aria-label="Toggle light/dark color scheme"
          backgroundColor="$color2"
          borderColor="$color4"
          borderWidth={1}
          circular
          hoverStyle={{
            backgroundColor: '$backgroundHover',
          }}
          icon={Icon}
          onPress={onPress}
          scaleIcon={1.5}
          size="$2.5"
          // top={-4}
        />
      </TooltipSimple>
    </View>
  );
};
