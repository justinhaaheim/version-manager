import {Ionicons} from '@expo/vector-icons';
// import * as Haptics from 'expo-haptics';
import {Tabs} from 'expo-router';
import React from 'react';
// Remove React Native specific imports if Tamagui components replace them
// import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme as useTamaguiTheme, useThemeName} from 'tamagui'; // Import Tamagui components, removed View

import HomeHeaderTitle from '@/components/HomeHeaderTitle';
import {ThemeToggle} from '@/theme/ThemeToggle';

export default function TabLayout() {
  // const {theme, themeColors} = useThemeManager(); // Old theme
  const currentTamaguiTheme = useTamaguiTheme(); // Tamagui theme
  const themeName = useThemeName(); // Get current theme name (e.g., 'light', 'dark')
  const isLight = themeName === 'light'; // Check if current theme is light

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: currentTamaguiTheme.background?.val || '#FFFFFF', // Tamagui token
        },
        headerTintColor: currentTamaguiTheme.color?.val || '#000000', // Tamagui token
        headerTitleStyle: {
          fontWeight: '600',
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tabBarActiveTintColor: currentTamaguiTheme.primary?.val ?? '#007AFF', // Semantic primary color
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tabBarInactiveTintColor:
          currentTamaguiTheme.secondary?.val ?? '#999999', // Semantic secondary color
        tabBarStyle: {
          backgroundColor: currentTamaguiTheme.background?.val || '#FFFFFF', // Tamagui token
          borderTopColor: currentTamaguiTheme.borderColor?.val || '#e0e0e0', // Tamagui token
          height: 90,
          paddingBottom: 12,
          paddingTop: 12,
          ...(isLight // Use isLight based on Tamagui theme name
            ? {
                elevation: 10, // Keep platform-specific shadow styles for now
                shadowColor: 'rgba(0,0,0,0.1)',
                shadowOffset: {height: -3, width: 0},
                shadowOpacity: 0.3,
                shadowRadius: 5,
              }
            : {}),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          headerRight: ThemeToggle,
          headerTitle: () => <HomeHeaderTitle />,
          headerTitleAlign: 'left',
          tabBarButtonTestID: 'homeTabButton',
          tabBarIcon: (
            {color}, // Use incoming color, but override size
          ) => (
            <Ionicons color={color} name="home" size={28} /> // Set fixed size
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarButtonTestID: 'settingsTabButton',
          tabBarIcon: (
            {color}, // Use incoming color, but override size
          ) => (
            <Ionicons color={color} name="settings-outline" size={28} /> // Set fixed size
          ),
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}
