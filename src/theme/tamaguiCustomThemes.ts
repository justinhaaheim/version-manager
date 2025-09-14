/* eslint-disable sort-keys-fix/sort-keys-fix */
import * as Colors from '@tamagui/colors';
import {createThemes, defaultComponentThemes} from '@tamagui/theme-builder';

import * as CustomColors from '@/theme/tamaguiCustomColors';

type ChildrenThemes = Record<
  string,
  {palette: {dark: string[]; light: string[]}}
>;

/**
 * This is the default tamagui config v4 definitions.
 *   - uses shorthands v4
 *   - uses tokens v4 which are mostly the same as v3
 */

// Themes:

const darkPalette = [
  '#050505',
  '#151515',
  '#191919',
  '#232323',
  '#282828',
  '#323232',
  '#424242',
  '#494949',
  '#545454',
  '#626262',
  '#a5a5a5',
  '#fff',
];

const lightPalette = [
  '#fff',
  '#f2f2f2',
  'hsl(0, 0%, 93%)',
  'hsl(0, 0%, 91%)',
  'hsl(0, 0%, 88%)',
  'hsl(0, 0%, 85%)',
  'hsl(0, 0%, 82%)',
  'hsl(0, 0%, 76%)',
  'hsl(0, 0%, 56%)',
  'hsl(0, 0%, 50%)',
  'hsl(0, 0%, 42%)',
  'hsl(0, 0%, 9%)',
];

const lightShadows = {
  shadow1: 'rgba(0,0,0,0.04)',
  shadow2: 'rgba(0,0,0,0.08)',
  shadow3: 'rgba(0,0,0,0.16)',
  shadow4: 'rgba(0,0,0,0.24)',
  shadow5: 'rgba(0,0,0,0.32)',
  shadow6: 'rgba(0,0,0,0.4)',
};

const darkShadows = {
  shadow1: 'rgba(0,0,0,0.2)',
  shadow2: 'rgba(0,0,0,0.3)',
  shadow3: 'rgba(0,0,0,0.4)',
  shadow4: 'rgba(0,0,0,0.5)',
  shadow5: 'rgba(0,0,0,0.6)',
  shadow6: 'rgba(0,0,0,0.7)',
};

const blackColors = {
  black1: darkPalette[0],
  black2: darkPalette[1],
  black3: darkPalette[2],
  black4: darkPalette[3],
  black5: darkPalette[4],
  black6: darkPalette[5],
  black7: darkPalette[6],
  black8: darkPalette[7],
  black9: darkPalette[8],
  black10: darkPalette[9],
  black11: darkPalette[10],
  black12: darkPalette[11],
};

const whiteColors = {
  white1: lightPalette[0],
  white2: lightPalette[1],
  white3: lightPalette[2],
  white4: lightPalette[3],
  white5: lightPalette[4],
  white6: lightPalette[5],
  white7: lightPalette[6],
  white8: lightPalette[7],
  white9: lightPalette[8],
  white10: lightPalette[9],
  white11: lightPalette[10],
  white12: lightPalette[11],
};

const childrenThemesDefault = {
  black: {
    palette: {
      dark: Object.values(blackColors),
      light: Object.values(blackColors),
    },
  },
  white: {
    palette: {
      dark: Object.values(whiteColors),
      light: Object.values(whiteColors),
    },
  },

  blue: {
    palette: {
      dark: Object.values(Colors.blueDark),
      light: Object.values(Colors.blue),
    },
  },
  red: {
    palette: {
      dark: Object.values(Colors.redDark),
      light: Object.values(Colors.red),
    },
  },
  yellow: {
    palette: {
      dark: Object.values(Colors.yellowDark),
      light: Object.values(Colors.yellow),
    },
  },
  green: {
    palette: {
      dark: Object.values(Colors.greenDark),
      light: Object.values(Colors.green),
    },
  },
} as const;

