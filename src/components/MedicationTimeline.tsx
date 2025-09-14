import type {MedicationEntry} from '@/types/medication';
import type {
  ProcessedMedicationDose,
  TimelineData,
} from '@/types/medicationVisualization';
import type {BaseObject} from '@/utils/loggingUtils';
import type {View as ReactNativeView} from 'react-native';

import dayjs from 'dayjs';
import {BlurView} from 'expo-blur';
import {useFocusEffect} from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState, StyleSheet} from 'react-native';
import Animated, {
  runOnUI,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {Card, ScrollView, Text, View} from 'tamagui';

import {AnimatedMedicationLabel} from '@/components/AnimatedMedicationLabel';
import {AnimatedMedicationPill} from '@/components/AnimatedMedicationPill';
import {AnimatedSubRow} from '@/components/AnimatedSubRow';
import {getUserMedicationConfig} from '@/config/medicationConfig';
import {ONE_HOUR_IN_MS} from '@/constants/timeConstants';
import {processTimelineData} from '@/services/medicationVisualizationService';
import {useDebugTimelineOverflow, useDevStoreActions} from '@/store/devStore';
import {useSecondsSinceAppInit} from '@/store/mainStore';
import {useThemeManager} from '@/theme/useThemeManager';
import {
  getDurationString,
  getLatestDoseEndTimeMs,
  isDoseIntersectingTimeMs,
  isDoseWithinRange,
} from '@/utils/dateUtils';
import {objectGetValueOfAllProperties} from '@/utils/loggingUtils';
import {formatTimeLabel} from '@/utils/timeFormatting';

interface MedicationTimelineProps {
  data: MedicationEntry[];
  defaultWindowEndOffsetHours?: number;
  defaultWindowStartOffsetHours?: number;
  fullRangeEndOffsetHours?: number;
  fullRangeStartOffsetHours?: number;
  height?: number;
  onSnapToDefaultRequest?: (callback: () => void) => void;
  scrollRightLimitOffsetHours?: number;
}

type TickMark = {isMajor: boolean; label: string | null; time: Date; x: number};

// const TIMELINE_PADDING = {
//   bottom: 10,
//   left: 10,
//   right: 10,
//   top: 35, // Reduced to bring labels closer to bars
// };

const TIMELINE_LABEL_SECTION = {height: 35, paddingBottom: 8, paddingTop: 10};

const MEDICATION_ROW_PARAMS = {
  firstRowMarginTop: 4,
  subRowMarginBottom: 4,
  topBorderWidth: 4,
};

const GRID_LINE_OPACITY = {
  major: 0.1,
  minor: 0.03,
};

const BAR_HEIGHT = 32;

const VERTICAL_LINE_OVERDRAW_HEIGHT = 500;

const DISPLAY_ROW_LABELS = true;
const DISPLAY_ROW_BACKGROUND_COLORS = true;

const NOW_LABEL = 'Now';

const styles = StyleSheet.create({
  cardScrollContainerDebug: {
    alignSelf: 'center',
    width: '50%',
  },
  cardScrollContainerNormal: {width: 'auto'},
  gridLine: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
  horizontalScrollContainerDebug: {
    borderColor: 'blue',
    borderWidth: 2,
    overflow: 'visible',
  },
  horizontalScrollContainerNormal: {
    overflow: 'hidden',
  },
  hourLabel: {
    bottom: TIMELINE_LABEL_SECTION.paddingBottom,
    position: 'absolute',
  },
  hourLabelBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  medicationBar: {
    alignItems: 'flex-start',
    height: BAR_HEIGHT,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
  medicationLabel: {
    alignItems: 'flex-start',
    display: 'flex',
    height: 20,
    justifyContent: 'center',
    // left: 0,
    opacity: 0.6,
    position: 'absolute',
    top: 0,
  },
  medicationRow: {
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  nowLabel: {
    height: 20,
    // pointerEvents: 'auto',
    position: 'absolute',
    top: TIMELINE_LABEL_SECTION.paddingTop - 3,
    width: 40,
    zIndex: 1000,
  },
  nowLine: {
    bottom: 0,
    position: 'absolute',
    width: 2,
  },
  nowLineMainSegment: {
    top: 0,
  },
  nowLineSmallSegmentLabelSection: {
    height: TIMELINE_LABEL_SECTION.paddingBottom,
  },
  timelineContainer: {
    // overflow: 'hidden',
    position: 'relative',
  },
  timelineLabelSection: {
    height: TIMELINE_LABEL_SECTION.height,
    width: '100%',
    zIndex: 10,
  },
  timelineRowsContainer: {
    display: 'flex', // We want this to be a flex container so we can stack rows on top of each other and not have to manually calculate the height
    flexDirection: 'column',
    marginVertical: 4,
    overflow: 'visible',
    position: 'relative',
    width: '100%',
  },
  verticalLine: {
    bottom: 0 - VERTICAL_LINE_OVERDRAW_HEIGHT,
    position: 'absolute',
    top: 0 - VERTICAL_LINE_OVERDRAW_HEIGHT,
  },
});

// Helper function to organize doses into non-overlapping sub-rows
const organizeDosesIntoSubRows = (
  doses: ProcessedMedicationDose[],
): ProcessedMedicationDose[][] => {
  // Sort doses by start time (most recent first)
  const sortedDoses = [...doses].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );

  const subRows: ProcessedMedicationDose[][] = [];

  for (const dose of sortedDoses) {
    let placed = false;

    // Try to place in existing sub-row
    for (const subRow of subRows) {
      // Check if this dose overlaps with any dose in this sub-row
      const hasOverlap = subRow.some((existingDose) => {
        // Two doses overlap if one starts before the other ends
        return (
          dose.startTime < existingDose.endTime &&
          dose.endTime > existingDose.startTime
        );
      });

      if (!hasOverlap) {
        subRow.push(dose);
        placed = true;
        break;
      }
    }

    // If couldn't place in any existing sub-row, create new one
    if (!placed) {
      subRows.push([dose]);
    }
  }

  // console.debug('subRows', subRows);
  return subRows;
};

export function MedicationTimeline({
  data,
  height: propHeight,
  defaultWindowEndOffsetHours: defaultWindowEndOffsetHours = 3,
  defaultWindowStartOffsetHours: defaultWindowStartOffsetHours = -12,
  fullRangeEndOffsetHours = 12,
  fullRangeStartOffsetHours = -72,
  scrollRightLimitOffsetHours: _scrollRightLimitOffsetHours = 6,
  onSnapToDefaultRequest,
}: MedicationTimelineProps) {
  const cardRef = useRef<ReactNativeView | null>(null);
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const horizontalScrollRef = useRef<Animated.ScrollView | null>(null);
  const debugTimelineOverflow = useDebugTimelineOverflow();
  const {toggleDebugFlag} = useDevStoreActions();

  const {theme} = useThemeManager();

  const _oneSecondRefreshKey = useSecondsSinceAppInit(); // Subscribe to re-render every second

  // Get user config (hardcoded to 'justin' for now)
  const config = getUserMedicationConfig('justin');

  const nowTimeMs = Date.now();

  // Don't memoize this, because we need this to be up-to-date with the current time
  const timelineFullRange = {
    end: nowTimeMs + fullRangeEndOffsetHours * ONE_HOUR_IN_MS,
    start: nowTimeMs + fullRangeStartOffsetHours * ONE_HOUR_IN_MS,
  };

  const timelineFullRangeMs =
    (fullRangeEndOffsetHours - fullRangeStartOffsetHours) * ONE_HOUR_IN_MS;

  // const timelineScrollRightLimitOffsetMs =
  //   scrollRightLimitOffsetHours * ONE_HOUR_IN_MS;

  // This is what should fit inside the card
  const timelineDefaultViewableRange = {
    end: nowTimeMs + defaultWindowEndOffsetHours * ONE_HOUR_IN_MS,
    start: nowTimeMs + defaultWindowStartOffsetHours * ONE_HOUR_IN_MS,
  };

  const timelineDefaultViewableRangeMs =
    (defaultWindowEndOffsetHours - defaultWindowStartOffsetHours) *
    ONE_HOUR_IN_MS;

  // Calculate pixels per ms early so we can use it for initial scroll position
  // TODO: Is defaulting to 0 here a good idea?
  // We know how wide the card is, and we know how many ms should fit in that space, so we can calculate the pixels per ms
  const pixelsPerMs = (cardWidth ?? 0) / timelineDefaultViewableRangeMs;

  // Helper to convert time to x position
  const timeToX = (date: Date): number => {
    const offset = date.getTime() - timelineFullRange.start;
    return offset * pixelsPerMs;
  };

  // Calculate initial scroll position
  const timelineScrollStartingContentOffsetX = timeToX(
    new Date(timelineDefaultViewableRange.start),
  );

  // Shared value for horizontal scroll position
  const scrollX = useSharedValue(0);

  // Track if we've set the initial scroll position
  const hasSetInitialScroll = useSharedValue(false);

  // Function to snap back to default view
  const snapToDefault = useCallback(() => {
    if (horizontalScrollRef.current && cardWidth) {
      horizontalScrollRef.current.scrollTo({
        animated: true,
        x: timelineScrollStartingContentOffsetX,
        y: 0,
      });
    }
  }, [timelineScrollStartingContentOffsetX, cardWidth]);

  // Register the snapToDefault callback with parent if provided
  useEffect(() => {
    if (onSnapToDefaultRequest) {
      onSnapToDefaultRequest(snapToDefault);
    }
  }, [onSnapToDefaultRequest, snapToDefault]);

  // Snap back when screen gains focus
  useFocusEffect(
    useCallback(() => {
      snapToDefault();
    }, [snapToDefault]),
  );

  // Snap back when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        snapToDefault();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [snapToDefault]);

  // Handler for horizontal scroll events - must be defined before any conditional returns
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      // Mark that we've received a real scroll event
      hasSetInitialScroll.value = true;
    },
  });

  // Set the initial scroll position when we have a valid cardWidth
  useEffect(() => {
    if (cardWidth && timelineScrollStartingContentOffsetX > 0) {
      // Pass the values to runOnUI to avoid dependency issues
      runOnUI((offset: number) => {
        'worklet';
        // Only update if we haven't received a real scroll event yet
        if (!hasSetInitialScroll.value) {
          scrollX.value = offset;
        }
      })(timelineScrollStartingContentOffsetX);
    }
  }, [
    cardWidth,
    timelineScrollStartingContentOffsetX,
    scrollX,
    hasSetInitialScroll,
  ]);

  const updateCardWidth = useCallback((ref: typeof cardRef) => {
    if (ref.current != null) {
      ref.current.measure((x, y, width, height, pageX, pageY) => {
        /* eslint-disable sort-keys-fix/sort-keys-fix */
        console.debug('[MedicationTimeline] cardRef.current.measure', {
          x,
          y,
          width,
          height,
          pageX,
          pageY,
        });
        /* eslint-enable sort-keys-fix/sort-keys-fix */
        setCardWidth(width);
      });
    }
  }, []);

  useLayoutEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    debugTimelineOverflow;

    updateCardWidth(cardRef);
  }, [cardRef, debugTimelineOverflow, updateCardWidth]);

  // Process timeline data **independently of the current time or timeline viewable time range**.
  // This prevents stale data, and the need to reprocess this data frequently.
  // We want the timeline to be up-to-date to the second/minute, but we only need to reprocess
  // this data when there's NEW DATA.
  const timelineData = useMemo<TimelineData | null>(() => {
    if (config == null) {
      console.warn('[MedicationTimeline] No config');
      return null;
    }
    if (data == null || data.length === 0) {
      console.warn('[MedicationTimeline] Data is nullish or length 0');
      return null;
    }

    // TODO: Consider filtering out doses that start before `timelineRange.start - 24hrs` (which assumes that no medication lasts longer than 24hrs)
    return processTimelineData({
      config,
      entries: data,
    });
  }, [data, config]);

  // Calculate total height based on sub-rows
  const rowsWithSubRows = useMemo(() => {
    if (!timelineData) return [];
    return timelineData.rows.map((row) => ({
      ...row,
      subRows: organizeDosesIntoSubRows(row.doses),
    }));
  }, [timelineData]);

  // Sort rows by most recent medication first
  const sortedRowsUnfiltered = useMemo(() => {
    if (!timelineData) return [];

    // Sort by most recent dose
    return rowsWithSubRows.slice().sort((a, b) => {
      // Get the most recent dose from each row that's visible in range
      const aMostRecent = getLatestDoseEndTimeMs(a.doses);
      const bMostRecent = getLatestDoseEndTimeMs(b.doses);
      return bMostRecent - aMostRecent;
    });
  }, [rowsWithSubRows, timelineData]);

  /**
   * Filter out any doses that are not within the timeline range.
   *
   * NOTE: This cannot be memoized because it depends on timelineRange
   * and the precise current time.
   */
  const sortedRows = sortedRowsUnfiltered
    .map((row) => {
      // Rebuild the row object with the filtered doses and sub-row doses
      return {
        ...row,

        // TODO: Do we still use doses later on? Right now we have to keep this in sync with the subRows
        doses: row.doses.filter((dose) => {
          return isDoseWithinRange(dose, timelineFullRange);
        }),

        // Map over each sub-row, filter out doses outside
        // the range, and then filter out sub-rows that are now empty
        subRows: row.subRows
          .map((subRow) =>
            // Filter out doses in the sub-row that are not within the timeline range
            subRow.filter((dose) => {
              return isDoseWithinRange(dose, timelineFullRange);
            }),
          )
          // Filter out sub-rows that are now empty
          .filter((subRow) => subRow.length > 0),
      };
    })
    .filter((row) => row.doses.length > 0);

  // console.debug('[MedicationTimeline] sortedRows with subrows', sortedRows);

  useEffect(() => {
    console.debug('[MedicationTimeline] timelineData', timelineData);
  }, [timelineData]);

  // console.debug('[MedicationTimeline] sortedRows', sortedRows);
  // console.debug(
  //   '[MedicationTimeline] sortedRows',
  //   JSON.stringify(sortedRows, null, 2),
  // );
  // console.debug(
  //   '[MedicationTimeline] sortedRows with dates',
  //   sortedRows.map((row) =>
  //     row.subRows.map((subRow) =>
  //       subRow.map((dose) => ({
  //         ...dose,
  //         endTime: dose.endTime.toLocaleString(),
  //         startTime: dose.startTime.toLocaleString(),
  //       })),
  //     ),
  //   ),
  // );

  if (!timelineData || !config) {
    return (
      <Card borderRadius="$4" margin="$2" padding="$3">
        <Text color="$colorPress" fontSize="$4">
          No timeline data available
        </Text>
      </Card>
    );
  }

  /*******************************************
   * Calculate the time scale
   *******************************************/
  const timelineFullWidthPx = timelineFullRangeMs * pixelsPerMs;

  // Current time position
  const nowX = timeToX(new Date(nowTimeMs));

  // const timelineScrollRightLimitOffsetX =
  //   timelineScrollRightLimitOffsetMs * pixelsPerMs;

  // Calculate major tick marks aligned with noon
  const getMajorTickHours = () => {
    const majorTicks: TickMark[] = [];
    const minorTicks: TickMark[] = [];

    // Start from BEFORE the beginning of the time range
    const startHourTimestamp = dayjs(timelineFullRange.start)
      .startOf('hour')
      .valueOf();
    // Go to AFTER the end of the time range
    const endHourTimestamp = dayjs(timelineFullRange.end)
      .endOf('hour')
      .valueOf();

    const hoursToRenderCountUnrounded =
      (endHourTimestamp - startHourTimestamp) / ONE_HOUR_IN_MS;
    const hoursToRenderCount = Math.round(hoursToRenderCountUnrounded);
    // This can happen. No need to log about it:
    // if (hoursToRenderCountUnrounded !== hoursToRenderCount) {
    //   console.warn(
    //     `[MedicationTimeline] Hours to render count is not an integer: ${hoursToRenderCountUnrounded}`,
    //   );
    // }

    const hoursTimestampsToRender = Array.from(
      {length: hoursToRenderCount},
      (_, i) => startHourTimestamp + i * ONE_HOUR_IN_MS,
    );

    hoursTimestampsToRender.forEach((hourTimestamp) => {
      const markerTime = new Date(hourTimestamp);
      const x = timeToX(markerTime);
      const hour = markerTime.getHours();

      // Check if this is a major tick (every 3 hours, aligned with noon)
      const isMajor = hour % 3 === 0;

      if (isMajor) {
        const label = formatTimeLabel(markerTime);
        majorTicks.push({isMajor, label, time: markerTime, x});
      }

      // All hours get grid lines
      minorTicks.push({isMajor, label: null, time: markerTime, x});
    });

    return {majorTicks, minorTicks};
  };

  const {majorTicks: hourMarkers, minorTicks: gridLines} = getMajorTickHours();

  return (
    <Card
      // alignSelf="center"
      borderColor="$borderColor"
      borderRadius="$4"
      borderWidth="$0.5"
      margin="$2"
      // onLayout={() => updateCardWidth(cardRef)}
      ref={cardRef}
      style={
        debugTimelineOverflow
          ? styles.cardScrollContainerDebug
          : styles.cardScrollContainerNormal
      }>
      {/* <ScrollView height={propHeight} nestedScrollEnabled> */}
      <Animated.ScrollView
        bounces
        // contentInset={{
        //   left: 0,
        //   right: 0 - timelineScrollRightLimitOffsetX,
        // }}
        contentOffset={{x: timelineScrollStartingContentOffsetX, y: 0}}
        horizontal
        // nestedScrollEnabled
        onScroll={scrollHandler}
        ref={horizontalScrollRef}
        // scrollEventThrottle={16}
        showsHorizontalScrollIndicator
        style={
          debugTimelineOverflow
            ? styles.horizontalScrollContainerDebug
            : styles.horizontalScrollContainerNormal
        }
        // snapToOffsets={[timelineScrollStartingContentOffsetX]}
      >
        <View
          // height={cardHeight}
          // overflow="hidden"
          style={styles.timelineContainer}
          width={timelineFullWidthPx}>
          {/**************************************
           * Label top section
           **************************************/}
          <View
            onPress={() => snapToDefault()}
            style={styles.timelineLabelSection}>
            {/* Blur underneath hour markers */}
            <BlurView
              intensity={80}
              style={styles.hourLabelBlur}
              tint={theme}
            />

            {/* Hour labels at top */}
            {hourMarkers.map((marker) => {
              return (
                <View
                  alignItems="center"
                  key={`${marker.label}-${marker.time.getTime()}`}
                  left={marker.x - 25}
                  style={styles.hourLabel}
                  width={50}>
                  <Text color="$colorPress" fontSize={11}>
                    {marker.label}
                  </Text>
                </View>
              );
            })}

            {/* Now label */}
            <View
              alignItems="center"
              backgroundColor="$color9"
              borderRadius={4}
              justifyContent="center"
              left={nowX - 20}
              onPress={
                __DEV__
                  ? (e) => {
                      e.stopPropagation();
                      toggleDebugFlag('DEBUG_TIMELINE_OVERFLOW');
                    }
                  : undefined
              }
              style={styles.nowLabel}
              theme="red"
              width={40}>
              <Text color="white" fontSize={12} fontWeight="bold">
                {NOW_LABEL}
              </Text>
            </View>

            {/* Now line */}
            <View
              backgroundColor="$color9"
              left={nowX}
              style={[styles.nowLine, styles.nowLineSmallSegmentLabelSection]}
              theme="red"
            />
          </View>

          {/**************************************
           * Timeline medication rows container
           **************************************/}
          <ScrollView
            height={propHeight}
            nestedScrollEnabled
            scrollEnabled={propHeight != null}
            style={styles.timelineRowsContainer}>
            {/* Background grid lines - major and minor */}
            {gridLines.map((line) => (
              <View
                backgroundColor="$colorPress"
                // borderStyle="dashed"
                borderWidth={0}
                key={`grid-${line.time.getTime()}`}
                left={line.x}
                opacity={
                  line.isMajor
                    ? GRID_LINE_OPACITY.major
                    : GRID_LINE_OPACITY.minor
                }
                style={[styles.gridLine, styles.verticalLine]}
              />
            ))}

            {/* Now line */}
            <View
              backgroundColor="$color9"
              left={nowX}
              style={[
                styles.nowLine,
                styles.nowLineMainSegment,
                styles.verticalLine,
              ]}
              theme="red"
            />

            {/**************************************
             * Timeline medication actual rows
             **************************************/}
            {sortedRows.map((row) => {
              // if (!row.medicationId.startsWith('dextro')) {
              //   return null;
              // }
              return (
                <View
                  key={row.medicationId}
                  // marginBottom={
                  //   rowIndex < sortedRows.length - 1 ? SUB_ROW_VERTICAL_GAP : 0
                  // }
                  style={styles.medicationRow}>
                  {DISPLAY_ROW_BACKGROUND_COLORS && (
                    <View
                      backgroundColor="$background04"
                      borderBottomWidth={0}
                      borderColor="$color6"
                      borderTopWidth={MEDICATION_ROW_PARAMS.topBorderWidth}
                      opacity={0.6}
                      style={[StyleSheet.absoluteFill, {zIndex: -1}]}
                      theme={row.theme}
                    />
                  )}

                  {/* Render sub-rows */}
                  {row.subRows.map((subRowDoses, subRowIndex) => {
                    // Pre-calculate positions for all doses in this sub-row
                    const dosePositions = subRowDoses.map((dose) => {
                      const startX = timeToX(dose.startTime);
                      const endX = timeToX(dose.endTime);
                      return {
                        barWidth: endX - startX,
                        endX,
                        startX,
                      };
                    });

                    const isFirstSubRow = subRowIndex === 0;
                    const isLastSubRow = subRowIndex === row.subRows.length - 1;

                    return (
                      <AnimatedSubRow
                        cardWidth={cardWidth}
                        dosePositions={dosePositions}
                        key={`${row.medicationId}-subrow-${String(subRowIndex)}`}
                        marginBottom={
                          isLastSubRow
                            ? 0
                            : MEDICATION_ROW_PARAMS.subRowMarginBottom
                        }
                        marginTop={
                          isFirstSubRow
                            ? MEDICATION_ROW_PARAMS.topBorderWidth +
                              MEDICATION_ROW_PARAMS.firstRowMarginTop
                            : 0
                        }
                        scrollX={scrollX}>
                        {subRowDoses.map((dose) => {
                          // TODO: Try having doses render normally even if past the end of the screen, and then just try to make the text "sticky" so as much of it shows as possible
                          const startX = timeToX(dose.startTime);
                          const endX = timeToX(dose.endTime);
                          const barWidth = endX - startX;

                          if (barWidth <= 0) {
                            console.warn(
                              `[MedicationTimeline] Bar width is <= 0 for dose ${dose.medicationId}. This should not happen as we should be filtering these doses out.`,
                              {
                                barWidth,
                                dose: objectGetValueOfAllProperties(
                                  dose as unknown as BaseObject,
                                ),
                                endX,
                                startX,
                              },
                            );
                            return null;
                          }

                          // Calculate relative time for all doses
                          const relativeTime = getDurationString(
                            dose.startTime.getTime() - nowTimeMs,
                            {alwaysShowSign: true, compact: true},
                          );

                          const isActive = isDoseIntersectingTimeMs(
                            dose,
                            nowTimeMs,
                          );

                          return (
                            <AnimatedMedicationPill
                              barWidth={barWidth}
                              dose={dose}
                              isActive={isActive}
                              key={`${dose.amount}-${dose.medicationId}-${dose.startTime.toISOString()}`}
                              relativeTime={relativeTime}
                              style={[styles.medicationBar, {left: startX}]}
                            />
                          );
                        })}
                      </AnimatedSubRow>
                    );
                  })}

                  {/* Row label with background for legibility */}
                  {DISPLAY_ROW_LABELS && (
                    <AnimatedMedicationLabel
                      cardWidth={cardWidth}
                      displayName={row.displayName}
                      scrollX={scrollX}
                      theme={row.theme}
                    />
                  )}
                </View>
              );
            })}
            {/**************************************
             * /END SORTED ROWS
             **************************************/}
          </ScrollView>
        </View>
      </Animated.ScrollView>
      {/* </ScrollView> */}
    </Card>
  );
}
