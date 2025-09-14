module.exports = function (api) {
  api.cache(true);
  return {
    plugins: [
      ['inline-import', {extensions: ['.sql']}], // Add for Drizzle migrations
      // [
      //   '@tamagui/babel-plugin',
      //   {
      //     components: ['tamagui'],
      //     config: './tamagui.config.ts',
      //     disableExtraction: process.env.NODE_ENV === 'development',
      //     logTimings: true,
      //   },
      // ],
    ],
    presets: ['babel-preset-expo'],
  };
};
