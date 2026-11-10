import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, S } from '@/theme';

export function Screen({
  children,
  scroll = true,
  refreshControl,
  edges = ['bottom'],
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  edges?: ('top' | 'bottom')[];
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={st.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  ) : (
    <View style={[st.scroll, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={st.screen} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type TProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean };
export const H1 = (p: TProps) => <Text {...p} style={[st.h1, p.style]} />;
export const H2 = (p: TProps) => <Text {...p} style={[st.h2, p.style]} />;
export const T = (p: TProps) => <Text {...p} style={[st.t, p.style]} />;
export const Muted = (p: TProps) => <Text {...p} style={[st.muted, p.style]} />;
export const Label = (p: TProps) => <Text {...p} style={[st.label, p.style]} />;

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[st.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [st.btn, { backgroundColor: v.bg, borderColor: v.border }, pressed && { opacity: 0.8 }, off && { opacity: 0.5 }, style]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={st.row}>
          {icon}
          <Text style={[st.btnText, { color: v.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: C.gold, fg: '#04140F', border: C.gold },
  secondary: { bg: C.surface2, fg: C.text, border: C.border },
  ghost: { bg: 'transparent', fg: C.gold, border: 'transparent' },
  danger: { bg: C.redDim, fg: C.red, border: C.redDim },
  whatsapp: { bg: '#1F3B2C', fg: '#5CE08C', border: '#1F3B2C' },
};

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: S.xs }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={C.faint}
        selectionColor={C.gold}
        {...props}
        style={[st.input, error ? { borderColor: C.red } : null, props.style]}
      />
      {error ? <Text style={st.error}>{error}</Text> : hint ? <Muted style={{ fontSize: 13 }}>{hint}</Muted> : null}
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'green' | 'gold' | 'red' }) {
  const m = {
    neutral: [C.surface2, C.muted],
    green: [C.greenDim, C.green],
    gold: [C.goldDim, C.gold],
    red: [C.redDim, C.red],
  }[tone];
  return (
    <View style={[st.pill, { backgroundColor: m[0] }]}>
      <Text style={{ color: m[1], fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={st.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      <View style={[st.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={st.errorBox}>
      <Text style={{ color: C.red }}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.gold} size="large" />
    </View>
  );
}

export function Choice({
  selected,
  onPress,
  title,
  subtitle,
  left,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  left?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[st.choice, selected && { borderColor: C.gold, backgroundColor: C.goldDim }]}>
      {left}
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }}>{title}</T>
        {subtitle ? <Muted style={{ fontSize: 13 }}>{subtitle}</Muted> : null}
      </View>
      <View style={[st.radio, selected && { borderColor: C.gold }]}>{selected ? <View style={st.radioDot} /> : null}</View>
    </Pressable>
  );
}

export const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.md, gap: S.md, paddingBottom: S.xl * 2 },
  h1: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 19, fontWeight: '700' },
  t: { color: C.text, fontSize: 16, lineHeight: 22 },
  muted: { color: C.muted, fontSize: 15, lineHeight: 21 },
  label: { color: C.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: S.md, gap: S.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  btn: { minHeight: 52, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md, borderWidth: 1 },
  btnText: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  input: { backgroundColor: C.surface, color: C.text, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, minHeight: 52, fontSize: 17 },
  error: { color: C.red, fontSize: 13 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, alignSelf: 'flex-start' },
  track: { height: 8, backgroundColor: C.surface2, borderRadius: R.pill, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: C.green, borderRadius: R.pill },
  errorBox: { backgroundColor: C.redDim, padding: S.md, borderRadius: R.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold },
});
