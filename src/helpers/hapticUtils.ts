import * as Haptics from 'expo-haptics';

// Wrapper to add haptic feedback
export const withHaptics = (
  onPress: () => void,
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  return () => {
    void Haptics.impactAsync(style);
    onPress();
  };
};
