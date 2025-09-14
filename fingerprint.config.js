/** @type {import('@expo/fingerprint').Config} */

const config = {
  ignorePaths: ['projectVersions.json'],

  sourceSkips: [
    // 'None', // Skip nothing
    'ExpoConfigVersions', // Versions in app.json, including Android versionCode and iOS buildNumber
    'ExpoConfigRuntimeVersionIfString', // runtimeVersion in app.json if it is a string
    'ExpoConfigNames', // App names in app.json, including shortName and description
    'ExpoConfigAndroidPackage', // Android package name in app.json
    'ExpoConfigIosBundleIdentifier', // iOS bundle identifier in app.json
    'ExpoConfigSchemes', // Schemes in app.json
    // 'ExpoConfigEASProject', // EAS project information in app.json
    'ExpoConfigAssets', // Assets in app.json, including icons and splash assets
    // 'ExpoConfigAll', // Skip the whole ExpoConfig. Prefer other ExpoConfig source skips when possible and use this flag with caution. This will potentially ignore some native changes that should be part of most fingerprints. E.g., adding a new config plugin, changing the app icon, or changing the app name.
    // 'PackageJsonAndroidAndIosScriptsIfNotContainRun', // package.json scripts if android and ios items do not contain "run". Because prebuild will change the scripts in package.json, this is useful to generate a consistent fingerprint before and after prebuild.
    'PackageJsonScriptsAll', // Skip the whole `scripts` section in the project's package.json.
    'GitIgnore', // Skip .gitignore files.
    'ExpoConfigExtraSection', // The [extra](https://docs.expo.dev/versions/latest/config/app/#extra) section in app.json
  ],
};

module.exports = config;
