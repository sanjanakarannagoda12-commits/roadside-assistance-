// screens/NavigateToCustomerScreen.tsx
// After accepting: route to the customer, call them, mark arrival or cancel.
// The map is a placeholder — "Open in Maps" starts Google Maps turn-by-turn navigation to the customer.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { openGoogleMapsNavigation } from '../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { Avatar, BottomBar, OutlineButton, PrimaryButton, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { cancelJob, markArrived } from '../services/mechanicApi';

export default function NavigateToCustomerScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { request, clearJob } = useJob();
  const [arriving, setArriving] = useState(false);

  if (!request) return null;

  const openMaps = () => {
    const { lat, lng } = request.location;
    openGoogleMapsNavigation(lat, lng).catch(() =>
      Alert.alert('Could not open Google Maps', 'Install Google Maps, or check that a browser is available.'),
    );
  };

  const callCustomer = () => {
    Linking.openURL(`tel:${request.customerPhone}`).catch(() => Alert.alert('Could not start a call'));
  };

  const handleArrived = async () => {
    setArriving(true);
    try {
      await markArrived(request.id);
      navigation.replace('Diagnose');
    } finally {
      setArriving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel this job?', 'The customer will be matched with another mechanic. Frequent cancellations can affect your rating.', [
      { text: 'Keep job', style: 'cancel' },
      {
        text: 'Cancel job',
        style: 'destructive',
        onPress: async () => {
          await cancelJob(request.id).catch(() => {});
          clearJob();
          navigation.reset({ index: 0, routes: [{ name: 'HomeMechanic' }] });
        },
      },
    ]);
  };

  return (
    <View style={ui.screen}>
      {/* Map placeholder */}
      <View style={[styles.map, { paddingTop: insets.top }]}>
        <Ionicons name="git-branch-outline" size={34} color={colors.primary} />
        <Text style={styles.mapEta}>ETA {request.etaMin} min</Text>
        <Text style={styles.mapDistance}>
          {request.distanceKm} km · {request.location.address}
        </Text>
        <TouchableOpacity style={styles.mapsButton} onPress={openMaps} activeOpacity={0.85}>
          <Ionicons name="navigate" size={16} color={colors.textOnDark} />
          <Text style={styles.mapsButtonText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sheetLabel}>Heading to</Text>
        <View style={styles.customerRow}>
          <Avatar name={request.customerName} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.customerName}>{request.customerName}</Text>
            <Text style={styles.customerMeta}>{request.vehicle}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={callCustomer} activeOpacity={0.8}>
            <Ionicons name="call" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Messages')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={[ui.card, styles.issueCard]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.issueText}>{request.issueSummary}</Text>
        </View>
      </View>

      <BottomBar>
        <PrimaryButton label="I've arrived" onPress={handleArrived} loading={arriving} />
        <OutlineButton label="Cancel job" onPress={handleCancel} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mapEta: { fontSize: 22, fontWeight: '700', color: colors.primary, marginTop: 10 },
  mapDistance: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dark,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    marginTop: 18,
  },
  mapsButtonText: { color: colors.textOnDark, fontWeight: '600', fontSize: 14 },

  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sheetLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  customerName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  customerMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  issueCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  issueText: { fontSize: 14, color: colors.textPrimary, flex: 1 },
});
