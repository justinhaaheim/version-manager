# Timeline SVG to Views Refactor

## Goal

Refactor MedicationTimeline from SVG to React Native Views + Tamagui for better interactivity support

## Plan

1. Replace SVG grid lines with absolutely positioned Views
2. Convert medication bars to Tamagui components with borderRadius
3. Use Tamagui Text components for labels
4. Maintain same visual appearance while gaining touch capabilities

## Benefits

- Native touch handling for future tap-to-add functionality
- Tamagui theming integration
- Better gesture handler compatibility
- Easier animation support

## Implementation Notes

- Use absolute positioning for timeline elements
- StyleSheet.absoluteFillObject for overlays
- Tamagui's View with borderRadius for pill shapes
- Keep same layout calculations
