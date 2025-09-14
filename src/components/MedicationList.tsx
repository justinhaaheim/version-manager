import type {MedicationEntry} from '@/types/medication';

import React, {useCallback, useMemo, useRef} from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Card, Text, View, XStack, YStack} from 'tamagui';

import {MedicationTimeline} from '@/components/MedicationTimeline';
import {useSecondsSinceAppInit} from '@/store/mainStore';
import {
  getDurationStringWithSecondsBelow60,
  getPrettyDateTimeString,
} from '@/utils/dateUtils';
import {parseMedicationText} from '@/utils/medicationParser';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface MedicationListProps {
  data: MedicationEntry[];
  isRefreshing: boolean;
  onRefresh: () => void;
}

function MedicationListItem({item}: {item: MedicationEntry}) {
  // Subscribe to seconds counter to trigger re-renders
  useSecondsSinceAppInit();

  const medications = parseMedicationText(item.medicineTaken);
  const dateText = getPrettyDateTimeString(item.timestamp);

  // Dynamically compute time since and dimmed state
  const timeSince = Date.now() - item.timestamp.valueOf();
  const timeSinceText = getDurationStringWithSecondsBelow60(timeSince);
  const isDimmed = timeSince > TWENTY_FOUR_HOURS_MS;

  return (
    <Card
      borderRadius="$4"
      margin="$1"
      opacity={isDimmed ? 0.4 : 1}
      padding="$3">
      <XStack justifyContent="space-between" marginBottom="$2">
        <Text color="$color" fontSize="$5" fontWeight="600">
          {timeSinceText} ago
        </Text>
        <Text color="$colorPress" fontSize="$3">
          {dateText}
        </Text>
      </XStack>

      <YStack gap="$1">
        {medications.map((med) => (
          <Text color="$color" fontSize="$4" key={med}>
            {'💊 ' + med}
          </Text>
        ))}
        {medications.length === 0 && (
          <Text color="$colorPress" fontSize="$4" fontStyle="italic">
            No medications recorded
          </Text>
        )}
      </YStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 20,
  },
});

export function MedicationList({
  data,
  isRefreshing,
  onRefresh,
}: MedicationListProps) {
  const {height: _screenHeight} = useWindowDimensions();
  const snapToDefaultRef = useRef<(() => void) | null>(null);

  const renderItem = useCallback(
    ({item}: {item: MedicationEntry}) => <MedicationListItem item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: MedicationEntry) => item.id, []);

  // Handle refresh with snap-to-default
  const handleRefresh = useCallback(() => {
    onRefresh();
    // Snap timeline back to default position on refresh
    if (snapToDefaultRef.current) {
      snapToDefaultRef.current();
    }
  }, [onRefresh]);

  // Create header component with constrained timeline
  const ListHeaderComponent = useMemo(() => {
    // Calculate max height as 40% of screen height, ensuring space for list items
    // const maxTimelineHeight = Math.min(screenHeight * 0.4, 400);
    // <View style={{maxHeight: maxTimelineHeight, overflow: 'hidden'}}>
    return (
      <View>
        <MedicationTimeline
          data={data}
          onSnapToDefaultRequest={(callback) => {
            snapToDefaultRef.current = callback;
          }}
        />
      </View>
    );
  }, [data]);

  return (
    <View flex={1} paddingHorizontal="$2">
      <FlatList
        ListEmptyComponent={
          <YStack alignItems="center" justifyContent="center" padding="$8">
            <Text color="$colorPress" fontSize="$5">
              No medication data available
            </Text>
          </YStack>
        }
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={styles.contentContainer}
        data={data}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl onRefresh={handleRefresh} refreshing={isRefreshing} />
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
