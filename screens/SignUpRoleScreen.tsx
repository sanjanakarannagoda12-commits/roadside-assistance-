// screens/SignUpRoleScreen.tsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';

export default function SignUpRoleScreen({ navigation }: any) {
  const { setRole } = useAppContext();

  const choose = (role: 'user' | 'provider') => {
    setRole(role);
    navigation.navigate('SignUp', { role });
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/mechanic-illustration.png')} // same illustration you already have from Login
        style={styles.illustration}
        resizeMode="contain"
      />

      <Text style={styles.heading}>Sign Up</Text>

      <TouchableOpacity style={styles.optionButton} onPress={() => choose('provider')} activeOpacity={0.85}>
        <Text style={styles.optionButtonText}>Service Provider</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.optionButton, styles.secondaryButton]}
        onPress={() => choose('user')}
        activeOpacity={0.85}
      >
        <Text style={styles.optionButtonText}>User</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 60 },
  illustration: { width: '100%', height: 180, marginBottom: 32 },
  heading: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 32 },
  optionButton: {
    backgroundColor: colors.dark, // was blue in the Figma, now dark charcoal
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: colors.primary, // orange for the second option, so they're visually distinct
  },
  optionButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
});