// components/ui.tsx
// Small shared building blocks for the mechanic job flow, so every screen
// has the same buttons, header and spacing.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[ui.primaryButton, isDisabled && ui.buttonDisabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={colors.textOnDark} />
      ) : (
        <Text style={ui.primaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function OutlineButton({
  label,
  onPress,
  disabled,
  loading,
  style,
  tone = 'default',
}: ButtonProps & { tone?: 'default' | 'danger' }) {
  const color = tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[
        ui.outlineButton,
        tone === 'danger' && { borderColor: colors.danger },
        (disabled || loading) && ui.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[ui.outlineButtonText, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** Title row with an optional back arrow. Handles the top safe area. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[ui.header, { paddingTop: insets.top + 12 }]}>
      {onBack && (
        <TouchableOpacity onPress={onBack} hitSlop={12} style={ui.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={ui.headerTitle}>{title}</Text>
        {subtitle ? <Text style={ui.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** Sticky area at the bottom of a screen for the main action. Handles the bottom safe area. */
export function BottomBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[ui.bottomBar, { paddingBottom: insets.bottom + 16 }]}>{children}</View>;
}

/** Step indicator for the on-site part of the job, e.g. "Step 2 of 4". */
export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={ui.stepRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[ui.stepDot, i < step && ui.stepDotDone]} />
      ))}
      <Text style={ui.stepText}>
        Step {step} of {total}
      </Text>
    </View>
  );
}

export function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={[ui.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[ui.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primaryButtonText: { color: colors.textOnDark, fontSize: 16, fontWeight: '700' },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  outlineButtonText: { fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.45 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  backButton: { marginRight: 10, marginLeft: -4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: 10,
  },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  stepDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepDotDone: { backgroundColor: colors.primary },
  stepText: { fontSize: 12, color: colors.textSecondary, marginLeft: 6 },

  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 },

  avatar: { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700' },
});
