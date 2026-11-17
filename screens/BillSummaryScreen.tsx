// screens/BillSummaryScreen.tsx
// Step 4 on site: review the itemised bill, Ridzo commission and payout, then send it.
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { formatRs, markBillSent, sendBill } from '../services/mechanicApi';
import { errorMessage } from '../services/apiClient';

export default function BillSummaryScreen({ navigation }: any) {
  const { request, bill, services, parts, discountRs, setServerBill } = useJob();
  const [sending, setSending] = useState(false);

  if (!request) return null;

  const handleSend = async () => {
    setSending(true);
    try {
      const serverBill = await sendBill(request.id, {
        serviceKeys: services.map((s) => s.id),
        parts: parts.map((p) => ({ name: p.name, priceRs: p.priceRs })),
        discountRs,
      });
      setServerBill(serverBill); // the server's numbers are the ones the customer pays
      markBillSent(request.id);
      navigation.replace('AwaitingPayment');
    } catch (e) {
      Alert.alert("Couldn't send the bill", errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Bill summary" subtitle={`For ${request.customerName}`} onBack={navigation.goBack} />

      <ScrollView contentContainerStyle={ui.content}>
        <StepDots step={4} total={4} />

        <View style={ui.card}>
          {[...bill.services, ...bill.parts].map((l, i) => (
            <Row key={`${l.label}_${i}`} label={l.label} value={formatRs(l.amountRs)} />
          ))}
          {bill.travelRs > 0 && (
            <Row label={`Travel charge (${request.distanceKm} km)`} value={formatRs(bill.travelRs)} icon="lock-closed" />
          )}
          {bill.discountRs > 0 && (
            <Row label="Discount" value={`−${formatRs(bill.discountRs)}`} color={colors.successDark} />
          )}

          <View style={ui.divider} />
          <Row label="Total to customer" value={formatRs(bill.totalRs)} bold />
        </View>

        <View style={[ui.card, { marginTop: 12 }]}>
          <Row
            label={`Ridzo commission (${Math.round(bill.commissionRate * 100)}% of services & parts)`}
            value={`−${formatRs(bill.commissionRs)}`}
            color={colors.textSecondary}
          />
          <Row label="Your payout" value={formatRs(bill.payoutRs)} color={colors.successDark} bold />
        </View>

        <View style={styles.note}>
          <Ionicons
            name={request.paymentMethod === 'card' ? 'card-outline' : 'wallet-outline'}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.noteText}>
            {request.paymentMethod === 'card'
              ? 'The customer will pay with their card on file in the Ridzo app.'
              : 'The customer will pay you in cash. Confirm once you receive it.'}
          </Text>
        </View>
      </ScrollView>

      <BottomBar>
        <PrimaryButton label="Send bill to customer" onPress={handleSend} loading={sending} />
      </BottomBar>
    </View>
  );
}

function Row({
  label,
  value,
  color,
  bold,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
  icon?: 'lock-closed';
}) {
  const textStyle = [styles.rowText, bold && styles.rowBold, color ? { color } : null];
  return (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={12} color={colors.textSecondary} style={{ marginRight: 6, alignSelf: 'center' }} /> : null}
      <Text style={[textStyle, { flex: 1 }]}>{label}</Text>
      <Text style={textStyle}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowText: { fontSize: 15, color: colors.textPrimary },
  rowBold: { fontWeight: '700', fontSize: 16 },
  note: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
