import {useLocalSearchParams, useRouter} from 'expo-router';
import React from 'react';

import TestMedicationView from '@/components/TestMedicationView';
import {
  adjustTimestampsForTesting,
  getTestScenario,
  getTestScenarioInfo,
} from '@/test/scenarios';

export default function TestScenario() {
  const {scenario} = useLocalSearchParams<{scenario: string}>();
  const router = useRouter();

  // Get test scenario
  const testScenario = getTestScenario(scenario ?? '');
  const scenarioInfo = getTestScenarioInfo(scenario ?? '');

  // Transform raw data to medication entries with adjusted timestamps
  const medicationData = React.useMemo(() => {
    if (!testScenario) return [];

    // Adjust timestamps to be relative to current time
    return adjustTimestampsForTesting(
      testScenario.data,
      testScenario.nowTimestampForTest,
    );
  }, [testScenario]);

  // Handle invalid scenario
  if (!testScenario || !scenarioInfo) {
    return (
      <TestMedicationView
        data={[]}
        onExit={() => router.back()}
        scenarioDescription={`Scenario "${scenario}" not found`}
        scenarioName="Invalid Scenario"
      />
    );
  }

  return (
    <TestMedicationView
      data={medicationData}
      onExit={() => router.back()}
      scenarioDescription={scenarioInfo.description}
      scenarioName={scenarioInfo.name}
    />
  );
}
