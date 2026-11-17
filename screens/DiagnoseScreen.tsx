// screens/DiagnoseScreen.tsx
// Step 1 on site: take a "before" photo (uploaded straight away, required), confirm the issue,
// add a note, start the job. The photo protects the mechanic if the customer later claims damage.
import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots, ui } from '../components/ui';
import { useJob } from '../context/JobContext';
import { IssueCategory, startJob, uploadJobPhoto } from '../services/mechanicApi';
import { errorMessage } from '../services/apiClient';
import { MAX_NOTE_LENGTH } from '../utils/validation';

const ISSUES: { key: IssueCategory; label: string; icon: any }[] = [
  { key: 'tyre', label: 'Tyre puncture', icon: 'ellipse-outline' },
  { key: 'battery', label: 'Battery', icon: 'battery-dead-outline' },
  { key: 'engine', label: 'Engine', icon: 'cog-outline' },
  { key: 'lockout', label: 'Locked out', icon: 'key-outline' },
  { key: 'other', label: 'Other', icon: 'help-circle-outline' },
];

export default function DiagnoseScreen({ navigation }: any) {
  const { request, beforePhotoUri, setBeforePhotoUri, issue, setIssue, note, setNote } = useJob();
  const [starting, setStarting] = useState(false);
  // Resumed job whose before photo is already on the server → no need to take it again.
  const [photoState, setPhotoState] = useState<'none' | 'uploading' | 'saved' | 'failed'>(
    request?.photos?.before ? 'saved' : 'none',
  );
  const [photoError, setPhotoError] = useState('');
  const [pendingMime, setPendingMime] = useState<string>('image/jpeg');

  if (!request) return null;

  const upload = async (uri: string, mime: string) => {
    setPhotoState('uploading');
    setPhotoError('');
    try {
      await uploadJobPhoto(request.id, 'before', uri, mime);
      setPhotoState('saved');
    } catch (e) {
      setPhotoState('failed');
      setPhotoError(errorMessage(e));
    }
  };

  const takePhoto = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take a before photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    const a = result.assets?.[0];
    if (result.canceled || !a) return;
    const mime = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    setBeforePhotoUri(a.uri);
    setPendingMime(mime);
    await upload(a.uri, mime);
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await startJob(request.id, { issue, note, beforePhotoUri });
      navigation.navigate('SelectServices');
    } catch (e) {
      Alert.alert("Couldn't start the job", errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={`Job with ${request.customerName}`} subtitle={request.vehicle} />

      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <StepDots step={1} total={4} />

        {/* Before photo */}
        {beforePhotoUri ? (
          <View>
            <Image source={{ uri: beforePhotoUri }} style={styles.photo} />
            <View style={styles.photoStatus}>
              {photoState === 'uploading' ? (
                <>
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                  <Text style={styles.retakeText}>Saving…</Text>
                </>
              ) : photoState === 'saved' ? (
                <>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.retakeText}>Saved</Text>
                </>
              ) : photoState === 'failed' ? (
                <TouchableOpacity style={{ flexDirection: 'row', gap: 6 }} onPress={() => upload(beforePhotoUri, pendingMime)}>
                  <Ionicons name="refresh" size={16} color={colors.textOnDark} />
                  <Text style={styles.retakeText}>Retry upload</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={styles.retake} onPress={takePhoto} activeOpacity={0.85}>
              <Ionicons name="camera-reverse-outline" size={16} color={colors.textOnDark} />
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>
          </View>
        ) : photoState === 'saved' ? (
          <TouchableOpacity style={styles.photoPlaceholder} onPress={takePhoto} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={styles.photoTitle}>Before photo already saved</Text>
            <Text style={styles.photoHint}>Tap to retake</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.photoPlaceholder} onPress={takePhoto} activeOpacity={0.8}>
            <View style={styles.cameraChip}>
              <Ionicons name="camera-outline" size={26} color={colors.primary} />
            </View>
            <Text style={styles.photoTitle}>Take before photo</Text>
            <Text style={styles.photoHint}>Required · protects you if there's a dispute later</Text>
          </TouchableOpacity>
        )}
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}

        {/* Issue */}
        <Text style={[ui.label, { marginTop: 24 }]}>What's the issue?</Text>
        <View style={styles.chipRow}>
          {ISSUES.map((item) => {
            const selected = issue === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                onPress={() => setIssue(item.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={item.icon}
                  size={15}
                  color={selected ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.chipText, selected && { color: colors.primary, fontWeight: '600' }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Note */}
        <Text style={[ui.label, { marginTop: 20 }]}>Note</Text>
        <TextInput
          style={[ui.input, styles.noteInput]}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textSecondary}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={MAX_NOTE_LENGTH}
          textAlignVertical="top"
        />
        <Text style={styles.counter}>
          {note.length}/{MAX_NOTE_LENGTH}
        </Text>
      </ScrollView>

      <BottomBar>
        <PrimaryButton
          label={photoState === 'saved' ? 'Start job' : 'Take the before photo to start'}
          onPress={handleStart}
          loading={starting}
          disabled={!issue || photoState !== 'saved'}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photoPlaceholder: {
    height: 220,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraChip: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  photoHint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  photo: { height: 220, borderRadius: 16, backgroundColor: colors.surface },
  retake: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  retakeText: { color: colors.textOnDark, fontSize: 13, fontWeight: '600' },
  photoStatus: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  photoError: { color: colors.danger, fontSize: 12, marginTop: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.primary },
  chipUnselected: { borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 14, color: colors.textPrimary },

  noteInput: { minHeight: 96 },
  counter: { fontSize: 11, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },
});
