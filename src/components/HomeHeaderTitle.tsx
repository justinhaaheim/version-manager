import type {ViewProps} from 'tamagui';

import Constants from 'expo-constants';
import React from 'react';
import semver from 'semver';
import {Text, View} from 'tamagui';

import projectVersions from '@/../projectVersions.json';

const sanitizedVersionString = semver.valid(
  semver.coerce(projectVersions.codeVersion),
);
const shouldShowAppVersion =
  Constants.expoConfig?.extra?.showAppVersion === true;
const appTitle = Constants.expoConfig?.name ?? 'NO APP NAME';

export default function HomeHeaderTitle(props: ViewProps) {
  return (
    <View {...props} marginBottom="$2" marginHorizontal="$3">
      <Text
        color="$color12"
        fontSize="$8"
        fontWeight={400}
        letterSpacing={-0.5}
        textAlign="left">
        {appTitle}
        {shouldShowAppVersion && (
          <Text
            color="$color11"
            fontSize="$4"
            fontWeight="$2"
            letterSpacing={-0.5}
            textAlign="left">
            {'  ' + sanitizedVersionString}
          </Text>
        )}
      </Text>
    </View>
  );
}
