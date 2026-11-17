// screens/SpecialtiesPricingScreen.tsx
// Onboarding step 3 of 3: pick specialties and tick the services you do, then submit for review.
// Prices are set by Ridzo (admin web app), so mechanics don't type any prices — they just see them.
// Also opened from Home → "My services & prices" (route param mode: 'edit') to change services later.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { BottomBar, PrimaryButton, ScreenHeader, StepDots } from '../components/ui';
import { Catalog, getCatalog, saveServices, submitForReview } from '../services/authApi';
import { errorMessage } from '../services/apiClient';

const formatRs = (n: number) => `Rs ${n.toLocaleString('en-US')}`;

export default function SpecialtiesPricingScreen({ navigation, route }: any) {
  const editMode = route?.params?.mode === 'edit';
  const { me, setMe } = useAppContext();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const load = () => {
    setLoadError('');
    getCatalog()
      .then((c) => {
        setCatalog(c);
        // Prefill from what the mechanic saved before (e.g. after a rejection, or in edit mode).
        const saved = me?.services ?? [];
        setCategories([...new Set(saved.map((s) => s.category))]);
        setEnabled(Object.fromEntries(saved.map((s) => [s.key, true])));
      })
      .catch((e) => setLoadError(errorMessage(e)));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const visibleServices = useMemo(
    () => (catalog?.services ?? []).filter((s) => categories.includes(s.category)),
    [catalog, categories],
  );
  const chosen = visibleServices.filter((s) => enabled[s.key]);

  const specialtyError = categories.length === 0 ? 'Choose at least one specialty' : null;
  const servicesError = categories.length > 0 && chosen.length === 0 ? 'Turn on at least one service you offer' : null;

  const toggleCategory = (cat: string) => {
    const on = categories.includes(cat);
    setCategories(on ? categories.filter((c) => c !== cat) : [...categories, cat]);
    setSavedMessage('');
    // Turning a specialty on switches its services on by default.
    if (!on && catalog) {
      setEnabled((prev) => ({
        ...prev,
        ...Object.fromEntries(catalog.services.filter((s) => s.category === cat).map((s) => [s.key, true])),
      }));
    }
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    setFormError('');
    setSavedMessage('');
    if (specialtyError || servicesError) return;

    setSaving(true);
    try {
      const updated = await saveServices(chosen.map((s) => s.key));
      if (editMode) {
        setMe(updated);
        setSavedMessage('Saved. New jobs will use these services.');
        return;
      }
      setMe(await submitForReview());
      navigation.reset({ index: 0, routes: [{ name: 'UnderReview' }] });
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={editMode ? 'My services & prices' : 'Your services'}
        subtitle={editMode ? 'What you can be booked for' : 'Choose what you can fix on the roadside'}
        onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {!editMode && <StepDots step={3} total={3} />}

        {!catalog && !loadError && <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />}
        {loadError ? (
          <TouchableOpacity style={styles.errorBox} onPress={load}>
            <Text style={styles.errorBoxText}>{loadError} Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}

        {catalog && (
          <>
            <Text style={styles.sectionLabel}>Your specialties</Text>
            <View style={styles.chipRow}>
              {catalog.specialties.map((sp) => {
                const on = categories.includes(sp.category);
                return (
                  <TouchableOpacity
                    key={sp.category}
                    style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                    onPress={() => toggleCategory(sp.category)}
                    activeOpacity={0.8}
                  >
                    {on && <Ionicons name="checkmark" size={14} color={colors.primary} />}
                    <Text style={[styles.chipText, on && { color: colors.primary, fontWeight: '600' }]}>{sp.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {submitted && specialtyError ? <Text style={styles.errorText}>{specialtyError}</Text> : null}

            {visibleServices.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Services you offer</Text>
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.infoText}>
                    Ridzo sets the price for every service, so customers always see the same fair price. A travel charge
                    based on distance is added to each job automatically.
                  </Text>
                </View>
                {visibleServices.map((s) => {
                  const on = !!enabled[s.key];
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.serviceRow, !on && { opacity: 0.55 }]}
                      onPress={() => {
                        setEnabled((p) => ({ ...p, [s.key]: !on }));
                        setSavedMessage('');
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={on ? colors.primary : colors.textSecondary}
                        style={{ marginRight: 12 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.serviceName}>{s.name}</Text>
                        <Text style={styles.serviceMeta}>{s.durationLabel}</Text>
                      </View>
                      <Text style={styles.price}>{formatRs(s.priceRs)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {submitted && servicesError ? <Text style={styles.errorText}>{servicesError}</Text> : null}
              </>
            )}

            {formError ? (
              <View style={[styles.errorBox, { marginTop: 16 }]}>
                <Text style={styles.errorBoxText}>{formError}</Text>
              </View>
            ) : null}
            {savedMessage ? <Text style={styles.savedText}>{savedMessage}</Text> : null}
          </>
        )}
      </ScrollView>

      <BottomBar>
        <PrimaryButton
          label={editMode ? 'Save services' : 'Submit for review'}
          onPress={handleSubmit}
          loading={saving}
          disabled={!catalog}
        />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.secondary, borderColor: colors.primary },
  chipOff: { borderColor: colors.border },
  chipText: { fontSize: 14, color: colors.textPrimary },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  serviceName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  serviceMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginLeft: 8 },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 12 },
  infoText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  savedText: { fontSize: 13, color: colors.successDark, marginTop: 16, textAlign: 'center' },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 4 },
  errorBox: { backgroundColor: colors.bgDanger, borderRadius: 10, padding: 12 },
  errorBoxText: { color: colors.danger, fontSize: 13 },
});