const ourCustomChildrenThemes = {
  // black: {
  //   palette: {
  //     dark: Object.values(blackColors),
  //     light: Object.values(blackColors),
  //   },
  // },
  // white: {
  //   palette: {
  //     dark: Object.values(whiteColors),
  //     light: Object.values(whiteColors),
  //   },
  // },
  gray: {
    palette: {
      dark: Object.values(Colors.grayDark),
      light: Object.values(Colors.gray),
    },
  },
  // blue: {
  //   palette: {
  //     dark: Object.values(Colors.blueDark),
  //     light: Object.values(Colors.blue),
  //   },
  // },
  orange: {
    palette: {
      dark: Object.values(Colors.orangeDark),
      light: Object.values(Colors.orange),
    },
  },
  // red: {
  //   palette: {
  //     dark: Object.values(Colors.redDark),
  //     light: Object.values(Colors.red),
  //   },
  // },
  // yellow: {
  //   palette: {
  //     dark: Object.values(Colors.yellowDark),
  //     light: Object.values(Colors.yellow),
  //   },
  // },
  // green: {
  //   palette: {
  //     dark: Object.values(colorsGreenDark),
  //     light: Object.values(colorsGreen),
  //   },
  // },
  purple: {
    palette: {
      dark: Object.values(Colors.purpleDark),
      light: Object.values(Colors.purple),
    },
  },
  pink: {
    palette: {
      dark: Object.values(Colors.pinkDark),
      light: Object.values(Colors.pink),
    },
  },
  tan: {
    palette: {
      light: CustomColors.tan,
      dark: CustomColors.tanDark,
    },
  },

  jade: {
    palette: {
      dark: CustomColors.jadeDark,
      light: CustomColors.jadeLight,
    },
  },

  supreme: {
    palette: {
      dark: CustomColors.supremeDark,
      light: CustomColors.supremeLight,
    },
  },

  orangeRed: {
    palette: {
      dark: CustomColors.orangeRedDark,
      light: CustomColors.orangeRedLight,
    },
  },

  royalBlue: {
    palette: {
      dark: CustomColors.royalBlueDark,
      light: CustomColors.royalBlueLight,
    },
  },

  burgundy: {
    palette: {
      dark: CustomColors.burgundyDark,
      light: CustomColors.burgundyLight,
    },
  },

  teal: {
    palette: {
      dark: CustomColors.tealDark,
      light: CustomColors.tealLight,
    },
  },

  forest: {
    palette: {
      dark: CustomColors.forestDark,
      light: CustomColors.forestLight,
    },
  },

  cyan: {
    palette: {
      dark: CustomColors.cyanDark,
      light: CustomColors.cyanLight,
    },
  },
} as const;

const childrenThemes = {
  ...childrenThemesDefault,
  ...ourCustomChildrenThemes,
} as const;

const _childrenThemesTypeCheck: ChildrenThemes = childrenThemes;

export const CUSTOM_THEME_NAMES = Object.keys(
  childrenThemes,
) as (keyof typeof childrenThemes)[];

export type CustomThemeNames = (typeof CUSTOM_THEME_NAMES)[number];

export const CUSTOM_THEME_NAMES_FUN_COLORS = CUSTOM_THEME_NAMES.filter(
  (theme) => theme !== 'black' && theme !== 'white' && theme !== 'gray',
);

export type CustomThemeNamesFunColors =
  (typeof CUSTOM_THEME_NAMES_FUN_COLORS)[number];

const generatedThemes = createThemes({
  componentThemes: defaultComponentThemes,

  base: {
    palette: {
      dark: darkPalette,
      light: lightPalette,
    },

    // for values we don't want being inherited onto sub-themes
    extra: {
      light: {
        ...Colors.blue,
        ...Colors.green,
        ...Colors.red,
        ...Colors.yellow,
        ...lightShadows,
        ...blackColors,
        ...whiteColors,
        shadowColor: lightShadows.shadow1,
      },
      dark: {
        ...Colors.blueDark,
        ...Colors.greenDark,
        ...Colors.redDark,
        ...Colors.yellowDark,
        ...darkShadows,
        ...blackColors,
        ...whiteColors,
        shadowColor: darkShadows.shadow1,
      },
    },
  },

  // inverse accent theme
  accent: {
    palette: {
      dark: lightPalette,
      light: darkPalette,
    },
  },

  childrenThemes: childrenThemes,
});

export type TamaguiThemes = typeof generatedThemes;

export const themes = generatedThemes;

/**
 * This is an optional production optimization: themes JS can get to 20Kb or more.
 * Tamagui has ~1Kb of logic to hydrate themes from CSS, so you can remove the JS.
 * So long as you server render your Tamagui CSS, this will save you bundle size:
 */
// export const themes: TamaguiThemes =
//   process.env.TAMAGUI_ENVIRONMENT === 'client' && process.env.NODE_ENV === 'production'
//     ? {}
//     : (generatedThemes as any)
