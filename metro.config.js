const {getDefaultConfig} = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add 'sql' to source extensions for Drizzle migrations
config.resolver.sourceExts.push('sql');

// // Log the default blockList to see what Expo blocks by default
// console.log('Default Metro blockList:', config.resolver.blockList);
// console.log('Type of blockList:', typeof config.resolver.blockList);

// Ignore e2e/screenshots directory to prevent hot reloads during screenshot tests
config.resolver.blockList = [config.resolver.blockList, /e2e\/screenshots\/.*/]
  .flat()
  .filter(Boolean);

// console.log('Final Metro blockList:', config.resolver.blockList);

module.exports = config;
