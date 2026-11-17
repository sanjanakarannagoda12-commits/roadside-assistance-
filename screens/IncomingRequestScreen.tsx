// screens/IncomingRequestScreen.tsx
// A job offered to this mechanic. They have 30 seconds; after that Ridzo also offers it to the next
// mechanic — but this mechanic can STILL accept until someone else does ("missed" state).
// The screen checks the offer every few seconds so it can say "taken" as soon as that happens.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { PrimaryButton, OutlineButton, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import {
  JobRequest,
  REQUEST_TIMEOUT_SECONDS,
  acceptRequest,
  declineRequest,
  formatRs,
  getOfferState,
} from '../services/mechanicApi';
import { ApiError, errorMessage } from '../services/apiClient';

const STATE_POLL_MS = 3000;

export default function IncomingRequestScreen({ navigation, route }: any) {
  const request: JobRequest = route.params.request;
  const insets = useSafeAreaInsets();
  const { beginJob } = useJob();
  const [secondsLeft, setSecondsLeft] = useState(
    request.offerState === 'missed' ? 0 : Math.min(request.secondsLeft ?? REQUEST_TIMEOUT_SECONDS, REQUEST_TIMEOUT_SECONDS),
  );
  const [gone, setGone] = useState<null | string>(null); // why the job is no longer available
  const [accepting, setAccepting] = useState(false);
  const handled = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const missed = secondsLeft === 0;

  // Pulsing ring around the countdown
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Countdown. Reaching 0 does NOT close the screen — the job may still be open.
  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Is it still available?
  useEffect(() => {
    const timer = setInterval(async () => {
      if (handled.current) return;
      try {
        const { state } = await getOfferState(request.id);
        if (state === 'taken') setGone('Another mechanic took this job.');
        else if (state === 'closed') setGone('The customer no longer needs help.');
      } catch {
        // keep trying
      }
    }, STATE_POLL_MS);
    return () => clearInterval(timer);
  }, [request.id]);

  // Close automatically a moment after the job disappears.
  useEffect(() => {
    if (!gone) return;
    handled.current = true;
    const t = setTimeout(() => navigation.goBack(), 2500);
    return () => clearTimeout(t);
  }, [gone, navigation]);

  const handleDecline = () => {
    if (handled.current) return;
    handled.current = true;
    declineRequest(request.id).catch(() => {});
    navigation.goBack();
  };

  const handleAccept = async () => {
    if (handled.current) return;
    handled.current = true;
    setAccepting(true);
    try {
      const job = await acceptRequest(request.id); // includes the customer's phone number
      beginJob(job);
      navigation.replace('NavigateToCustomer');
    } catch (e) {
      setAccepting(false);
      if (e instanceof ApiError && (e.code === 'job_taken' || e.code === 'job_closed')) {
        setGone(e.message);
        return;
      }
      handled.current = false;
      Alert.alert("Couldn't accept", errorMessage(e));
    }
  };

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const urgent = secondsLeft <= 10 && !missed;

  return (
    <View style={[ui.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.center}>
        <View style={styles.timerWrap}>
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
          <View style={[styles.timerCircle, urgent && { borderColor: colors.danger }]}>
            {gone ? (
              <Ionicons name="close" size={44} color={colors.textSecondary} />
            ) : missed ? (
              <Ionicons name="time-outline" size={44} color={colors.warning} />
            ) : (
              <>
                <Text style={[styles.timerText, urgent && { color: colors.danger }]}>{secondsLeft}</Text>
                <Text style={styles.timerUnit}>sec</Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.title}>{gone ? 'No longer available' : missed ? "Time's up — still open" : 'New request'}</Text>
        <Text style={styles.subtitle}>
          {gone ?? (missed ? "We're also asking other mechanics. You can still take it if nobody has." : 'A driver nearby needs your help')}
        </Text>

        <View style={[ui.card, styles.detailsCard]}>
          <DetailRow icon="location-outline" text={`${request.distanceKm} km${request.distanceSource === 'estimate' ? ' (approx.)' : ' by road'} · ~${request.etaMin} min`} />
          <DetailRow icon="car-outline" text={`${request.vehicleType} · ${request.issueSummary}`} />
          <DetailRow icon="cash-outline" text={`Est. ${formatRs(request.estimateRs)} + ${formatRs(request.travelRs)} travel`} />
          <DetailRow
            icon={request.paymentMethod === 'card' ? 'card-outline' : 'wallet-outline'}
            text={request.paymentMethod === 'card' ? 'Paying by card' : 'Paying in cash'}
            last
          />
        </View>
      </View>

      <View style={styles.actions}>
        {gone ? (
          <OutlineButton label="Back" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
        ) : (
          <>
            <OutlineButton
              label={missed ? 'Dismiss' : 'Decline'}
              tone="danger"
              onPress={handleDecline}
              style={{ flex: 1 }}
              disabled={accepting}
            />
            <PrimaryButton label={missed ? 'Accept anyway' : 'Accept'} onPress={handleAccept} loading={accepting} style={{ flex: 1 }} />
          </>
        )}
      </View>
    </View>
  );
}

function DetailRow({ icon, text, last }: { icon: any; text: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && { marginBottom: 12 }]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  timerWrap: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.secondary,
  },
  timerCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: { fontSize: 40, fontWeight: '700', color: colors.primary },
  timerUnit: { fontSize: 12, color: colors.textSecondary, marginTop: -2 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 24 },
  detailsCard: { alignSelf: 'stretch' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
});
