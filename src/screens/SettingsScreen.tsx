import Constants from 'expo-constants';
import {useRouter} from 'expo-router';
import * as Updates from 'expo-updates';
import React from 'react';
import {Alert} from 'react-native';
import {
  Button,
  Card,
  H3,
  Input,
  Label,
  ScrollView,
  Separator,
  Switch,
  Text,
  XStack,
  YStack,
} from 'tamagui';

import projectVersions from '@/../projectVersions.json';
import {UpdateInfo} from '@/components/UpdateInfo';
import VersionDisplay from '@/components/VersionDisplay';
import {emptyStringToNull} from '@/helpers/GeneralUtils';
import {googleSignInService} from '@/services/googleSignIn';
import {useAllDebugFlags, useDevStoreActions} from '@/store/devStore';
import {
  useGoogleUser,
  useIsCheckingForUpdate,
  useIsFetchingUpdate,
  useIsSpreadsheetUrlValid,
  useIsUpdateDownloaded,
  useMainStoreActions,
  useSpreadsheetUrl,
  useUpdateCheckResult,
} from '@/store/mainStore';
import {TEST_SCENARIOS} from '@/test/scenarios';

export default function SettingsScreen() {
  const router = useRouter();
  const googleUser = useGoogleUser();
  const actions = useMainStoreActions();
  const spreadsheetUrl = useSpreadsheetUrl();
  const isSpreadsheetUrlValid = useIsSpreadsheetUrlValid();
  const isCheckingForUpdate = useIsCheckingForUpdate();
  const isFetchingUpdate = useIsFetchingUpdate();
  const isUpdateDownloaded = useIsUpdateDownloaded();
  const updateCheckResult = useUpdateCheckResult();
  const debugFlags = useAllDebugFlags();
  const devActions = useDevStoreActions();

  const buildDetails: string[] = [
    `App Name: ${Constants.expoConfig?.name}`,
    `Version (Expo Build): ${Constants.expoConfig?.version ?? 'unknown'}`,
    `Version (code): ${projectVersions.codeVersion}`,
    `Build Number: ${Constants.expoConfig?.ios?.buildNumber}`,
    `Bundle ID: ${Constants.expoConfig?.ios?.bundleIdentifier}`,
    `Debug Mode: ${Constants.debugMode}`,
    // `Device Model Name: ${Device.modelName}`,
    `Device Name: ${Constants.deviceName}`,
    // `OS Version: ${Device.osVersion}`,
    `Expo Runtime Version: ${Constants.expoRuntimeVersion}`,
    `Expo Version: ${Constants.expoVersion}`,
    `JS Engine: ${Constants.expoConfig?.jsEngine}`,
    `New Arch Enabled: ${Constants.expoConfig?.newArchEnabled}`,
    `Is Detached: ${Constants.isDetached}`,
    `Is Headless: ${Constants.isHeadless}`,
    `Linking URI: ${Constants.linkingUri}`,
    `Scheme: ${Constants.scheme}`,
    `Supports Tablet: ${Constants.expoConfig?.ios?.supportsTablet}`,
  ];

  const handleCheckForUpdate = React.useCallback(() => {
    void actions.checkForUpdate();
  }, [actions]);

  const handleInstallUpdate = React.useCallback(() => {
    void actions.reloadWithUpdate();
  }, [actions]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {
        style: 'cancel',
        text: 'Cancel',
      },
      {
        onPress: () => {
          void (async () => {
            try {
              await googleSignInService.signOut();
              actions.setGoogleUser(null);
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          })();
        },
        style: 'destructive',
        text: 'Sign Out',
      },
    ]);
  };

  const handleLoadTestScenario = (scenarioId: string) => {
    router.push(`/test/${scenarioId}`);
  };

  return (
    <ScrollView
      backgroundColor="$background"
      flex={1}
      paddingTop="$4"
      testID="settings-screen">
      {/* User Account Card */}
      {googleUser && (
        <Card
          borderRadius="$3"
          elevate
          marginBottom="$4"
          marginHorizontal="$4"
          padding="$4"
          shadowColor="$shadowColor"
          shadowOffset={{height: 2, width: 0}}
          shadowOpacity={0.1}
          shadowRadius="$2">
          <YStack gap="$3">
            <H3>Account</H3>
            <YStack gap="$2">
              <Text color="$color" fontSize="$5">
                {googleUser.name}
              </Text>
              <Text color="$color11" fontSize="$4">
                {googleUser.email}
              </Text>
            </YStack>
            <Separator marginVertical="$2" />
            <Button onPress={() => void handleSignOut()} size="$4" theme="red">
              Sign Out
            </Button>
          </YStack>
        </Card>
      )}

      {/* Google Sheets Configuration Card */}
      <Card
        borderRadius="$3"
        elevate
        marginBottom="$4"
        marginHorizontal="$4"
        padding="$4"
        shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.1}
        shadowRadius="$2">
        <YStack gap="$3">
          <H3>Google Sheets Configuration</H3>
          <YStack gap="$2">
            <Label color="$color" fontSize="$4" htmlFor="spreadsheet-url">
              Spreadsheet URL
            </Label>
            <Input
              borderColor={
                spreadsheetUrl === ''
                  ? '$color6'
                  : isSpreadsheetUrlValid
                    ? '$blue9'
                    : '$red9'
              }
              borderWidth={2}
              id="spreadsheet-url"
              onChangeText={(text) => actions.setSpreadsheetUrl(text)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
              size="$4"
              testID="spreadsheet-url-input"
              value={spreadsheetUrl}
            />
            {spreadsheetUrl !== '' && (
              <XStack>
                {isSpreadsheetUrlValid ? (
                  <Text color="$blue9" fontSize="$3">
                    ✓ Valid spreadsheet URL
                  </Text>
                ) : (
                  <Text color="$red9" fontSize="$3">
                    ✗ Invalid spreadsheet URL format
                  </Text>
                )}
              </XStack>
            )}
            <Text color="$color11" fontSize="$3">
              Paste your Google Sheets URL to configure data source
            </Text>
          </YStack>
        </YStack>
      </Card>

      {/* Test Scenarios Card (Dev Only) */}
      {__DEV__ && (
        <Card
          borderRadius="$3"
          elevate
          marginBottom="$4"
          marginHorizontal="$4"
          padding="$4"
          shadowColor="$shadowColor"
          shadowOffset={{height: 2, width: 0}}
          shadowOpacity={0.1}
          shadowRadius="$2">
          <YStack gap="$3">
            <H3>Test Scenarios</H3>
            <Text color="$color11" fontSize="$3">
              Load mock data scenarios for testing
            </Text>
            <YStack gap="$2">
              {Object.entries(TEST_SCENARIOS).map(([id, scenario]) => (
                <Button
                  key={id}
                  onPress={() => handleLoadTestScenario(id)}
                  size="$3"
                  theme="blue">
                  <YStack alignItems="center" gap="$1">
                    <Text fontSize="$3" fontWeight="bold">
                      {scenario.name}
                    </Text>
                    <Text fontSize="$2" opacity={0.8}>
                      {scenario.description}
                    </Text>
                  </YStack>
                </Button>
              ))}
            </YStack>
            <Separator marginVertical="$1" />
            <Text color="$color11" fontSize="$2">
              Deep links for Maestro testing:
            </Text>
            <Text color="$color11" fontSize="$2">
              {Constants.scheme}://test/[scenario-id]
            </Text>
          </YStack>
        </Card>
      )}

      <Card
        borderRadius="$3"
        elevate
        marginBottom="$4"
        marginHorizontal="$4"
        padding="$4"
        shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.1}
        shadowRadius="$2">
        <YStack gap="$3">
          <H3>Updates</H3>
          <YStack gap="$2">
            <Text color="$color11" fontSize="$3">
              {`Channel: ${emptyStringToNull(Updates.channel) ?? 'Not configured'}`}
            </Text>
            <Text color="$color11" fontSize="$3">
              {`Runtime Version: ${emptyStringToNull(Updates.runtimeVersion) ?? 'Not available'}`}
            </Text>
            <Text color="$color11" fontSize="$3">
              {`Update ID: ${emptyStringToNull(Updates.updateId) ?? 'No update loaded'}`}
            </Text>
            {Updates.createdAt && (
              <Text color="$color11" fontSize="$3">
                Created: {new Date(Updates.createdAt).toLocaleString()}
              </Text>
            )}
          </YStack>
          <Separator my="$2" />
          <YStack gap="$2">
            <XStack gap="$2">
              {isUpdateDownloaded ? (
                <Button
                  flex={1}
                  onPress={handleInstallUpdate}
                  size="$4"
                  theme="green">
                  Install and Reload
                </Button>
              ) : (
                <Button
                  disabled={isCheckingForUpdate || isFetchingUpdate}
                  flex={1}
                  onPress={handleCheckForUpdate}
                  size="$4"
                  theme="blue">
                  {isCheckingForUpdate
                    ? 'Checking...'
                    : isFetchingUpdate
                      ? 'Downloading...'
                      : 'Check for Updates'}
                </Button>
              )}
            </XStack>
            {/* Show update status message */}
            {updateCheckResult && !isCheckingForUpdate && !isFetchingUpdate && (
              <Text color="$color11" fontSize="$3" textAlign="center">
                {updateCheckResult.isAvailable
                  ? isUpdateDownloaded
                    ? '✓ Update downloaded and ready to install'
                    : 'Downloading update...'
                  : '✓ You are running the latest version'}
              </Text>
            )}

            {/* Show detailed update information */}
            {updateCheckResult && updateCheckResult.isAvailable && (
              <UpdateInfo data={updateCheckResult} title="Update Details:" />
            )}

            {/* Show reason for no update */}
            {updateCheckResult &&
              !updateCheckResult.isAvailable &&
              'reason' in updateCheckResult &&
              updateCheckResult.reason && (
                <YStack
                  backgroundColor="$backgroundFocus"
                  borderRadius="$2"
                  marginTop="$2"
                  padding="$2">
                  <Text color="$color11" fontSize="$2">
                    Reason: {updateCheckResult.reason}
                  </Text>
                </YStack>
              )}
          </YStack>
        </YStack>
      </Card>

      {/* Dev Settings Card */}
      <Card
        borderRadius="$3"
        elevate
        marginBottom="$4"
        marginHorizontal="$4"
        padding="$4"
        shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.1}
        shadowRadius="$2">
        <YStack gap="$3">
          <H3>Dev Settings</H3>
          <Text color="$color11" fontSize="$3">
            Debug flags and development parameters
          </Text>
          <Separator marginVertical="$1" />
          <YStack gap="$2">
            {Object.entries(debugFlags).map(([key, value]) => (
              <XStack
                alignItems="center"
                justifyContent="space-between"
                key={key}>
                <Text color="$color11" flex={1} fontSize="$3">
                  {key.replace(/_/g, ' ')}
                </Text>
                <Switch
                  checked={value}
                  onCheckedChange={() =>
                    devActions.toggleDebugFlag(key as keyof typeof debugFlags)
                  }
                  size="$3">
                  <Switch.Thumb animation="quick" />
                </Switch>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </Card>

      {/* Build Details Card */}
      <Card
        borderRadius="$3"
        elevate
        marginBottom="$4"
        marginHorizontal="$4"
        padding="$4"
        shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.1}
        shadowRadius="$2">
        <VersionDisplay />
      </Card>

      {/* Build Details Card */}
      <Card
        borderRadius="$3"
        elevate
        marginBottom="$4"
        marginHorizontal="$4"
        padding="$4"
        shadowColor="$shadowColor"
        shadowOffset={{height: 2, width: 0}}
        shadowOpacity={0.1}
        shadowRadius="$2">
        <YStack gap="$1">
          {buildDetails.map((detail) => (
            <Text
              color="$color11"
              fontSize="$4"
              key={detail}
              marginVertical="$0.5">
              {detail}
            </Text>
          ))}
        </YStack>
        <UpdateInfo
          backgroundColor="$background"
          data={Updates}
          title="Current Version:"
        />
      </Card>
    </ScrollView>
  );
}
