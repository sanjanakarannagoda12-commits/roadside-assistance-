// screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';

export default function LoginScreen({ navigation }: any) {
  const { setRole } = useAppContext();
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleContinue = () => {
    setRole('provider'); // this whole flow is the mechanic app
    navigation.navigate('OTP', { phone, isNewUser: mode === 'signup' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <View style={styles.logoCircle}>
          <Ionicons name="construct-outline" size={24} color={colors.primary} />
        </View>
        <Text style={styles.logoText}>Ridzo mechanic</Text>
      </View>

      <Text style={styles.label}>Phone number</Text>
      <View style={styles.phoneRow}>
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>+94</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="77 123 4567"
          placeholderTextColor={colors.textSecondary}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.85}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        style={styles.footerLink}
      >
        <Text style={styles.footerText}>
          {mode === 'login' ? "New mechanic? " : 'Already have an account? '}
          <Text style={{ color: colors.primary, fontWeight: '700' }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  logoRow: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  logoText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  prefix: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, justifyContent: 'center',
  },
  prefixText: { fontSize: 14, color: colors.textPrimary },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: colors.textPrimary,
  },
  continueButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginBottom: 20,
  },
  continueButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  footerLink: { alignItems: 'center' },
  footerText: { fontSize: 13, color: colors.textSecondary },
});