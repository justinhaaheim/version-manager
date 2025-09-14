# Medication Timeline Visualization - Engineering Plan

## Executive Summary

Build a Gantt-chart style medication timeline that visualizes what medications are currently active in the user's system. This feature addresses the critical question "What's in my system right now?" by showing medication doses as horizontal bars that span from when taken until when they wear off.

**MVP Scope**: Display taken medications with their active durations. Future phases will add "what can I take next" indicators.

## Core Requirements

### Visual Design (from prototype)

- Horizontal timeline spanning ~10 hours (-6h to +4h from now)
- Vertical "Now" line as reference point
- Each medication type gets its own row
- Doses shown as pill-shaped bars with rounded ends
- Medication amount displayed inside each bar (e.g., "650mg")
- Color-coded by medication type

### Data Requirements

- Parse medication strings from Google Sheets (various formats)
- Track when each dose was taken
- Calculate when each dose wears off
- Support varying dose amounts (1 vs 2 tablets)

## Technical Design

### 1. Configuration Schema

```typescript
// src/config/medicationConfig.ts

interface MedicationVisualizationConfig {
  // User-specific configs
  users: {
    [userId: string]: UserMedicationConfig;
  };
}

interface UserMedicationConfig {
  // Medications to display in timeline
  visualizedMedications: VisualizationMedication[];

  // Global limits (e.g., acetaminophen daily max)
  globalLimits?: GlobalLimit[];
}

interface VisualizationMedication {
  // Unique identifier for this medication
  id: string; // e.g., "acetaminophen_8hr"

  // Display name in UI
  displayName: string; // e.g., "Tylenol"

  // Color for visualization
  color: string; // e.g., "#4CAF50"

  // Parsing configuration
  parser: MedicationParser;

  // Duration medication remains active
  activeDuration: {
    hours: number;
  };

  // Standard doses (for future: entry UI)
  standardDoses?: {
    amount: number;
    unit: string;
    label?: string; // e.g., "1 tablet", "2 tablets"
  }[];

  // Ingredients (for cross-medication limits)
  ingredients?: {
    name: string; // e.g., "acetaminophen"
    amountPerUnit: number; // e.g., 650
    unit: string; // e.g., "mg"
  }[];
}

interface MedicationParser {
  // Regex patterns to match this medication
  patterns: RegExp[];

  // Function to extract dose info from matched string
  extractDose: (matchedString: string) => {
    amount: number;
    unit: string;
  } | null;
}

interface GlobalLimit {
  ingredientName: string; // e.g., "acetaminophen"
  maxAmount: number; // e.g., 4000
  unit: string; // e.g., "mg"
  windowHours: number; // e.g., 24
}
```

### 2. Example Configuration

```typescript
const MEDICATION_CONFIG: MedicationVisualizationConfig = {
  users: {
    justin: {
      visualizedMedications: [
        {
          id: 'acetaminophen_8hr',
          displayName: 'Tylenol',
          color: '#4CAF50',
          parser: {
            patterns: [
              /Acetaminophen 8.?hour.*\((\d+) tablets?\)/i,
              /Tylenol 8.?hour.*\((\d+) tablets?\)/i,
            ],
            extractDose: (match) => {
              const tabletMatch = match.match(/\((\d+) tablets?\)/);
              const tabletCount = tabletMatch ? parseInt(tabletMatch[1]) : 1;
              return {amount: tabletCount * 650, unit: 'mg'};
            },
          },
          activeDuration: {hours: 8},
          standardDoses: [
            {amount: 650, unit: 'mg', label: '1 tablet'},
            {amount: 1300, unit: 'mg', label: '2 tablets'},
          ],
          ingredients: [
            {name: 'acetaminophen', amountPerUnit: 650, unit: 'mg'},
          ],
        },
        {
          id: 'percocet_5_325',
          displayName: 'Percocet',
          color: '#FF9800',
          parser: {
            patterns: [/Percocet 5-325.*\((\d+) tablets?\)/i],
            extractDose: (match) => {
              const tabletMatch = match.match(/\((\d+) tablets?\)/);
              const tabletCount = tabletMatch ? parseInt(tabletMatch[1]) : 1;
              return {
                amount: tabletCount * 5,
                unit: 'mg oxycodone', // Primary ingredient for display
              };
            },
          },
          activeDuration: {hours: 4},
          ingredients: [
            {name: 'oxycodone', amountPerUnit: 5, unit: 'mg'},
            {name: 'acetaminophen', amountPerUnit: 325, unit: 'mg'},
          ],
        },
      ],
      globalLimits: [
        {
          ingredientName: 'acetaminophen',
          maxAmount: 4000,
          unit: 'mg',
          windowHours: 24,
        },
      ],
    },
  },
};
```

### 3. Data Processing Pipeline

```typescript
// src/services/medicationVisualizationService.ts

interface ProcessedMedicationDose {
  medicationId: string;
  displayName: string;
  amount: number;
  unit: string;
  startTime: Date;
  endTime: Date;
  color: string;
  isActive: boolean; // Is currently in system
}

interface TimelineData {
  rows: TimelineRow[];
  nowTime: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
}

interface TimelineRow {
  medicationId: string;
  displayName: string;
  doses: ProcessedMedicationDose[];
}

// Main processing function
function processTimelineData(
  entries: MedicationEntry[],
  config: UserMedicationConfig,
  nowTime: Date = new Date(),
): TimelineData {
  // 1. Parse raw medication strings into structured doses
  const parsedDoses = entries.flatMap((entry) =>
    parseMedicationEntry(entry, config),
  );

  // 2. Group by medication type
  const groupedByMedication = groupDosesByMedication(parsedDoses);

  // 3. Calculate active periods
  const processedDoses = calculateActivePeriods(groupedByMedication, config);

  // 4. Build timeline structure
  return buildTimelineData(processedDoses, config, nowTime);
}
```

