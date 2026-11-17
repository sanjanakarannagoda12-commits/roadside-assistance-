// screens/VerifyDocumentsScreen.tsx
// Onboarding step 2 of 3: upload the 4 verification documents. Each one uploads
// as soon as it's picked; Continue unlocks when all 4 are on the server.
// After a review, each document shows Ridzo's decision — a rejected one shows the reason
// (e.g. "NIC: Rejected — Photo is blurry") and must be re-uploaded before resubmitting.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots } from '../components/ui';
import { DocState, DocType, uploadDocument } from '../services/authApi';
import { errorMessage } from '../services/apiClient';
import { ALLOWED_DOC_MIME, validateDocument } from '../utils/validation';

const REQUIRED_DOCS: { key: DocType; label: string; hint: string; icon: any }[] = [
  { key: 'nic', label: 'NIC', hint: 'Front side, all 4 corners visible', icon: 'card-outline' },
  { key: 'license', label: 'Driving licence', hint: 'Must be valid (not expired)', icon: 'document-text-outline' },
  { key: 'certificate', label: 'Trade certificate', hint: 'NVQ or any mechanic qualification', icon: 'ribbon-outline' },
  { key: 'toolkit', label: 'Toolkit photo', hint: 'A clear photo of the tools you carry', icon: 'construct-outline' },
];

type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number | null };

/** Chip text + colours for a document's current state. */
function chipFor(state: DocState | null) {
  if (!state) return { text: 'Upload', fg: colors.warning, bg: colors.bgWarning };
  switch (state.status) {
    case 'approved':
      return { text: 'Approved', fg: colors.successDark, bg: '#FFFFFF' };
    case 'rejected':
      return { text: 'Rejected · Re-upload', fg: colors.danger, bg: '#FFFFFF' };
    default:
      return { text: 'Uploaded · Replace', fg: colors.successDark, bg: '#FFFFFF' };
  }
}

export default function VerifyDocumentsScreen({ navigation }: any) {
  const { me, setMe } = useAppContext();
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [errors, setErrors] = useState<Partial<Record<DocType, string>>>({});
  const [showMissing, setShowMissing] = useState(false);

  const docs = me?.onboarding.documents ?? { nic: null, license: null, certificate: null, toolkit: null };
  const toFix = me?.onboarding.documentsToFix ?? REQUIRED_DOCS.map((d) => d.key);
  const rejectedCount = REQUIRED_DOCS.filter((d) => docs[d.key]?.status === 'rejected').length;
  const allUploaded = toFix.length === 0;

  const upload = async (doc: DocType, file: PickedFile) => {
    const invalid = validateDocument(file);
    if (invalid) {
      setErrors((e) => ({ ...e, [doc]: invalid }));
      return;
    }
    setErrors((e) => ({ ...e, [doc]: undefined }));
    setUploading(doc);
    try {
      const updated = await uploadDocument(doc, { uri: file.uri, name: file.name, mimeType: file.mimeType! });
      setMe(updated);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [doc]: errorMessage(e) }));
    } finally {
      setUploading(null);
    }
  };

  const fromCamera = async (doc: DocType) => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings, or choose a file instead.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const a = res.assets?.[0];
    if (!res.canceled && a) {
      await upload(doc, { uri: a.uri, name: a.fileName ?? `${doc}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize });
    }
  };

  const fromFiles = async (doc: DocType) => {
    const res = await DocumentPicker.getDocumentAsync({ type: ALLOWED_DOC_MIME, copyToCacheDirectory: true });
    const a = res.assets?.[0];
    if (!res.canceled && a) await upload(doc, { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
  };

  const choose = (doc: DocType, label: string) => {
    Alert.alert(`Upload ${label}`, 'JPG, PNG, HEIC or PDF · max 5 MB', [
      { text: 'Take photo', onPress: () => fromCamera(doc) },
      { text: 'Choose file', onPress: () => fromFiles(doc) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Verification documents" subtitle="We check these to keep customers safe" onBack={navigation.canGoBack() ? navigation.goBack : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        <StepDots step={2} total={3} />

        {rejectedCount > 0 ? (
          <View style={styles.rejectBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.rejectText}>
              Ridzo couldn't verify {rejectedCount === 1 ? '1 document' : `${rejectedCount} documents`}. Re-upload the
              ones marked in red, then resubmit.
            </Text>
          </View>
        ) : null}

        {REQUIRED_DOCS.map((doc) => {
          const state = docs[doc.key];
          const rejected = state?.status === 'rejected';
          const done = Boolean(state) && !rejected;
          const busy = uploading === doc.key;
          const chip = chipFor(state);
          const error = errors[doc.key] ?? (showMissing && toFix.includes(doc.key) && !rejected ? 'Required' : undefined);
          return (
            <View key={doc.key} style={{ marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.docRow, done && styles.docRowDone, rejected || error ? styles.docRowError : null]}
                onPress={() => choose(doc.key, doc.label)}
                disabled={uploading !== null}
                activeOpacity={0.8}
              >
                <View style={styles.docIcon}>
                  <Ionicons name={doc.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docHint}>{doc.hint}</Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
                    {state?.status === 'approved' && <Ionicons name="checkmark-circle" size={12} color={chip.fg} />}
                    <Text style={[styles.statusText, { color: chip.fg }]}>{chip.text}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {rejected && !error ? (
                <Text style={styles.errorText}>
                  {doc.label}: Rejected — {state?.reason ?? 'Please upload a clearer copy.'}
                </Text>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      <BottomBar>
        <PrimaryButton
          label={
            allUploaded
              ? 'Continue'
              : rejectedCount > 0
                ? `Re-upload ${toFix.length === 1 ? '1 document' : `${toFix.length} documents`}`
                : `Upload all 4 documents (${4 - toFix.length}/4)`
          }
          onPress={() => (allUploaded ? navigation.navigate('SpecialtiesPricing') : setShowMissing(true))}
          disabled={uploading !== null}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  rejectBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.bgDanger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  rejectText: { flex: 1, color: colors.danger, fontSize: 13 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  docRowDone: { backgroundColor: colors.bgSuccess },
  docRowError: { borderColor: colors.danger },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  docLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  docHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 4, marginLeft: 4 },
});
