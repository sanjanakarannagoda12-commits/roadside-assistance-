// screens/ProfileScreen.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import BottomNav from '../components/BottomNav';
import { useAppContext } from '../context/AppContext';

export default function ProfileScreen({ navigation }: any) {
  const { role, isVerified } = useAppContext();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        {role === 'provider' && !isVerified && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('VerifyDocuments')}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            <Text style={styles.rowText}>Verify Garage</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.row}>
          <Ionicons name="person-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row}>
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>Logout</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <BottomNav active="Account" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 24, paddingTop: 60 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, marginLeft: 12, fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
});