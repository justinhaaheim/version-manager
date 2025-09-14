/**
 * Main Tamagui configuration - using default v4 configuration
 * for idiomatic theming with the 12-step palette system
 */

// Re-export the configuration from src/theme
// Note: Metro bundler will resolve the .ts extension
import {config} from './src/theme/tamagui.config';

export type {AppConfig} from './src/theme/tamagui.config';
export {config};
export default config;
