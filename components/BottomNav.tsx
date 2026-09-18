// components/BottomNav.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';

const TABS = [
  { key: 'Home', label: 'Home', icon: 'home', iconOutline: 'home-outline', route: 'Home' },
  { key: 'Activities', label: 'Activities', icon: 'grid', iconOutline: 'grid-outline', route: 'Search' },
  { key: 'Notifications', label: 'Notifications', icon: 'notifications', iconOutline: 'notifications-outline', route: 'Messages' },
  { key: 'Account', label: 'Account', icon: 'person', iconOutline: 'person-outline', route: 'Profile' },
] as const;

export default function BottomNav({ active, navigation }: { active: string; navigation: any }) {
  const { role } = useAppContext();

  const handlePress = (tab: (typeof TABS)[number]) => {
    if (tab.key === 'Home') {
      navigation.navigate(role === 'provider' ? 'HomeMechanic' : 'Home');
    } else {
      navigation.navigate(tab.route);
    }
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handlePress(tab)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={(isActive ? tab.icon : tab.iconOutline) as any}
                size={20}
                color={isActive ? colors.primary : colors.textSecondary}
              />
              {isActive && <Text style={styles.label}>{tab.label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: colors.secondary,
  },
  label: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});