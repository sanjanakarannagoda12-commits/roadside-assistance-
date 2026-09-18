// screens/HomeMechanicScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import BottomNav from '../components/BottomNav';
import { getDashboardSummary, MechanicDashboardSummary } from '../services/mechanicApi';

const MENU_ROWS = [
  { key: 'services', label: 'My services & prices', icon: 'pricetags-outline', route: 'MyServices' },
  { key: 'history', label: 'Job history', icon: 'time-outline', route: 'JobHistory' },
];

export default function HomeMechanicScreen({ navigation }: any) {
  const { fullName } = useAppContext();
  const [isOnline, setIsOnline] = useState(false);
  const [summary, setSummary] = useState<MechanicDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(false);
    getDashboardSummary()
      .then((data) => {
        if (isMounted) setSummary(data);
      })
      .catch(() => {
        if (isMounted) setError(true);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {fullName ? fullName.split(' ')[0] : 'Mechanic'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color={colors.star} />
              <Text style={styles.ratingText}>
                {loading ? '...' : summary ? `${summary.rating} · ${summary.specialty}` : '—'}
              </Text>
            </View>
          </View>
          <Image source={require('../assets/avatar.png')} style={styles.avatar} />
        </View>

        {/* Go online / offline card */}
        <View style={styles.onlineCard}>
          <Text style={styles.onlineStatus}>{isOnline ? "You're online" : "You're offline"}</Text>
          <TouchableOpacity
            style={styles.onlineButton}
            onPress={() => setIsOnline((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.onlineButtonText}>{isOnline ? 'Go offline' : 'Go online'}</Text>
          </TouchableOpacity>
        </View>

        {/* Today stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Today</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.statValue}>
                {summary ? `Rs ${summary.todayEarningsRs.toLocaleString()}` : '—'}
              </Text>
            )}
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Jobs</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.statValue}>{summary ? summary.todayJobs : '—'}</Text>
            )}
          </View>
        </View>

        {error && (
          <Text style={styles.errorText}>Couldn't load today's stats. Pull down to try again soon.</Text>
        )}

        {/* Menu rows */}
        <View style={styles.menuList}>
          {MENU_ROWS.map((row) => (
            <TouchableOpacity
              key={row.key}
              style={styles.menuRow}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(row.route)}
            >
              <Ionicons name={row.icon as any} size={18} color={colors.textPrimary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav active="Home" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  ratingText: { color: colors.textSecondary, fontSize: 13, marginLeft: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary },

  onlineCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  onlineStatus: { color: colors.textOnDark, fontSize: 15, fontWeight: '600', marginBottom: 14 },
  onlineButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  onlineButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    minHeight: 76,
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  errorText: { fontSize: 12, color: colors.warning, marginBottom: 12 },

  menuList: { gap: 10, marginTop: 12 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuLabel: { flex: 1, fontSize: 14, color: colors.textPrimary },
});