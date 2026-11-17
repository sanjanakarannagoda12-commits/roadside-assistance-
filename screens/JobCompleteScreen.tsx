// screens/JobCompleteScreen.tsx
// Payment received → job closed. The mechanic rates the customer and returns home.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { PrimaryButton, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { formatRs, rateCustomer } from '../services/mechanicApi';

export default function JobCompleteScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { request, bill, clearJob } = useJob();
  const [stars, setStars] = useState(0);
  const [saving, setSaving] = useState(false);
  const paidBy: 'card' | 'cash' = route.params?.paidBy ?? 'card';

  const handleDone = async () => {
    setSaving(true);
    if (request && stars > 0) await rateCustomer(request.id, stars).catch(() => {});
    clearJob();
    navigation.reset({ index: 0, routes: [{ name: 'HomeMechanic' }] });
  };

  return (
    <View style={[ui.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.center}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={48} color={colors.successDark} />
        </View>
        <Text style={styles.title}>Payment received</Text>
        <Text style={styles.subtitle}>
          {formatRs(bill.totalRs)} · {paidBy === 'cash' ? 'Cash' : 'Card'} · Receipt sent
        </Text>

        <View style={[ui.card, styles.payoutCard]}>
          <Text style={styles.payoutLabel}>Your payout</Text>
          <Text style={styles.payoutValue}>{formatRs(bill.payoutRs)}</Text>
          <Text style={styles.payoutHint}>
            {paidBy === 'cash'
              ? `Ridzo commission of ${formatRs(bill.commissionRs)} will be deducted from your next card payout.`
              : 'Added to your earnings. Paid out with your next weekly transfer.'}
          </Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.rateLabel}>Rate {request?.customerName ?? 'the customer'}</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={6}>
              <Ionicons
                name={n <= stars ? 'star' : 'star-outline'}
                size={34}
                color={n <= stars ? colors.star : colors.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <PrimaryButton label="Done" onPress={handleDone} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bgSuccess,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  payoutCard: { alignSelf: 'stretch', alignItems: 'center', marginTop: 24 },
  payoutLabel: { fontSize: 13, color: colors.textSecondary },
  payoutValue: { fontSize: 26, fontWeight: '700', color: colors.successDark, marginTop: 4 },
  payoutHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  divider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 24 },
  rateLabel: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  stars: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
