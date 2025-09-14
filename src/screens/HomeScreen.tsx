import * as Updates from 'expo-updates';
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, TouchableOpacity} from 'react-native';
import {Button, H2, Text, XStack, YStack} from 'tamagui';

import {MedicationList} from '@/components/MedicationList';
import {useHealthLogData} from '@/hooks/useHealthLogData';
import {googleSignInService} from '@/services/googleSignIn';
import {
  useRequestStatus,
  useShowRequestInfoOnHomeScreen,
} from '@/store/devStore';
import {
  useGoogleUser,
  useIsUpdateDownloaded,
  useMainStoreActions,
  useSecondsSinceAppInit,
  useUpdateCheckResult,
} from '@/store/mainStore';
import {getDurationStringWithSecondsBelow60} from '@/utils/dateUtils';

export default function HomeScreen() {
  const actions = useMainStoreActions();
  const googleUser = useGoogleUser();
  const updateCheckResult = useUpdateCheckResult();
  const isUpdateDownloaded = useIsUpdateDownloaded();
  const showRequestInfo = useShowRequestInfoOnHomeScreen();
  const requestStatus = useRequestStatus();

  const {
    medicationData,
    isLoading,
    isRefreshing,
    isFetching,
    error,
    lastUpdated,
    refresh,
  } = useHealthLogData();

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const result = await googleSignInService.signIn();
      actions.setGoogleUser(result.user);
    } catch (authError) {
      console.error('Auth error:', authError);
      const errorMessage =
        authError instanceof Error
          ? authError.message
          : 'An error occurred during authentication';
      Alert.alert('Authentication Failed', errorMessage);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleInstallUpdate = () => {
    Alert.alert(
      'Install Update',
      'The app will close and restart with the new update.',
      [
        {
          style: 'cancel',
          text: 'Cancel',
        },
        {
          onPress: () => {
            void actions.reloadWithUpdate();
          },
          style: 'default',
          text: 'Install',
        },
      ],
    );
  };

  // Check for updates on mount
  useEffect(() => {
    void actions.checkForUpdate();
  }, [actions]);

  // Subscribe to seconds counter for dynamic updates
  useSecondsSinceAppInit();

  const timeSinceUpdate =
    lastUpdated != null
      ? getDurationStringWithSecondsBelow60(Date.now() - lastUpdated)
      : null;

  // Calculate update creation date for display
  const updateCreatedAtText = useMemo(() => {
    // Get the createdAt date based on the update state
    let createdAtDate: Date | null = null;

    if (isUpdateDownloaded && Updates.createdAt) {
      createdAtDate = Updates.createdAt;
    } else if (updateCheckResult?.isAvailable && updateCheckResult.manifest) {
      // Check if the manifest has a createdAt property (ExpoUpdatesManifest)
      if ('createdAt' in updateCheckResult.manifest) {
        createdAtDate = new Date(updateCheckResult.manifest.createdAt);
      }
    }

    if (createdAtDate) {
      return (
        <Text color="$colorPress" fontSize="$2" marginLeft="$1">
          ({createdAtDate.toLocaleString()})
        </Text>
      );
    }
    return null;
  }, [isUpdateDownloaded, updateCheckResult]);

  if (!googleUser) {
    return (
      <YStack
        alignItems="center"
        backgroundColor="$background"
        flex={1}
        justifyContent="center"
        padding="$4"
        testID="home-screen">
        <H2 marginBottom="$4">Recent Meds</H2>
        <Text color="$colorPress" marginBottom="$6" textAlign="center">
          Sign in with Google to access your medication data
        </Text>
        <Button
          disabled={isAuthenticating}
          onPress={() => void handleSignIn()}
          size="$5"
          theme="blue">
          {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
        </Button>
      </YStack>
    );
  }

  if (isLoading && medicationData.length === 0) {
    return (
      <YStack
        alignItems="center"
        backgroundColor="$background"
        flex={1}
        justifyContent="center"
        testID="home-screen">
        <ActivityIndicator size="large" />
        <Text color="$colorPress" marginTop="$4">
          Loading medication data...
        </Text>
      </YStack>
    );
  }

  return (
    <YStack backgroundColor="$background" flex={1} testID="home-screen">
      <YStack
        borderBottomColor="$borderColor"
        borderBottomWidth={1}
        padding="$3">
        <XStack alignItems="center" justifyContent="space-between">
          <YStack>
            <Text color="$colorPress" fontSize="$2">
              Signed in as {googleUser.email}
            </Text>
            {/* Update notification */}
            {(updateCheckResult?.isAvailable ?? isUpdateDownloaded) && (
              <XStack alignItems="center" marginTop="$1">
                <Text color="$colorPress" fontSize="$2">
                  {isUpdateDownloaded ? 'Update ready to ' : 'Update available'}
                </Text>
                {isUpdateDownloaded && (
                  <TouchableOpacity onPress={handleInstallUpdate}>
                    <Text
                      fontSize="$2"
                      textDecorationLine="underline"
                      theme="blue">
                      install
                    </Text>
                  </TouchableOpacity>
                )}
                {updateCreatedAtText}
              </XStack>
            )}
          </YStack>
          {isFetching ? (
            <Text fontSize="$2" theme="blue">
              Fetching...
            </Text>
          ) : (
            timeSinceUpdate && (
              <Text color="$colorPress" fontSize="$2">
                Updated {timeSinceUpdate} ago
              </Text>
            )
          )}
        </XStack>
        {error && (
          <Text fontSize="$3" marginTop="$2" theme="red">
            {error}
          </Text>
        )}
        {showRequestInfo && requestStatus && (
          <Text
            color={
              requestStatus.type === 'error'
                ? '$red9'
                : requestStatus.type === 'success'
                  ? '$green9'
                  : requestStatus.type === 'retry'
                    ? '$yellow9'
                    : '$blue9'
            }
            fontSize="$2"
            marginTop="$1">
            {requestStatus.message}
          </Text>
        )}
      </YStack>

      <MedicationList
        data={medicationData}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />
    </YStack>
  );
}
