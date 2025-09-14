// import * as Colors from '@tamagui/colors';
import {defaultConfig} from '@tamagui/config/v4';
import {createTamagui} from 'tamagui';

import {themes} from '@/theme/tamaguiCustomThemes';

export const config = createTamagui({
  ...defaultConfig,
  // Recommended V4 setting for React Native compatibility
  settings: {
    ...defaultConfig.settings,
    allowedStyleValues: 'strict',
    fastSchemeChange: false,
    onlyAllowShorthands: false,
    styleCompat: 'react-native', // Aligns flexBasis of flex to be 0, not auto
  },

  themes: themes,
});

export type AppConfig = typeof config;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
