// screens/AwaitingPaymentScreen.tsx
// Bill sent. Waits for the customer's card payment, or lets the mechanic confirm cash.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { OutlineButton, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { errorMessage } from '../services/apiClient';
import { completeJob, confirmCashPayment, formatRs, getPaymentStatus } from '../services/mechanicApi';

const POLL_MS = 3000;

export default function AwaitingPaymentScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { request, bill } = useJob();
  const [confirming, setConfirming] = useState(false);
  const done = useRef(false);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const finish = async (method: 'card' | 'cash') => {
    if (done.current || !request) return;
    done.current = true;
    if (method === 'card') {
      // TODO(payments): the gateway webhook will complete card jobs on the server instead.
      try {
        await completeJob(request.id, 'card');
      } catch {
        done.current = false; // try again on the next poll
        return;
      }
    }
    navigation.replace('JobComplete', { paidBy: method });
  };

  // Poll for card payment. TODO(backend): replace with a websocket/push event.
  useEffect(() => {
    if (!request) return;
    const timer = setInterval(async () => {
      try {
        const status = await getPaymentStatus(request.id, request.paymentMethod);
        if (status === 'paid') finish('card');
      } catch {
        // keep polling
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;

  const handleCash = () => {
    Alert.alert('Cash received?', `Confirm you received ${formatRs(bill.totalRs)} in cash from ${request.customerName}.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Yes, received',
        onPress: async () => {
          setConfirming(true);
          try {
            await confirmCashPayment(request.id);
            finish('cash');
          } catch (e) {
            Alert.alert("Couldn't confirm the payment", errorMessage(e));
          } finally {
            setConfirming(false);
          }
        },
      },
    ]);
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[ui.screen, styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.center}>
        <View style={styles.circleWrap}>
          <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
          <View style={styles.circle}>
            <Ionicons name="time-outline" size={36} color={colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>Waiting for customer to pay</Text>
        <Text style={styles.amount}>{formatRs(bill.totalRs)}</Text>
        <View style={styles.methodPill}>
          <Ionicons
            name={request.paymentMethod === 'card' ? 'card-outline' : 'wallet-outline'}
            size={14}
            color={colors.textSecondary}
          />
          <Text style={styles.methodText}>{request.paymentMethod === 'card' ? 'Card on file' : 'Cash'}</Text>
        </View>

        <Text style={styles.hint}>
          {request.paymentMethod === 'card'
            ? "We'll update this screen automatically once the payment goes through."
            : 'Collect the cash from the customer, then confirm below.'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <OutlineButton label="Mark as cash received" onPress={handleCash} loading={confirming} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  circleWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  spinner: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: colors.secondary,
    borderTopColor: colors.primary,
  },
  circle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  amount: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, marginTop: 10 },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  methodText: { fontSize: 13, color: colors.textSecondary },
  hint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});
