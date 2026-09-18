// screens/SignUpScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme/colors';

export default function SignUpScreen({ route, navigation }: any) {
  const { role } = route.params; // 'user' or 'provider'
  const isProvider = role === 'provider';

  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');

  const handleCreateAccount = () => {
    if (isProvider) {
      // Providers go straight into the document verification step
      navigation.navigate('VerifyDocuments');
    } else {
      navigation.navigate('Home');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image
        source={require('../assets/mechanic-illustration.png')}
        style={styles.illustration}
        resizeMode="contain"
      />

      <Text style={styles.heading}>Sign Up</Text>

      <TextInput
        style={styles.input}
        placeholder="Email & phone number"
        placeholderTextColor={colors.textSecondary}
        value={contact}
        onChangeText={setContact}
      />
      <TextInput
        style={styles.input}
        placeholder="Otp received"
        placeholderTextColor={colors.textSecondary}
        value={otp}
        onChangeText={setOtp}
        keyboardType="number-pad"
      />

      {isProvider && (
        <TextInput
          style={styles.input}
          placeholder="Company Name"
          placeholderTextColor={colors.textSecondary}
          value={companyName}
          onChangeText={setCompanyName}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.createButton} onPress={handleCreateAccount} activeOpacity={0.85}>
        <Text style={styles.createButtonText}>Create Account</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>Or Sign up With</Text>
        <View style={styles.divider} />
      </View>

      <TouchableOpacity style={styles.googleButton}>
        <Image source={require('../assets/google-icon.png')} style={{ width: 24, height: 24 }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, paddingBottom: 40, backgroundColor: colors.background },
  illustration: { width: '100%', height: 160, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    fontSize: 14,
    color: colors.textPrimary,
  },
  createButton: {
    backgroundColor: colors.primary, // orange, matches Login's primary button
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  createButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 10, color: colors.textSecondary, fontSize: 12 },
  googleButton: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});