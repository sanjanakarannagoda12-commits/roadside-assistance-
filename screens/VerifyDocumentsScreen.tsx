// screens/VerifyDocumentsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../theme/colors';

const REQUIRED_DOCS = [
  { key: 'nic', label: 'NIC', icon: 'card-outline' },
  { key: 'license', label: 'Driving license', icon: 'document-text-outline' },
  { key: 'certificate', label: 'Trade certificate', icon: 'ribbon-outline' },
  { key: 'toolkit', label: 'Toolkit photo', icon: 'construct-outline' },
] as const;

export default function VerifyDocumentsScreen({ navigation }: any) {
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});

  const pickDocument = async (key: string) => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.assets && result.assets.length > 0) {
      setUploaded((prev) => ({ ...prev, [key]: true }));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Verification documents</Text>

      {REQUIRED_DOCS.map((doc) => (
        <TouchableOpacity
          key={doc.key}
          style={styles.docRow}
          onPress={() => pickDocument(doc.key)}
          activeOpacity={0.8}
        >
          <Ionicons name={doc.icon as any} size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={styles.docLabel}>{doc.label}</Text>
          <View style={[styles.statusChip, uploaded[doc.key] ? styles.statusUploaded : styles.statusPending]}>
            <Text style={[styles.statusText, { color: uploaded[doc.key] ? colors.success : colors.warning }]}>
              {uploaded[doc.key] ? 'Uploaded' : 'Pending'}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => navigation.navigate('SpecialtiesPricing')}
        activeOpacity={0.85}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, paddingBottom: 40, backgroundColor: colors.background },
  heading: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  docRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 10, padding: 12, marginBottom: 10,
  },
  docLabel: { flex: 1, fontSize: 13, color: colors.textPrimary },
  statusChip: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusUploaded: { backgroundColor: colors.bgSuccess },
  statusPending: { backgroundColor: colors.bgWarning },
  statusText: { fontSize: 10, fontWeight: '600' },
  continueButton: {
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginTop: 20,
  },
  continueButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
});