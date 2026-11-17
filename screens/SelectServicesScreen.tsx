// screens/SelectServicesScreen.tsx
// Step 2 on site: tick the services performed from the mechanic's own price list.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { MechanicService, formatRs, getMyServices } from '../services/mechanicApi';

export default function SelectServicesScreen({ navigation }: any) {
  const { issue, services: selected, setServices } = useJob();
  const [all, setAll] = useState<MechanicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    getMyServices()
      .then((list) => {
        // Show services matching the diagnosed issue first
        const sorted = [...list].sort(
          (a, b) => Number(b.category === issue) - Number(a.category === issue),
        );
        setAll(sorted);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [issue]);

  const isSelected = (s: MechanicService) => selected.some((x) => x.id === s.id);
  const toggle = (s: MechanicService) =>
    setServices(isSelected(s) ? selected.filter((x) => x.id !== s.id) : [...selected, s]);

  const total = selected.reduce((sum, s) => sum + s.priceRs, 0);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Select services" subtitle="What did you do for this customer?" onBack={navigation.goBack} />

      <ScrollView contentContainerStyle={ui.content}>
        <StepDots step={2} total={4} />

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />}

        {error && (
          <TouchableOpacity onPress={load} style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your services. Tap to retry.</Text>
          </TouchableOpacity>
        )}

        <View style={{ gap: 10 }}>
          {all.map((s) => {
            const on = isSelected(s);
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.row, on && styles.rowSelected]}
                onPress={() => toggle(s)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={on ? colors.primary : colors.textSecondary}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.name, on && { color: colors.primary }]}>{s.name}</Text>
                  <Text style={styles.duration}>{s.durationLabel}</Text>
                </View>
                <Text style={[styles.price, on && { color: colors.primary }]}>{formatRs(s.priceRs)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <BottomBar>
        {selected.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {selected.length} service{selected.length > 1 ? 's' : ''}
            </Text>
            <Text style={styles.totalValue}>{formatRs(total)}</Text>
          </View>
        )}
        <PrimaryButton
          label="Next: add parts & fees"
          onPress={() => navigation.navigate('PartsFees')}
          disabled={selected.length === 0}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: { backgroundColor: colors.secondary, borderColor: colors.primary },
  name: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  duration: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginLeft: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: colors.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  errorBox: { backgroundColor: colors.bgWarning, borderRadius: 12, padding: 14, marginBottom: 12 },
  errorText: { color: colors.warning, fontSize: 13 },
});
