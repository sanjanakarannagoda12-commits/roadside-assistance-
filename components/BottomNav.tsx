// components/BottomNav.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

const TABS = [
  { key: 'Home', icon: 'home' },
  { key: 'Search', icon: 'search' },
  { key: 'Messages', icon: 'chatbubble-outline' },
  { key: 'Profile', icon: 'person-outline' },
] as const;

export default function BottomNav({ active, onChange }: { active: string; onChange: (k: string) => void }) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            <Ionicons
              name={tab.icon as any}
              size={22}
              color={isActive ? colors.primary : colors.textOnDark}
            />
            <Text style={[styles.label, isActive && { color: colors.primary }]}>{tab.key}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.dark, // was blue in old design, now dark charcoal to match reference
    paddingVertical: 14,
    paddingBottom: 24,
    justifyContent: 'space-around',
  },
  tab: { alignItems: 'center' },
  label: { color: colors.textOnDark, fontSize: 11, marginTop: 4 },
});
