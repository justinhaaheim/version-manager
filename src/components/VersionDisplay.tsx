import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import React from 'react';
import {Card, Text, XStack, YStack} from 'tamagui';

import projectVersions from '@/../projectVersions.json';

interface VersionHistoryEntry {
  branch: string;
  commit: string;
  timestamp: string;
}

interface VersionInfo {
  buildNumber: string | null;
  channel: string | null;
  codeVersion: string;
  latestUpdate?: {
    branch?: string;
    commit?: string;
    timestamp?: string;
  };
  runtimeVersion: string | null;
}

function getVersionInfo(): VersionInfo {
  const updates = Constants.expoConfig?.updates;

  // Get the latest update from history
  const latestEntry = Object.entries(
    projectVersions.codeVersionHistory as Record<string, VersionHistoryEntry>,
  )
    .sort(
      ([, a], [, b]) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .at(0);

  return {
    buildNumber: Application.nativeBuildVersion ?? null,
    channel:
      (updates?.requestHeaders?.['expo-channel-name'] as string | undefined) ??
      null,
    codeVersion: projectVersions.codeVersion,
    latestUpdate: latestEntry?.[1]
      ? {
          branch: latestEntry[1].branch,
          commit: latestEntry[1].commit?.substring(0, 7),
          timestamp: latestEntry[1].timestamp,
        }
      : undefined,
    runtimeVersion: Updates.runtimeVersion ?? null,
  };
}

export default function VersionDisplay() {
  const versionInfo = getVersionInfo();

  return (
    <Card
      backgroundColor="$background"
      borderColor="$borderColor"
      borderRadius="$3"
      borderWidth={1}
      margin="$3"
      padding="$3">
      <YStack gap="$2">
        <Text color="$color11" fontSize="$2" fontWeight="600">
          VERSION INFO
        </Text>

        <XStack gap="$4">
          <YStack flex={1}>
            <Text color="$color10" fontSize="$1">
              Code Version
            </Text>
            {/* TODO: Add mono font when available */}
            <Text color="$color12" fontSize="$3">
              {versionInfo.codeVersion}
            </Text>
          </YStack>

          <YStack flex={1}>
            <Text color="$color10" fontSize="$1">
              Build Number
            </Text>
            {/* TODO: Add mono font when available */}
            <Text color="$color12" fontSize="$3">
              {versionInfo.buildNumber ?? 'N/A'}
            </Text>
          </YStack>
        </XStack>

        <XStack gap="$4">
          <YStack flex={1}>
            <Text color="$color10" fontSize="$1">
              Runtime Version
            </Text>
            {/* TODO: Add mono font when available */}
            <Text color="$color12" fontSize="$3">
              {versionInfo.runtimeVersion}
            </Text>
          </YStack>

          <YStack flex={1}>
            <Text color="$color10" fontSize="$1">
              Update Channel
            </Text>
            {/* TODO: Add mono font when available */}
            <Text color="$color12" fontSize="$3">
              {versionInfo.channel ?? 'N/A'}
            </Text>
          </YStack>
        </XStack>

        {versionInfo.latestUpdate && (
          <YStack>
            <Text color="$color10" fontSize="$1">
              Latest Update
            </Text>
            {/* TODO: Add mono font when available */}
            <Text color="$color11" fontSize="$2">
              {versionInfo.latestUpdate.branch} @{' '}
              {versionInfo.latestUpdate.commit}
            </Text>
            {versionInfo.latestUpdate.timestamp && (
              <Text color="$color10" fontSize="$1">
                {new Date(versionInfo.latestUpdate.timestamp).toLocaleString()}
              </Text>
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}
