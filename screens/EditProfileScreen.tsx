// screens/EditProfileScreen.tsx
// Profile photo, email and service area. The name is locked once Ridzo has checked the NIC
// (it must keep matching the NIC — the server enforces this too).
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { FormField, SelectField } from '../components/FormField';
import { BottomBar, PrimaryButton, ScreenHeader } from '../components/ui';
import ProfileAvatar from '../components/ProfileAvatar';
import { getCatalog, saveProfile, uploadAvatar } from '../services/authApi';
import { errorMessage, fieldErrors } from '../services/apiClient';
import { cleanName, validateFullName, validateOptionalEmail, validateRequiredChoice } from '../utils/validation';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function EditProfileScreen({ navigation }: any) {
  const { me, setMe, bumpAvatar } = useAppContext();
  const nameLocked = me ? !['onboarding', 'rejected'].includes(me.user.status) : false;
  const [fullName, setFullName] = useState(me?.user.fullName ?? '');
  const [email, setEmail] = useState(me?.user.email ?? '');
  const [serviceArea, setServiceArea] = useState(me?.user.serviceArea ?? '');
  const [areas, setAreas] = useState<string[]>(me?.user.serviceArea ? [me.user.serviceArea] : []);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getCatalog()
      .then((c) => setAreas(c.serviceAreas))
      .catch(() => {});
  }, []);

  const errors = {
    fullName: (nameLocked ? null : validateFullName(fullName)) ?? serverErrors.fullName ?? null,
    email: validateOptionalEmail(email) ?? serverErrors.email ?? null,
    serviceArea: validateRequiredChoice('service area')(serviceArea) ?? serverErrors.serviceArea ?? null,
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow access to your photos to choose a profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    const a = res.assets?.[0];
    if (res.canceled || !a) return;
    const mimeType = a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    if (a.mimeType && a.mimeType !== 'image/png' && a.mimeType !== 'image/jpeg') {
      setMessage({ ok: false, text: 'Choose a JPG or PNG photo.' });
      return;
    }
    if (a.fileSize && a.fileSize > MAX_AVATAR_BYTES) {
      setMessage({ ok: false, text: 'That photo is too large (max 2 MB).' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      await uploadAvatar({ uri: a.uri, name: a.fileName ?? `avatar.${mimeType === 'image/png' ? 'png' : 'jpg'}`, mimeType });
      bumpAvatar();
      setMessage({ ok: true, text: 'Profile photo updated.' });
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSubmitted(true);
    setMessage(null);
    if (errors.fullName || errors.email || errors.serviceArea) return;
    setSaving(true);
    try {
      const updated = await saveProfile({
        fullName: nameLocked ? me!.user.fullName! : cleanName(fullName),
        email: email.trim(),
        serviceArea,
      });
      setMe(updated);
      setServerErrors({});
      setMessage({ ok: true, text: 'Saved.' });
    } catch (e) {
      const fe = fieldErrors(e);
      setServerErrors(fe);
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Edit profile" subtitle="What customers see about you" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.avatarWrap} onPress={pickPhoto} disabled={uploading} activeOpacity={0.8}>
          <ProfileAvatar style={styles.avatar} />
          <View style={styles.cameraBadge}>
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to change your photo · JPG or PNG, max 2 MB</Text>

        <FormField
          label="Full name"
          value={fullName}
          onChangeText={(t) => {
            setFullName(t);
            setServerErrors(({ fullName: _, ...r }) => r);
          }}
          editable={!nameLocked}
          error={show('fullName')}
          hint={nameLocked ? 'Must match your NIC. Contact Ridzo support to change it.' : undefined}
          maxLength={60}
          autoCapitalize="words"
        />
        <FormField
          label="Email"
          optional
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setServerErrors(({ email: _, ...r }) => r);
          }}
          error={show('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          maxLength={120}
        />
        <SelectField
          label="Service area"
          value={serviceArea}
          options={areas}
          onChange={setServiceArea}
          placeholder="Choose your district"
          error={show('serviceArea')}
        />
        <Text style={styles.phone}>Phone: {me?.user.phone} (used to log in, can't be changed)</Text>

        {message ? (
          <Text style={[styles.message, { color: message.ok ? colors.successDark : colors.danger }]}>{message.text}</Text>
        ) : null}
      </ScrollView>
      <BottomBar>
        <PrimaryButton label="Save changes" onPress={save} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  avatarWrap: { alignSelf: 'center', marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.secondary },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  message: { fontSize: 13, marginTop: 16, textAlign: 'center' },
});
