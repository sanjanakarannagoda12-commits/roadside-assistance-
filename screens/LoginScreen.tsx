// screens/LoginScreen.tsx
// One entry point for both new and returning mechanics: enter your number, get a code.
// Whether this is a sign-up or a login is decided by the backend after OTP (see authApi.ts).
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { sendOtp } from '../services/authApi';
import { ApiError, errorMessage } from '../services/apiClient';
import { normaliseSriLankanMobile, validatePhone } from '../utils/validation';

export default function LoginScreen({ navigation }: any) {
  const { setRole } = useAppContext();
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const normalised = normaliseSriLankanMobile(phone);

  const handleContinue = async () => {
    const invalid = validatePhone(phone);
    if (invalid || !normalised) {
      setError(invalid ?? 'Enter a valid Sri Lankan mobile number');
      return;
    }
    setError('');
    setSending(true);
    try {
      const { resendInSeconds } = await sendOtp(`+94${normalised}`);
      setRole('provider'); // this whole app is the mechanic app
      navigation.navigate('OTP', { phone: normalised, resendIn: resendInSeconds });
    } catch (e) {
      // A code was already sent moments ago — just go and enter it.
      if (e instanceof ApiError && e.code === 'resend_too_soon') {
        navigation.navigate('OTP', { phone: normalised, resendIn: Number(e.data.retryAfterSeconds) || 30 });
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoRow}>
        <View style={styles.logoCircle}>
          <Ionicons name="construct-outline" size={24} color={colors.primary} />
        </View>
        <Text style={styles.logoText}>Ridzo mechanic</Text>
      </View>

      <Text style={styles.heading}>Enter your mobile number</Text>
      <Text style={styles.subtitle}>
        We'll text you a code to log in. New to Ridzo? We'll set up your account right after.
      </Text>

      <View style={styles.phoneRow}>
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>🇱🇰 +94</Text>
        </View>
        <TextInput
          style={[styles.input, error ? { borderColor: colors.danger } : null]}
          placeholder="77 123 4567"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={13}
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            if (error) setError('');
          }}
          onSubmitEditing={handleContinue}
          autoFocus
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.continueButton, (!normalised || sending) && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={sending}
        activeOpacity={0.85}
      >
        {sending ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.continueButtonText}>Continue</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.legal}>
        By continuing you agree to Ridzo's Terms of Service and Privacy Policy. Standard SMS rates may apply.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  logoRow: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  logoText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 20 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, justifyContent: 'center',
  },
  prefixText: { fontSize: 15, color: colors.textPrimary },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 8 },
  continueButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 20, marginBottom: 16, minHeight: 54, justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  continueButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  legal: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', lineHeight: 16 },
});
