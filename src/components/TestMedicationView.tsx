import type {MedicationEntry} from '@/types/medication';

import React from 'react';
import {Button, H2, H3, ScrollView, Text, Theme, View, YStack} from 'tamagui';

import {MedicationList} from './MedicationList';
import {MedicationTimeline} from './MedicationTimeline';

interface TestMedicationViewProps {
  data: MedicationEntry[];
  onExit: () => void;
  scenarioDescription: string;
  scenarioName: string;
}

export default function TestMedicationView({
  data,
  scenarioName,
  scenarioDescription,
  onExit,
}: TestMedicationViewProps) {
  const [showTimeline, setShowTimeline] = React.useState(false);

  return (
    <View flex={1}>
      {/* Header with test info */}
      <Theme name="red">
        <YStack
          backgroundColor="$color9"
          gap="$2"
          paddingHorizontal="$4"
          paddingTop="$12"
          paddingVertical="$4">
          <H2>Test Mode</H2>
          <Text fontSize="$5" fontWeight="bold">
            {scenarioName}
          </Text>
          <Text fontSize="$4" opacity={0.9}>
            {scenarioDescription}
          </Text>
          <Text fontSize="$3" opacity={0.7}>
            {data.length} medication entries
          </Text>
          <Button marginTop="$2" onPress={onExit} size="$4" theme="white">
            Exit Test Mode
          </Button>
        </YStack>
      </Theme>

      {/* Toggle between list and timeline view */}
      <YStack paddingHorizontal="$4" paddingVertical="$3">
        <Button
          onPress={() => setShowTimeline(!showTimeline)}
          size="$3"
          theme="blue">
          {showTimeline ? 'Show List View' : 'Show Timeline View'}
        </Button>
      </YStack>

      {/* Content */}
      {data.length === 0 ? (
        <YStack alignItems="center" flex={1} gap="$3" justifyContent="center">
          <Text color="$color11" fontSize="$5">
            No medication data
          </Text>
        </YStack>
      ) : showTimeline ? (
        <ScrollView flex={1} paddingHorizontal="$4">
          <H3 marginBottom="$3">Medication Timeline</H3>
          <MedicationTimeline data={data} />
        </ScrollView>
      ) : (
        <MedicationList
          data={data}
          isRefreshing={false}
          onRefresh={() => {
            // No-op for test mode
          }}
        />
      )}
    </View>
  );
}
