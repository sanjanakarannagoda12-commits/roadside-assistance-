// screens/BasicDetailsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function BasicDetailsScreen({ navigation }: any) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [serviceArea, setServiceArea] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Basic details</Text>

      <TouchableOpacity style={styles.photoCircle} activeOpacity={0.8}>
        <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <Text style={styles.label}>Full name</Text>
      <TextInput
        style={styles.input}
        placeholder="Kasun Ranasinghe"
        placeholderTextColor={colors.textSecondary}
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Email (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="you@email.com"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      {/* Simple text field for now — swap for a real picker once we add a picker dependency */}
      <Text style={styles.label}>Service area</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Kandy"
        placeholderTextColor={colors.textSecondary}
        value={serviceArea}
        onChangeText={setServiceArea}
      />

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => navigation.navigate('VerifyDocuments')}
        activeOpacity={0.85}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 60 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  photoCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20,
  },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, fontSize: 14, color: colors.textPrimary,
  },
  continueButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 12,
  },
  continueButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
});