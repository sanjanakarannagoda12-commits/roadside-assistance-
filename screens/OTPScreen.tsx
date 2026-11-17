// screens/OTPScreen.tsx
// Verifies the code, then routes by account status returned from the backend:
// new → onboarding, pending/rejected → Under review, approved → Home.
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputInstance,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import {
  OTP_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  formatSriLankanMobile,
  routeForMe,
  sendOtp,
  verifyOtp,
} from '../services/authApi';
import { ApiError, errorMessage } from '../services/apiClient';

const emptyDigits = () => Array<string>(OTP_LENGTH).fill('');

export default function OTPScreen({ route, navigation }: any) {
  const phone: string = route.params?.phone ?? '';
  const { setMe } = useAppContext();
  const [digits, setDigits] = useState(emptyDigits);
  const [secondsLeft, setSecondsLeft] = useState<number>(route.params?.resendIn ?? RESEND_COOLDOWN_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef<Array<TextInputInstance | null>>([]);

  useEffect(() => {
    if (secondsLeft === 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const code = digits.join('');

  const verify = async (fullCode: string) => {
    if (fullCode.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    setError('');
    try {
      // Tokens are saved to secure storage inside verifyOtp, so the user stays logged in.
      const { me } = await verifyOtp(phone, fullCode);
      setMe(me);
      // Replace the whole stack so Back can't return to the login/OTP screens.
      navigation.reset({ index: 0, routes: [{ name: routeForMe(me) }] });
    } catch (e) {
      setError(errorMessage(e));
      setDigits(emptyDigits());
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleChange = (text: string, index: number) => {
    const clean = text.replace(/[^0-9]/g, '');
    if (error) setError('');

    // Pasted or auto-filled full code (iOS/Android SMS autofill lands in the first box)
    if (clean.length > 1) {
      const filled = clean.slice(0, OTP_LENGTH).split('');
      const next = emptyDigits().map((_, i) => filled[i] ?? '');
      setDigits(next);
      inputs.current[Math.min(filled.length, OTP_LENGTH - 1)]?.focus();
      if (filled.length === OTP_LENGTH) verify(filled.join(''));
      return;
    }

    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.every((d) => d !== '')) verify(next.join(''));
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      const { resendInSeconds } = await sendOtp(`+94${phone}`);
      setDigits(emptyDigits());
      setSecondsLeft(resendInSeconds);
      inputs.current[0]?.focus();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'resend_too_soon') {
        setSecondsLeft(Number(e.data.retryAfterSeconds) || RESEND_COOLDOWN_SECONDS);
      }
      setError(errorMessage(e));
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={navigation.goBack} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      <Text style={styles.heading}>Verify your number</Text>
      <Text style={styles.subtitle}>
        Enter the {OTP_LENGTH}-digit code sent to{'\n'}
        <Text style={styles.phone}>+94 {formatSriLankanMobile(phone)}</Text>
      </Text>
      <TouchableOpacity onPress={navigation.goBack}>
        <Text style={styles.changeNumber}>Wrong number? Change it</Text>
      </TouchableOpacity>

      <View style={styles.otpRow}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => {
              inputs.current[i] = r;
            }}
            style={[styles.otpBox, d ? styles.otpBoxFilled : null, error ? styles.otpBoxError : null]}
            maxLength={i === 0 ? OTP_LENGTH : 1}
            keyboardType="number-pad"
            textContentType={i === 0 ? 'oneTimeCode' : 'none'}
            autoComplete={i === 0 ? 'sms-otp' : 'off'}
            value={d}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            autoFocus={i === 0}
            editable={!verifying}
          />
        ))}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.verifyButton, (code.length !== OTP_LENGTH || verifying) && styles.buttonDisabled]}
        onPress={() => verify(code)}
        disabled={code.length !== OTP_LENGTH || verifying}
        activeOpacity={0.85}
      >
        {verifying ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.verifyButtonText}>Verify</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleResend} disabled={secondsLeft > 0 || resending}>
        <Text style={[styles.resend, secondsLeft === 0 && styles.resendActive]}>
          {resending
            ? 'Sending…'
            : secondsLeft > 0
              ? `Resend code in 0:${secondsLeft.toString().padStart(2, '0')}`
              : 'Resend code'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  back: { position: 'absolute', top: 60, left: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  phone: { color: colors.textPrimary, fontWeight: '600' },
  changeNumber: { fontSize: 13, color: colors.primary, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  otpBox: {
    width: 46, height: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    textAlign: 'center', fontSize: 20, fontWeight: '600', color: colors.textPrimary,
  },
  otpBoxFilled: { borderColor: colors.primary, backgroundColor: colors.secondary },
  otpBoxError: { borderColor: colors.danger, backgroundColor: colors.bgDanger },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center', marginBottom: 4 },
  verifyButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 16, marginBottom: 16, minHeight: 54, justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  verifyButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  resend: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
  resendActive: { color: colors.primary, fontWeight: '600' },
});
