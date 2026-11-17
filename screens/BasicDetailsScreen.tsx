// screens/BasicDetailsScreen.tsx
// Onboarding step 1 of 3: name, optional email, service area (district). Saved to the server.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInputInstance, StyleSheet, KeyboardAvoidingView, Platform, View } from 'react-native';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { FormField, SelectField } from '../components/FormField';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots } from '../components/ui';
import { getCatalog, saveProfile } from '../services/authApi';
import { errorMessage, fieldErrors } from '../services/apiClient';
import {
  cleanName,
  validateFullName,
  validateOptionalEmail,
  validateRequiredChoice,
} from '../utils/validation';

// Fallback if /catalog can't be loaded — same list as the server.
const DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
  'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle',
];

type Field = 'fullName' | 'email' | 'serviceArea';

export default function BasicDetailsScreen({ navigation }: any) {
  const { me, setMe } = useAppContext();
  const [fullName, setFullName] = useState(me?.user.fullName ?? '');
  const [email, setEmail] = useState(me?.user.email ?? '');
  const [serviceArea, setServiceArea] = useState(me?.user.serviceArea ?? '');
  const [areas, setAreas] = useState<string[]>(DISTRICTS);
  const [touched, setTouched] = useState<Record<Field, boolean>>({ fullName: false, email: false, serviceArea: false });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    getCatalog()
      .then((c) => setAreas(c.serviceAreas))
      .catch(() => {});
  }, []);

  const errors: Record<Field, string | null> = {
    fullName: validateFullName(fullName) ?? serverErrors.fullName ?? null,
    email: validateOptionalEmail(email) ?? serverErrors.email ?? null,
    serviceArea: validateRequiredChoice('service area')(serviceArea) ?? serverErrors.serviceArea ?? null,
  };
  const show = (f: Field) => (touched[f] ? errors[f] : null);
  const touch = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));
  const clearServerError = (f: Field) => setServerErrors(({ [f]: _, ...rest }) => rest);

  const handleContinue = async () => {
    setTouched({ fullName: true, email: true, serviceArea: true });
    setFormError('');
    if (errors.fullName || errors.email || errors.serviceArea) return;

    setSaving(true);
    try {
      const updated = await saveProfile({ fullName: cleanName(fullName), email: email.trim(), serviceArea });
      setMe(updated);
      navigation.navigate('VerifyDocuments');
    } catch (e) {
      const fe = fieldErrors(e);
      setServerErrors(fe);
      if (!Object.keys(fe).length) setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Basic details" subtitle="Tell customers who's coming to help" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StepDots step={1} total={3} />

        <FormField
          label="Full name"
          placeholder="e.g. Kasun Ranasinghe"
          value={fullName}
          onChangeText={(t) => {
            setFullName(t);
            clearServerError('fullName');
          }}
          onBlur={() => touch('fullName')}
          error={show('fullName')}
          hint="First and last name, as on your NIC"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={60}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />

        <FormField
          ref={emailRef}
          label="Email"
          optional
          placeholder="you@email.com"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clearServerError('email');
          }}
          onBlur={() => touch('email')}
          error={show('email')}
          hint="For receipts and payout statements"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={120}
        />

        <SelectField
          label="Service area"
          placeholder="Choose your district"
          value={serviceArea}
          options={areas}
          onChange={(v) => {
            setServiceArea(v);
            touch('serviceArea');
            clearServerError('serviceArea');
          }}
          error={show('serviceArea')}
          hint="You'll get job requests in and around this district"
        />

        {formError ? (
          <View style={styles.formError}>
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <BottomBar>
        <PrimaryButton label="Continue" onPress={handleContinue} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  formError: { backgroundColor: colors.bgDanger, borderRadius: 10, padding: 12, marginTop: 8 },
  formErrorText: { color: colors.danger, fontSize: 13 },
});
