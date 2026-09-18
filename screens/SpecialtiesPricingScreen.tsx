// screens/SpecialtiesPricingScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

const SPECIALTIES = ['Tyres', 'Battery', 'Engine', 'Locksmith'];

export default function SpecialtiesPricingScreen({ navigation }: any) {
  const [selected, setSelected] = useState<string[]>(['Tyres', 'Battery']);
  const [tyrePrice, setTyrePrice] = useState('');
  const [batteryPrice, setBatteryPrice] = useState('');

  const toggle = (item: string) => {
    setSelected((prev) => (prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your specialties</Text>

      <View style={styles.chipRow}>
        {SPECIALTIES.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
              onPress={() => toggle(item)}
            >
              <Text style={{ color: isSelected ? colors.primary : colors.textPrimary, fontSize: 12 }}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.subheading}>Set starting prices</Text>
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>Tyre change</Text>
        <TextInput
          style={styles.priceInput}
          placeholder="Rs"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          value={tyrePrice}
          onChangeText={setTyrePrice}
        />
      </View>
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>Battery jump start</Text>
        <TextInput
          style={styles.priceInput}
          placeholder="Rs"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          value={batteryPrice}
          onChangeText={setBatteryPrice}
        />
      </View>

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => navigation.navigate('UnderReview')}
        activeOpacity={0.85}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 60 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: { borderRadius: 14, paddingVertical: 7, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: colors.secondary },
  chipUnselected: { borderWidth: 1, borderColor: colors.border },
  subheading: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  priceLabel: { fontSize: 13, color: colors.textPrimary },
  priceInput: {
    width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: 'right', color: colors.textPrimary,
  },
  continueButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 32,
  },
  continueButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
});