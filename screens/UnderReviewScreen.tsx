// screens/UnderReviewScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function UnderReviewScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="time-outline" size={26} color={colors.warning} />
      </View>
      <Text style={styles.heading}>Under review</Text>
      <Text style={styles.subtitle}>
        We're checking your documents. This usually takes 24–48 hours.
      </Text>

      <View style={styles.lockedRow}>
        <Text style={styles.lockedLabel}>Go online</Text>
        <View style={styles.lockedChip}>
          <Text style={styles.lockedText}>Locked</Text>
        </View>
      </View>

      {/* Dev-only shortcut so we can keep testing the dashboard before real backend review exists.
          Remove this once account approval is wired up to Supabase. */}
      <TouchableOpacity onPress={() => navigation.navigate('HomeMechanic')} style={{ marginTop: 40 }}>
        <Text style={styles.devLink}>(dev) Continue to dashboard preview</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bgWarning,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heading: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 220, marginBottom: 24 },
  lockedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 14, width: '100%',
  },
  lockedLabel: { fontSize: 13, color: colors.textPrimary },
  lockedChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  lockedText: { fontSize: 10, color: colors.textSecondary },
  devLink: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});