// screens/OTPScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function OTPScreen({ route, navigation }: any) {
  const { phone, isNewUser } = route.params || {};
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (secondsLeft === 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const handleChange = (text: string, index: number) => {
    const next = [...digits];
    next[index] = text.slice(-1);
    setDigits(next);
    if (text && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleVerify = () => {
    navigation.navigate(isNewUser ? 'BasicDetails' : 'HomeMechanic');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Verify your number</Text>
      <Text style={styles.subtitle}>Code sent to +94 {phone || '77 123 4567'}</Text>

      <View style={styles.otpRow}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => { inputs.current[i] = r; }}
            style={styles.otpBox}
            maxLength={1}
            keyboardType="number-pad"
            value={d}
            onChangeText={(t) => handleChange(t, i)}
          />
        ))}
      </View>

      <TouchableOpacity style={styles.verifyButton} onPress={handleVerify} activeOpacity={0.85}>
        <Text style={styles.verifyButtonText}>Verify</Text>
      </TouchableOpacity>

      <Text style={styles.resend}>
        {secondsLeft > 0 ? `Resend code in 0:${secondsLeft.toString().padStart(2, '0')}` : 'Resend code'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 },
  otpBox: {
    width: 44, height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    textAlign: 'center', fontSize: 18, color: colors.textPrimary,
  },
  verifyButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginBottom: 16,
  },
  verifyButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  resend: { textAlign: 'center', color: colors.textSecondary, fontSize: 12 },
});