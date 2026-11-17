// components/FormField.tsx
// Labelled text input and select field with inline error messages.
// Errors only show after the field is touched (blurred) or the form is submitted.
import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TextInputInstance,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  prefix?: string;
  showCount?: boolean;
};

export const FormField = forwardRef<TextInputInstance, FieldProps>(function FormField(
  { label, error, hint, optional, prefix, showCount, style, maxLength, value, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
      >
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.textSecondary}
          maxLength={maxLength}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
      </View>
      <View style={styles.footer}>
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : (
          <View />
        )}
        {showCount && maxLength ? (
          <Text style={styles.count}>
            {(value ?? '').length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

type SelectProps = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
};

export function SelectField({ label, value, options, onChange, placeholder, error, hint }: SelectProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.inputWrap, styles.select, error ? styles.inputError : null]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectText, !value && { color: colors.textSecondary }]}>
          {value || placeholder || 'Select'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.footer}>
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options as string[]}
            keyExtractor={(o) => o}
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, selected && { color: colors.primary, fontWeight: '700' }]}>
                    {item}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 6 },
  label: { fontSize: 13, color: colors.textPrimary, fontWeight: '600', marginBottom: 6 },
  optional: { color: colors.textSecondary, fontWeight: '400' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger, backgroundColor: colors.bgDanger },
  prefix: { fontSize: 15, color: colors.textSecondary, marginRight: 6 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.textPrimary },
  footer: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 20, paddingTop: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  errorText: { fontSize: 12, color: colors.danger, flex: 1 },
  hint: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  count: { fontSize: 11, color: colors.textSecondary, marginLeft: 8 },
  select: { justifyContent: 'space-between', paddingVertical: 13 },
  selectText: { fontSize: 15, color: colors.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 15, color: colors.textPrimary },
});
