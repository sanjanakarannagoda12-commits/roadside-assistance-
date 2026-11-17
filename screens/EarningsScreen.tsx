// screens/EarningsScreen.tsx
// Weekly earnings, pending payout and recent jobs. Also used as "Job history".
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import BottomNav from '../components/BottomNav';
import { ui } from '../components/ui';
import { EarningsSummary, formatRs, getEarnings } from '../services/mechanicApi';

export default function EarningsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    getEarnings()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <View style={ui.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.heading}>Earnings</Text>

        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />}

        {error && (
          <TouchableOpacity onPress={load} style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your earnings. Tap to retry.</Text>
          </TouchableOpacity>
        )}

        {data && (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>This week</Text>
              <Text style={styles.heroValue}>{formatRs(data.weekPayoutRs)}</Text>
              <Text style={styles.heroSub}>Today {formatRs(data.todayPayoutRs)}</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={[ui.card, styles.stat]}>
                <Text style={styles.statLabel}>Jobs done</Text>
                <Text style={styles.statValue}>{data.weekJobs}</Text>
              </View>
              <View style={[ui.card, styles.stat]}>
                <Text style={styles.statLabel}>Pending payout</Text>
                <Text style={styles.statValue}>{formatRs(data.pendingPayoutRs)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Recent jobs</Text>
            {data.recentJobs.map((job, i) => (
              <View key={job.id} style={[styles.jobRow, i === data.recentJobs.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.jobIcon}>
                  <Ionicons
                    name={job.paymentMethod === 'card' ? 'card-outline' : 'wallet-outline'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle}>
                    {job.title} – {job.area}
                  </Text>
                  <Text style={styles.jobMeta}>{job.dateLabel}</Text>
                </View>
                <Text style={styles.jobAmount}>{formatRs(job.payoutRs)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <BottomNav active="Earnings" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  heading: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  hero: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, marginBottom: 12 },
  heroLabel: { fontSize: 13, color: colors.textOnDark, opacity: 0.85 },
  heroValue: { fontSize: 32, fontWeight: '700', color: colors.textOnDark, marginTop: 4 },
  heroSub: { fontSize: 13, color: colors.textOnDark, opacity: 0.85, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  stat: { flex: 1 },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  sectionTitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  jobIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  jobTitle: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  jobMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  jobAmount: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  errorBox: { backgroundColor: colors.bgWarning, borderRadius: 12, padding: 14, marginBottom: 12 },
  errorText: { color: colors.warning, fontSize: 13 },
});
