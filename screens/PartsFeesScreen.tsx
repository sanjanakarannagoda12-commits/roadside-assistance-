// screens/PartsFeesScreen.tsx
// Step 3 on site: add parts used / extra fees and an optional discount.
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { formatRs } from '../services/mechanicApi';
import { MAX_SERVICE_PRICE_RS, validatePartName } from '../utils/validation';

const toNumber = (s: string) => {
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

export default function PartsFeesScreen({ navigation }: any) {
  const { services, parts, addPart, removePart, discountRs, setDiscountRs, bill } = useJob();
  const [adding, setAdding] = useState(false);
  const [partName, setPartName] = useState('');
  const [partPrice, setPartPrice] = useState('');
  const [discountText, setDiscountText] = useState(discountRs ? String(discountRs) : '');

  const [partTouched, setPartTouched] = useState(false);
  const partNameError = validatePartName(partName);
  const partPriceError =
    toNumber(partPrice) <= 0
      ? 'Enter a price'
      : toNumber(partPrice) > MAX_SERVICE_PRICE_RS
        ? `Maximum is Rs ${MAX_SERVICE_PRICE_RS.toLocaleString('en-US')}`
        : null;
  const canAdd = !partNameError && !partPriceError;
  const discountTooHigh = toNumber(discountText) > bill.subtotalRs;

  const savePart = () => {
    setPartTouched(true);
    if (!canAdd) return;
    addPart(partName.trim(), toNumber(partPrice));
    setPartName('');
    setPartPrice('');
    setPartTouched(false);
    setAdding(false);
  };

  const onDiscountChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setDiscountText(digits);
    setDiscountRs(toNumber(digits));
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Parts & extra fees" subtitle="Anything on top of your service price" onBack={navigation.goBack} />

      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <StepDots step={3} total={4} />

        {/* Services summary (read-only) */}
        <Text style={ui.label}>Services</Text>
        <View style={[ui.card, { marginBottom: 20 }]}>
          {services.map((s, i) => (
            <View key={s.id} style={[styles.line, i > 0 && { marginTop: 8 }]}>
              <Text style={styles.lineLabel}>{s.name}</Text>
              <Text style={styles.lineValue}>{formatRs(s.priceRs)}</Text>
            </View>
          ))}
        </View>

        {/* Parts */}
        <Text style={ui.label}>Parts & fees</Text>
        {parts.map((p) => (
          <View key={p.id} style={styles.partRow}>
            <Text style={[styles.lineLabel, { flex: 1 }]}>{p.name}</Text>
            <Text style={styles.lineValue}>{formatRs(p.priceRs)}</Text>
            <TouchableOpacity onPress={() => removePart(p.id)} hitSlop={10} style={{ marginLeft: 12 }}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}

        {adding ? (
          <View style={styles.addForm}>
            <TextInput
              style={[ui.input, { flex: 1 }]}
              placeholder="e.g. New tube"
              placeholderTextColor={colors.textSecondary}
              value={partName}
              onChangeText={setPartName}
              maxLength={40}
              autoFocus
            />
            <TextInput
              style={[ui.input, { width: 110, textAlign: 'right' }]}
              placeholder="Rs"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={partPrice}
              onChangeText={(t) => setPartPrice(t.replace(/[^0-9]/g, ''))}
              maxLength={6}
              onSubmitEditing={savePart}
            />
            {partTouched && (partNameError || partPriceError) ? (
              <Text style={[styles.errorText, { width: '100%' }]}>{partNameError ?? partPriceError}</Text>
            ) : null}
            <View style={styles.addFormActions}>
              <TouchableOpacity onPress={() => setAdding(false)} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={savePart}
                style={[styles.smallButton, styles.smallButtonPrimary]}
              >
                <Text style={[styles.smallButtonText, { color: colors.textOnDark }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addButton} onPress={() => setAdding(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.addButtonText}>Add part or fee</Text>
          </TouchableOpacity>
        )}

        {/* Discount */}
        <Text style={[ui.label, { marginTop: 24 }]}>Discount</Text>
        <TextInput
          style={[ui.input, discountTooHigh && { borderColor: colors.danger }]}
          placeholder="Rs 0"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          value={discountText}
          onChangeText={onDiscountChange}
        />
        {discountTooHigh && (
          <Text style={styles.errorText}>Discount can't be more than the subtotal.</Text>
        )}
      </ScrollView>

      <BottomBar>
        <View style={styles.line}>
          <Text style={styles.footerLabel}>Subtotal</Text>
          <Text style={styles.footerValue}>{formatRs(bill.subtotalRs)}</Text>
        </View>
        {bill.discountRs > 0 && (
          <View style={styles.line}>
            <Text style={[styles.footerLabel, { color: colors.successDark }]}>Discount</Text>
            <Text style={[styles.footerValue, { color: colors.successDark }]}>−{formatRs(bill.discountRs)}</Text>
          </View>
        )}
        <PrimaryButton
          label={`Review bill · ${formatRs(bill.totalRs)}`}
          onPress={() => navigation.navigate('BillSummary')}
          disabled={discountTooHigh || adding}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineLabel: { fontSize: 15, color: colors.textPrimary },
  lineValue: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  addButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  addForm: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  addFormActions: { flexDirection: 'row', gap: 8, width: '100%', justifyContent: 'flex-end' },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallButtonText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 6 },
  footerLabel: { fontSize: 15, color: colors.textSecondary },
  footerValue: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
});
