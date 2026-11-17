// screens/HomeMechanicScreen.tsx
// Dashboard + the Go online switch. While online and on this screen it checks for job offers every
// few seconds (push notifications will replace the polling later).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { useJob } from '../context/JobContext';
import BottomNav from '../components/BottomNav';
import ProfileAvatar from '../components/ProfileAvatar';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import {
  JobRequest,
  MechanicDashboardSummary,
  RESUME_ROUTE,
  getActiveJob,
  getCurrentOffer,
  getDashboardSummary,
  goOffline,
  goOnline,
} from '../services/mechanicApi';
import { getMe, routeForMe } from '../services/authApi';
import { ApiError, errorMessage } from '../services/apiClient';
import { currentPosition, ensureLocationPermission } from '../services/location';
import { canTrackInBackground, ensureBackgroundPermission, isExpoGo } from '../services/backgroundLocation';

const OFFER_POLL_MS = 4000;

const MENU_ROWS = [
  { key: 'services', label: 'My services & prices', icon: 'pricetags-outline', route: 'MyServices' },
  { key: 'history', label: 'Job history', icon: 'time-outline', route: 'JobHistory' },
];

export default function HomeMechanicScreen({ navigation }: any) {
  const { fullName, setMe, online: isOnline, setOnline, tracking } = useAppContext();
  const { beginJob, request: currentJob } = useJob();
  const [switching, setSwitching] = useState(false);
  const [summary, setSummary] = useState<MechanicDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeJob, setActiveJob] = useState<JobRequest | null>(null);
  const shownOffers = useRef(new Set<string>());
  const isFocused = useIsFocused();

  const refreshStatusAndRoute = async () => {
    const fresh = await getMe().catch(() => null);
    if (fresh) {
      setMe(fresh);
      navigation.reset({ index: 0, routes: [{ name: routeForMe(fresh) }] });
    }
  };

  // Going online needs approval (checked by the server) and the phone's location.
  const toggleOnline = async () => {
    setSwitching(true);
    try {
      if (isOnline) {
        await goOffline();
        setOnline(false);
        return;
      }
      if (!(await ensureLocationPermission())) return;
      // Like PickMe/Uber: ask for "Allow all the time" so jobs still reach you in other apps.
      // If refused, you can still go online — tracking then only works while Ridzo is open.
      if (await canTrackInBackground()) await ensureBackgroundPermission();
      const pos = await currentPosition();
      const res = await goOnline(pos);
      setOnline(res.online);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_approved') return refreshStatusAndRoute();
      Alert.alert(isOnline ? "Couldn't go offline" : "Couldn't go online", errorMessage(e));
    } finally {
      setSwitching(false);
    }
  };

  const loadDashboard = useCallback(() => {
    let alive = true;
    setError(false);
    getDashboardSummary()
      .then((d) => alive && setSummary(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    getActiveJob()
      .then((j) => {
        if (!alive) return;
        setActiveJob(j);
        // Load it into the job context right away so location tracking for the job resumes
        // even before the mechanic taps "Resume".
        if (j && currentJob?.id !== j.id) beginJob(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh stats + active job whenever Home comes back into view (e.g. after finishing a job).
  useFocusEffect(loadDashboard);

  // While online, free and on this screen: check for job offers.
  useEffect(() => {
    if (!isOnline || !isFocused || activeJob) return;
    let stopped = false;
    const check = async () => {
      try {
        const offer = await getCurrentOffer();
        // Don't re-open an offer you already saw (e.g. one you backed out of after it timed out).
        if (!stopped && offer && !shownOffers.current.has(offer.id)) {
          shownOffers.current.add(offer.id);
          navigation.navigate('IncomingRequest', { request: offer });
        }
      } catch {
        // network blip — next poll will retry
      }
    };
    check();
    const timer = setInterval(check, OFFER_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [isOnline, isFocused, activeJob, navigation]);

  const resumeJob = () => {
    if (!activeJob) return;
    beginJob(activeJob);
    navigation.navigate(RESUME_ROUTE[activeJob.status ?? 'accepted'] ?? 'NavigateToCustomer');
  };

  const ratingText = loading
    ? '...'
    : summary
      ? `${summary.rating ? summary.rating.toFixed(1) : 'New'} · ${summary.specialty}`
      : '—';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {fullName ? fullName.split(' ')[0] : 'Mechanic'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color={colors.star} />
              <Text style={styles.ratingText}>{ratingText}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} accessibilityLabel="Edit profile">
            <ProfileAvatar style={styles.avatar} />
          </TouchableOpacity>
        </View>

        {activeJob && (
          <TouchableOpacity style={styles.resumeCard} onPress={resumeJob} activeOpacity={0.85}>
            <Ionicons name="construct" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>Job in progress</Text>
              <Text style={styles.resumeText}>
                {activeJob.customerName} · {activeJob.issueSummary}
              </Text>
            </View>
            <Text style={styles.resumeAction}>Resume</Text>
          </TouchableOpacity>
        )}

        {/* Go online / offline card */}
        <View style={styles.onlineCard}>
          <Text style={styles.onlineStatus}>{isOnline ? "You're online" : "You're offline"}</Text>
          <Text style={styles.onlineHint}>
            {isOnline ? 'Looking for requests near you…' : 'Go online to start receiving job requests'}
          </Text>
          {isOnline && tracking === 'foreground' ? (
            <Text style={styles.trackingHint}>
              {isExpoGo
                ? 'Expo Go: keep Ridzo open — background tracking needs the Ridzo app build.'
                : 'Keep Ridzo open, or allow location "All the time" in Settings to stay online in other apps.'}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.onlineButton}
            onPress={toggleOnline}
            disabled={switching}
            activeOpacity={0.85}
          >
            {switching ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.onlineButtonText}>{isOnline ? 'Go offline' : 'Go online'}</Text>
            )}
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

        {summary?.acceptanceRate != null && (
          <Text style={styles.acceptText}>
            You accepted {Math.round(summary.acceptanceRate * 100)}% of jobs offered in the last 30 days
          </Text>
        )}

        {error && <Text style={styles.errorText}>Couldn't load today's stats. They'll refresh when you come back.</Text>}

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
  onlineStatus: { color: colors.textOnDark, fontSize: 15, fontWeight: '600', marginBottom: 4 },
  trackingHint: {
    color: colors.textOnDark,
    fontSize: 11,
    opacity: 0.9,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: -8,
    marginBottom: 12,
  },
  onlineHint: { color: colors.textOnDark, fontSize: 12, opacity: 0.85, marginBottom: 14 },
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
  acceptText: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.secondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  resumeTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  resumeText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  resumeAction: { fontSize: 14, fontWeight: '700', color: colors.primary },

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