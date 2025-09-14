const jhaConfig = require('eslint-config-jha-react-node');
const expoConfig = require('eslint-config-expo/flat');

// Create a filtered version of jhaConfig that removes duplicate plugin definitions
const filteredJhaConfig = jhaConfig.map((config) => {
  // Check if this config part defines plugins and if either 'import' or 'react' are present
  if (config.plugins && (config.plugins.import || config.plugins.react)) {
    // Clone the plugins object
    const newPlugins = {...config.plugins};

    // Remove 'import' if it exists (already defined in expoConfig)
    if (newPlugins.import) {
      delete newPlugins.import;
    }
    // Remove 'react' if it exists (likely now also defined in expoConfig)
    if (newPlugins.react) {
      delete newPlugins.react;
    }

    // Return the modified config object
    return {
      ...config,
      plugins: newPlugins,
    };
  }
  // If no problematic plugins found, return the original config part
  return config;
});

const config = [
  {ignores: ['**/.expo/', 'tmp/']},
  ...expoConfig,
  ...filteredJhaConfig,
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];

module.exports = config;
