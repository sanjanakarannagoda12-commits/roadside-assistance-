// screens/UnderReviewScreen.tsx
// Shown while an admin checks the mechanic's documents, after a rejection, or while suspended.
// "Check status" asks the server again, and moves on to Home once approved.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { PrimaryButton, OutlineButton } from '../components/ui';
import { getMe, logout, routeForMe } from '../services/authApi';
import { errorMessage } from '../services/apiClient';

export default function UnderReviewScreen({ navigation }: any) {
  const { me, setMe } = useAppContext();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const rejected = me?.user.status === 'rejected';
  const suspended = me?.user.status === 'suspended';
  const DOC_NAMES: Record<string, string> = { nic: 'NIC', license: 'Driving licence', certificate: 'Trade certificate', toolkit: 'Toolkit photo' };
  const rejectedDocs = Object.entries(me?.onboarding.documents ?? {}).filter(([, d]) => d?.status === 'rejected');

  const checkStatus = async () => {
    setChecking(true);
    setMessage('');
    try {
      const fresh = await getMe();
      setMe(fresh);
      const next = routeForMe(fresh);
      if (next === 'UnderReview') {
        setMessage(fresh.user.status === 'pending_review' ? 'Still under review. We will notify you by SMS.' : '');
      }
      else navigation.reset({ index: 0, routes: [{ name: next }] });
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setMe(null);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, (rejected || suspended) && { backgroundColor: colors.bgDanger }]}>
        <Ionicons
          name={suspended ? 'ban-outline' : rejected ? 'close-circle-outline' : 'time-outline'}
          size={28}
          color={rejected || suspended ? colors.danger : colors.warning}
        />
      </View>

      <Text style={styles.heading}>
        {suspended ? 'Account suspended' : rejected ? 'Some documents need fixing' : 'Under review'}
      </Text>
      <Text style={styles.subtitle}>
        {suspended
          ? `${me?.user.rejectionReason ? `${me.user.rejectionReason}. ` : ''}You can't go online right now. Contact Ridzo support for help.`
          : rejected
            ? 'Ridzo checked your documents. Re-upload the ones below and resubmit.'
            : "We're checking your documents. This usually takes 24–48 hours."}
      </Text>

      {rejected && rejectedDocs.length > 0 && (
        <View style={styles.fixList}>
          {rejectedDocs.map(([key, d]) => (
            <View key={key} style={styles.fixRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.fixText}>
                <Text style={{ fontWeight: '700' }}>{DOC_NAMES[key] ?? key}:</Text> {d?.reason ?? 'Please upload a clearer copy.'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!rejected && (
        <View style={styles.lockedRow}>
          <Text style={styles.lockedLabel}>Go online</Text>
          <View style={styles.lockedChip}>
            <Ionicons name="lock-closed" size={10} color={colors.textSecondary} />
            <Text style={styles.lockedText}>Locked</Text>
          </View>
        </View>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.actions}>
        {rejected ? (
          <PrimaryButton label="Fix and resubmit" onPress={() => navigation.navigate('VerifyDocuments')} />
        ) : suspended ? (
          <PrimaryButton label="Check again" onPress={checkStatus} loading={checking} />
        ) : (
          <PrimaryButton label="Check status" onPress={checkStatus} loading={checking} />
        )}
        <OutlineButton label="Log out" onPress={handleLogout} />
      </View>

      <TouchableOpacity onPress={checkStatus} style={{ marginTop: 16 }} disabled={checking}>
        <Text style={styles.phone}>Signed in as {me?.user.phone}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bgWarning,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heading: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 280, marginBottom: 24, lineHeight: 20 },
  lockedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, padding: 14, width: '100%',
  },
  lockedLabel: { fontSize: 14, color: colors.textPrimary },
  lockedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  lockedText: { fontSize: 11, color: colors.textSecondary },
  fixList: { alignSelf: 'stretch', backgroundColor: colors.bgDanger, borderRadius: 10, padding: 12, gap: 8 },
  fixRow: { flexDirection: 'row', gap: 8 },
  fixText: { flex: 1, fontSize: 13, color: colors.danger, lineHeight: 18 },
  message: { fontSize: 13, color: colors.textSecondary, marginTop: 16, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 28 },
  phone: { fontSize: 12, color: colors.textSecondary },
});