### 4. Visualization Component Architecture

```typescript
// src/components/MedicationTimeline/MedicationTimeline.tsx

interface MedicationTimelineProps {
  data: MedicationEntry[];
  height?: number;
}

export function MedicationTimeline({ data, height = 300 }: MedicationTimelineProps) {
  const config = useMedicationConfig(); // Gets user-specific config
  const timelineData = useMemo(
    () => processTimelineData(data, config),
    [data, config]
  );

  return (
    <TimelineContainer height={height}>
      <TimelineHeader timeRange={timelineData.timeRange} />
      <TimelineBody>
        {timelineData.rows.map(row => (
          <TimelineRow key={row.medicationId} row={row} />
        ))}
        <NowIndicator />
      </TimelineBody>
    </TimelineContainer>
  );
}
```

### 5. State Management Integration

Add timeline-specific state to the existing Zustand store:

```typescript
// Extend MainStore interface
interface MainStore {
  // ... existing properties ...

  medicationVisualization: {
    config: UserMedicationConfig | null;
    processedTimelineData: TimelineData | null;
  };

  actions: {
    // ... existing actions ...
    setMedicationConfig: (config: UserMedicationConfig) => void;
    updateTimelineData: (data: TimelineData) => void;
  };
}
```

## Implementation Plan

### Phase 1: MVP (Current Focus)

1. **Configuration Setup** ✅ Priority
   - Create medication config for Justin
   - Define parsing patterns for current medications
   - Set active durations based on prescriptions

2. **Data Processing** ✅ Priority
   - Build medication string parser using regex
   - Create dose grouping logic
   - Calculate active period endpoints

3. **Basic Visualization** ✅ Priority
   - Implement horizontal timeline component
   - Create medication row components
   - Add "Now" indicator line
   - Render pill-shaped bars with amounts

4. **Integration** ✅ Priority
   - Add timeline above existing medication list
   - Connect to existing data flow
   - Ensure real-time updates work

### Phase 2: Enhanced Functionality (Future)

- Add "what can I take next" dotted indicators
- Implement ingredient tracking (acetaminophen limits)
- Add dose amount visualization differences
- Create interaction handlers for logging doses

### Phase 3: Advanced Features (Future)

- Multiple user configs
- Medication effectiveness fade visualization
- Smart dose recommendations
- iOS Live Activities integration

## Key Design Decisions

### 1. Configuration Over Code

Medication rules live in configuration, not hardcoded logic. This makes it easy to adjust durations, doses, and parsing without changing component code.

### 2. Regex-Based Parsing

Given the inconsistent medication string formats, regex patterns provide flexibility. Each medication can have multiple patterns to handle variations.

### 3. Ingredient Tracking Design

Separating ingredients from medications allows tracking cross-medication limits (e.g., total acetaminophen from Tylenol + Percocet).

### 4. Time Window Choice

10-hour window (-6h to +4h) balances context with clarity. Shows recent history without cluttering.

### 5. Real-Time Updates

Leverage existing seconds ticker for dynamic "time ago" updates in visualization.

## Testing Approach

### 1. Parser Testing

- Unit tests for each medication regex pattern
- Edge cases: decimals, abbreviations, missing units

### 2. Timeline Calculation

- Test active period calculations
- Verify overlapping doses handled correctly
- Check timezone handling

### 3. Visual Testing

- Screenshot tests for different medication combinations
- Responsive layout testing
- Dark mode compatibility

## MVP Success Criteria

1. **Correctly Parse**: Successfully parse 95% of existing medication entries
2. **Accurate Visualization**: Show active medications with correct durations
3. **Performance**: Render timeline in <100ms with 100+ entries
4. **User Understanding**: Users can identify active medications within 2 seconds

## Open Questions for Discussion

1. **Dose Visualization**: Should we use bar height/opacity to indicate dose strength, or is text sufficient?

2. **Medication Grouping**: Should "Acetaminophen 8 hour" and "Acetaminophen Extra Strength" be separate rows or combined?

3. **Edge Cases**: How to handle medications taken "as needed" without clear duration guidelines?

4. **Color Scheme**: Use medication-specific colors or category-based (pain, migraine, etc.)?

## Next Steps

1. Review and refine medication config with actual prescription data
2. Implement parser with comprehensive test cases
3. Build timeline component using React Native SVG or Canvas
4. Integrate with existing data flow
5. Add to home screen above medication list

## Technical Considerations

### Performance

- Memoize timeline calculations
- Use React Native's InteractionManager for smooth scrolling
- Consider virtualization if many medication types

### Accessibility

- Ensure color contrast meets WCAG standards
- Add screen reader descriptions for timeline elements
- Support Dynamic Type sizing

### Platform Differences

- iOS: Leverage native feel with haptic feedback
- Future: Consider Apple Watch companion view

This plan provides a solid foundation for building the medication timeline while maintaining flexibility for future enhancements. The focus remains on delivering a working MVP that provides immediate value while setting up the architecture for more advanced features.
